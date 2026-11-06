import { Router } from "express";
import { authenticateMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { authStrictRateLimiter } from "../../shared/middlewares/ip-security.middleware.js";
import { authController } from "./auth.controller.js";

export const authRouter: Router = Router();

authRouter.post(
  "/register-company",
  authStrictRateLimiter,
  (req, res, next) => authController.registerCompany(req, res, next)
);

authRouter.post("/login", authStrictRateLimiter, (req, res, next) =>
  authController.login(req, res, next)
);

authRouter.post("/logout", authenticateMiddleware, (req, res, next) =>
  authController.logout(req, res, next)
);

authRouter.get("/me", authenticateMiddleware, (req, res, next) =>
  authController.me(req, res, next)
);
