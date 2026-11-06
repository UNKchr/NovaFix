import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { env } from "../../config/env.config.js";
import { AppError } from "../errors/app-error.js";
import {
  buildErrorResponse,
  type ApiErrorResponse,
} from "../utils/response.util.js";

interface BodyParserHttpError extends Error {
  readonly status?: number;
  readonly type?: string;
}

function isBodyParserError(err: unknown): err is BodyParserHttpError {
  return (
    err instanceof Error &&
    ("status" in err || "type" in err)
  );
}

/**
 * Middleware para rutas no encontradas (404).
 */
export function notFoundMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(
    AppError.notFound(
      `El recurso solicitado "${req.method} ${req.originalUrl}" no existe.`
    )
  );
}

/**
 * Manejador global de excepciones (Secure by Design).
 * Jamás expone trazas de pila (stack traces), nombres de tablas de Prisma
 * ni errores internos de infraestructura en las respuestas HTTP al cliente.
 */
export const globalErrorMiddleware: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void => {
  // 1. Errores operativos controlados de la aplicación
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(buildErrorResponse(err.errorCode, err.message, err.details));
    return;
  }

  // 2. Errores de límite de payload (express.json({ limit: '16kb' })) o JSON malformado
  if (isBodyParserError(err)) {
    if (err.type === "entity.too.large" || err.status === 413) {
      res
        .status(413)
        .json(
          buildErrorResponse(
            "PAYLOAD_TOO_LARGE",
            "El tamaño del cuerpo de la solicitud excede el límite máximo permitido de 16 KB."
          )
        );
      return;
    }

    if (err instanceof SyntaxError && err.status === 400) {
      res
        .status(400)
        .json(
          buildErrorResponse(
            "BAD_REQUEST",
            "El cuerpo de la solicitud contiene un formato JSON inválido."
          )
        );
      return;
    }
  }

  // 3. Errores no controlados o de infraestructura (Prisma, PostgreSQL, Red, etc.)
  // Se registran internamente para diagnóstico del administrador sin exponer detalles al cliente.
  if (!env.isProduction) {
    console.error("[GlobalErrorHandler][UnhandledException]:", err);
  } else {
    const internalSummary =
      err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error";
    console.error(`[GlobalErrorHandler][ProductionError] ${internalSummary}`);
  }

  res
    .status(500)
    .json(
      buildErrorResponse(
        "INTERNAL_SERVER_ERROR",
        "Ha ocurrido un error interno procesando su solicitud. Por favor, intente nuevamente más tarde."
      )
    );
};
