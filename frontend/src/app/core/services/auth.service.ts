import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, type Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiErrorResponse, ApiSuccessResponse } from '../models/api-response.model';
import type {
  AuthenticatedSessionView,
  AuthenticatedUser,
  LoginPayload,
  PermissionCode,
  RegisterCompanyPayload,
} from '../models/auth.model';

const SESSION_STORAGE_KEY = 'novafix.session.v1';
const JWT_STRUCTURE_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly sessionSignal = signal<AuthenticatedSessionView | null>(
    this.restoreValidatedSession(),
  );

  public readonly session = this.sessionSignal.asReadonly();

  public readonly currentUser = computed<AuthenticatedUser | null>(() => {
    const active = this.sessionSignal();
    if (!active || this.isExpired(active.expiresAt)) {
      return null;
    }
    return active.user;
  });

  public readonly isAuthenticated = computed<boolean>(() => {
    return this.currentUser() !== null;
  });

  public readonly isCompanyAdmin = computed<boolean>(() => {
    return this.currentUser()?.isCompanyAdmin === true;
  });

  private readonly permissionSet = computed<ReadonlySet<PermissionCode>>(() => {
    const user = this.currentUser();
    return new Set<PermissionCode>(user?.permissions ?? []);
  });

  public getValidAccessToken(): string | null {
    const active = this.sessionSignal();
    if (!active) {
      return null;
    }
    if (this.isExpired(active.expiresAt) || !JWT_STRUCTURE_REGEX.test(active.token)) {
      this.clearExpiredSession();
      return null;
    }
    return active.token;
  }

  public hasPermission(permission: PermissionCode): boolean {
    if (this.isCompanyAdmin()) {
      return true;
    }
    return this.permissionSet().has(permission);
  }

  public login(payload: LoginPayload): Observable<AuthenticatedSessionView> {
    const normalizedPayload: LoginPayload = {
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    };

    return this.http
      .post<ApiSuccessResponse<AuthenticatedSessionView>>(
        `${environment.apiUrl}/auth/login`,
        normalizedPayload,
      )
      .pipe(
        map((response) => response.data),
        tap((session) => this.persistSession(session)),
      );
  }

  public registerCompany(payload: RegisterCompanyPayload): Observable<AuthenticatedSessionView> {
    const normalizedPayload: RegisterCompanyPayload = {
      companyName: payload.companyName.trim(),
      adminFullName: payload.adminFullName.trim(),
      adminEmail: payload.adminEmail.trim().toLowerCase(),
      adminPassword: payload.adminPassword,
    };

    return this.http
      .post<ApiSuccessResponse<AuthenticatedSessionView>>(
        `${environment.apiUrl}/auth/register-company`,
        normalizedPayload,
      )
      .pipe(
        map((response) => response.data),
        tap((session) => this.persistSession(session)),
      );
  }

  public refreshProfile(): Observable<AuthenticatedUser> {
    return this.http
      .get<ApiSuccessResponse<{ readonly user: AuthenticatedUser }>>(
        `${environment.apiUrl}/auth/me`,
      )
      .pipe(
        map((response) => response.data.user),
        tap((updatedUser) => {
          const current = this.sessionSignal();
          if (current) {
            this.persistSession({
              ...current,
              user: updatedUser,
            });
          }
        }),
      );
  }

  public logout(): void {
    const token = this.getValidAccessToken();
    if (!token) {
      this.clearExpiredSession();
      void this.router.navigateByUrl('/login');
      return;
    }

    this.http
      .post<ApiSuccessResponse<null>>(`${environment.apiUrl}/auth/logout`, {})
      .pipe(
        catchError(() => of(null)),
        finalize(() => {
          this.clearExpiredSession();
          void this.router.navigateByUrl('/login');
        }),
      )
      .subscribe();
  }

  public clearExpiredSession(): void {
    this.sessionSignal.set(null);
    try {
      this.document.defaultView?.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage access errors in restricted contexts
    }
  }

  public extractErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as Partial<ApiErrorResponse> | undefined;
      if (body?.error && typeof body.error.message === 'string' && body.error.message.length > 0) {
        return body.error.message;
      }
      if (error.status === 0) {
        return 'No fue posible establecer conexión con el servidor de NovaFix.';
      }
      if (error.status === 429) {
        return 'Demasiados intentos consecutivos. Por favor espera unos segundos.';
      }
    }
    return fallbackMessage;
  }

  private persistSession(session: AuthenticatedSessionView): void {
    if (!JWT_STRUCTURE_REGEX.test(session.token) || this.isExpired(session.expiresAt)) {
      this.clearExpiredSession();
      return;
    }
    this.sessionSignal.set(session);
    try {
      this.document.defaultView?.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(session),
      );
    } catch {
      // Keep session in memory if sessionStorage is unavailable
    }
  }

  private restoreValidatedSession(): AuthenticatedSessionView | null {
    try {
      const raw = this.document.defaultView?.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<AuthenticatedSessionView>;
      if (
        !parsed ||
        typeof parsed.token !== 'string' ||
        typeof parsed.expiresAt !== 'string' ||
        !parsed.user ||
        typeof parsed.user.id !== 'string' ||
        typeof parsed.user.companyId !== 'string' ||
        !JWT_STRUCTURE_REGEX.test(parsed.token) ||
        this.isExpired(parsed.expiresAt)
      ) {
        this.document.defaultView?.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      return parsed as AuthenticatedSessionView;
    } catch {
      return null;
    }
  }

  private isExpired(expiresAtIso: string): boolean {
    const expiryTime = Date.parse(expiresAtIso);
    if (Number.isNaN(expiryTime)) {
      return true;
    }
    return expiryTime <= Date.now();
  }
}
