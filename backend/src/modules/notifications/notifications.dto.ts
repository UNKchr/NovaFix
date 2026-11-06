import { z } from "zod";
import type { NotificationType } from "../../generated/prisma/enums.js";
import { parseWithZod } from "../../shared/utils/validation.util.js";

export const notificationIdParamsSchema = z
  .object({
    notificationId: z
      .string()
      .uuid("El identificador de la notificación debe ser un UUID válido."),
  })
  .strict();

export type NotificationIdParamsDto = z.infer<typeof notificationIdParamsSchema>;

export interface NotificationItemView {
  readonly id: string;
  readonly repairOrderId: string;
  readonly ticketCode: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly actorFullName: string;
  readonly isRead: boolean;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface NotificationsFeedView {
  readonly unreadCount: number;
  readonly items: ReadonlyArray<NotificationItemView>;
}

export function validateNotificationIdParams(
  params: unknown
): NotificationIdParamsDto {
  return parseWithZod(notificationIdParamsSchema, params);
}
