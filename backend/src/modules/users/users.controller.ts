import type { Request, Response, NextFunction } from "express";
import { getAuthenticatedUser } from "../../shared/middlewares/auth.middleware.js";
import {
  buildSuccessResponse,
  type ApiSuccessResponse,
} from "../../shared/utils/response.util.js";
import {
  validateCreateUserDto,
  validateUpdateUserDto,
  validateUserIdParams,
  type UserSummaryView,
} from "./users.dto.js";
import { usersService } from "./users.service.js";

export class UsersController {
  public async list(
    req: Request,
    res: Response<ApiSuccessResponse<ReadonlyArray<UserSummaryView>>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const users = await usersService.listUsers(authUser);

      res
        .status(200)
        .json(
          buildSuccessResponse(users, "Usuarios obtenidos exitosamente.")
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async create(
    req: Request,
    res: Response<ApiSuccessResponse<UserSummaryView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const dto = validateCreateUserDto(req.body);
      const created = await usersService.createUser(authUser, dto);

      res
        .status(201)
        .json(
          buildSuccessResponse(
            created,
            "Usuario creado con contraseña hasheada y permisos asignados."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async update(
    req: Request,
    res: Response<ApiSuccessResponse<UserSummaryView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const { userId } = validateUserIdParams(req.params);
      const dto = validateUpdateUserDto(req.body);
      const updated = await usersService.updateUser(authUser, userId, dto);

      res
        .status(200)
        .json(
          buildSuccessResponse(updated, "Usuario actualizado exitosamente.")
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async remove(
    req: Request,
    res: Response<
      ApiSuccessResponse<{
        readonly deletedUserId: string;
        readonly reassignedOrdersCount: number;
      }>
    >,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const { userId } = validateUserIdParams(req.params);
      const result = await usersService.deleteUser(authUser, userId);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            result,
            "Usuario dado de baja de forma segura y órdenes activas reasignadas."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const usersController = new UsersController();
