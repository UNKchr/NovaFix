import type { Routes } from '@angular/router';
import {
  anyPermissionGuard,
  authGuard,
  guestGuard,
  permissionGuard,
} from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'NovaFix — Gestión y Seguimiento de Servicio Técnico',
    loadComponent: () =>
      import('./features/home/home-showcase.component').then((m) => m.HomeShowcaseComponent),
  },
  {
    path: 'tracking',
    title: 'Consultar Estado de Orden — NovaFix',
    loadComponent: () =>
      import('./features/tracking/public-tracking.component').then(
        (m) => m.PublicTrackingComponent,
      ),
  },
  {
    path: 'login',
    title: 'Iniciar Sesión — NovaFix',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register-company',
    title: 'Registrar Empresa — NovaFix',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register-company/register-company.component').then(
        (m) => m.RegisterCompanyComponent,
      ),
  },
  {
    path: 'orders',
    title: 'Centro de Órdenes de Servicio — NovaFix',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/orders-workspace/orders-workspace.component').then(
        (m) => m.OrdersWorkspaceComponent,
      ),
  },
  {
    path: 'admin/areas',
    title: 'Gestión de Áreas Operativas — NovaFix',
    canActivate: [authGuard, permissionGuard('MANAGE_AREAS')],
    loadComponent: () =>
      import('./features/admin/areas-management/areas-management.component').then(
        (m) => m.AreasManagementComponent,
      ),
  },
  {
    path: 'admin/users',
    title: 'Gestión de Personal y Permisos — NovaFix',
    canActivate: [authGuard, anyPermissionGuard(['MANAGE_USERS', 'ORDER_VIEW_AREA'])],
    loadComponent: () =>
      import('./features/admin/users-management/users-management.component').then(
        (m) => m.UsersManagementComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
