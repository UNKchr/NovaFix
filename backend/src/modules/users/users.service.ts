import { redisCache } from "../../config/redis.config.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  revokeAllUserSessions,
  type AuthenticatedUserContext,
} from "../../shared/middlewares/auth.middleware.js";
import { hashPassword } from "../../shared/utils/crypto.util.js";
import { resolveEffectivePermissions } from "../../shared/utils/permissions.util.js";
import { buildOrderCacheKey } from "../../shared/utils/validation.util.js";
import { areasRepository } from "../areas/areas.repository.js";
import type {
  CreateUserDto,
  UpdateUserDto,
  UserSummaryView,
} from "./users.dto.js";
import { usersRepository } from "./users.repository.js";

export class UsersService {
  public async listUsers(
    authUser: AuthenticatedUserContext
  ): Promise<ReadonlyArray<UserSummaryView>> {
    const canManageUsers =
      authUser.isCompanyAdmin || authUser.permissions.includes("MANAGE_USERS");
    const canViewArea = authUser.permissions.includes("ORDER_VIEW_AREA");

    if (!canManageUsers && !canViewArea) {
      throw new AppError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: "No tiene permisos para consultar el directorio de usuarios.",
      });
    }

    const filterAreaId =
      !canManageUsers && canViewArea
        ? (authUser.areaId ?? undefined)
        : undefined;

    const users = await usersRepository.listActiveUsers({
      companyId: authUser.companyId,
      filterAreaId,
    });

    return users.map((u) => this.mapUserToSummaryView(u));
  }

  public async createUser(
    authUser: AuthenticatedUserContext,
    dto: CreateUserDto
  ): Promise<UserSummaryView> {
    const existingEmail = await usersRepository.findByEmail(dto.email);
    if (existingEmail !== null) {
      throw AppError.conflict(
        `El correo electrónico "${dto.email}" ya está en uso.`
      );
    }

    const targetArea = await areasRepository.findActiveByIdAndCompany(
      dto.areaId,
      authUser.companyId
    );
    if (targetArea === null) {
      throw AppError.notFound(
        "El área seleccionada no existe en su empresa o fue eliminada."
      );
    }

    const { passwordHash, passwordSalt } = await hashPassword(dto.password);

    const created = await usersRepository.createUser({
      companyId: authUser.companyId,
      areaId: dto.areaId,
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      passwordSalt,
      permissionPreset: dto.permissionPreset,
      customPermissions: dto.customPermissions ?? [],
    });

    return this.mapUserToSummaryView(created);
  }

  public async updateUser(
    authUser: AuthenticatedUserContext,
    targetUserId: string,
    dto: UpdateUserDto
  ): Promise<UserSummaryView> {
    const existingUser = await usersRepository.findActiveByIdAndCompany(
      targetUserId,
      authUser.companyId
    );
    if (existingUser === null) {
      throw AppError.notFound("El usuario especificado no existe en su empresa.");
    }

    if (dto.areaId !== undefined) {
      const targetArea = await areasRepository.findActiveByIdAndCompany(
        dto.areaId,
        authUser.companyId
      );
      if (targetArea === null) {
        throw AppError.notFound(
          "El área seleccionada no existe en su empresa o fue eliminada."
        );
      }
    }

    let passwordHash: string | undefined;
    let passwordSalt: string | undefined;

    if (dto.password !== undefined) {
      const hashed = await hashPassword(dto.password);
      passwordHash = hashed.passwordHash;
      passwordSalt = hashed.passwordSalt;
    }

    const updated = await usersRepository.updateUser({
      userId: targetUserId,
      companyId: authUser.companyId,
      fullName: dto.fullName,
      areaId: dto.areaId,
      passwordHash,
      passwordSalt,
      permissionPreset: dto.permissionPreset,
      customPermissions: dto.customPermissions,
      isActive: dto.isActive,
    });

    if (
      dto.password !== undefined ||
      dto.permissionPreset !== undefined ||
      dto.customPermissions !== undefined ||
      dto.isActive === false
    ) {
      await revokeAllUserSessions(targetUserId);
    }

    return this.mapUserToSummaryView(updated);
  }

  public async deleteUser(
    authUser: AuthenticatedUserContext,
    targetUserId: string
  ): Promise<{
    readonly deletedUserId: string;
    readonly reassignedOrdersCount: number;
  }> {
    if (targetUserId === authUser.userId) {
      throw AppError.badRequest(
        "No puede eliminar su propia cuenta de administrador activa."
      );
    }

    const existingUser = await usersRepository.findActiveByIdAndCompany(
      targetUserId,
      authUser.companyId
    );
    if (existingUser === null) {
      throw AppError.notFound("El usuario especificado no existe o ya fue eliminado.");
    }

    if (existingUser.isCompanyAdmin) {
      throw AppError.badRequest(
        "No se puede eliminar al usuario Administrador principal de la empresa."
      );
    }

    const affectedTicketCodes =
      await usersRepository.softDeleteUserAndReassignActiveOrders({
        targetUserId,
        actorAdminId: authUser.userId,
        companyId: authUser.companyId,
      });

    await revokeAllUserSessions(targetUserId);

    for (const ticketCode of affectedTicketCodes) {
      await redisCache.del(buildOrderCacheKey(ticketCode));
    }

    return {
      deletedUserId: targetUserId,
      reassignedOrdersCount: affectedTicketCodes.length,
    };
  }

  private mapUserToSummaryView(
    dbUser: Awaited<ReturnType<typeof usersRepository.createUser>>
  ): UserSummaryView {
    const activeArea =
      dbUser.area !== null &&
      dbUser.area.isActive &&
      dbUser.area.deletedAt === null
        ? dbUser.area
        : null;

    const customPermissions = dbUser.customPermissions.map((p) => p.permission);
    const effectivePermissions = resolveEffectivePermissions({
      isCompanyAdmin: dbUser.isCompanyAdmin,
      userPreset: dbUser.permissionPreset,
      areaPreset: activeArea?.defaultPreset,
      areaPermissions: activeArea?.permissions.map((p) => p.permission),
      userPermissions: customPermissions,
    });

    const activeAssignedOrdersCount = dbUser._count.assignedOrders;

    return {
      id: dbUser.id,
      companyId: dbUser.companyId,
      email: dbUser.email,
      fullName: dbUser.fullName,
      isCompanyAdmin: dbUser.isCompanyAdmin,
      isActive: dbUser.isActive,
      areaId: activeArea?.id ?? null,
      areaName: activeArea?.name ?? null,
      isTechnicalArea: activeArea?.isTechnicalQueue ?? false,
      permissionPreset: dbUser.permissionPreset,
      customPermissions,
      effectivePermissions,
      isBusyWithActiveOrder: activeAssignedOrdersCount > 0,
      activeAssignedOrdersCount,
      availableSince: dbUser.availableSince.toISOString(),
      createdAt: dbUser.createdAt.toISOString(),
    };
  }
}

export const usersService = new UsersService();
