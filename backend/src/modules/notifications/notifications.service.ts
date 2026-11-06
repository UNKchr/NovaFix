import { AppError } from "../../shared/errors/app-error.js";
import type { AuthenticatedUserContext } from "../../shared/middlewares/auth.middleware.js";
import type { NotificationsFeedView } from "./notifications.dto.js";
import { notificationsRepository } from "./notifications.repository.js";

export class NotificationsService {
  public async listForUser(
    authUser: AuthenticatedUserContext
  ): Promise<NotificationsFeedView> {
    const { items, unreadCount } =
      await notificationsRepository.listVisibleForUser({
        companyId: authUser.companyId,
        userId: authUser.userId,
        areaId: authUser.areaId,
      });

    return {
      unreadCount,
      items: items.map((item) => ({
        id: item.id,
        repairOrderId: item.repairOrderId,
        ticketCode: item.repairOrder.ticketCode,
        type: item.type,
        title: item.title,
        message: item.message,
        actorFullName: item.actorUser.fullName,
        isRead: item.isRead,
        readAt: item.readAt !== null ? item.readAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  public async markOneRead(
    authUser: AuthenticatedUserContext,
    notificationId: string
  ): Promise<void> {
    const updatedCount = await notificationsRepository.markOneAsRead({
      notificationId,
      companyId: authUser.companyId,
      userId: authUser.userId,
      areaId: authUser.areaId,
    });

    if (updatedCount === 0) {
      throw AppError.notFound("La notificación especificada no existe.");
    }
  }

  public async markAllRead(
    authUser: AuthenticatedUserContext
  ): Promise<{ readonly markedCount: number }> {
    const markedCount = await notificationsRepository.markAllAsRead({
      companyId: authUser.companyId,
      userId: authUser.userId,
      areaId: authUser.areaId,
    });
    return { markedCount };
  }

  public async hideOne(
    authUser: AuthenticatedUserContext,
    notificationId: string
  ): Promise<void> {
    const hiddenCount = await notificationsRepository.hideOneForUser({
      notificationId,
      companyId: authUser.companyId,
      userId: authUser.userId,
      areaId: authUser.areaId,
    });

    if (hiddenCount === 0) {
      throw AppError.notFound("La notificación especificada no existe.");
    }
  }

  public async clearAll(
    authUser: AuthenticatedUserContext
  ): Promise<{ readonly clearedCount: number }> {
    const clearedCount = await notificationsRepository.hideAllVisibleForUser({
      companyId: authUser.companyId,
      userId: authUser.userId,
      areaId: authUser.areaId,
    });
    return { clearedCount };
  }
}

export const notificationsService = new NotificationsService();
