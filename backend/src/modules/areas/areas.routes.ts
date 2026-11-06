import { Router } from "express";
import {
  authenticateMiddleware,
  requireAnyPermission,
} from "../../shared/middlewares/auth.middleware.js";
import { areasController } from "./areas.controller.js";

export const areasRouter: Router = Router();

areasRouter.use(authenticateMiddleware);

areasRouter.get("/", (req, res, next) => areasController.list(req, res, next));

areasRouter.post(
  "/",
  requireAnyPermission("MANAGE_AREAS"),
  (req, res, next) => areasController.create(req, res, next)
);

areasRouter.patch(
  "/:areaId",
  requireAnyPermission("MANAGE_AREAS"),
  (req, res, next) => areasController.update(req, res, next)
);

areasRouter.delete(
  "/:areaId",
  requireAnyPermission("MANAGE_AREAS"),
  (req, res, next) => areasController.remove(req, res, next)
);
