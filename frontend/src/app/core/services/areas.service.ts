import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { finalize, map, type Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiSuccessResponse } from '../models/api-response.model';
import type {
  AreaSummaryView,
  CreateAreaPayload,
  UpdateAreaPayload,
} from '../models/area.model';

@Injectable({
  providedIn: 'root',
})
export class AreasService {
  private readonly http = inject(HttpClient);

  private readonly areasSignal = signal<ReadonlyArray<AreaSummaryView>>([]);
  private readonly loadingSignal = signal<boolean>(false);

  public readonly areas = this.areasSignal.asReadonly();
  public readonly isLoading = this.loadingSignal.asReadonly();

  public readonly technicalAreasCount = computed<number>(
    () => this.areasSignal().filter((area) => area.isTechnicalQueue).length,
  );

  public readonly receptionAreasCount = computed<number>(
    () => this.areasSignal().filter((area) => !area.isTechnicalQueue).length,
  );

  public loadAreas(options?: { readonly silent?: boolean }): Observable<ReadonlyArray<AreaSummaryView>> {
    const isSilent = options?.silent === true;
    if (!isSilent) {
      this.loadingSignal.set(true);
    }
    return this.http
      .get<ApiSuccessResponse<ReadonlyArray<AreaSummaryView>>>(`${environment.apiUrl}/areas`)
      .pipe(
        map((res) => res.data),
        tap((areas) => this.areasSignal.set(areas)),
        finalize(() => {
          if (!isSilent) {
            this.loadingSignal.set(false);
          }
        }),
      );
  }

  public createArea(payload: CreateAreaPayload): Observable<AreaSummaryView> {
    const trimmedDesc = payload.description?.trim();
    const cleanPayload: CreateAreaPayload = {
      name: payload.name.trim(),
      ...(trimmedDesc ? { description: trimmedDesc } : {}),
      isTechnicalQueue: payload.isTechnicalQueue,
      defaultPreset: payload.defaultPreset,
      permissions: payload.permissions,
    };

    return this.http
      .post<ApiSuccessResponse<AreaSummaryView>>(`${environment.apiUrl}/areas`, cleanPayload)
      .pipe(
        map((res) => res.data),
        tap((created) => {
          this.areasSignal.update((current) => [...current, created]);
        }),
      );
  }

  public updateArea(areaId: string, payload: UpdateAreaPayload): Observable<AreaSummaryView> {
    return this.http
      .patch<ApiSuccessResponse<AreaSummaryView>>(
        `${environment.apiUrl}/areas/${encodeURIComponent(areaId)}`,
        payload,
      )
      .pipe(
        map((res) => res.data),
        tap((updated) => {
          this.areasSignal.update((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
        }),
      );
  }

  public deleteArea(areaId: string): Observable<{ readonly deletedAreaId: string }> {
    return this.http
      .delete<ApiSuccessResponse<{ readonly deletedAreaId: string }>>(
        `${environment.apiUrl}/areas/${encodeURIComponent(areaId)}`,
      )
      .pipe(
        map((res) => res.data),
        tap(({ deletedAreaId }) => {
          this.areasSignal.update((current) =>
            current.filter((item) => item.id !== deletedAreaId),
          );
        }),
      );
  }
}
