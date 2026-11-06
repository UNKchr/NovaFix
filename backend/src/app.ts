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
import { buildSuccessResponse } from "./shared/utils/response.util.js";

export function createExpressApp(): Application {
  const app: Application = express();

  // 1. Ocultar cabecera x-powered-by (OWASP Security Misconfiguration)
  app.disable("x-powered-by");

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

  // 3. Configuración estricta de CORS restringida a FRONTEND_URL
  app.use(
    cors({
      origin: env.frontendUrl,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["X-Cache"],
      credentials: true,
      maxAge: 600,
    })
  );

  // 4. Límite estricto de payload JSON (16kb) contra ataques DoS
  app.use(express.json({ limit: "16kb", strict: true }));

  // 5. Endpoint de verificación de salud (Healthcheck)
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

  // 6. Montaje de rutas modulares RESTful
  app.use("/api/auth", authRouter);
  app.use("/api/areas", areasRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/notifications", notificationsRouter);

  // 7. Manejadores de rutas inexistentes (404) y errores globales (500/4xx)
  app.use(notFoundMiddleware);
  app.use(globalErrorMiddleware);

  return app;
}

export const app: Application = createExpressApp();
