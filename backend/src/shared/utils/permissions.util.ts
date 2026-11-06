import type {
  PermissionCode,
  PermissionPreset,
} from "../../generated/prisma/enums.js";

export const ALL_PERMISSION_CODES: ReadonlyArray<PermissionCode> = [
  "MANAGE_AREAS",
  "MANAGE_USERS",
  "ORDER_CREATE",
  "ORDER_DELETE",
  "ORDER_ASSIGN_QUEUE",
  "ORDER_STATUS_DIAGNOSING",
  "ORDER_STATUS_IN_REPAIR",
  "ORDER_STATUS_READY",
  "ORDER_STATUS_CANCELLED",
  "ORDER_STATUS_DELIVERED",
  "ORDER_VIEW_AREA",
  "ORDER_VIEW_ALL_COMPANY",
] as const;

export const PRESET_PERMISSIONS_MAP: Readonly<
  Record<PermissionPreset, ReadonlyArray<PermissionCode>>
> = {
  RECEPTION_AGENT: [
    "ORDER_CREATE",
    "ORDER_DELETE",
    "ORDER_STATUS_DELIVERED",
  ],
  RECEPTION_SUPERVISOR: [
    "ORDER_CREATE",
    "ORDER_DELETE",
    "ORDER_STATUS_DELIVERED",
    "ORDER_VIEW_AREA",
  ],
  TECHNICAL_SPECIALIST: [
    "ORDER_ASSIGN_QUEUE",
    "ORDER_STATUS_DIAGNOSING",
    "ORDER_STATUS_IN_REPAIR",
    "ORDER_STATUS_READY",
    "ORDER_STATUS_CANCELLED",
  ],
  TECHNICAL_SUPERVISOR: [
    "ORDER_ASSIGN_QUEUE",
    "ORDER_STATUS_DIAGNOSING",
    "ORDER_STATUS_IN_REPAIR",
    "ORDER_STATUS_READY",
    "ORDER_STATUS_CANCELLED",
    "ORDER_VIEW_AREA",
  ],
  CUSTOM: [],
};

export interface PermissionResolutionInput {
  readonly isCompanyAdmin: boolean;
  readonly userPreset: PermissionPreset;
  readonly areaPreset?: PermissionPreset | null | undefined;
  readonly areaPermissions?: ReadonlyArray<PermissionCode> | undefined;
  readonly userPermissions?: ReadonlyArray<PermissionCode> | undefined;
}

/**
 * Calcula el conjunto efectivo de permisos de un usuario combinando:
 * 1. Si es Administrador de Empresa (isCompanyAdmin), recibe todos los permisos.
 * 2. Enfoque híbrido: unión de permisos de plantilla del usuario, plantilla del área,
 *    permisos asignados al área (AreaPermission) y permisos personalizados del usuario (UserPermission).
 */
export function resolveEffectivePermissions(
  input: PermissionResolutionInput
): ReadonlyArray<PermissionCode> {
  if (input.isCompanyAdmin) {
    return ALL_PERMISSION_CODES;
  }

  const effectiveSet = new Set<PermissionCode>();

  for (const perm of PRESET_PERMISSIONS_MAP[input.userPreset]) {
    effectiveSet.add(perm);
  }

  if (input.areaPreset !== undefined && input.areaPreset !== null) {
    for (const perm of PRESET_PERMISSIONS_MAP[input.areaPreset]) {
      effectiveSet.add(perm);
    }
  }

  if (input.areaPermissions !== undefined) {
    for (const perm of input.areaPermissions) {
      effectiveSet.add(perm);
    }
  }

  if (input.userPermissions !== undefined) {
    for (const perm of input.userPermissions) {
      effectiveSet.add(perm);
    }
  }

  return Array.from(effectiveSet);
}
