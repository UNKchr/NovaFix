import type { Request, Response, NextFunction } from "express";
import { getAuthenticatedUser } from "../../shared/middlewares/auth.middleware.js";
import {
  buildSuccessResponse,
  type ApiSuccessResponse,
} from "../../shared/utils/response.util.js";
import {
  validateCreateOrderDto,
  validateListOrdersQueryDto,
  validateTicketCodeParam,
  validateUpdateOrderStatusDto,
  type InternalOrderView,
  type PublicOrderTrackingView,
} from "./orders.dto.js";
import { ordersService } from "./orders.service.js";

export class OrdersController {
  /**
   * GET /api/orders/:ticketCode
   * Consulta pública de seguimiento en vivo (Cache-Aside en Redis).
   */
  public async getPublicByTicketCode(
    req: Request,
    res: Response<ApiSuccessResponse<PublicOrderTrackingView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const ticketCode = validateTicketCodeParam(req.params);
      const orderView =
        await ordersService.getPublicOrderByTicketCode(ticketCode);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            orderView,
            "Orden de servicio obtenida exitosamente.",
            { cache: "MISS" }
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  /**
   * GET /api/orders
   * Lista las órdenes internas filtradas estrictamente según rol, área y empresa.
   */
  public async listInternal(
    req: Request,
    res: Response<ApiSuccessResponse<ReadonlyArray<InternalOrderView>>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const query = validateListOrdersQueryDto(req.query);
      const orders = await ordersService.listInternalOrders(authUser, query);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            orders,
            "Órdenes de servicio obtenidas exitosamente."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  /**
   * POST /api/orders
   * Crea una orden en estado CREATED y ejecuta la asignación automática o cola FIFO.
   */
  public async create(
    req: Request,
    res: Response<ApiSuccessResponse<InternalOrderView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const dto = validateCreateOrderDto(req.body);
      const created = await ordersService.createOrder(authUser, dto);

      const message =
        created.status === "ASSIGNING"
          ? `Orden #${created.ticketCode} registrada e ingresada en la fila de espera (ASSIGNING).`
          : `Orden #${created.ticketCode} registrada y asignada automáticamente a ${created.assignedTo?.fullName ?? "técnico disponible"}.`;

      res.status(201).json(buildSuccessResponse(created, message));
    } catch (error: unknown) {
      next(error);
    }
  }

  /**
   * PATCH /api/orders/:ticketCode/status
   * Actualiza el estado de la orden, dispara notificaciones, desencola la siguiente orden en espera
   * si el técnico finalizó e invalida la clave en Redis.
   */
  public async updateStatus(
    req: Request,
    res: Response<ApiSuccessResponse<InternalOrderView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const ticketCode = validateTicketCodeParam(req.params);
      const dto = validateUpdateOrderStatusDto(req.body);

      const updated = await ordersService.updateOrderStatus(
        authUser,
        ticketCode,
        dto
      );

      res
        .status(200)
        .json(
          buildSuccessResponse(
            updated,
            `Estado de la orden #${updated.ticketCode} actualizado a ${updated.status}.`
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  /**
   * DELETE /api/orders/:ticketCode
   * Elimina (Soft Delete) una orden creada por equivocación o por administración,
   * liberando al técnico si estaba asignada e invalidando Redis.
   */
  public async remove(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly deletedTicketCode: string }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const ticketCode = validateTicketCodeParam(req.params);
      const result = await ordersService.deleteOrder(authUser, ticketCode);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            result,
            `Orden #${ticketCode} eliminada de forma segura.`
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const ordersController = new OrdersController();
