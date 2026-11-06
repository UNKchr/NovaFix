import type { PermissionCode, PermissionPreset } from './auth.model';

export interface AreaSummaryView {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly description: string | null;
  readonly isTechnicalQueue: boolean;
  readonly defaultPreset: PermissionPreset;
  readonly permissions: ReadonlyArray<PermissionCode>;
  readonly activeUsersCount: number;
  readonly activeOrdersCount: number;
  readonly createdAt: string;
}

export interface CreateAreaPayload {
  readonly name: string;
  readonly description?: string;
  readonly isTechnicalQueue: boolean;
  readonly defaultPreset: PermissionPreset;
  readonly permissions: ReadonlyArray<PermissionCode>;
}

export interface UpdateAreaPayload {
  readonly name?: string;
  readonly description?: string | null;
  readonly isTechnicalQueue?: boolean;
  readonly defaultPreset?: PermissionPreset;
  readonly permissions?: ReadonlyArray<PermissionCode>;
}
