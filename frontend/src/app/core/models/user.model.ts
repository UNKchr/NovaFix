import type { PermissionCode, PermissionPreset } from './auth.model';

export interface UserSummaryView {
  readonly id: string;
  readonly companyId: string;
  readonly email: string;
  readonly fullName: string;
  readonly isCompanyAdmin: boolean;
  readonly isActive: boolean;
  readonly areaId: string | null;
  readonly areaName: string | null;
  readonly isTechnicalArea: boolean;
  readonly permissionPreset: PermissionPreset;
  readonly customPermissions: ReadonlyArray<PermissionCode>;
  readonly effectivePermissions: ReadonlyArray<PermissionCode>;
  readonly isBusyWithActiveOrder: boolean;
  readonly activeAssignedOrdersCount: number;
  readonly availableSince: string;
  readonly createdAt: string;
}

export interface CreateUserPayload {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly areaId: string;
  readonly permissionPreset: PermissionPreset;
  readonly customPermissions: ReadonlyArray<PermissionCode>;
}

export interface UpdateUserPayload {
  readonly fullName?: string;
  readonly password?: string;
  readonly areaId?: string;
  readonly permissionPreset?: PermissionPreset;
  readonly customPermissions?: ReadonlyArray<PermissionCode>;
  readonly isActive?: boolean;
}

export interface DeleteUserResult {
  readonly deletedUserId: string;
  readonly reassignedOrdersCount: number;
}
