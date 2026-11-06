import { prisma } from "../../config/database.config.js";
import type {
  PermissionCode,
  PermissionPreset,
} from "../../generated/prisma/enums.js";

export interface CreateAreaRepoParams {
  readonly companyId: string;
  readonly name: string;
  readonly description: string | null;
  readonly isTechnicalQueue: boolean;
  readonly defaultPreset: PermissionPreset;
  readonly permissions: ReadonlyArray<PermissionCode>;
}

export interface UpdateAreaRepoParams {
  readonly areaId: string;
  readonly companyId: string;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly isTechnicalQueue?: boolean | undefined;
  readonly defaultPreset?: PermissionPreset | undefined;
  readonly permissions?: ReadonlyArray<PermissionCode> | undefined;
}

export class AreasRepository {
  public async listActiveByCompany(companyId: string) {
    return prisma.area.findMany({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        permissions: true,
        _count: {
          select: {
            users: {
              where: {
                isActive: true,
                deletedAt: null,
              },
            },
            targetedOrders: {
              where: {
                deletedAt: null,
                status: {
                  in: ["CREATED", "ASSIGNING", "DIAGNOSING", "IN_REPAIR", "READY"],
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  public async findActiveByIdAndCompany(areaId: string, companyId: string) {
    return prisma.area.findFirst({
      where: {
        id: areaId,
        companyId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        permissions: true,
      },
    });
  }

  public async findByNameInCompany(companyId: string, name: string) {
    return prisma.area.findFirst({
      where: {
        companyId,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    });
  }

  public async createArea(params: CreateAreaRepoParams) {
    const uniquePermissions = Array.from(new Set(params.permissions));
    return prisma.area.create({
      data: {
        companyId: params.companyId,
        name: params.name,
        description: params.description,
        isTechnicalQueue: params.isTechnicalQueue,
        defaultPreset: params.defaultPreset,
        isActive: true,
        permissions: {
          create: uniquePermissions.map((permission) => ({ permission })),
        },
      },
      include: {
        permissions: true,
        _count: {
          select: {
            users: {
              where: { isActive: true, deletedAt: null },
            },
            targetedOrders: {
              where: {
                deletedAt: null,
                status: {
                  in: ["CREATED", "ASSIGNING", "DIAGNOSING", "IN_REPAIR", "READY"],
                },
              },
            },
          },
        },
      },
    });
  }

  public async updateArea(params: UpdateAreaRepoParams) {
    return prisma.$transaction(async (tx) => {
      if (params.permissions !== undefined) {
        const uniquePermissions = Array.from(new Set(params.permissions));
        await tx.areaPermission.deleteMany({
          where: { areaId: params.areaId },
        });
        if (uniquePermissions.length > 0) {
          await tx.areaPermission.createMany({
            data: uniquePermissions.map((permission) => ({
              areaId: params.areaId,
              permission,
            })),
          });
        }
      }

      return tx.area.update({
        where: { id: params.areaId },
        data: {
          ...(params.name !== undefined ? { name: params.name } : {}),
          ...(params.description !== undefined
            ? { description: params.description }
            : {}),
          ...(params.isTechnicalQueue !== undefined
            ? { isTechnicalQueue: params.isTechnicalQueue }
            : {}),
          ...(params.defaultPreset !== undefined
            ? { defaultPreset: params.defaultPreset }
            : {}),
        },
        include: {
          permissions: true,
          _count: {
            select: {
              users: {
                where: { isActive: true, deletedAt: null },
              },
              targetedOrders: {
                where: {
                  deletedAt: null,
                  status: {
                    in: [
                      "CREATED",
                      "ASSIGNING",
                      "DIAGNOSING",
                      "IN_REPAIR",
                      "READY",
                    ],
                  },
                },
              },
            },
          },
        },
      });
    });
  }

  public async countActiveOrdersInArea(
    areaId: string,
    companyId: string
  ): Promise<number> {
    return prisma.repairOrder.count({
      where: {
        companyId,
        deletedAt: null,
        status: {
          in: ["CREATED", "ASSIGNING", "DIAGNOSING", "IN_REPAIR", "READY"],
        },
        OR: [{ targetAreaId: areaId }, { originAreaId: areaId }],
      },
    });
  }

  public async softDeleteArea(areaId: string, companyId: string): Promise<void> {
    const now = new Date();
    const archivedSuffix = `_deleted_${now.getTime()}`;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.area.findFirst({
        where: { id: areaId, companyId },
      });
      if (existing === null) {
        return;
      }

      const archivedName = `${existing.name.slice(0, 50)}${archivedSuffix}`;

      await tx.user.updateMany({
        where: { companyId, areaId },
        data: { areaId: null },
      });

      await tx.area.update({
        where: { id: areaId },
        data: {
          name: archivedName,
          isActive: false,
          deletedAt: now,
        },
      });
    });
  }
}

export const areasRepository = new AreasRepository();
