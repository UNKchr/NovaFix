import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { PermissionCode } from '../models/auth.model';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/']);
};

export function permissionGuard(requiredPermission: PermissionCode): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    if (authService.hasPermission(requiredPermission)) {
      return true;
    }
    return router.createUrlTree(['/']);
  };
}

export function anyPermissionGuard(
  requiredPermissions: ReadonlyArray<PermissionCode>,
): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    if (requiredPermissions.some((perm) => authService.hasPermission(perm))) {
      return true;
    }
    return router.createUrlTree(['/']);
  };
}
