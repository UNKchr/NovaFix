import type { Request } from "express";
import { env, normalizeIpString } from "../../config/env.config.js";
import { redisCache, type RateWindowCounter } from "../../config/redis.config.js";

export interface IpBanRecord {
  readonly ip: string;
  readonly reason: string;
  readonly banLevel: number;
  readonly bannedAtIso: string;
  readonly expiresAtIso: string;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
}

const KEY_PREFIX_WHITELIST = "sec:whitelist:ip:";
const KEY_PREFIX_BLACKLIST = "sec:blacklist:ip:";
const KEY_PREFIX_ACTIVE_BAN = "sec:ban:ip:";
const KEY_PREFIX_BAN_LEVEL = "sec:ban_level:ip:";
const KEY_PREFIX_STRIKES = "sec:strikes:ip:";
const KEY_PREFIX_AUTH_FAIL = "sec:auth_fail:ip:";
const KEY_PREFIX_RATE_LIMIT = "sec:rl:";

const STRIKE_WINDOW_SECONDS = 900; // 15 minutos
const MAX_STRIKES_BEFORE_BAN = 3;

const AUTH_FAIL_WINDOW_SECONDS = 600; // 10 minutos
const MAX_AUTH_FAILS_BEFORE_BAN = 8;

const BAN_LEVEL_HISTORY_SECONDS = 86_400; // 24 horas

/**
 * Duraciones progresivas de baneo según reincidencias en 24h:
 * - Nivel 1: 15 minutos (900s)
 * - Nivel 2: 2 horas (7200s)
 * - Nivel 3+: 24 horas (86400s)
 */
function resolveBanDurationSeconds(banLevel: number): number {
  if (banLevel <= 1) {
    return 900;
  }
  if (banLevel === 2) {
    return 7_200;
  }
  return 86_400;
}

export class IpSecurityService {
  /**
   * Extrae y normaliza de forma segura la dirección IP del cliente.
   * Si la petición entra por loopback local (ej. Proxy de Angular + Cloudflare Tunnel)
   * o `trust proxy` está habilitado, distingue la IP real de cada compañero mediante
   * `cf-connecting-ip` o `x-forwarded-for`.
   */
  public extractClientIp(req: Request): string {
    const socketIp = normalizeIpString(req.socket.remoteAddress ?? "unknown");
    const isLocalProxyConnection = socketIp === "127.0.0.1" || env.trustProxy;

    if (isLocalProxyConnection) {
      const cfIpHeader = req.headers["cf-connecting-ip"];
      if (typeof cfIpHeader === "string" && cfIpHeader.trim().length > 0) {
        return normalizeIpString(cfIpHeader);
      }

      const forwardedFor = req.headers["x-forwarded-for"];
      if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
        const firstForwardedIp = forwardedFor.split(",")[0];
        if (firstForwardedIp !== undefined && firstForwardedIp.trim().length > 0) {
          return normalizeIpString(firstForwardedIp);
        }
      }
    }

    const rawIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
    return normalizeIpString(rawIp);
  }

  /**
   * Verifica si la IP está en la lista blanca (configuración estática o dinámica en Redis).
   */
  public async isWhitelisted(rawIp: string): Promise<boolean> {
    const ip = normalizeIpString(rawIp);
    if (env.ipWhitelist.has(ip)) {
      return true;
    }
    const dynamicFlag = await redisCache.get<boolean>(
      `${KEY_PREFIX_WHITELIST}${ip}`
    );
    return dynamicFlag === true;
  }

  /**
   * Verifica si la IP está en la lista negra permanente (configuración estática o dinámica).
   */
  public async isBlacklisted(rawIp: string): Promise<boolean> {
    const ip = normalizeIpString(rawIp);
    if (await this.isWhitelisted(ip)) {
      return false;
    }
    if (env.ipBlacklist.has(ip)) {
      return true;
    }
    const dynamicFlag = await redisCache.get<boolean>(
      `${KEY_PREFIX_BLACKLIST}${ip}`
    );
    return dynamicFlag === true;
  }

  /**
   * Agrega dinámicamente una IP a la lista negra por el tiempo indicado (por defecto 7 días).
   */
  public async addToBlacklist(
    rawIp: string,
    ttlSeconds = 604_800
  ): Promise<void> {
    const ip = normalizeIpString(rawIp);
    await redisCache.set(`${KEY_PREFIX_BLACKLIST}${ip}`, true, ttlSeconds);
  }

  /**
   * Consulta si una IP posee un baneo temporal activo.
   */
  public async getActiveBan(rawIp: string): Promise<IpBanRecord | null> {
    const ip = normalizeIpString(rawIp);
    if (await this.isWhitelisted(ip)) {
      return null;
    }

    const banKey = `${KEY_PREFIX_ACTIVE_BAN}${ip}`;
    const storedBan = await redisCache.get<Omit<IpBanRecord, "remainingSeconds">>(
      banKey
    );
    if (storedBan === null) {
      return null;
    }

    const ttlSeconds = await redisCache.getTtl(banKey);
    const remainingSeconds =
      ttlSeconds > 0
        ? ttlSeconds
        : Math.max(
            1,
            Math.ceil(
              (new Date(storedBan.expiresAtIso).getTime() - Date.now()) / 1000
            )
          );

    return {
      ...storedBan,
      remainingSeconds,
    };
  }

  /**
   * Aplica un baneo temporal progresivo a una IP infractora (15m -> 2h -> 24h).
   */
  public async applyProgressiveBan(
    rawIp: string,
    reason: string
  ): Promise<IpBanRecord> {
    const ip = normalizeIpString(rawIp);
    const levelCounter = await redisCache.incrementWindow(
      `${KEY_PREFIX_BAN_LEVEL}${ip}`,
      BAN_LEVEL_HISTORY_SECONDS
    );

    const banLevel = levelCounter.count;
    const durationSeconds = resolveBanDurationSeconds(banLevel);
    const nowMs = Date.now();
    const bannedAtIso = new Date(nowMs).toISOString();
    const expiresAtIso = new Date(nowMs + durationSeconds * 1000).toISOString();

    const recordToStore: Omit<IpBanRecord, "remainingSeconds"> = {
      ip,
      reason,
      banLevel,
      bannedAtIso,
      expiresAtIso,
      durationSeconds,
    };

    await redisCache.set(
      `${KEY_PREFIX_ACTIVE_BAN}${ip}`,
      recordToStore,
      durationSeconds
    );

    console.warn(
      `[IpSecurity][AUTO-BAN] IP "${ip}" bloqueada temporalmente (Nivel ${banLevel}, ${durationSeconds}s). Motivo: ${reason}`
    );

    return {
      ...recordToStore,
      remainingSeconds: durationSeconds,
    };
  }

  /**
   * Evalúa y consume 1 petición dentro de la ventana de Rate Limit indicada para una IP y alcance.
   */
  public async consumeRateLimitQuota(
    rawIp: string,
    scope: string,
    windowSeconds: number
  ): Promise<RateWindowCounter> {
    const ip = normalizeIpString(rawIp);
    const key = `${KEY_PREFIX_RATE_LIMIT}${scope}:${ip}`;
    return redisCache.incrementWindow(key, windowSeconds);
  }

  /**
   * Registra un "Strike" cuando una IP supera repetidamente el Rate Limit.
   * Al alcanzar 3 infracciones en 15 minutos, aplica un baneo automático progresivo.
   */
  public async recordRateLimitViolation(
    rawIp: string,
    scope: string
  ): Promise<IpBanRecord | null> {
    const ip = normalizeIpString(rawIp);
    if (await this.isWhitelisted(ip)) {
      return null;
    }

    const strikeKey = `${KEY_PREFIX_STRIKES}${ip}`;
    const strikeCounter = await redisCache.incrementWindow(
      strikeKey,
      STRIKE_WINDOW_SECONDS
    );

    if (strikeCounter.count >= MAX_STRIKES_BEFORE_BAN) {
      await redisCache.del(strikeKey);
      return this.applyProgressiveBan(
        ip,
        `Exceso reiterado del límite de peticiones en el canal "${scope}"`
      );
    }

    return null;
  }

  /**
   * Registra un intento fallido de inicio de sesión para proteger contra fuerza bruta.
   * Si la IP acumula 8 fallos en 10 minutos, se banea automáticamente.
   */
  public async recordFailedAuthAttempt(
    rawIp: string
  ): Promise<IpBanRecord | null> {
    const ip = normalizeIpString(rawIp);
    if (await this.isWhitelisted(ip)) {
      return null;
    }

    const failKey = `${KEY_PREFIX_AUTH_FAIL}${ip}`;
    const failCounter = await redisCache.incrementWindow(
      failKey,
      AUTH_FAIL_WINDOW_SECONDS
    );

    if (failCounter.count >= MAX_AUTH_FAILS_BEFORE_BAN) {
      await redisCache.del(failKey);
      return this.applyProgressiveBan(
        ip,
        "Múltiples intentos fallidos de inicio de sesión"
      );
    }

    return null;
  }

  /**
   * Limpia el historial de intentos fallidos de inicio de sesión cuando el usuario ingresa correctamente.
   */
  public async clearFailedAuthAttempts(rawIp: string): Promise<void> {
    const ip = normalizeIpString(rawIp);
    await redisCache.del(`${KEY_PREFIX_AUTH_FAIL}${ip}`);
  }
}

export const ipSecurityService = new IpSecurityService();
