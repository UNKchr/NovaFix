import type { Request, Response, NextFunction } from "express";
import { getAuthenticatedUser } from "../../shared/middlewares/auth.middleware.js";
import {
  buildSuccessResponse,
  type ApiSuccessResponse,
} from "../../shared/utils/response.util.js";
import {
  validateNotificationIdParams,
  type NotificationsFeedView,
} from "./notifications.dto.js";
import { notificationsService } from "./notifications.service.js";

export class NotificationsController {
  public async list(
    req: Request,
    res: Response<ApiSuccessResponse<NotificationsFeedView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const feed = await notificationsService.listForUser(authUser);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            feed,
            "Notificaciones obtenidas exitosamente."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async markAllRead(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly markedCount: number }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const result = await notificationsService.markAllRead(authUser);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            result,
            "Todas las notificaciones visibles fueron marcadas como leídas."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async markOneRead(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly read: true }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const { notificationId } = validateNotificationIdParams(req.params);
      await notificationsService.markOneRead(authUser, notificationId);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            { read: true as const },
            "Notificación marcada como leída."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async clearAll(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly clearedCount: number }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const result = await notificationsService.clearAll(authUser);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            result,
            "Bandeja de notificaciones limpiada exitosamente."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async hideOne(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly hidden: true }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const { notificationId } = validateNotificationIdParams(req.params);
      await notificationsService.hideOne(authUser, notificationId);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            { hidden: true as const },
            "Notificación ocultada de su bandeja."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const notificationsController = new NotificationsController();
