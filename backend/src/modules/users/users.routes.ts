import { Router } from "express";
import {
  authenticateMiddleware,
  requireAnyPermission,
} from "../../shared/middlewares/auth.middleware.js";
import { usersController } from "./users.controller.js";

export const usersRouter: Router = Router();

usersRouter.use(authenticateMiddleware);

usersRouter.get(
  "/",
  requireAnyPermission("MANAGE_USERS", "ORDER_VIEW_AREA"),
  (req, res, next) => usersController.list(req, res, next)
);

usersRouter.post(
  "/",
  requireAnyPermission("MANAGE_USERS"),
  (req, res, next) => usersController.create(req, res, next)
);

usersRouter.patch(
  "/:userId",
  requireAnyPermission("MANAGE_USERS"),
  (req, res, next) => usersController.update(req, res, next)
);

usersRouter.delete(
  "/:userId",
  requireAnyPermission("MANAGE_USERS"),
  (req, res, next) => usersController.remove(req, res, next)
);
