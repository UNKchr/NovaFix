import { randomInt } from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";
import {
  revokeTokenOnLogout,
  type AuthenticatedUserContext,
} from "../../shared/middlewares/auth.middleware.js";
import { ipSecurityService } from "../../shared/security/ip-security.service.js";
import {
  hashPassword,
  signAuthToken,
  verifyPassword,
} from "../../shared/utils/crypto.util.js";
import { resolveEffectivePermissions } from "../../shared/utils/permissions.util.js";
import type {
  AuthenticatedSessionView,
  LoginDto,
  RegisterCompanyDto,
} from "./auth.dto.js";
import { authRepository } from "./auth.repository.js";

function buildSlugFromName(companyName: string): string {
  const base = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const safeBase = base.length >= 2 ? base : "empresa";
  const randomSuffix = randomInt(1000, 9999);
  return `${safeBase}-${randomSuffix}`;
}

export class AuthService {
  public async registerCompany(
    dto: RegisterCompanyDto
  ): Promise<AuthenticatedSessionView> {
    const existingUser = await authRepository.findUserByEmail(dto.adminEmail);
    if (existingUser !== null) {
      throw AppError.conflict(
        "El correo electrónico proporcionado ya se encuentra registrado."
      );
    }

    let companySlug = buildSlugFromName(dto.companyName);
    const existingCompany = await authRepository.findCompanyBySlug(companySlug);
    if (existingCompany !== null) {
      companySlug = `${companySlug}-${randomInt(100, 999)}`;
    }

    const { passwordHash, passwordSalt } = await hashPassword(
      dto.adminPassword
    );

    const adminUser =
      await authRepository.createCompanyWithDefaultAreasAndAdmin({
        companyName: dto.companyName,
        companySlug,
        adminFullName: dto.adminFullName,
        adminEmail: dto.adminEmail,
        passwordHash,
        passwordSalt,
      });

    const effectivePermissions = resolveEffectivePermissions({
      isCompanyAdmin: adminUser.isCompanyAdmin,
      userPreset: adminUser.permissionPreset,
    });

    const { token, payload } = signAuthToken({
      userId: adminUser.id,
      companyId: adminUser.companyId,
    });

    return {
      token,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      user: {
        id: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        isCompanyAdmin: adminUser.isCompanyAdmin,
        companyId: adminUser.companyId,
        companyName: adminUser.company.name,
        areaId: null,
        areaName: null,
        isTechnicalArea: false,
        permissionPreset: adminUser.permissionPreset,
        permissions: effectivePermissions,
        unreadNotificationsCount: 0,
      },
    };
  }

  public async login(
    dto: LoginDto,
    clientIp?: string
  ): Promise<AuthenticatedSessionView> {
    const dbUser = await authRepository.findUserByEmail(dto.email);

    // Mensaje uniforme ante usuario inexistente o contraseña incorrecta (evita User Enumeration)
    if (
      dbUser === null ||
      !dbUser.isActive ||
      dbUser.deletedAt !== null ||
      !dbUser.company.isActive
    ) {
      if (clientIp !== undefined) {
        await ipSecurityService.recordFailedAuthAttempt(clientIp);
      }
      throw new AppError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Credenciales inválidas o cuenta inactiva.",
      });
    }

    const isPasswordValid = await verifyPassword(
      dto.password,
      dbUser.passwordHash,
      dbUser.passwordSalt
    );

    if (!isPasswordValid) {
      if (clientIp !== undefined) {
        await ipSecurityService.recordFailedAuthAttempt(clientIp);
      }
      throw new AppError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Credenciales inválidas o cuenta inactiva.",
      });
    }

    if (clientIp !== undefined) {
      await ipSecurityService.clearFailedAuthAttempts(clientIp);
    }

    const activeArea =
      dbUser.area !== null &&
      dbUser.area.isActive &&
      dbUser.area.deletedAt === null
        ? dbUser.area
        : null;

    const effectivePermissions = resolveEffectivePermissions({
      isCompanyAdmin: dbUser.isCompanyAdmin,
      userPreset: dbUser.permissionPreset,
      areaPreset: activeArea?.defaultPreset,
      areaPermissions: activeArea?.permissions.map((p) => p.permission),
      userPermissions: dbUser.customPermissions.map((p) => p.permission),
    });

    const unreadNotificationsCount =
      await authRepository.countUnreadNotifications({
        companyId: dbUser.companyId,
        userId: dbUser.id,
        areaId: activeArea?.id ?? null,
      });

    const { token, payload } = signAuthToken({
      userId: dbUser.id,
      companyId: dbUser.companyId,
    });

    return {
      token,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      user: {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        isCompanyAdmin: dbUser.isCompanyAdmin,
        companyId: dbUser.companyId,
        companyName: dbUser.company.name,
        areaId: activeArea?.id ?? null,
        areaName: activeArea?.name ?? null,
        isTechnicalArea: activeArea?.isTechnicalQueue ?? false,
        permissionPreset: dbUser.permissionPreset,
        permissions: effectivePermissions,
        unreadNotificationsCount,
      },
    };
  }

  public async logout(authUser: AuthenticatedUserContext): Promise<void> {
    await revokeTokenOnLogout(authUser.tokenJti, authUser.tokenExp);
  }

  public async getCurrentProfile(authUser: AuthenticatedUserContext) {
    const unreadNotificationsCount =
      await authRepository.countUnreadNotifications({
        companyId: authUser.companyId,
        userId: authUser.userId,
        areaId: authUser.areaId,
      });

    return {
      id: authUser.userId,
      email: authUser.email,
      fullName: authUser.fullName,
      isCompanyAdmin: authUser.isCompanyAdmin,
      companyId: authUser.companyId,
      companyName: authUser.companyName,
      areaId: authUser.areaId,
      areaName: authUser.areaName,
      isTechnicalArea: authUser.isTechnicalArea,
      permissionPreset: authUser.permissionPreset,
      permissions: authUser.permissions,
      unreadNotificationsCount,
    };
  }
}

export const authService = new AuthService();
