import type { Request, Response, NextFunction, RequestHandler } from "express";
import { env } from "../../config/env.config.js";
import { AppError } from "../errors/app-error.js";
import { ipSecurityService } from "../security/ip-security.service.js";

export interface RateLimiterOptions {
  readonly scope: string;
  readonly maxRequests: number;
  readonly windowSeconds: number;
  readonly errorMessage: string;
}

function formatWaitDurationLabel(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundos`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  }
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

/**
 * Anillo 1: Middleware perimetral de Whitelist, Blacklist y Baneo Activo de IP.
 * Se ejecuta antes de parsear el cuerpo JSON o consultar la base de datos.
 */
export async function ipShieldMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientIp = ipSecurityService.extractClientIp(req);

    if (await ipSecurityService.isWhitelisted(clientIp)) {
      next();
      return;
    }

    if (await ipSecurityService.isBlacklisted(clientIp)) {
      throw new AppError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message:
          "El acceso desde su conexión ha sido restringido por políticas de seguridad.",
      });
    }

    const activeBan = await ipSecurityService.getActiveBan(clientIp);
    if (activeBan !== null) {
      res.setHeader("Retry-After", String(activeBan.remainingSeconds));
      const waitLabel = formatWaitDurationLabel(activeBan.remainingSeconds);

      throw new AppError({
        statusCode: 429,
        errorCode: "TOO_MANY_REQUESTS",
        message: `El acceso desde su conexión se encuentra temporalmente suspendido por exceso de intentos. Por favor, espere ${waitLabel} antes de volver a intentarlo.`,
      });
    }

    next();
  } catch (error: unknown) {
    next(error);
  }
}

/**
 * Anillo 2 y 3: Factoría de Rate Limiting por perfil de ruta con escalado a Baneo Progresivo.
 */
export function createRateLimiterMiddleware(
  options: RateLimiterOptions
): RequestHandler {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.path === "/api/health" || req.path === "/health") {
        next();
        return;
      }

      const clientIp = ipSecurityService.extractClientIp(req);

      if (await ipSecurityService.isWhitelisted(clientIp)) {
        res.setHeader("RateLimit-Limit", String(options.maxRequests));
        res.setHeader("RateLimit-Remaining", String(options.maxRequests));
        res.setHeader("RateLimit-Reset", String(options.windowSeconds));
        next();
        return;
      }

      const counter = await ipSecurityService.consumeRateLimitQuota(
        clientIp,
        options.scope,
        options.windowSeconds
      );

      const remaining = Math.max(0, options.maxRequests - counter.count);
      res.setHeader("RateLimit-Limit", String(options.maxRequests));
      res.setHeader("RateLimit-Remaining", String(remaining));
      res.setHeader("RateLimit-Reset", String(counter.ttlSeconds));

      if (counter.count > options.maxRequests) {
        const triggeredBan = await ipSecurityService.recordRateLimitViolation(
          clientIp,
          options.scope
        );

        if (triggeredBan !== null) {
          res.setHeader("Retry-After", String(triggeredBan.remainingSeconds));
          const waitLabel = formatWaitDurationLabel(
            triggeredBan.remainingSeconds
          );
          throw new AppError({
            statusCode: 429,
            errorCode: "TOO_MANY_REQUESTS",
            message: `Se ha detectado un exceso reiterado de solicitudes desde su conexión. El acceso ha sido suspendido temporalmente por ${waitLabel}.`,
          });
        }

        res.setHeader("Retry-After", String(counter.ttlSeconds));
        throw new AppError({
          statusCode: 429,
          errorCode: "TOO_MANY_REQUESTS",
          message: `${options.errorMessage} Intente nuevamente en ${formatWaitDurationLabel(counter.ttlSeconds)}.`,
        });
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

/**
 * Límite general para la API operativa (/api/*): 180 peticiones por minuto por IP por defecto.
 */
export const globalApiRateLimiter: RequestHandler = createRateLimiterMiddleware(
  {
    scope: "global_api",
    maxRequests: env.rateLimitGlobalMax,
    windowSeconds: 60,
    errorMessage:
      "Ha realizado demasiadas solicitudes en poco tiempo.",
  }
);

/**
 * Límite estricto para inicio de sesión y registro (/api/auth/login y /api/auth/register-company):
 * 6 intentos por minuto por IP por defecto.
 */
export const authStrictRateLimiter: RequestHandler =
  createRateLimiterMiddleware({
    scope: "auth_strict",
    maxRequests: env.rateLimitAuthMax,
    windowSeconds: 60,
    errorMessage:
      "Ha superado el número máximo de intentos de acceso permitidos por minuto.",
  });

/**
 * Límite moderado para consulta pública de órdenes (/api/orders/public/:ticketCode):
 * 20 consultas por minuto por IP por defecto.
 */
export const publicTrackingRateLimiter: RequestHandler =
  createRateLimiterMiddleware({
    scope: "public_tracking",
    maxRequests: env.rateLimitPublicTrackingMax,
    windowSeconds: 60,
    errorMessage:
      "Ha realizado demasiadas consultas de seguimiento seguidas.",
  });
