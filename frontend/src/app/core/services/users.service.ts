import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { finalize, map, type Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiSuccessResponse } from '../models/api-response.model';
import type {
  CreateUserPayload,
  DeleteUserResult,
  UpdateUserPayload,
  UserSummaryView,
} from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly http = inject(HttpClient);

  private readonly usersSignal = signal<ReadonlyArray<UserSummaryView>>([]);
  private readonly loadingSignal = signal<boolean>(false);

  public readonly users = this.usersSignal.asReadonly();
  public readonly isLoading = this.loadingSignal.asReadonly();

  public readonly activeUsersCount = computed<number>(
    () => this.usersSignal().filter((u) => u.isActive).length,
  );

  public readonly availableTechniciansCount = computed<number>(
    () =>
      this.usersSignal().filter(
        (u) => u.isActive && u.isTechnicalArea && !u.isBusyWithActiveOrder,
      ).length,
  );

  public loadUsers(options?: { readonly silent?: boolean }): Observable<ReadonlyArray<UserSummaryView>> {
    const isSilent = options?.silent === true;
    if (!isSilent) {
      this.loadingSignal.set(true);
    }
    return this.http
      .get<ApiSuccessResponse<ReadonlyArray<UserSummaryView>>>(`${environment.apiUrl}/users`)
      .pipe(
        map((res) => res.data),
        tap((users) => this.usersSignal.set(users)),
        finalize(() => {
          if (!isSilent) {
            this.loadingSignal.set(false);
          }
        }),
      );
  }

  public createUser(payload: CreateUserPayload): Observable<UserSummaryView> {
    const cleanPayload: CreateUserPayload = {
      fullName: payload.fullName.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      areaId: payload.areaId.trim(),
      permissionPreset: payload.permissionPreset,
      customPermissions: payload.customPermissions,
    };

    return this.http
      .post<ApiSuccessResponse<UserSummaryView>>(`${environment.apiUrl}/users`, cleanPayload)
      .pipe(
        map((res) => res.data),
        tap((created) => {
          this.usersSignal.update((current) => [...current, created]);
        }),
      );
  }

  public updateUser(userId: string, payload: UpdateUserPayload): Observable<UserSummaryView> {
    return this.http
      .patch<ApiSuccessResponse<UserSummaryView>>(
        `${environment.apiUrl}/users/${encodeURIComponent(userId)}`,
        payload,
      )
      .pipe(
        map((res) => res.data),
        tap((updated) => {
          this.usersSignal.update((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
        }),
      );
  }

  public deleteUser(userId: string): Observable<DeleteUserResult> {
    return this.http
      .delete<ApiSuccessResponse<DeleteUserResult>>(
        `${environment.apiUrl}/users/${encodeURIComponent(userId)}`,
      )
      .pipe(
        map((res) => res.data),
        tap(({ deletedUserId }) => {
          this.usersSignal.update((current) =>
            current.filter((item) => item.id !== deletedUserId),
          );
        }),
      );
  }
}
