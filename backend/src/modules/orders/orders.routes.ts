import { Router } from "express";
import {
  authenticateMiddleware,
  requireAnyPermission,
} from "../../shared/middlewares/auth.middleware.js";
import { cacheOrderByTicketMiddleware } from "../../shared/middlewares/cache.middleware.js";
import { ordersController } from "./orders.controller.js";

export const ordersRouter: Router = Router();

/**
 * Endpoint público de consulta en vivo por ticketCode con Cache-Aside en Redis (TTL 300s).
 * No requiere inicio de sesión para permitir que el cliente final consulte su equipo en /tracking.
 */
ordersRouter.get(
  "/public/:ticketCode",
  cacheOrderByTicketMiddleware,
  (req, res, next) => ordersController.getPublicByTicketCode(req, res, next)
);

/**
 * Listado interno de órdenes filtrado por empresa, área y permisos del trabajador autenticado.
 */
ordersRouter.get(
  "/",
  authenticateMiddleware,
  (req, res, next) => ordersController.listInternal(req, res, next)
);

/**
 * Creación de nueva orden desde Recepción (ejecuta asignación automática o ingreso a cola FIFO).
 */
ordersRouter.post(
  "/",
  authenticateMiddleware,
  requireAnyPermission("ORDER_CREATE"),
  (req, res, next) => ordersController.create(req, res, next)
);

/**
 * Consulta directa por ticketCode (con interceptor Cache-Aside en Redis).
 */
ordersRouter.get(
  "/:ticketCode",
  cacheOrderByTicketMiddleware,
  (req, res, next) => ordersController.getPublicByTicketCode(req, res, next)
);

/**
 * Actualización de estado de reparación/entrega e invalidación inmediata de caché en Redis (DEL).
 */
ordersRouter.patch(
  "/:ticketCode/status",
  authenticateMiddleware,
  requireAnyPermission(
    "ORDER_STATUS_DIAGNOSING",
    "ORDER_STATUS_IN_REPAIR",
    "ORDER_STATUS_READY",
    "ORDER_STATUS_CANCELLED",
    "ORDER_STATUS_DELIVERED"
  ),
  (req, res, next) => ordersController.updateStatus(req, res, next)
);

/**
 * Eliminación/anulación segura de una orden (por equivocación de recepción o por administración).
 */
ordersRouter.delete(
  "/:ticketCode",
  authenticateMiddleware,
  requireAnyPermission("ORDER_DELETE"),
  (req, res, next) => ordersController.remove(req, res, next)
);
