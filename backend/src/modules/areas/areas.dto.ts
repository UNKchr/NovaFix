import { z } from "zod";
import type {
  PermissionCode,
  PermissionPreset,
} from "../../generated/prisma/enums.js";
import {
  parseWithZod,
  zSanitizedString,
} from "../../shared/utils/validation.util.js";

const permissionCodeEnumSchema = z.enum([
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
]);

const permissionPresetEnumSchema = z.enum([
  "RECEPTION_AGENT",
  "RECEPTION_SUPERVISOR",
  "TECHNICAL_SPECIALIST",
  "TECHNICAL_SUPERVISOR",
  "CUSTOM",
]);

export const areaIdParamsSchema = z
  .object({
    areaId: z.string().uuid("El identificador del área debe ser un UUID válido."),
  })
  .strict();

export const createAreaSchema = z
  .object({
    name: zSanitizedString("name", 2, 80),
    description: zSanitizedString("description", 2, 255).optional(),
    isTechnicalQueue: z.boolean().default(false),
    defaultPreset: permissionPresetEnumSchema.default("CUSTOM"),
    permissions: z.array(permissionCodeEnumSchema).max(12).optional(),
  })
  .strict();

export const updateAreaSchema = z
  .object({
    name: zSanitizedString("name", 2, 80).optional(),
    description: zSanitizedString("description", 2, 255).nullable().optional(),
    isTechnicalQueue: z.boolean().optional(),
    defaultPreset: permissionPresetEnumSchema.optional(),
    permissions: z.array(permissionCodeEnumSchema).max(12).optional(),
  })
  .strict();

export type AreaIdParamsDto = z.infer<typeof areaIdParamsSchema>;
export type CreateAreaDto = z.infer<typeof createAreaSchema>;
export type UpdateAreaDto = z.infer<typeof updateAreaSchema>;

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

export function validateAreaIdParams(params: unknown): AreaIdParamsDto {
  return parseWithZod(areaIdParamsSchema, params);
}

export function validateCreateAreaDto(payload: unknown): CreateAreaDto {
  return parseWithZod(createAreaSchema, payload);
}

export function validateUpdateAreaDto(payload: unknown): UpdateAreaDto {
  return parseWithZod(updateAreaSchema, payload);
}
