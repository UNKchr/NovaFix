import type { Request, Response, NextFunction, RequestHandler } from "express";
import type {
  PermissionCode,
  PermissionPreset,
} from "../../generated/prisma/enums.js";
import { prisma } from "../../config/database.config.js";
import { redisCache } from "../../config/redis.config.js";
import { AppError } from "../errors/app-error.js";
import { verifyAuthToken } from "../utils/crypto.util.js";
import { resolveEffectivePermissions } from "../utils/permissions.util.js";

export interface AuthenticatedUserContext {
  readonly userId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly email: string;
  readonly fullName: string;
  readonly isCompanyAdmin: boolean;
  readonly areaId: string | null;
  readonly areaName: string | null;
  readonly isTechnicalArea: boolean;
  readonly permissionPreset: PermissionPreset;
  readonly permissions: ReadonlyArray<PermissionCode>;
  readonly tokenJti: string;
  readonly tokenExp: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUserContext | undefined;
    }
  }
}

const REVOKED_TOKEN_PREFIX = "revoked_jwt:";
const USER_REVOKED_AFTER_PREFIX = "revoked_user_iat:";

/**
 * Almacena el identificador único del token (jti) en lista negra de Redis
 * cuando el usuario cierra sesión (Logout) hasta que el token expire naturalmente.
 */
export async function revokeTokenOnLogout(
  jti: string,
  expSeconds: number
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingTtl = Math.max(expSeconds - nowSeconds, 60);
  await redisCache.set(`${REVOKED_TOKEN_PREFIX}${jti}`, "revoked", remainingTtl);
}

/**
 * Invalida inmediatamente todos los tokens emitidos para un usuario antes del instante actual
 * (ej. cuando el Admin cambia su contraseña, modifica sus permisos o lo da de baja).
 */
export async function revokeAllUserSessions(
  userId: string,
  ttlSeconds = 86400
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  await redisCache.set(
    `${USER_REVOKED_AFTER_PREFIX}${userId}`,
    nowSeconds,
    ttlSeconds
  );
}

/**
 * Extrae de forma segura el token Bearer de la cabecera Authorization.
 */
function extractBearerToken(authorizationHeader: string | undefined): string {
  if (
    typeof authorizationHeader !== "string" ||
    authorizationHeader.trim().length === 0
  ) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Se requiere autenticación. Cabecera Authorization no proporcionada.",
    });
  }

  const parts = authorizationHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Formato de cabecera Authorization inválido. Use: Bearer <token>.",
    });
  }

  return parts[1].trim();
}

/**
 * Middleware de autenticación endurecido (Secure by Design):
 * 1. Verifica firma criptográfica HMAC-SHA256 en tiempo constante y algoritmo HS256.
 * 2. Verifica en Redis si el token (jti) fue revocado por Logout.
 * 3. Verifica en Redis si todas las sesiones del usuario fueron invalidadas por un cambio administrativo.
 * 4. Consulta PostgreSQL para confirmar que tanto el usuario como su empresa sigan activos y no eliminados.
 * 5. Calcula los permisos efectivos en tiempo real desde la base de datos (nunca confía en permisos estáticos del cliente).
 */
export async function authenticateMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = extractBearerToken(req.headers.authorization);
    const payload = verifyAuthToken(rawToken);

    // 1. Verificar si el token específico fue cerrado mediante Logout
    const isTokenRevoked = await redisCache.get<string>(
      `${REVOKED_TOKEN_PREFIX}${payload.jti}`
    );
    if (isTokenRevoked !== null) {
      throw new AppError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "La sesión fue cerrada previamente. Por favor, inicie sesión de nuevo.",
      });
    }

    // 2. Verificar si el usuario tuvo una revocación global de sesiones (cambio de clave/baja)
    const userRevokedAt = await redisCache.get<number>(
      `${USER_REVOKED_AFTER_PREFIX}${payload.sub}`
    );
    if (userRevokedAt !== null && payload.iat <= userRevokedAt) {
      throw new AppError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Sus credenciales o permisos fueron actualizados. Inicie sesión nuevamente.",
      });
    }

    // 3. Verificar estado real del usuario y su empresa en PostgreSQL
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
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

    if (
      dbUser === null ||
      !dbUser.isActive ||
      dbUser.deletedAt !== null ||
      dbUser.companyId !== payload.companyId ||
      !dbUser.company.isActive
    ) {
      throw new AppError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Cuenta de usuario o empresa inactiva o no autorizada.",
      });
    }

    const activeArea =
      dbUser.area !== null && dbUser.area.isActive && dbUser.area.deletedAt === null
        ? dbUser.area
        : null;

    const effectivePermissions = resolveEffectivePermissions({
      isCompanyAdmin: dbUser.isCompanyAdmin,
      userPreset: dbUser.permissionPreset,
      areaPreset: activeArea?.defaultPreset,
      areaPermissions: activeArea?.permissions.map((p) => p.permission),
      userPermissions: dbUser.customPermissions.map((p) => p.permission),
    });

    req.authUser = Object.freeze({
      userId: dbUser.id,
      companyId: dbUser.companyId,
      companyName: dbUser.company.name,
      email: dbUser.email,
      fullName: dbUser.fullName,
      isCompanyAdmin: dbUser.isCompanyAdmin,
      areaId: activeArea?.id ?? null,
      areaName: activeArea?.name ?? null,
      isTechnicalArea: activeArea?.isTechnicalQueue ?? false,
      permissionPreset: dbUser.permissionPreset,
      permissions: effectivePermissions,
      tokenJti: payload.jti,
      tokenExp: payload.exp,
    });

    next();
  } catch (error: unknown) {
    next(error);
  }
}

/**
 * Helper seguro para obtener el usuario autenticado dentro de un controlador protegido.
 */
export function getAuthenticatedUser(req: Request): AuthenticatedUserContext {
  if (req.authUser === undefined) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Contexto de autenticación no disponible.",
    });
  }
  return req.authUser;
}

/**
 * Middleware de control de acceso basado en permisos granulares (RBAC/ABAC).
 * Exige que el usuario autenticado sea Admin de su empresa o posea al menos uno
 * de los permisos indicados.
 */
export function requireAnyPermission(
  ...requiredPermissions: ReadonlyArray<PermissionCode>
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authUser = getAuthenticatedUser(req);

      if (authUser.isCompanyAdmin) {
        next();
        return;
      }

      const userPermSet = new Set<PermissionCode>(authUser.permissions);
      const hasPermission = requiredPermissions.some((perm) =>
        userPermSet.has(perm)
      );

      if (!hasPermission) {
        throw new AppError({
          statusCode: 403,
          errorCode: "FORBIDDEN",
          message:
            "No cuenta con los permisos necesarios dentro de su empresa para realizar esta acción.",
        });
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
