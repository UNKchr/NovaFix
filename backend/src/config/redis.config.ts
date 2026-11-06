import { createClient, type RedisClientType } from "redis";
import { env } from "./env.config.js";

interface MemoryFallbackEntry {
  readonly serializedValue: string;
  readonly expiresAtMs: number;
}

export interface RateWindowCounter {
  readonly count: number;
  readonly ttlSeconds: number;
}

const MAX_MEMORY_FALLBACK_ENTRIES = 10_000;

/**
 * Singleton de conexión a Redis con reconexión controlada, operaciones atómicas
 * para Rate Limiting / Baneos de IP y respaldo automático en memoria RAM
 * (Fail-Secure + Graceful Degradation).
 */
class RedisCacheManager {
  private static instance: RedisCacheManager | undefined;
  private readonly client: RedisClientType;
  private readonly memoryStore = new Map<string, MemoryFallbackEntry>();
  private isAvailable = false;

  private constructor() {
    this.client = createClient({
      url: env.redisUrl,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: (retries: number): number | Error => {
          if (retries > 5) {
            this.isAvailable = false;
            return new Error(
              "[Redis] Límite de reintentos alcanzado. Operando en modo degradado con respaldo en memoria."
            );
          }
          return Math.min(retries * 200, 2000);
        },
      },
    });

    this.registerEventListeners();
  }

  public static getInstance(): RedisCacheManager {
    if (RedisCacheManager.instance === undefined) {
      RedisCacheManager.instance = new RedisCacheManager();
    }
    return RedisCacheManager.instance;
  }

  private registerEventListeners(): void {
    this.client.on("ready", () => {
      this.isAvailable = true;
      console.info("[Redis] Conexión establecida y lista.");
    });

    this.client.on("end", () => {
      this.isAvailable = false;
      console.warn("[Redis] Conexión cerrada.");
    });

    this.client.on("error", (err: unknown) => {
      this.isAvailable = false;
      const safeMessage =
        err instanceof Error ? err.message : "Error desconocido en cliente Redis";
      console.warn(
        `[Redis][Degradación Elegante] Caché temporalmente no disponible: ${safeMessage}`
      );
    });
  }

  private pruneMemoryStoreIfNeeded(): void {
    const nowMs = Date.now();

    if (this.memoryStore.size >= MAX_MEMORY_FALLBACK_ENTRIES) {
      for (const [key, entry] of this.memoryStore.entries()) {
        if (entry.expiresAtMs <= nowMs) {
          this.memoryStore.delete(key);
        }
      }
    }

    if (this.memoryStore.size >= MAX_MEMORY_FALLBACK_ENTRIES) {
      const oldestKey = this.memoryStore.keys().next().value;
      if (oldestKey !== undefined) {
        this.memoryStore.delete(oldestKey);
      }
    }
  }

  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryStore.get(key);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.serializedValue) as T;
    } catch {
      this.memoryStore.delete(key);
      return null;
    }
  }

  private setInMemory<T>(key: string, value: T, ttlSeconds: number): void {
    this.pruneMemoryStoreIfNeeded();
    const safeTtlSeconds = Math.max(1, Math.floor(ttlSeconds));
    this.memoryStore.set(key, {
      serializedValue: JSON.stringify(value),
      expiresAtMs: Date.now() + safeTtlSeconds * 1000,
    });
  }

  private incrementInMemory(
    key: string,
    windowSeconds: number
  ): RateWindowCounter {
    this.pruneMemoryStoreIfNeeded();
    const nowMs = Date.now();
    const safeWindowSeconds = Math.max(1, Math.floor(windowSeconds));
    const existing = this.memoryStore.get(key);

    if (existing === undefined || existing.expiresAtMs <= nowMs) {
      const expiresAtMs = nowMs + safeWindowSeconds * 1000;
      this.memoryStore.set(key, {
        serializedValue: "1",
        expiresAtMs,
      });
      return {
        count: 1,
        ttlSeconds: safeWindowSeconds,
      };
    }

    const parsedCount = Number.parseInt(existing.serializedValue, 10);
    const nextCount = Number.isNaN(parsedCount) ? 1 : parsedCount + 1;
    const remainingTtlSeconds = Math.max(
      1,
      Math.ceil((existing.expiresAtMs - nowMs) / 1000)
    );

    this.memoryStore.set(key, {
      serializedValue: String(nextCount),
      expiresAtMs: existing.expiresAtMs,
    });

    return {
      count: nextCount,
      ttlSeconds: remainingTtlSeconds,
    };
  }

  private getMemoryTtl(key: string): number {
    const entry = this.memoryStore.get(key);
    if (entry === undefined) {
      return 0;
    }
    const remainingMs = entry.expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      this.memoryStore.delete(key);
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  }

  public async connect(): Promise<void> {
    if (this.client.isOpen) {
      return;
    }
    try {
      await this.client.connect();
    } catch (err: unknown) {
      this.isAvailable = false;
      const safeMessage =
        err instanceof Error ? err.message : "Fallo al conectar a Redis";
      console.warn(
        `[Redis][Degradación Elegante] No fue posible conectar al inicio (${safeMessage}). El sistema operará con respaldo en memoria y PostgreSQL.`
      );
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.client.isOpen) {
      return;
    }
    try {
      await this.client.quit();
      this.isAvailable = false;
    } catch {
      this.client.destroy();
      this.isAvailable = false;
    }
  }

  public isReady(): boolean {
    return this.isAvailable && this.client.isReady;
  }

  public async get<T>(key: string): Promise<T | null> {
    if (!this.isReady()) {
      return this.getFromMemory<T>(key);
    }
    try {
      const serialized = await this.client.get(key);
      if (serialized === null) {
        return this.getFromMemory<T>(key);
      }
      return JSON.parse(serialized) as T;
    } catch (err: unknown) {
      const safeMessage =
        err instanceof Error ? err.message : "Error al leer clave de caché";
      console.warn(
        `[Redis][GET Fallback] Error leyendo clave "${key}": ${safeMessage}`
      );
      return this.getFromMemory<T>(key);
    }
  }

  public async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = env.cacheTtlSeconds
  ): Promise<void> {
    this.setInMemory(key, value, ttlSeconds);

    if (!this.isReady()) {
      return;
    }
    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized, {
        EX: Math.max(1, Math.floor(ttlSeconds)),
      });
    } catch (err: unknown) {
      const safeMessage =
        err instanceof Error ? err.message : "Error al escribir clave de caché";
      console.warn(
        `[Redis][SET Fallback] Error escribiendo clave "${key}": ${safeMessage}`
      );
    }
  }

  public async del(key: string): Promise<void> {
    this.memoryStore.delete(key);

    if (!this.isReady()) {
      return;
    }
    try {
      await this.client.del(key);
    } catch (err: unknown) {
      const safeMessage =
        err instanceof Error ? err.message : "Error al invalidar clave de caché";
      console.warn(
        `[Redis][DEL Fallback] Error invalidando clave "${key}": ${safeMessage}`
      );
    }
  }

  /**
   * Incrementa atómicamente el contador de una ventana de tiempo (en segundos)
   * y devuelve tanto el conteo actual como el TTL restante en segundos.
   */
  public async incrementWindow(
    key: string,
    windowSeconds: number
  ): Promise<RateWindowCounter> {
    const safeWindow = Math.max(1, Math.floor(windowSeconds));

    if (!this.isReady()) {
      return this.incrementInMemory(key, safeWindow);
    }

    try {
      const count = await this.client.incr(key);
      let ttl = await this.client.ttl(key);

      if (count === 1 || ttl < 0) {
        await this.client.expire(key, safeWindow);
        ttl = safeWindow;
      }

      return {
        count,
        ttlSeconds: Math.max(1, ttl),
      };
    } catch (err: unknown) {
      const safeMessage =
        err instanceof Error ? err.message : "Error al incrementar contador";
      console.warn(
        `[Redis][INCR Fallback] Error en ventana "${key}": ${safeMessage}`
      );
      return this.incrementInMemory(key, safeWindow);
    }
  }

  /**
   * Obtiene el tiempo restante de vida (TTL en segundos) de una clave en Redis o Memoria.
   */
  public async getTtl(key: string): Promise<number> {
    if (!this.isReady()) {
      return this.getMemoryTtl(key);
    }

    try {
      const ttl = await this.client.ttl(key);
      if (ttl > 0) {
        return ttl;
      }
      return this.getMemoryTtl(key);
    } catch {
      return this.getMemoryTtl(key);
    }
  }
}

export const redisCache = RedisCacheManager.getInstance();
