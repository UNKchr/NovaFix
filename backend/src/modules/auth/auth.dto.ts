import { z } from "zod";
import type {
  PermissionCode,
  PermissionPreset,
} from "../../generated/prisma/enums.js";
import {
  parseWithZod,
  zSanitizedString,
} from "../../shared/utils/validation.util.js";

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

export const registerCompanySchema = z
  .object({
    companyName: zSanitizedString("companyName", 2, 120),
    adminFullName: zSanitizedString("adminFullName", 2, 100),
    adminEmail: emailFieldSchema,
    adminPassword: passwordFieldSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailFieldSchema,
    password: z
      .string({ message: "La contraseña es obligatoria." })
      .min(1, "Debe ingresar su contraseña.")
      .max(128, "Contraseña demasiado extensa."),
  })
  .strict();

export type RegisterCompanyDto = z.infer<typeof registerCompanySchema>;
export type LoginDto = z.infer<typeof loginSchema>;

export interface AuthenticatedSessionView {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly fullName: string;
    readonly isCompanyAdmin: boolean;
    readonly companyId: string;
    readonly companyName: string;
    readonly areaId: string | null;
    readonly areaName: string | null;
    readonly isTechnicalArea: boolean;
    readonly permissionPreset: PermissionPreset;
    readonly permissions: ReadonlyArray<PermissionCode>;
    readonly unreadNotificationsCount: number;
  };
}

export function validateRegisterCompanyDto(
  payload: unknown
): RegisterCompanyDto {
  return parseWithZod(registerCompanySchema, payload);
}

export function validateLoginDto(payload: unknown): LoginDto {
  return parseWithZod(loginSchema, payload);
}
