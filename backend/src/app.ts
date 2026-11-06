import cors from "cors";
import express, {
  type Application,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { env } from "./config/env.config.js";
import { redisCache } from "./config/redis.config.js";
import { areasRouter } from "./modules/areas/areas.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import {
  globalErrorMiddleware,
  notFoundMiddleware,
} from "./shared/middlewares/error.middleware.js";
import {
  globalApiRateLimiter,
  ipShieldMiddleware,
} from "./shared/middlewares/ip-security.middleware.js";
import { buildSuccessResponse } from "./shared/utils/response.util.js";

const CLOUDFLARE_TUNNEL_ORIGIN_REGEX =
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i;

export function createExpressApp(): Application {
  const app: Application = express();

  // 1. Ocultar cabecera x-powered-by y configurar proxy de confianza si aplica
  app.disable("x-powered-by");
  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }

  // 2. Cabeceras de seguridad HTTP estándar (Secure by Design)
  app.use((_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'"
    );
    next();
  });

  // 3. Configuración estricta de CORS restringida a FRONTEND_URL (y túneles Cloudflare en desarrollo)
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (
          requestOrigin === undefined ||
          requestOrigin === env.frontendUrl ||
          (!env.isProduction &&
            CLOUDFLARE_TUNNEL_ORIGIN_REGEX.test(requestOrigin))
        ) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: [
        "X-Cache",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "Retry-After",
      ],
      credentials: true,
      maxAge: 600,
    })
  );

  // 4. Escudo perimetral de Whitelist, Blacklist y Baneos de IP (antes de parsear JSON)
  app.use(ipShieldMiddleware);

  // 5. Límite estricto de payload JSON (16kb) contra ataques DoS
  app.use(express.json({ limit: "16kb", strict: true }));

  // 6. Endpoint de verificación de salud (Healthcheck)
  app.get("/api/health", (_req: Request, res: Response): void => {
    res.status(200).json(
      buildSuccessResponse(
        {
          status: "ok",
          environment: env.nodeEnv,
          redisConnected: redisCache.isReady(),
        },
        "Servidor NovaFix operativo."
      )
    );
  });

  // 7. Rate Limit general para el tráfico hacia /api/*
  app.use("/api", globalApiRateLimiter);

  // 8. Montaje de rutas modulares RESTful
  app.use("/api/auth", authRouter);
  app.use("/api/areas", areasRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/notifications", notificationsRouter);

  // 9. Manejadores de rutas inexistentes (404) y errores globales (500/4xx)
  app.use(notFoundMiddleware);
  app.use(globalErrorMiddleware);

  return app;
}

export const app: Application = createExpressApp();
