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
  });
}

export const env: EnvConfig = buildEnvConfig();
