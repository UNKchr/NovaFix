import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

const PUBLIC_AUTH_PATHS: ReadonlyArray<string> = [
  `${environment.apiUrl}/auth/login`,
  `${environment.apiUrl}/auth/register-company`,
  `${environment.apiUrl}/orders/public/`,
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isTrustedApiOrigin = req.url.startsWith(environment.apiUrl);
  const isPublicAuthEndpoint = PUBLIC_AUTH_PATHS.some((path) => req.url.startsWith(path));

  let outgoingRequest = req;

  if (isTrustedApiOrigin && !isPublicAuthEndpoint) {
    const token = authService.getValidAccessToken();
    if (token) {
      outgoingRequest = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  }

  return next(outgoingRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isTrustedApiOrigin &&
        !isPublicAuthEndpoint
      ) {
        authService.clearExpiredSession();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
