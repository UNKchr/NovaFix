import { createClient, type RedisClientType } from "redis";
import { env } from "./env.config.js";

/**
 * Singleton de conexión a Redis con reconexión controlada y degradación elegante.
 * Si Redis no está disponible o falla en tiempo de ejecución, el sistema continúa
 * operando de forma transparente contra PostgreSQL (Graceful Degradation).
 */
class RedisCacheManager {
  private static instance: RedisCacheManager | undefined;
  private readonly client: RedisClientType;
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
              "[Redis] Límite de reintentos alcanzado. Operando en modo degradado (solo PostgreSQL)."
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
      console.info("[Redis] Conexión establecida y lista para caché.");
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
        `[Redis][Degradación Elegante] No fue posible conectar al inicio (${safeMessage}). El sistema operará directamente contra PostgreSQL.`
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
      return null;
    }
    try {
      const serialized = await this.client.get(key);
      if (serialized === null) {
        return null;
      }
      return JSON.parse(serialized) as T;
    } catch (err: unknown) {
      const safeMessage =
        err instanceof Error ? err.message : "Error al leer clave de caché";
      console.warn(
        `[Redis][GET Fallback] Error leyendo clave "${key}": ${safeMessage}`
      );
      return null;
    }
  }

  public async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = env.cacheTtlSeconds
  ): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized, {
        EX: ttlSeconds,
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
}

export const redisCache = RedisCacheManager.getInstance();
