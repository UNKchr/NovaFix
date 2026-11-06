import type { PermissionCode } from "../../generated/prisma/enums.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PRESET_PERMISSIONS_MAP } from "../../shared/utils/permissions.util.js";
import type {
  AreaSummaryView,
  CreateAreaDto,
  UpdateAreaDto,
} from "./areas.dto.js";
import { areasRepository } from "./areas.repository.js";

export class AreasService {
  public async listAreas(companyId: string): Promise<ReadonlyArray<AreaSummaryView>> {
    const areas = await areasRepository.listActiveByCompany(companyId);

    return areas.map((area) => ({
      id: area.id,
      companyId: area.companyId,
      name: area.name,
      description: area.description,
      isTechnicalQueue: area.isTechnicalQueue,
      defaultPreset: area.defaultPreset,
      permissions: area.permissions.map((p) => p.permission),
      activeUsersCount: area._count.users,
      activeOrdersCount: area._count.targetedOrders,
      createdAt: area.createdAt.toISOString(),
    }));
  }

  public async createArea(
    companyId: string,
    dto: CreateAreaDto
  ): Promise<AreaSummaryView> {
    const duplicate = await areasRepository.findByNameInCompany(
      companyId,
      dto.name
    );

    if (duplicate !== null && duplicate.deletedAt === null) {
      throw AppError.conflict(
        `Ya existe un área activa llamada "${dto.name}" en su empresa.`
      );
    }

    const basePermissions: ReadonlyArray<PermissionCode> =
      dto.permissions ?? PRESET_PERMISSIONS_MAP[dto.defaultPreset];

    const created = await areasRepository.createArea({
      companyId,
      name: dto.name,
      description: dto.description ?? null,
      isTechnicalQueue: dto.isTechnicalQueue,
      defaultPreset: dto.defaultPreset,
      permissions: basePermissions,
    });

    return {
      id: created.id,
      companyId: created.companyId,
      name: created.name,
      description: created.description,
      isTechnicalQueue: created.isTechnicalQueue,
      defaultPreset: created.defaultPreset,
      permissions: created.permissions.map((p) => p.permission),
      activeUsersCount: created._count.users,
      activeOrdersCount: created._count.targetedOrders,
      createdAt: created.createdAt.toISOString(),
    };
  }

  public async updateArea(
    companyId: string,
    areaId: string,
    dto: UpdateAreaDto
  ): Promise<AreaSummaryView> {
    const existing = await areasRepository.findActiveByIdAndCompany(
      areaId,
      companyId
    );
    if (existing === null) {
      throw AppError.notFound("El área especificada no existe o fue eliminada.");
    }

    if (dto.name !== undefined && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await areasRepository.findByNameInCompany(
        companyId,
        dto.name
      );
      if (duplicate !== null && duplicate.id !== areaId && duplicate.deletedAt === null) {
        throw AppError.conflict(
          `Ya existe otra área activa con el nombre "${dto.name}".`
        );
      }
    }

    const resolvedPermissions =
      dto.permissions !== undefined
        ? dto.permissions
        : dto.defaultPreset !== undefined && dto.defaultPreset !== "CUSTOM"
          ? PRESET_PERMISSIONS_MAP[dto.defaultPreset]
          : undefined;

    const updated = await areasRepository.updateArea({
      areaId,
      companyId,
      name: dto.name,
      description: dto.description,
      isTechnicalQueue: dto.isTechnicalQueue,
      defaultPreset: dto.defaultPreset,
      permissions: resolvedPermissions,
    });

    return {
      id: updated.id,
      companyId: updated.companyId,
      name: updated.name,
      description: updated.description,
      isTechnicalQueue: updated.isTechnicalQueue,
      defaultPreset: updated.defaultPreset,
      permissions: updated.permissions.map((p) => p.permission),
      activeUsersCount: updated._count.users,
      activeOrdersCount: updated._count.targetedOrders,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  public async deleteArea(companyId: string, areaId: string): Promise<void> {
    const existing = await areasRepository.findActiveByIdAndCompany(
      areaId,
      companyId
    );
    if (existing === null) {
      throw AppError.notFound("El área especificada no existe o ya fue eliminada.");
    }

    const activeOrdersCount = await areasRepository.countActiveOrdersInArea(
      areaId,
      companyId
    );

    if (activeOrdersCount > 0) {
      throw AppError.conflict(
        `No se puede eliminar el área "${existing.name}" porque tiene ${activeOrdersCount} orden(es) activa(s) en curso. Finalice o entregue las órdenes activas antes de dar de baja el área.`
      );
    }

    await areasRepository.softDeleteArea(areaId, companyId);
  }
}

export const areasService = new AreasService();
