import { prisma } from "../../config/database.config.js";
import type {
  PermissionCode,
  PermissionPreset,
} from "../../generated/prisma/enums.js";
import { resolveEffectivePermissions } from "../../shared/utils/permissions.util.js";

export interface CreateUserRepoParams {
  readonly companyId: string;
  readonly areaId: string;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly permissionPreset: PermissionPreset;
  readonly customPermissions: ReadonlyArray<PermissionCode>;
}

export interface UpdateUserRepoParams {
  readonly userId: string;
  readonly companyId: string;
  readonly fullName?: string | undefined;
  readonly areaId?: string | undefined;
  readonly passwordHash?: string | undefined;
  readonly passwordSalt?: string | undefined;
  readonly permissionPreset?: PermissionPreset | undefined;
  readonly customPermissions?: ReadonlyArray<PermissionCode> | undefined;
  readonly isActive?: boolean | undefined;
}

export class UsersRepository {
  public async listActiveUsers(params: {
    readonly companyId: string;
    readonly filterAreaId?: string | undefined;
  }) {
    return prisma.user.findMany({
      where: {
        companyId: params.companyId,
        deletedAt: null,
        ...(params.filterAreaId !== undefined
          ? { areaId: params.filterAreaId }
          : {}),
      },
      include: {
        area: {
          include: {
            permissions: true,
          },
        },
        customPermissions: true,
        _count: {
          select: {
            assignedOrders: {
              where: {
                deletedAt: null,
                status: {
                  in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
                },
              },
            },
          },
        },
      },
      orderBy: [
        { isCompanyAdmin: "desc" },
        { fullName: "asc" },
      ],
    });
  }

  public async findActiveByIdAndCompany(userId: string, companyId: string) {
    return prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        deletedAt: null,
      },
      include: {
        area: {
          include: {
            permissions: true,
          },
        },
        customPermissions: true,
        _count: {
          select: {
            assignedOrders: {
              where: {
                deletedAt: null,
                status: {
                  in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
                },
              },
            },
          },
        },
      },
    });
  }

  public async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  public async createUser(params: CreateUserRepoParams) {
    const uniquePerms = Array.from(new Set(params.customPermissions));
    return prisma.user.create({
      data: {
        companyId: params.companyId,
        areaId: params.areaId,
        email: params.email,
        fullName: params.fullName,
        passwordHash: params.passwordHash,
        passwordSalt: params.passwordSalt,
        isCompanyAdmin: false,
        permissionPreset: params.permissionPreset,
        isActive: true,
        availableSince: new Date(),
        customPermissions: {
          create: uniquePerms.map((permission) => ({ permission })),
        },
      },
      include: {
        area: {
          include: {
            permissions: true,
          },
        },
        customPermissions: true,
        _count: {
          select: {
            assignedOrders: {
              where: {
                deletedAt: null,
                status: {
                  in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
                },
              },
            },
          },
        },
      },
    });
  }

  public async updateUser(params: UpdateUserRepoParams) {
    return prisma.$transaction(async (tx) => {
      if (params.customPermissions !== undefined) {
        const uniquePerms = Array.from(new Set(params.customPermissions));
        await tx.userPermission.deleteMany({
          where: { userId: params.userId },
        });
        if (uniquePerms.length > 0) {
          await tx.userPermission.createMany({
            data: uniquePerms.map((permission) => ({
              userId: params.userId,
              permission,
            })),
          });
        }
      }

      return tx.user.update({
        where: { id: params.userId },
        data: {
          ...(params.fullName !== undefined ? { fullName: params.fullName } : {}),
          ...(params.areaId !== undefined ? { areaId: params.areaId } : {}),
          ...(params.passwordHash !== undefined
            ? { passwordHash: params.passwordHash }
            : {}),
          ...(params.passwordSalt !== undefined
            ? { passwordSalt: params.passwordSalt }
            : {}),
          ...(params.permissionPreset !== undefined
            ? { permissionPreset: params.permissionPreset }
            : {}),
          ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
        },
        include: {
          area: {
            include: {
              permissions: true,
            },
          },
          customPermissions: true,
          _count: {
            select: {
              assignedOrders: {
                where: {
                  deletedAt: null,
                  status: {
                    in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
                  },
                },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Baja segura (Soft Delete) de un usuario con protección total anti-corrupción:
   * - Si el usuario eliminado era un técnico con órdenes activas (CREATED, DIAGNOSING, IN_REPAIR),
   *   registra el estado previo en el historial y reasigna cada orden al técnico libre con mayor
   *   tiempo disponible (availableSince ASC) en esa misma área, o la devuelve al frente de la cola
   *   (ASSIGNING) conservando su queuedAt original.
   * - Si era un recepcionista, sus órdenes activas permanecen vinculadas a originAreaId para que
   *   sus compañeros activos de recepción reciban los avisos y puedan entregarlas.
   */
  public async softDeleteUserAndReassignActiveOrders(params: {
    readonly targetUserId: string;
    readonly actorAdminId: string;
    readonly companyId: string;
  }): Promise<ReadonlyArray<string>> {
    const now = new Date();
    const affectedTicketCodes: string[] = [];

    await prisma.$transaction(async (tx) => {
      const userToDelete = await tx.user.findFirst({
        where: {
          id: params.targetUserId,
          companyId: params.companyId,
          deletedAt: null,
        },
      });

      if (userToDelete === null) {
        return;
      }

      const archivedEmail = `deleted_${now.getTime()}_${userToDelete.email}`.slice(
        0,
        150
      );

      await tx.user.update({
        where: { id: userToDelete.id },
        data: {
          email: archivedEmail,
          isActive: false,
          deletedAt: now,
        },
      });

      const activeAssignedOrders = await tx.repairOrder.findMany({
        where: {
          companyId: params.companyId,
          assignedToId: userToDelete.id,
          deletedAt: null,
          status: {
            in: ["CREATED", "DIAGNOSING", "IN_REPAIR"],
          },
        },
        orderBy: [
          { priority: "desc" },
          { queuedAt: "asc" },
        ],
      });

      for (const order of activeAssignedOrders) {
        affectedTicketCodes.push(order.ticketCode);

        const candidatesInArea = await tx.user.findMany({
          where: {
            companyId: params.companyId,
            areaId: order.targetAreaId,
            isActive: true,
            deletedAt: null,
            id: { not: userToDelete.id },
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

        const nextAvailableTech = candidatesInArea.find((candidate) => {
          const perms = resolveEffectivePermissions({
            isCompanyAdmin: candidate.isCompanyAdmin,
            userPreset: candidate.permissionPreset,
            areaPreset: candidate.area?.defaultPreset,
            areaPermissions: candidate.area?.permissions.map((p) => p.permission),
            userPermissions: candidate.customPermissions.map((p) => p.permission),
          });
          return perms.includes("ORDER_ASSIGN_QUEUE");
        });

        if (nextAvailableTech !== undefined) {
          await tx.repairOrder.update({
            where: { id: order.id },
            data: {
              status: "CREATED",
              assignedToId: nextAvailableTech.id,
              assignedAt: now,
            },
          });

          await tx.orderStatusHistory.create({
            data: {
              repairOrderId: order.id,
              previousStatus: order.status,
              newStatus: "CREATED",
              changedById: params.actorAdminId,
              comment: `Orden reasignada automáticamente a ${nextAvailableTech.fullName} por baja del técnico anterior (${userToDelete.fullName}). Estado previo reportado: ${order.status}.`,
            },
          });

          await tx.notification.create({
            data: {
              companyId: params.companyId,
              repairOrderId: order.id,
              actorUserId: params.actorAdminId,
              recipientUserId: nextAvailableTech.id,
              type: "ORDER_REASSIGNED",
              title: `Orden #${order.ticketCode} reasignada a tu bandeja`,
              message: `Se te ha reasignado automáticamente la orden #${order.ticketCode} (${order.deviceModel}) tras la baja del técnico anterior. Estado previo: ${order.status}.`,
            },
          });
        } else {
          await tx.repairOrder.update({
            where: { id: order.id },
            data: {
              status: "ASSIGNING",
              assignedToId: null,
              assignedAt: null,
            },
          });

          await tx.orderStatusHistory.create({
            data: {
              repairOrderId: order.id,
              previousStatus: order.status,
              newStatus: "ASSIGNING",
              changedById: params.actorAdminId,
              comment: `Orden devuelta al frente de la fila (ASSIGNING) por baja del técnico anterior (${userToDelete.fullName}). Estado previo: ${order.status}.`,
            },
          });

          await tx.notification.create({
            data: {
              companyId: params.companyId,
              repairOrderId: order.id,
              actorUserId: params.actorAdminId,
              recipientAreaId: order.targetAreaId,
              type: "ORDER_REASSIGNED",
              title: `Orden #${order.ticketCode} reingresada al frente de la fila`,
              message: `La orden #${order.ticketCode} (${order.deviceModel}) volvió como prioritaria a la fila de espera tras la baja del técnico anterior (estado previo: ${order.status}).`,
            },
          });
        }
      }
    });

    return affectedTicketCodes;
  }
}

export const usersRepository = new UsersRepository();
