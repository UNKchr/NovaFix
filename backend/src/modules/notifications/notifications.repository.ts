import { prisma } from "../../config/database.config.js";

export class NotificationsRepository {
  private buildRecipientFilter(userId: string, areaId: string | null) {
    return areaId !== null
      ? [
          { recipientUserId: userId },
          {
            recipientUserId: null,
            recipientAreaId: areaId,
          },
        ]
      : [{ recipientUserId: userId }];
  }

  public async listVisibleForUser(params: {
    readonly companyId: string;
    readonly userId: string;
    readonly areaId: string | null;
  }) {
    const orFilter = this.buildRecipientFilter(params.userId, params.areaId);

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          companyId: params.companyId,
          isHiddenByRecipient: false,
          OR: orFilter,
        },
        include: {
          repairOrder: {
            select: {
              ticketCode: true,
            },
          },
          actorUser: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      }),
      prisma.notification.count({
        where: {
          companyId: params.companyId,
          isHiddenByRecipient: false,
          isRead: false,
          OR: orFilter,
        },
      }),
    ]);

    return { items, unreadCount };
  }

  public async markOneAsRead(params: {
    readonly notificationId: string;
    readonly companyId: string;
    readonly userId: string;
    readonly areaId: string | null;
  }): Promise<number> {
    const orFilter = this.buildRecipientFilter(params.userId, params.areaId);
    const result = await prisma.notification.updateMany({
      where: {
        id: params.notificationId,
        companyId: params.companyId,
        isHiddenByRecipient: false,
        OR: orFilter,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return result.count;
  }

  public async markAllAsRead(params: {
    readonly companyId: string;
    readonly userId: string;
    readonly areaId: string | null;
  }): Promise<number> {
    const orFilter = this.buildRecipientFilter(params.userId, params.areaId);
    const result = await prisma.notification.updateMany({
      where: {
        companyId: params.companyId,
        isHiddenByRecipient: false,
        isRead: false,
        OR: orFilter,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Oculta una notificación individual para el usuario sin borrarla de PostgreSQL.
   */
  public async hideOneForUser(params: {
    readonly notificationId: string;
    readonly companyId: string;
    readonly userId: string;
    readonly areaId: string | null;
  }): Promise<number> {
    const now = new Date();
    const orFilter = this.buildRecipientFilter(params.userId, params.areaId);
    const result = await prisma.notification.updateMany({
      where: {
        id: params.notificationId,
        companyId: params.companyId,
        isHiddenByRecipient: false,
        OR: orFilter,
      },
      data: {
        isHiddenByRecipient: true,
        hiddenAt: now,
        isRead: true,
        readAt: now,
      },
    });
    return result.count;
  }

  /**
   * Limpia/oculta todas las notificaciones actuales del usuario (createdAt <= now)
   * conservándolas en PostgreSQL. Las notificaciones nuevas posteriores se mostrarán normalmente.
   */
  public async hideAllVisibleForUser(params: {
    readonly companyId: string;
    readonly userId: string;
    readonly areaId: string | null;
  }): Promise<number> {
    const now = new Date();
    const orFilter = this.buildRecipientFilter(params.userId, params.areaId);
    const result = await prisma.notification.updateMany({
      where: {
        companyId: params.companyId,
        isHiddenByRecipient: false,
        createdAt: {
          lte: now,
        },
        OR: orFilter,
      },
      data: {
        isHiddenByRecipient: true,
        hiddenAt: now,
        isRead: true,
        readAt: now,
      },
    });
    return result.count;
  }
}

export const notificationsRepository = new NotificationsRepository();
