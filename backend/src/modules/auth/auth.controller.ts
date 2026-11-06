import type { Request, Response, NextFunction } from "express";
import { getAuthenticatedUser } from "../../shared/middlewares/auth.middleware.js";
import { ipSecurityService } from "../../shared/security/ip-security.service.js";
import {
  buildSuccessResponse,
  type ApiSuccessResponse,
} from "../../shared/utils/response.util.js";
import {
  validateLoginDto,
  validateRegisterCompanyDto,
  type AuthenticatedSessionView,
} from "./auth.dto.js";
import { authService } from "./auth.service.js";

export class AuthController {
  public async registerCompany(
    req: Request,
    res: Response<ApiSuccessResponse<AuthenticatedSessionView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const dto = validateRegisterCompanyDto(req.body);
      const session = await authService.registerCompany(dto);

      res
        .status(201)
        .json(
          buildSuccessResponse(
            session,
            "Empresa y cuenta de administrador registradas exitosamente."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async login(
    req: Request,
    res: Response<ApiSuccessResponse<AuthenticatedSessionView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const dto = validateLoginDto(req.body);
      const clientIp = ipSecurityService.extractClientIp(req);
      const session = await authService.login(dto, clientIp);

      res
        .status(200)
        .json(
          buildSuccessResponse(session, "Inicio de sesión exitoso.")
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async logout(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly loggedOut: true }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      await authService.logout(authUser);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            { loggedOut: true as const },
            "Sesión cerrada e invalidada correctamente."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async me(
    req: Request,
    res: Response<ApiSuccessResponse<AuthenticatedSessionView["user"]>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const profile = await authService.getCurrentProfile(authUser);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            profile,
            "Perfil de sesión obtenido exitosamente."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const authController = new AuthController();
