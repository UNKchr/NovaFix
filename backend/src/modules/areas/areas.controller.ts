import type { Request, Response, NextFunction } from "express";
import { getAuthenticatedUser } from "../../shared/middlewares/auth.middleware.js";
import {
  buildSuccessResponse,
  type ApiSuccessResponse,
} from "../../shared/utils/response.util.js";
import {
  validateAreaIdParams,
  validateCreateAreaDto,
  validateUpdateAreaDto,
  type AreaSummaryView,
} from "./areas.dto.js";
import { areasService } from "./areas.service.js";

export class AreasController {
  public async list(
    req: Request,
    res: Response<ApiSuccessResponse<ReadonlyArray<AreaSummaryView>>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const areas = await areasService.listAreas(authUser.companyId);

      res
        .status(200)
        .json(
          buildSuccessResponse(areas, "Áreas de la empresa obtenidas exitosamente.")
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async create(
    req: Request,
    res: Response<ApiSuccessResponse<AreaSummaryView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const dto = validateCreateAreaDto(req.body);
      const created = await areasService.createArea(authUser.companyId, dto);

      res
        .status(201)
        .json(
          buildSuccessResponse(created, "Área creada exitosamente.")
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async update(
    req: Request,
    res: Response<ApiSuccessResponse<AreaSummaryView>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const { areaId } = validateAreaIdParams(req.params);
      const dto = validateUpdateAreaDto(req.body);
      const updated = await areasService.updateArea(
        authUser.companyId,
        areaId,
        dto
      );

      res
        .status(200)
        .json(
          buildSuccessResponse(updated, "Área actualizada exitosamente.")
        );
    } catch (error: unknown) {
      next(error);
    }
  }

  public async remove(
    req: Request,
    res: Response<ApiSuccessResponse<{ readonly deletedAreaId: string }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const authUser = getAuthenticatedUser(req);
      const { areaId } = validateAreaIdParams(req.params);
      await areasService.deleteArea(authUser.companyId, areaId);

      res
        .status(200)
        .json(
          buildSuccessResponse(
            { deletedAreaId: areaId },
            "Área dada de baja de forma segura."
          )
        );
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const areasController = new AreasController();
