import { env } from "../../config/env.config.js";
import { redisCache } from "../../config/redis.config.js";
import type { OrderStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { AuthenticatedUserContext } from "../../shared/middlewares/auth.middleware.js";
import { generateSecureTicketCode } from "../../shared/utils/crypto.util.js";
import { buildOrderCacheKey } from "../../shared/utils/validation.util.js";
import { areasRepository } from "../areas/areas.repository.js";
import type {
  CreateOrderDto,
  InternalOrderView,
  ListOrdersQueryDto,
  PublicOrderTrackingView,
  UpdateOrderStatusDto,
} from "./orders.dto.js";
import {
  ordersRepository,
  type InternalOrderRecord,
  type OrderVisibilityScope,
} from "./orders.repository.js";

export class OrdersService {
  /**
   * Consulta pública de seguimiento por ticketCode con estrategia Cache-Aside en Redis (TTL 300s).
   */
  public async getPublicOrderByTicketCode(
    ticketCode: string
  ): Promise<PublicOrderTrackingView> {
    const cacheKey = buildOrderCacheKey(ticketCode);

    const cached = await redisCache.get<PublicOrderTrackingView>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const dbOrder = await ordersRepository.findPublicByTicketCode(ticketCode);
    if (dbOrder === null) {
      throw AppError.notFound(
        `No se encontró ninguna orden activa con el código de seguimiento "${ticketCode}".`,
        "ORDER_NOT_FOUND"
      );
    }

    const publicView: PublicOrderTrackingView = {
      ticketCode: dbOrder.ticketCode,
      companyName: dbOrder.company.name,
      clientName: dbOrder.clientName,
      deviceModel: dbOrder.deviceModel,
      issueDesc: dbOrder.issueDesc,
      status: dbOrder.status,
      priority: dbOrder.priority,
      targetAreaName: dbOrder.targetArea.name,
      resolutionNotes: dbOrder.resolutionNotes,
      cancellationReason: dbOrder.cancellationReason,
      createdAt: dbOrder.createdAt.toISOString(),
      updatedAt: dbOrder.updatedAt.toISOString(),
      completedAt:
        dbOrder.completedAt !== null ? dbOrder.completedAt.toISOString() : null,
      deliveredAt:
        dbOrder.deliveredAt !== null ? dbOrder.deliveredAt.toISOString() : null,
      history: dbOrder.statusHistory.map((h) => ({
        status: h.newStatus,
        comment: h.comment,
        timestamp: h.createdAt.toISOString(),
      })),
    };

    await redisCache.set(cacheKey, publicView, env.cacheTtlSeconds);
    return publicView;
  }

  /**
   * Lista las órdenes internas aplicando el filtro estricto de visibilidad por Empresa, Área y Rol.
   */
  public async listInternalOrders(
    authUser: AuthenticatedUserContext,
    query: ListOrdersQueryDto
  ): Promise<ReadonlyArray<InternalOrderView>> {
    const scope = this.resolveVisibilityScope(authUser);

    const records = await ordersRepository.listInternalOrders({
      companyId: authUser.companyId,
      scope,
      status: query.status,
      search: query.search,
    });

    return records.map((record) => this.mapInternalOrder(record));
  }

  /**
   * Crea una nueva orden desde Recepción y ejecuta el motor de asignación automática o cola FIFO.
   */
  public async createOrder(
    authUser: AuthenticatedUserContext,
    dto: CreateOrderDto
  ): Promise<InternalOrderView> {
    const targetArea = await areasRepository.findActiveByIdAndCompany(
      dto.targetAreaId,
      authUser.companyId
    );

    if (targetArea === null) {
      throw AppError.notFound(
        "El área técnica destino seleccionada no existe o fue eliminada."
      );
    }

    if (!targetArea.isTechnicalQueue) {
      throw AppError.badRequest(
        `El área "${targetArea.name}" no está configurada como área técnica de reparación/diagnóstico.`
      );
    }

    const ticketCode = await this.generateUniqueTicketCode();

    const created = await ordersRepository.createOrderWithAutoQueue({
      companyId: authUser.companyId,
      ticketCode,
      clientName: dto.clientName,
      clientContact: dto.clientContact,
      deviceModel: dto.deviceModel,
      issueDesc: dto.issueDesc,
      priority: dto.priority,
      createdById: authUser.userId,
      creatorFullName: authUser.fullName,
      originAreaId: authUser.areaId,
      originAreaName: authUser.areaName ?? "Recepción",
      targetAreaId: targetArea.id,
    });

    await redisCache.del(buildOrderCacheKey(ticketCode));

    return this.mapInternalOrder(created);
  }

  /**
   * Actualiza el estado de una orden validando permisos específicos por estado,
   * pertenencia del técnico/recepcionista, desencolado automático e invalidación en Redis.
   */
  public async updateOrderStatus(
    authUser: AuthenticatedUserContext,
    ticketCode: string,
    dto: UpdateOrderStatusDto
  ): Promise<InternalOrderView> {
    const order = await ordersRepository.findActiveByTicketCodeAndCompany(
      ticketCode,
      authUser.companyId
    );

    if (order === null) {
      throw AppError.notFound(
        `No existe la orden "${ticketCode}" en su empresa.`,
        "ORDER_NOT_FOUND"
      );
    }

    this.validateStatusTransitionPermissionAndOwnership(
      authUser,
      order,
      dto.status
    );

    const { updatedOrder, dequeuedTicketCode } =
      await ordersRepository.updateStatusAndDequeueNext({
        orderId: order.id,
        companyId: authUser.companyId,
        previousStatus: order.status,
        newStatus: dto.status,
        actorUserId: authUser.userId,
        actorFullName: authUser.fullName,
        resolutionNotes: dto.resolutionNotes,
        cancellationReason: dto.cancellationReason,
        comment: dto.comment,
      });

    // Invalidación inmediata de caché en Redis (Cache-Aside)
    await redisCache.del(buildOrderCacheKey(ticketCode));
    if (dequeuedTicketCode !== null) {
      await redisCache.del(buildOrderCacheKey(dequeuedTicketCode));
    }

    return this.mapInternalOrder(updatedOrder);
  }

  /**
   * Elimina (Soft Delete) una orden por equivocación de recepción o por decisión administrativa,
   * liberando de inmediato al técnico asignado e invalidando Redis.
   */
  public async deleteOrder(
    authUser: AuthenticatedUserContext,
    ticketCode: string
  ): Promise<{ readonly deletedTicketCode: string }> {
    const order = await ordersRepository.findActiveByTicketCodeAndCompany(
      ticketCode,
      authUser.companyId
    );

    if (order === null) {
      throw AppError.notFound(
        `No existe la orden "${ticketCode}" en su empresa.`,
        "ORDER_NOT_FOUND"
      );
    }

    const isSupervisorOrAdmin =
      authUser.isCompanyAdmin ||
      authUser.permissions.includes("ORDER_VIEW_ALL_COMPANY") ||
      (authUser.permissions.includes("ORDER_VIEW_AREA") &&
        (authUser.areaId === order.originAreaId ||
          authUser.areaId === order.targetAreaId));

    const isCreatorOrOrphanCoworker =
      order.createdById === authUser.userId ||
      (authUser.areaId !== null &&
        authUser.areaId === order.originAreaId &&
        (!order.createdBy.isActive || order.createdBy.deletedAt !== null));

    if (!isSupervisorOrAdmin && !isCreatorOrOrphanCoworker) {
      throw new AppError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: "Solo puede eliminar órdenes generadas por usted o bajo su supervisión de área.",
      });
    }

    if (!authUser.isCompanyAdmin && order.status === "DELIVERED") {
      throw AppError.conflict(
        "No se puede eliminar una orden cuyo equipo ya fue entregado al cliente (DELIVERED)."
      );
    }

    const { dequeuedTicketCode } =
      await ordersRepository.softDeleteOrderAndReleaseTech({
        orderId: order.id,
        companyId: authUser.companyId,
        actorUserId: authUser.userId,
        actorFullName: authUser.fullName,
      });

    await redisCache.del(buildOrderCacheKey(ticketCode));
    if (dequeuedTicketCode !== null) {
      await redisCache.del(buildOrderCacheKey(dequeuedTicketCode));
    }

    return { deletedTicketCode: ticketCode };
  }

  private resolveVisibilityScope(
    authUser: AuthenticatedUserContext
  ): OrderVisibilityScope {
    if (
      authUser.isCompanyAdmin ||
      authUser.permissions.includes("ORDER_VIEW_ALL_COMPANY")
    ) {
      return { mode: "ALL_COMPANY" };
    }

    if (
      authUser.permissions.includes("ORDER_VIEW_AREA") &&
      authUser.areaId !== null
    ) {
      return {
        mode: "AREA_SUPERVISOR",
        userId: authUser.userId,
        areaId: authUser.areaId,
        isTechnicalArea: authUser.isTechnicalArea,
      };
    }

    if (authUser.permissions.includes("ORDER_CREATE")) {
      return {
        mode: "RECEPTION_AGENT",
        userId: authUser.userId,
        originAreaId: authUser.areaId,
      };
    }

    return {
      mode: "TECHNICAL_SPECIALIST",
      userId: authUser.userId,
    };
  }

  private validateStatusTransitionPermissionAndOwnership(
    authUser: AuthenticatedUserContext,
    order: InternalOrderRecord,
    targetStatus: UpdateOrderStatusDto["status"]
  ): void {
    const requiredPermMap: Readonly<
      Record<UpdateOrderStatusDto["status"], string>
    > = {
      DIAGNOSING: "ORDER_STATUS_DIAGNOSING",
      IN_REPAIR: "ORDER_STATUS_IN_REPAIR",
      READY: "ORDER_STATUS_READY",
      CANCELLED: "ORDER_STATUS_CANCELLED",
      DELIVERED: "ORDER_STATUS_DELIVERED",
    };

    const requiredPermission = requiredPermMap[targetStatus];
    if (
      !authUser.isCompanyAdmin &&
      !authUser.permissions.some((p) => p === requiredPermission)
    ) {
      throw new AppError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: `No posee el permiso "${requiredPermission}" requerido para cambiar la orden al estado "${targetStatus}".`,
      });
    }

    if (order.status === "DELIVERED") {
      throw AppError.conflict(
        "La orden ya fue entregada al cliente (DELIVERED) y su ciclo ha finalizado."
      );
    }

    if (targetStatus === "DELIVERED") {
      if (order.status !== "READY" && order.status !== "CANCELLED") {
        throw AppError.conflict(
          `Solo se puede marcar como DELIVERED una orden que esté en estado READY o CANCELLED (estado actual: ${order.status}).`
        );
      }

      const canDeliver =
        authUser.isCompanyAdmin ||
        order.createdById === authUser.userId ||
        (authUser.areaId !== null && authUser.areaId === order.originAreaId);

      if (!canDeliver) {
        throw new AppError({
          statusCode: 403,
          errorCode: "FORBIDDEN",
          message:
            "Solo el usuario de recepción que registró la orden (o un miembro autorizado de su área de recepción) puede marcarla como DELIVERED.",
        });
      }
      return;
    }

    // Para estados técnicos (DIAGNOSING, IN_REPAIR, READY, CANCELLED)
    if (order.status === "READY" || order.status === "CANCELLED") {
      throw AppError.conflict(
        `La orden ya fue finalizada técnicamente en estado "${order.status}" y está pendiente de entrega en Recepción.`
      );
    }

    const isAssignedTechnician = order.assignedToId === authUser.userId;
    const isTechAreaSupervisor =
      authUser.permissions.includes("ORDER_VIEW_AREA") &&
      authUser.areaId === order.targetAreaId;

    if (!authUser.isCompanyAdmin && !isAssignedTechnician && !isTechAreaSupervisor) {
      throw new AppError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message:
          "Solo el técnico asignado a esta orden (o el supervisor de su área técnica) puede actualizar su progreso de reparación.",
      });
    }
  }

  private async generateUniqueTicketCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateSecureTicketCode();
      const exists = await ordersRepository.existsByTicketCode(candidate);
      if (!exists) {
        return candidate;
      }
    }
    throw AppError.internal(
      "No fue posible generar un código único de seguimiento. Intente nuevamente."
    );
  }

  private mapInternalOrder(record: InternalOrderRecord): InternalOrderView {
    return {
      id: record.id,
      companyId: record.companyId,
      ticketCode: record.ticketCode,
      status: record.status as OrderStatus,
      priority: record.priority,
      clientName: record.clientName,
      clientContact: record.clientContact,
      deviceModel: record.deviceModel,
      issueDesc: record.issueDesc,
      resolutionNotes: record.resolutionNotes,
      cancellationReason: record.cancellationReason,
      createdBy: {
        id: record.createdBy.id,
        fullName: record.createdBy.fullName,
        email: record.createdBy.email,
        isDeleted:
          record.createdBy.deletedAt !== null || !record.createdBy.isActive,
      },
      originArea:
        record.originArea !== null
          ? {
              id: record.originArea.id,
              name: record.originArea.name,
            }
          : null,
      targetArea: {
        id: record.targetArea.id,
        name: record.targetArea.name,
      },
      assignedTo:
        record.assignedTo !== null
          ? {
              id: record.assignedTo.id,
              fullName: record.assignedTo.fullName,
              email: record.assignedTo.email,
            }
          : null,
      queuedAt: record.queuedAt.toISOString(),
      assignedAt:
        record.assignedAt !== null ? record.assignedAt.toISOString() : null,
      completedAt:
        record.completedAt !== null ? record.completedAt.toISOString() : null,
      deliveredAt:
        record.deliveredAt !== null ? record.deliveredAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      statusHistory: record.statusHistory.map((h) => ({
        id: h.id,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        changedByFullName: h.changedBy.fullName,
        comment: h.comment,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }
}

export const ordersService = new OrdersService();
