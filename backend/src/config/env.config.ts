import "dotenv/config";
import { z } from "zod";

export type NodeEnvironment = "development" | "production" | "test";

export interface EnvConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly isProduction: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly frontendUrl: string;
  readonly cacheTtlSeconds: number;
  readonly jwtSecret: string;
  readonly jwtExpiresInHours: number;
  readonly trustProxy: boolean;
  readonly ipWhitelist: ReadonlySet<string>;
  readonly ipBlacklist: ReadonlySet<string>;
  readonly rateLimitGlobalMax: number;
  readonly rateLimitAuthMax: number;
  readonly rateLimitPublicTrackingMax: number;
}

/**
 * Normaliza una dirección IP para evitar evasiones por formato
 * (por ejemplo, "::ffff:127.0.0.1" o "::1" se normalizan a "127.0.0.1").
 */
export function normalizeIpString(rawIp: string): string {
  const trimmed = rawIp.trim().toLowerCase();
  if (trimmed.length === 0) {
    return "unknown";
  }
  if (trimmed === "::1" || trimmed === "0:0:0:0:0:0:0:1") {
    return "127.0.0.1";
  }
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function parseCommaSeparatedIpSet(rawList: string): ReadonlySet<string> {
  const entries = rawList
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => normalizeIpString(item));

  return new Set<string>(entries);
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce
    .number()
    .int()
    .min(1, "PORT debe ser mayor o igual a 1")
    .max(65535, "PORT no puede exceder 65535")
    .default(3000),
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL es obligatoria")
    .refine(
      (val) =>
        val.startsWith("postgresql://") || val.startsWith("postgres://"),
      "DATABASE_URL debe iniciar con postgresql:// o postgres://"
    ),
  REDIS_URL: z
    .string()
    .trim()
    .min(1, "REDIS_URL es obligatoria")
    .refine(
      (val) => val.startsWith("redis://") || val.startsWith("rediss://"),
      "REDIS_URL debe iniciar con redis:// o rediss://"
    ),
  FRONTEND_URL: z
    .string()
    .trim()
    .min(1, "FRONTEND_URL es obligatoria")
    .refine((val) => val !== "*", 'FRONTEND_URL no puede ser el comodín "*"')
    .transform((val, ctx) => {
      try {
        const parsed = new URL(val);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "FRONTEND_URL debe usar protocolo http:// o https://",
          });
          return z.NEVER;
        }
        return parsed.origin;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `FRONTEND_URL inválida ("${val}")`,
        });
        return z.NEVER;
      }
    }),
  CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive("CACHE_TTL_SECONDS debe ser un entero positivo")
    .default(300),
  JWT_SECRET: z
    .string()
    .trim()
    .min(
      32,
      "JWT_SECRET debe tener al menos 32 caracteres (se recomiendan 64 caracteres hexadecimales/alfanuméricos)"
    )
    .max(256, "JWT_SECRET no debe exceder 256 caracteres")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "JWT_SECRET solo debe contener caracteres alfanuméricos seguros (A-Z, a-z, 0-9, _, -) para evitar errores de codificación"
    ),
  JWT_EXPIRES_IN_HOURS: z.coerce
    .number()
    .int()
    .min(1, "JWT_EXPIRES_IN_HOURS debe ser mínimo 1 hora")
    .max(168, "JWT_EXPIRES_IN_HOURS no puede exceder 168 horas (7 días)")
    .default(12),
  TRUST_PROXY: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .default("false")
    .transform((val) => val === "true" || val === "1"),
  IP_WHITELIST: z.string().optional().default(""),
  IP_BLACKLIST: z.string().optional().default(""),
  RATE_LIMIT_GLOBAL_MAX: z.coerce
    .number()
    .int()
    .min(20, "RATE_LIMIT_GLOBAL_MAX debe ser al menos 20 peticiones por minuto")
    .max(5000, "RATE_LIMIT_GLOBAL_MAX no debe exceder 5000")
    .default(180),
  RATE_LIMIT_AUTH_MAX: z.coerce
    .number()
    .int()
    .min(3, "RATE_LIMIT_AUTH_MAX debe ser al menos 3 intentos por minuto")
    .max(60, "RATE_LIMIT_AUTH_MAX no debe exceder 60")
    .default(6),
  RATE_LIMIT_PUBLIC_TRACKING_MAX: z.coerce
    .number()
    .int()
    .min(5, "RATE_LIMIT_PUBLIC_TRACKING_MAX debe ser al menos 5 consultas por minuto")
    .max(300, "RATE_LIMIT_PUBLIC_TRACKING_MAX no debe exceder 300")
    .default(20),
});

function buildEnvConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedIssues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `[FATAL][EnvConfig] Error de validación en variables de entorno (.env):\n${formattedIssues}`
    );
  }

  const data = result.data;

  return Object.freeze({
    nodeEnv: data.NODE_ENV,
    isProduction: data.NODE_ENV === "production",
    port: data.PORT,
    databaseUrl: data.DATABASE_URL,
    redisUrl: data.REDIS_URL,
    frontendUrl: data.FRONTEND_URL,
    cacheTtlSeconds: data.CACHE_TTL_SECONDS,
    jwtSecret: data.JWT_SECRET,
    jwtExpiresInHours: data.JWT_EXPIRES_IN_HOURS,
    trustProxy: data.TRUST_PROXY,
    ipWhitelist: parseCommaSeparatedIpSet(data.IP_WHITELIST),
    ipBlacklist: parseCommaSeparatedIpSet(data.IP_BLACKLIST),
    rateLimitGlobalMax: data.RATE_LIMIT_GLOBAL_MAX,
    rateLimitAuthMax: data.RATE_LIMIT_AUTH_MAX,
    rateLimitPublicTrackingMax: data.RATE_LIMIT_PUBLIC_TRACKING_MAX,
  });
}

export const env: EnvConfig = buildEnvConfig();
