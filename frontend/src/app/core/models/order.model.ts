export type OrderStatus =
  | 'CREATED'
  | 'ASSIGNING'
  | 'DIAGNOSING'
  | 'IN_REPAIR'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export type OrderTransitionStatus =
  | 'DIAGNOSING'
  | 'IN_REPAIR'
  | 'READY'
  | 'CANCELLED'
  | 'DELIVERED';

export type OrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface PriorityDescriptor {
  readonly value: OrderPriority;
  readonly label: string;
  readonly summary: string;
}

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  CREATED: 'ASIGNADA A TÉCNICO',
  ASSIGNING: 'EN ESPERA DE TÉCNICO',
  DIAGNOSING: 'EN DIAGNÓSTICO',
  IN_REPAIR: 'EN REPARACIÓN',
  READY: 'LISTA PARA ENTREGA',
  DELIVERED: 'ENTREGADA AL CLIENTE',
  CANCELLED: 'CANCELADA',
};

export const ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>> = {
  LOW: 'PRIORIDAD BAJA',
  NORMAL: 'PRIORIDAD NORMAL',
  HIGH: 'PRIORIDAD ALTA',
  URGENT: 'PRIORIDAD URGENTE',
};

export const ORDER_PRIORITY_CATALOG: ReadonlyArray<PriorityDescriptor> = [
  {
    value: 'LOW',
    label: 'Baja',
    summary: 'Mantenimiento preventivo o revisión sin urgencia.',
  },
  {
    value: 'NORMAL',
    label: 'Normal',
    summary: 'Ingreso estándar en turno regular de taller.',
  },
  {
    value: 'HIGH',
    label: 'Alta',
    summary: 'Equipo de trabajo prioritario en la lista de espera.',
  },
  {
    value: 'URGENT',
    label: 'Urgente',
    summary: 'Caso crítico; se asigna en primer lugar en cuanto un técnico queda disponible.',
  },
] as const;

export interface OrderHistoryEntryView {
  readonly id: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly changedByFullName: string;
  readonly comment: string | null;
  readonly createdAt: string;
}

export interface PublicOrderTrackingView {
  readonly ticketCode: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly deviceModel: string;
  readonly issueDesc: string;
  readonly status: OrderStatus;
  readonly priority: OrderPriority;
  readonly targetAreaName: string;
  readonly resolutionNotes: string | null;
  readonly cancellationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly deliveredAt: string | null;
  readonly history: ReadonlyArray<{
    readonly status: OrderStatus;
    readonly comment: string | null;
    readonly timestamp: string;
  }>;
}

export interface PublicTrackingLookupResult {
  readonly order: PublicOrderTrackingView;
  readonly cacheStatus: 'HIT' | 'MISS';
  readonly responseTimeMs: number;
  readonly fetchedAt: string;
}

export interface InternalOrderView {
  readonly id: string;
  readonly companyId: string;
  readonly ticketCode: string;
  readonly status: OrderStatus;
  readonly priority: OrderPriority;
  readonly clientName: string;
  readonly clientContact: string;
  readonly deviceModel: string;
  readonly issueDesc: string;
  readonly resolutionNotes: string | null;
  readonly cancellationReason: string | null;
  readonly createdBy: {
    readonly id: string;
    readonly fullName: string;
    readonly email: string;
    readonly isDeleted: boolean;
  };
  readonly originArea: {
    readonly id: string;
    readonly name: string;
  } | null;
  readonly targetArea: {
    readonly id: string;
    readonly name: string;
  };
  readonly assignedTo: {
    readonly id: string;
    readonly fullName: string;
    readonly email: string;
  } | null;
  readonly queuedAt: string;
  readonly assignedAt: string | null;
  readonly completedAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly statusHistory: ReadonlyArray<OrderHistoryEntryView>;
}

export interface CreateOrderPayload {
  readonly clientName: string;
  readonly clientContact: string;
  readonly deviceModel: string;
  readonly issueDesc: string;
  readonly targetAreaId: string;
  readonly priority: OrderPriority;
}

export interface UpdateOrderStatusPayload {
  readonly status: OrderTransitionStatus;
  readonly resolutionNotes?: string;
  readonly cancellationReason?: string;
  readonly comment?: string;
}

export interface ListOrdersQuery {
  readonly status?: OrderStatus;
  readonly search?: string;
}
