import type { Request, Response, NextFunction } from "express";
import { redisCache } from "../../config/redis.config.js";
import {
  buildOrderCacheKey,
  validateTicketCode,
} from "../utils/validation.util.js";
import {
  buildSuccessResponse,
  type ApiSuccessResponse,
} from "../utils/response.util.js";

export type TicketCodeRouteParams = {
  readonly ticketCode?: string;
} & Record<string, string>;

/**
 * Interceptor Cache-Aside para consultas de órdenes por ticketCode.
 * 1. Valida estrictamente el formato del ticketCode (^ORD-[A-Z0-9]{4,8}$) antes de tocar Redis.
 * 2. Si existe en Redis (Cache Hit), responde inmediatamente con 200 OK y X-Cache: HIT.
 * 3. Si no existe o Redis está degradado (Cache Miss), establece X-Cache: MISS y delega al controlador.
 */
export async function cacheOrderByTicketMiddleware(
  req: Request,
  res: Response<ApiSuccessResponse<unknown>>,
  next: NextFunction
): Promise<void> {
  try {
    const safeTicketCode = validateTicketCode(req.params["ticketCode"]);
    const cacheKey = buildOrderCacheKey(safeTicketCode);

    const cachedOrder = await redisCache.get<unknown>(cacheKey);

    if (cachedOrder !== null) {
      res.setHeader("X-Cache", "HIT");
      res
        .status(200)
        .json(
          buildSuccessResponse(
            cachedOrder,
            "Orden de servicio obtenida desde caché en tiempo real.",
            { cache: "HIT" }
          )
        );
      return;
    }

    res.setHeader("X-Cache", "MISS");
    next();
  } catch (error: unknown) {
    next(error);
  }
}
