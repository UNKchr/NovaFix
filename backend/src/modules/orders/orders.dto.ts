import { z } from "zod";
import type {
  OrderPriority,
  OrderStatus,
} from "../../generated/prisma/enums.js";
import {
  parseWithZod,
  validateTicketCode,
  zSanitizedString,
} from "../../shared/utils/validation.util.js";

const orderPriorityEnumSchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

const orderStatusFilterEnumSchema = z.enum([
  "CREATED",
  "ASSIGNING",
  "DIAGNOSING",
  "IN_REPAIR",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

const orderStatusTransitionEnumSchema = z.enum([
  "DIAGNOSING",
  "IN_REPAIR",
  "READY",
  "CANCELLED",
  "DELIVERED",
]);

export const createOrderSchema = z
  .object({
    clientName: zSanitizedString("clientName", 2, 100),
    clientContact: zSanitizedString("clientContact", 4, 100),
    deviceModel: zSanitizedString("deviceModel", 2, 100),
    issueDesc: zSanitizedString("issueDesc", 5, 1000),
    targetAreaId: z
      .string({ message: "El área técnica destino (targetAreaId) es obligatoria." })
      .uuid("El identificador del área destino debe ser un UUID válido."),
    priority: orderPriorityEnumSchema.default("NORMAL"),
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: orderStatusTransitionEnumSchema,
    resolutionNotes: zSanitizedString("resolutionNotes", 5, 1000).optional(),
    cancellationReason: zSanitizedString(
      "cancellationReason",
      5,
      1000
    ).optional(),
    comment: zSanitizedString("comment", 2, 1000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.status === "READY" &&
      (data.resolutionNotes === undefined ||
        data.resolutionNotes.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolutionNotes"],
        message:
          "Para marcar una orden como READY es obligatorio detallar lo realizado en el equipo (resolutionNotes, mínimo 5 caracteres).",
      });
    }

    if (
      data.status === "CANCELLED" &&
      (data.cancellationReason === undefined ||
        data.cancellationReason.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cancellationReason"],
        message:
          "Para marcar una orden como CANCELLED es obligatorio indicar el motivo de cancelación o diagnóstico (cancellationReason, mínimo 5 caracteres).",
      });
    }
  });

export const listOrdersQuerySchema = z
  .object({
    status: orderStatusFilterEnumSchema.optional(),
    search: zSanitizedString("search", 1, 80).optional(),
  })
  .strict();

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
export type ListOrdersQueryDto = z.infer<typeof listOrdersQuerySchema>;

export interface OrderHistoryEntryView {
  readonly id: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly changedByFullName: string;
  readonly comment: string | null;
  readonly createdAt: string;
}

export interface PublicOrderTrackingView {
  readonly ticketCode: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly deviceModel: string;
  readonly issueDesc: string;
  readonly status: OrderStatus;
  readonly priority: OrderPriority;
  readonly targetAreaName: string;
  readonly resolutionNotes: string | null;
  readonly cancellationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly deliveredAt: string | null;
  readonly history: ReadonlyArray<{
    readonly status: OrderStatus;
    readonly comment: string | null;
    readonly timestamp: string;
  }>;
}

export interface InternalOrderView {
  readonly id: string;
  readonly companyId: string;
  readonly ticketCode: string;
  readonly status: OrderStatus;
  readonly priority: OrderPriority;
  readonly clientName: string;
  readonly clientContact: string;
  readonly deviceModel: string;
  readonly issueDesc: string;
  readonly resolutionNotes: string | null;
  readonly cancellationReason: string | null;
  readonly createdBy: {
    readonly id: string;
    readonly fullName: string;
    readonly email: string;
    readonly isDeleted: boolean;
  };
  readonly originArea: {
    readonly id: string;
    readonly name: string;
  } | null;
  readonly targetArea: {
    readonly id: string;
    readonly name: string;
  };
  readonly assignedTo: {
    readonly id: string;
    readonly fullName: string;
    readonly email: string;
  } | null;
  readonly queuedAt: string;
  readonly assignedAt: string | null;
  readonly completedAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly statusHistory: ReadonlyArray<OrderHistoryEntryView>;
}

export function validateCreateOrderDto(payload: unknown): CreateOrderDto {
  return parseWithZod(createOrderSchema, payload);
}

export function validateUpdateOrderStatusDto(
  payload: unknown
): UpdateOrderStatusDto {
  return parseWithZod(updateOrderStatusSchema, payload);
}

export function validateListOrdersQueryDto(
  query: unknown
): ListOrdersQueryDto {
  return parseWithZod(listOrdersQuerySchema, query);
}

export function validateTicketCodeParam(params: unknown): string {
  if (
    typeof params !== "object" ||
    params === null ||
    !("ticketCode" in params)
  ) {
    return validateTicketCode(undefined);
  }
  return validateTicketCode((params as Record<string, unknown>)["ticketCode"]);
}
