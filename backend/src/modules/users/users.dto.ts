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

const emailFieldSchema = z
  .string({ message: "El correo electrónico es obligatorio." })
  .trim()
  .toLowerCase()
  .email("Formato de correo electrónico inválido.")
  .max(150, "El correo electrónico no puede superar los 150 caracteres.");

const passwordFieldSchema = z
  .string({ message: "La contraseña es obligatoria." })
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña no puede superar los 72 caracteres.")
  .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra.")
  .regex(/[0-9]/, "La contraseña debe incluir al menos un número.");

export const userIdParamsSchema = z
  .object({
    userId: z.string().uuid("El identificador del usuario debe ser un UUID válido."),
  })
  .strict();

export const createUserSchema = z
  .object({
    fullName: zSanitizedString("fullName", 2, 100),
    email: emailFieldSchema,
    password: passwordFieldSchema,
    areaId: z.string().uuid("El areaId debe ser un UUID válido."),
    permissionPreset: permissionPresetEnumSchema.default("RECEPTION_AGENT"),
    customPermissions: z.array(permissionCodeEnumSchema).max(12).optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: zSanitizedString("fullName", 2, 100).optional(),
    password: passwordFieldSchema.optional(),
    areaId: z.string().uuid("El areaId debe ser un UUID válido.").optional(),
    permissionPreset: permissionPresetEnumSchema.optional(),
    customPermissions: z.array(permissionCodeEnumSchema).max(12).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UserIdParamsDto = z.infer<typeof userIdParamsSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

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

export function validateUserIdParams(params: unknown): UserIdParamsDto {
  return parseWithZod(userIdParamsSchema, params);
}

export function validateCreateUserDto(payload: unknown): CreateUserDto {
  return parseWithZod(createUserSchema, payload);
}

export function validateUpdateUserDto(payload: unknown): UpdateUserDto {
  return parseWithZod(updateUserSchema, payload);
}
