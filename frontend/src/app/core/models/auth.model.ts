export type PermissionCode =
  | 'MANAGE_AREAS'
  | 'MANAGE_USERS'
  | 'ORDER_CREATE'
  | 'ORDER_DELETE'
  | 'ORDER_ASSIGN_QUEUE'
  | 'ORDER_STATUS_DIAGNOSING'
  | 'ORDER_STATUS_IN_REPAIR'
  | 'ORDER_STATUS_READY'
  | 'ORDER_STATUS_CANCELLED'
  | 'ORDER_STATUS_DELIVERED'
  | 'ORDER_VIEW_AREA'
  | 'ORDER_VIEW_ALL_COMPANY';

export type PermissionPreset =
  | 'RECEPTION_AGENT'
  | 'RECEPTION_SUPERVISOR'
  | 'TECHNICAL_SPECIALIST'
  | 'TECHNICAL_SUPERVISOR'
  | 'CUSTOM';

export interface PermissionDescriptor {
  readonly code: PermissionCode;
  readonly label: string;
  readonly category: 'ADMIN' | 'RECEPTION' | 'TECHNICAL' | 'SUPERVISION';
  readonly description: string;
}

export interface PresetDescriptor {
  readonly preset: PermissionPreset;
  readonly label: string;
  readonly summary: string;
  readonly defaultPermissions: ReadonlyArray<PermissionCode>;
}

export const ALL_PERMISSION_CODES: ReadonlyArray<PermissionCode> = [
  'MANAGE_AREAS',
  'MANAGE_USERS',
  'ORDER_CREATE',
  'ORDER_DELETE',
  'ORDER_ASSIGN_QUEUE',
  'ORDER_STATUS_DIAGNOSING',
  'ORDER_STATUS_IN_REPAIR',
  'ORDER_STATUS_READY',
  'ORDER_STATUS_CANCELLED',
  'ORDER_STATUS_DELIVERED',
  'ORDER_VIEW_AREA',
  'ORDER_VIEW_ALL_COMPANY',
] as const;

export const PERMISSION_CATALOG: ReadonlyArray<PermissionDescriptor> = [
  {
    code: 'MANAGE_AREAS',
    label: 'Gestionar Áreas',
    category: 'ADMIN',
    description: 'Crear, editar y dar de baja áreas de trabajo de la empresa.',
  },
  {
    code: 'MANAGE_USERS',
    label: 'Gestionar Personal',
    category: 'ADMIN',
    description: 'Crear usuarios, cambiar contraseñas, asignar permisos y dar de baja personal.',
  },
  {
    code: 'ORDER_CREATE',
    label: 'Registrar Órdenes',
    category: 'RECEPTION',
    description: 'Registrar el ingreso de equipos de clientes y enviarlos a un área técnica.',
  },
  {
    code: 'ORDER_DELETE',
    label: 'Anular Órdenes por Error',
    category: 'RECEPTION',
    description: 'Anular órdenes registradas por equivocación antes de ser entregadas.',
  },
  {
    code: 'ORDER_STATUS_DELIVERED',
    label: 'Entregar Equipos al Cliente',
    category: 'RECEPTION',
    description: 'Registrar la entrega final del equipo al cliente cuando está listo.',
  },
  {
    code: 'ORDER_ASSIGN_QUEUE',
    label: 'Recibir Órdenes Automáticamente',
    category: 'TECHNICAL',
    description: 'Recibir asignaciones automáticas de órdenes cuando el técnico está disponible.',
  },
  {
    code: 'ORDER_STATUS_DIAGNOSING',
    label: 'Estado: En Diagnóstico',
    category: 'TECHNICAL',
    description: 'Iniciar la revisión técnica del equipo.',
  },
  {
    code: 'ORDER_STATUS_IN_REPAIR',
    label: 'Estado: En Reparación',
    category: 'TECHNICAL',
    description: 'Indicar que el equipo se encuentra en proceso de reparación en taller.',
  },
  {
    code: 'ORDER_STATUS_READY',
    label: 'Estado: Lista para Entrega',
    category: 'TECHNICAL',
    description: 'Finalizar la reparación registrando el informe del trabajo realizado.',
  },
  {
    code: 'ORDER_STATUS_CANCELLED',
    label: 'Estado: Cancelada',
    category: 'TECHNICAL',
    description: 'Cancelar el servicio registrando el motivo técnico o decisión del cliente.',
  },
  {
    code: 'ORDER_VIEW_AREA',
    label: 'Supervisión de Área',
    category: 'SUPERVISION',
    description: 'Ver todas las órdenes y el personal perteneciente a su propia área.',
  },
  {
    code: 'ORDER_VIEW_ALL_COMPANY',
    label: 'Vista General de Empresa',
    category: 'SUPERVISION',
    description: 'Visualizar todas las órdenes de todas las áreas de la empresa.',
  },
] as const;

export const PRESET_CATALOG: ReadonlyArray<PresetDescriptor> = [
  {
    preset: 'RECEPTION_AGENT',
    label: 'Agente de Recepción',
    summary: 'Registra órdenes, anula ingresos erróneos y entrega equipos terminados.',
    defaultPermissions: ['ORDER_CREATE', 'ORDER_DELETE', 'ORDER_STATUS_DELIVERED'],
  },
  {
    preset: 'RECEPTION_SUPERVISOR',
    label: 'Supervisor de Recepción',
    summary: 'Funciones de recepción más supervisión completa de órdenes y personal de su área.',
    defaultPermissions: [
      'ORDER_CREATE',
      'ORDER_DELETE',
      'ORDER_STATUS_DELIVERED',
      'ORDER_VIEW_AREA',
    ],
  },
  {
    preset: 'TECHNICAL_SPECIALIST',
    label: 'Especialista Técnico',
    summary: 'Recibe órdenes automáticamente y realiza diagnósticos y reparaciones en taller.',
    defaultPermissions: [
      'ORDER_ASSIGN_QUEUE',
      'ORDER_STATUS_DIAGNOSING',
      'ORDER_STATUS_IN_REPAIR',
      'ORDER_STATUS_READY',
      'ORDER_STATUS_CANCELLED',
    ],
  },
  {
    preset: 'TECHNICAL_SUPERVISOR',
    label: 'Supervisor de Laboratorio',
    summary: 'Funciones técnicas más supervisión completa de órdenes y técnicos de su taller.',
    defaultPermissions: [
      'ORDER_ASSIGN_QUEUE',
      'ORDER_STATUS_DIAGNOSING',
      'ORDER_STATUS_IN_REPAIR',
      'ORDER_STATUS_READY',
      'ORDER_STATUS_CANCELLED',
      'ORDER_VIEW_AREA',
    ],
  },
  {
    preset: 'CUSTOM',
    label: 'Personalizado',
    summary: 'Configuración manual seleccionando permisos individuales específicos.',
    defaultPermissions: [],
  },
] as const;

export function getPresetDefaultPermissions(
  preset: PermissionPreset,
): ReadonlyArray<PermissionCode> {
  const found = PRESET_CATALOG.find((item) => item.preset === preset);
  return found ? found.defaultPermissions : [];
}

export function computeEffectivePermissions(input: {
  readonly userPreset: PermissionPreset;
  readonly areaPreset?: PermissionPreset | null;
  readonly areaPermissions?: ReadonlyArray<PermissionCode>;
  readonly customPermissions?: ReadonlyArray<PermissionCode>;
}): ReadonlyArray<PermissionCode> {
  const result = new Set<PermissionCode>();

  for (const code of getPresetDefaultPermissions(input.userPreset)) {
    result.add(code);
  }
  if (input.areaPreset) {
    for (const code of getPresetDefaultPermissions(input.areaPreset)) {
      result.add(code);
    }
  }
  if (input.areaPermissions) {
    for (const code of input.areaPermissions) {
      result.add(code);
    }
  }
  if (input.customPermissions) {
    for (const code of input.customPermissions) {
      result.add(code);
    }
  }

  return Array.from(result);
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly isCompanyAdmin: boolean;
  readonly companyId: string;
  readonly companyName: string;
  readonly areaId: string | null;
  readonly areaName: string | null;
  readonly isTechnicalArea: boolean;
  readonly permissionPreset: PermissionPreset;
  readonly permissions: ReadonlyArray<PermissionCode>;
  readonly unreadNotificationsCount: number;
}

export interface AuthenticatedSessionView {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: AuthenticatedUser;
}

export interface LoginPayload {
  readonly email: string;
  readonly password: string;
}

export interface RegisterCompanyPayload {
  readonly companyName: string;
  readonly adminFullName: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
}
