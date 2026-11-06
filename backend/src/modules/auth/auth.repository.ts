import { prisma } from "../../config/database.config.js";
import type { PermissionCode } from "../../generated/prisma/enums.js";
import { PRESET_PERMISSIONS_MAP } from "../../shared/utils/permissions.util.js";

export interface CreateCompanyAndAdminParams {
  readonly companyName: string;
  readonly companySlug: string;
  readonly adminFullName: string;
  readonly adminEmail: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
}

export class AuthRepository {
  public async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        company: true,
        area: {
          include: {
            permissions: true,
          },
        },
        customPermissions: true,
      },
    });
  }

  public async findCompanyBySlug(slug: string) {
    return prisma.company.findUnique({
      where: { slug },
    });
  }

  public async createCompanyWithDefaultAreasAndAdmin(
    params: CreateCompanyAndAdminParams
  ) {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: params.companyName,
          slug: params.companySlug,
          isActive: true,
        },
      });

      const receptionPermissions: ReadonlyArray<PermissionCode> =
        PRESET_PERMISSIONS_MAP.RECEPTION_AGENT;
      const technicalPermissions: ReadonlyArray<PermissionCode> =
        PRESET_PERMISSIONS_MAP.TECHNICAL_SPECIALIST;

      await tx.area.create({
        data: {
          companyId: company.id,
          name: "Recepción",
          description: "Área de atención al cliente, ingreso y entrega de equipos.",
          isTechnicalQueue: false,
          defaultPreset: "RECEPTION_AGENT",
          permissions: {
            create: receptionPermissions.map((permission) => ({ permission })),
          },
        },
      });

      await tx.area.create({
        data: {
          companyId: company.id,
          name: "Mantenimiento y Reparación",
          description: "Área técnica de diagnóstico, mantenimiento y reparación.",
          isTechnicalQueue: true,
          defaultPreset: "TECHNICAL_SPECIALIST",
          permissions: {
            create: technicalPermissions.map((permission) => ({ permission })),
          },
        },
      });

      const adminUser = await tx.user.create({
        data: {
          companyId: company.id,
          email: params.adminEmail,
          fullName: params.adminFullName,
          passwordHash: params.passwordHash,
          passwordSalt: params.passwordSalt,
          isCompanyAdmin: true,
          permissionPreset: "CUSTOM",
          isActive: true,
        },
        include: {
          company: true,
          area: {
            include: {
              permissions: true,
            },
          },
          customPermissions: true,
        },
      });

      return adminUser;
    });
  }

  public async countUnreadNotifications(params: {
    readonly companyId: string;
    readonly userId: string;
    readonly areaId: string | null;
  }): Promise<number> {
    const orConditions =
      params.areaId !== null
        ? [
            { recipientUserId: params.userId },
            {
              recipientUserId: null,
              recipientAreaId: params.areaId,
            },
          ]
        : [{ recipientUserId: params.userId }];

    return prisma.notification.count({
      where: {
        companyId: params.companyId,
        isHiddenByRecipient: false,
        isRead: false,
        OR: orConditions,
      },
    });
  }
}

export const authRepository = new AuthRepository();
