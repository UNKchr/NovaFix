import { Router } from "express";
import { authenticateMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { notificationsController } from "./notifications.controller.js";

export const notificationsRouter: Router = Router();

notificationsRouter.use(authenticateMiddleware);

notificationsRouter.get("/", (req, res, next) =>
  notificationsController.list(req, res, next)
);

notificationsRouter.patch("/read-all", (req, res, next) =>
  notificationsController.markAllRead(req, res, next)
);

notificationsRouter.patch("/:notificationId/read", (req, res, next) =>
  notificationsController.markOneRead(req, res, next)
);

notificationsRouter.delete("/clear", (req, res, next) =>
  notificationsController.clearAll(req, res, next)
);

notificationsRouter.delete("/:notificationId", (req, res, next) =>
  notificationsController.hideOne(req, res, next)
);
