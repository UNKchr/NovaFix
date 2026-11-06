import { prisma } from "../../config/database.config.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  OrderPriority,
  OrderStatus,
} from "../../generated/prisma/enums.js";
import { resolveEffectivePermissions } from "../../shared/utils/permissions.util.js";

const ORDER_INTERNAL_INCLUDE = {
  createdBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
      deletedAt: true,
      isActive: true,
    },
  },
  originArea: {
    select: {
      id: true,
      name: true,
    },
  },
  targetArea: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  statusHistory: {
    include: {
      changedBy: {
        select: {
          fullName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} satisfies Prisma.RepairOrderInclude;

export type InternalOrderRecord = Prisma.RepairOrderGetPayload<{
  include: typeof ORDER_INTERNAL_INCLUDE;
}>;

export type OrderVisibilityScope =
  | { readonly mode: "ALL_COMPANY" }
  | {
      readonly mode: "AREA_SUPERVISOR";
      readonly userId: string;
      readonly areaId: string;
      readonly isTechnicalArea: boolean;
    }
  | {
      readonly mode: "RECEPTION_AGENT";
      readonly userId: string;
      readonly originAreaId: string | null;
    }
  | {
      readonly mode: "TECHNICAL_SPECIALIST";
      readonly userId: string;
    };

export class OrdersRepository {
  public async existsByTicketCode(ticketCode: string): Promise<boolean> {
    const count = await prisma.repairOrder.count({
      where: { ticketCode },
    });
    return count > 0;
  }

  public async findPublicByTicketCode(ticketCode: string) {
    return prisma.repairOrder.findFirst({
      where: {
        ticketCode,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        targetArea: {
          select: {
            name: true,
          },
        },
        statusHistory: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            newStatus: true,
            comment: true,
            createdAt: true,
          },
        },
      },
    });
  }

  public async findActiveByTicketCodeAndCompany(
    ticketCode: string,
    companyId: string
  ): Promise<InternalOrderRecord | null> {
    return prisma.repairOrder.findFirst({
      where: {
        ticketCode,
        companyId,
        deletedAt: null,
      },
      include: ORDER_INTERNAL_INCLUDE,
    });
  }

  public async listInternalOrders(params: {
    readonly companyId: string;
    readonly scope: OrderVisibilityScope;
    readonly status?: OrderStatus | undefined;
    readonly search?: string | undefined;
  }): Promise<ReadonlyArray<InternalOrderRecord>> {
    const scopeWhere: Prisma.RepairOrderWhereInput = (() => {
      switch (params.scope.mode) {
        case "ALL_COMPANY":
          return {};
        case "AREA_SUPERVISOR":
          return params.scope.isTechnicalArea
            ? {
                OR: [
                  { targetAreaId: params.scope.areaId },
                  { assignedToId: params.scope.userId },
                  { createdById: params.scope.userId },
                ],
              }
            : {
                OR: [
                  { originAreaId: params.scope.areaId },
                  { createdById: params.scope.userId },
                ],
              };
        case "RECEPTION_AGENT":
          return params.scope.originAreaId !== null
            ? {
                OR: [
                  { createdById: params.scope.userId },
                  {
                    originAreaId: params.scope.originAreaId,
                    createdBy: {
                      OR: [{ deletedAt: { not: null } }, { isActive: false }],
                    },
                  },
                ],
              }
            : { createdById: params.scope.userId };
        case "TECHNICAL_SPECIALIST":
          return { assignedToId: params.scope.userId };
      }
    })();

    const searchWhere: Prisma.RepairOrderWhereInput =
      params.search !== undefined && params.search.length > 0
        ? {
            OR: [
              {
                ticketCode: {
                  contains: params.search,
                  mode: "insensitive",
                },
              },
              {
                clientName: {
                  contains: params.search,
                  mode: "insensitive",
                },
              },
              {
                deviceModel: {
                  contains: params.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {};

    return prisma.repairOrder.findMany({
      where: {
        companyId: params.companyId,
        deletedAt: null,
        ...(params.status !== undefined ? { status: params.status } : {}),
        AND: [scopeWhere, searchWhere],
      },
      include: ORDER_INTERNAL_INCLUDE,
      orderBy: [
        { createdAt: "desc" },
      ],
    });
  }

  /**
   * Crea la orden en una transacción atómica aplicando el motor de Doble Cola FIFO:
   * - Busca en targetAreaId al técnico activo con permiso ORDER_ASSIGN_QUEUE que tenga
   *   0 órdenes activas (CREATED, DIAGNOSING, IN_REPAIR) y lleve más tiempo libre (availableSince ASC).
   * - Si existe: se la asigna inmediatamente en estado CREATED y le envía notificación directa.
   * - Si todos están ocupados: la coloca en fila (estado ASSIGNING, queuedAt = now) y notifica al área.
   */
  public async createOrderWithAutoQueue(params: {
    readonly companyId: string;
    readonly ticketCode: string;
    readonly clientName: string;
    readonly clientContact: string;
    readonly deviceModel: string;
    readonly issueDesc: string;
    readonly priority: OrderPriority;
    readonly createdById: string;
    readonly creatorFullName: string;
    readonly originAreaId: string | null;
    readonly originAreaName: string;
    readonly targetAreaId: string;
  }): Promise<InternalOrderRecord> {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const candidateTechnicians = await tx.user.findMany({
        where: {
          companyId: params.companyId,
          areaId: params.targetAreaId,
          isActive: true,
          deletedAt: null,
          assignedOrders: {
            none: {
              deletedAt: null,
              status: {
                in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
              },
            },
          },
        },
        include: {
          area: {
            include: { permissions: true },
          },
          customPermissions: true,
        },
        orderBy: {
          availableSince: "asc",
        },
      });

      const availableTech = candidateTechnicians.find((candidate) => {
        const effectivePerms = resolveEffectivePermissions({
          isCompanyAdmin: candidate.isCompanyAdmin,
          userPreset: candidate.permissionPreset,
          areaPreset: candidate.area?.defaultPreset,
          areaPermissions: candidate.area?.permissions.map((p) => p.permission),
          userPermissions: candidate.customPermissions.map((p) => p.permission),
        });
        return effectivePerms.includes("ORDER_ASSIGN_QUEUE");
      });

      const initialStatus: OrderStatus =
        availableTech !== undefined ? "CREATED" : "ASSIGNING";

      const createdOrder = await tx.repairOrder.create({
        data: {
          companyId: params.companyId,
          ticketCode: params.ticketCode,
          status: initialStatus,
          priority: params.priority,
          clientName: params.clientName,
          clientContact: params.clientContact,
          deviceModel: params.deviceModel,
          issueDesc: params.issueDesc,
          createdById: params.createdById,
          originAreaId: params.originAreaId,
          targetAreaId: params.targetAreaId,
          assignedToId: availableTech?.id ?? null,
          queuedAt: now,
          assignedAt: availableTech !== undefined ? now : null,
          statusHistory: {
            create: {
              previousStatus: null,
              newStatus: initialStatus,
              changedById: params.createdById,
              comment:
                availableTech !== undefined
                  ? `Orden registrada por ${params.creatorFullName} (${params.originAreaName}) y asignada automáticamente al técnico ${availableTech.fullName}.`
                  : `Orden registrada por ${params.creatorFullName} (${params.originAreaName}) y colocada en lista de espera del taller.`,
            },
          },
        },
        include: ORDER_INTERNAL_INCLUDE,
      });

      if (availableTech !== undefined) {
        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: createdOrder.id,
            actorUserId: params.createdById,
            recipientUserId: availableTech.id,
            type: "ORDER_CREATED_ASSIGNED",
            title: `Nueva orden asignada #${createdOrder.ticketCode}`,
            message: `Se ha generado una nueva orden de reparación/diagnóstico #${createdOrder.ticketCode} (${createdOrder.deviceModel}) por parte de ${params.creatorFullName} (${params.originAreaName}) y te ha sido asignada automáticamente.`,
          },
        });
      } else {
        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: createdOrder.id,
            actorUserId: params.createdById,
            recipientAreaId: params.targetAreaId,
            type: "ORDER_QUEUED_IN_AREA",
            title: `Nueva orden en fila #${createdOrder.ticketCode}`,
            message: `Se ha generado una nueva orden #${createdOrder.ticketCode} (${createdOrder.deviceModel}) por parte de ${params.creatorFullName} (${params.originAreaName}). Se encuentra en fila de espera para el primer técnico disponible.`,
          },
        });
      }

      return createdOrder;
    });
  }

  /**
   * Actualiza el estado de la orden en una transacción atómica, envía las notificaciones
   * correspondientes y, si el técnico finaliza (READY o CANCELLED), busca automáticamente
   * la orden que lleve más tiempo esperando en la fila (ASSIGNING) para asignársela de inmediato.
   */
  public async updateStatusAndDequeueNext(params: {
    readonly orderId: string;
    readonly companyId: string;
    readonly previousStatus: OrderStatus;
    readonly newStatus: OrderStatus;
    readonly actorUserId: string;
    readonly actorFullName: string;
    readonly resolutionNotes?: string | undefined;
    readonly cancellationReason?: string | undefined;
    readonly comment?: string | undefined;
  }): Promise<{
    readonly updatedOrder: InternalOrderRecord;
    readonly dequeuedTicketCode: string | null;
  }> {
    const now = new Date();
    let dequeuedTicketCode: string | null = null;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const isFinishingTechWork =
        params.newStatus === "READY" || params.newStatus === "CANCELLED";
      const isDelivering = params.newStatus === "DELIVERED";

      const orderAfterUpdate = await tx.repairOrder.update({
        where: { id: params.orderId },
        data: {
          status: params.newStatus,
          ...(params.resolutionNotes !== undefined
            ? { resolutionNotes: params.resolutionNotes }
            : {}),
          ...(params.cancellationReason !== undefined
            ? { cancellationReason: params.cancellationReason }
            : {}),
          ...(isFinishingTechWork ? { completedAt: now } : {}),
          ...(isDelivering ? { deliveredAt: now } : {}),
        },
        include: ORDER_INTERNAL_INCLUDE,
      });

      const historyComment =
        params.newStatus === "READY"
          ? `Equipo listo para entrega. Trabajo realizado: ${params.resolutionNotes ?? ""}`
          : params.newStatus === "CANCELLED"
            ? `Orden cancelada. Motivo: ${params.cancellationReason ?? ""}`
            : params.newStatus === "DELIVERED"
              ? (params.comment ?? `Equipo entregado al cliente por ${params.actorFullName}.`)
              : (params.comment ??
                `Estado actualizado por ${params.actorFullName}.`);

      await tx.orderStatusHistory.create({
        data: {
          repairOrderId: orderAfterUpdate.id,
          previousStatus: params.previousStatus,
          newStatus: params.newStatus,
          changedById: params.actorUserId,
          comment: historyComment.slice(0, 1000),
        },
      });

      // Determinar destinatario en Recepción (creador activo o área de origen si el creador fue eliminado)
      const isCreatorActive =
        orderAfterUpdate.createdBy.isActive &&
        orderAfterUpdate.createdBy.deletedAt === null;

      const receptionNotificationTarget = isCreatorActive
        ? { recipientUserId: orderAfterUpdate.createdById }
        : { recipientAreaId: orderAfterUpdate.originAreaId };

      if (
        params.newStatus === "DIAGNOSING" ||
        params.newStatus === "IN_REPAIR"
      ) {
        const statusLabel =
          params.newStatus === "DIAGNOSING" ? "en diagnóstico" : "en reparación";
        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: orderAfterUpdate.id,
            actorUserId: params.actorUserId,
            ...receptionNotificationTarget,
            type: "ORDER_STATUS_PROGRESS",
            title: `Orden #${orderAfterUpdate.ticketCode} ahora está ${statusLabel}`,
            message: `El técnico ${params.actorFullName} actualizó el estado de la orden #${orderAfterUpdate.ticketCode} (${orderAfterUpdate.deviceModel}) a ${statusLabel}.`,
          },
        });
      } else if (params.newStatus === "READY") {
        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: orderAfterUpdate.id,
            actorUserId: params.actorUserId,
            ...receptionNotificationTarget,
            type: "ORDER_READY_FOR_PICKUP",
            title: `Orden #${orderAfterUpdate.ticketCode} lista para entrega`,
            message: `El técnico ${params.actorFullName} finalizó la orden #${orderAfterUpdate.ticketCode} (${orderAfterUpdate.deviceModel}). Trabajo realizado: "${params.resolutionNotes ?? ""}". Por favor, avisa al cliente.`,
          },
        });
      } else if (params.newStatus === "CANCELLED") {
        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: orderAfterUpdate.id,
            actorUserId: params.actorUserId,
            ...receptionNotificationTarget,
            type: "ORDER_CANCELLED_ALERT",
            title: `Orden #${orderAfterUpdate.ticketCode} cancelada`,
            message: `El técnico ${params.actorFullName} canceló la orden #${orderAfterUpdate.ticketCode} (${orderAfterUpdate.deviceModel}). Motivo: "${params.cancellationReason ?? ""}". Por favor, informa al cliente.`,
          },
        });
      }

      // Si el técnico acaba de finalizar su orden (READY o CANCELLED), liberarlo y desencolar la orden más antigua en fila
      if (isFinishingTechWork && orderAfterUpdate.assignedToId !== null) {
        await this.assignNextQueuedOrderOrMarkTechAvailable(tx, {
          companyId: params.companyId,
          targetAreaId: orderAfterUpdate.targetAreaId,
          releasedTechId: orderAfterUpdate.assignedToId,
          releasedTechFullName:
            orderAfterUpdate.assignedTo?.fullName ?? params.actorFullName,
          actorUserId: params.actorUserId,
          now,
          onDequeued: (ticketCode) => {
            dequeuedTicketCode = ticketCode;
          },
        });
      }

      return tx.repairOrder.findUniqueOrThrow({
        where: { id: orderAfterUpdate.id },
        include: ORDER_INTERNAL_INCLUDE,
      });
    });

    return {
      updatedOrder,
      dequeuedTicketCode,
    };
  }

  /**
   * Elimina de forma segura (Soft Delete) una orden creada por equivocación o por administración,
   * liberando de inmediato al técnico asignado y desencolando la siguiente orden en espera.
   */
  public async softDeleteOrderAndReleaseTech(params: {
    readonly orderId: string;
    readonly companyId: string;
    readonly actorUserId: string;
    readonly actorFullName: string;
  }): Promise<{ readonly dequeuedTicketCode: string | null }> {
    const now = new Date();
    let dequeuedTicketCode: string | null = null;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.repairOrder.findFirst({
        where: {
          id: params.orderId,
          companyId: params.companyId,
          deletedAt: null,
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      if (existing === null) {
        return;
      }

      const wasActiveWithTech =
        existing.assignedToId !== null &&
        (existing.status === "CREATED" ||
          existing.status === "DIAGNOSING" ||
          existing.status === "IN_REPAIR");

      await tx.repairOrder.update({
        where: { id: existing.id },
        data: {
          deletedAt: now,
          deletedById: params.actorUserId,
        },
      });

      if (wasActiveWithTech && existing.assignedToId !== null) {
        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: existing.id,
            actorUserId: params.actorUserId,
            recipientUserId: existing.assignedToId,
            type: "ORDER_VOIDED_DELETED",
            title: `Orden #${existing.ticketCode} anulada por ${params.actorFullName}`,
            message: `La orden #${existing.ticketCode} (${existing.deviceModel}) que tenías asignada fue eliminada/anulada por ${params.actorFullName}.`,
          },
        });

        await this.assignNextQueuedOrderOrMarkTechAvailable(tx, {
          companyId: params.companyId,
          targetAreaId: existing.targetAreaId,
          releasedTechId: existing.assignedToId,
          releasedTechFullName:
            existing.assignedTo?.fullName ?? "Técnico disponible",
          actorUserId: params.actorUserId,
          now,
          onDequeued: (ticketCode) => {
            dequeuedTicketCode = ticketCode;
          },
        });
      }
    });

    return { dequeuedTicketCode };
  }

  private async assignNextQueuedOrderOrMarkTechAvailable(
    tx: Prisma.TransactionClient,
    params: {
      readonly companyId: string;
      readonly targetAreaId: string;
      readonly releasedTechId: string;
      readonly releasedTechFullName: string;
      readonly actorUserId: string;
      readonly now: Date;
      readonly onDequeued: (ticketCode: string) => void;
    }
  ): Promise<void> {
    const remainingActiveForTech = await tx.repairOrder.count({
      where: {
        companyId: params.companyId,
        assignedToId: params.releasedTechId,
        deletedAt: null,
        status: {
          in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
        },
      },
    });

    if (remainingActiveForTech > 0) {
      return;
    }

    const nextQueuedOrder = await tx.repairOrder.findFirst({
      where: {
        companyId: params.companyId,
        targetAreaId: params.targetAreaId,
        deletedAt: null,
        status: "ASSIGNING",
        assignedToId: null,
      },
      orderBy: [
        { priority: "desc" },
        { queuedAt: "asc" },
      ],
    });

    if (nextQueuedOrder !== null) {
      const atomicClaim = await tx.repairOrder.updateMany({
        where: {
          id: nextQueuedOrder.id,
          status: "ASSIGNING",
          assignedToId: null,
          deletedAt: null,
        },
        data: {
          status: "CREATED",
          assignedToId: params.releasedTechId,
          assignedAt: params.now,
        },
      });

      if (atomicClaim.count === 1) {
        params.onDequeued(nextQueuedOrder.ticketCode);

        await tx.orderStatusHistory.create({
          data: {
            repairOrderId: nextQueuedOrder.id,
            previousStatus: "ASSIGNING",
            newStatus: "CREATED",
            changedById: params.actorUserId,
            comment: `Orden desencolada de la fila de espera y asignada automáticamente al técnico disponible ${params.releasedTechFullName}.`,
          },
        });

        await tx.notification.create({
          data: {
            companyId: params.companyId,
            repairOrderId: nextQueuedOrder.id,
            actorUserId: params.actorUserId,
            recipientUserId: params.releasedTechId,
            type: "ORDER_ASSIGNED_FROM_QUEUE",
            title: `Orden prioritaria de la fila asignada #${nextQueuedOrder.ticketCode}`,
            message: `Se te ha asignado automáticamente la orden #${nextQueuedOrder.ticketCode} (${nextQueuedOrder.deviceModel}) que esperaba en fila desde ${nextQueuedOrder.queuedAt.toLocaleTimeString()}.`,
          },
        });
        return;
      }
    }

    // Si no hay órdenes esperando en la fila, actualizamos availableSince para registrar desde qué instante exacto está libre
    await tx.user.update({
      where: { id: params.releasedTechId },
      data: {
        availableSince: params.now,
      },
    });
  }
}

export const ordersRepository = new OrdersRepository();
