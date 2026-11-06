import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import {
  OrderPreviewCardComponent,
  type OrderPreviewItem,
  type OrderPreviewStatus,
} from '../../shared/components/order-preview-card/order-preview-card.component';

export type OrderFilterCategory = 'ALL' | 'QUEUE' | 'ACTIVE_LAB' | 'READY_DELIVERY';

interface ArchitecturalPrinciple {
  readonly index: string;
  readonly title: string;
  readonly metric: string;
  readonly description: string;
}

const INITIAL_ORDER_PREVIEWS: readonly OrderPreviewItem[] = [
  {
    id: 'ord-01',
    ticketCode: 'ORD-8F3K9A',
    status: 'IN_REPAIR',
    statusLabel: 'EN REPARACIÓN',
    customerLabel: 'Corporación Vértice S.A.',
    deviceModel: 'MacBook Pro 16" M3 Max (A2991)',
    issueSummary:
      'Cortocircuito en línea principal PPBUS_AON tras sobretensión en puerto Thunderbolt 4.',
    originArea: 'Recepción Principal',
    targetArea: 'Lab. Microelectrónica',
    assigneeLabel: 'Ing. Mateo Vásquez',
    updatedRelative: 'Hace 12 min',
    priorityLabel: 'PRIORIDAD ALTA',
  },
  {
    id: 'ord-02',
    ticketCode: 'ORD-4M7P2X',
    status: 'ASSIGNING',
    statusLabel: 'EN ESPERA DE TÉCNICO',
    customerLabel: 'Estudio Arquitectónico Dual',
    deviceModel: 'Workstation Precision 7865 Tower',
    issueSummary:
      'Fallo intermitente en controlador NVMe RAID y sobrecalentamiento de VRM bajo carga sostenida.',
    originArea: 'Recepción Empresarial',
    targetArea: 'Lab. Servidores y Estaciones',
    assigneeLabel: 'En lista de espera (#01)',
    updatedRelative: 'Hace 28 min',
    priorityLabel: 'PRIORIDAD URGENTE',
  },
  {
    id: 'ord-03',
    ticketCode: 'ORD-9C2N6W',
    status: 'READY',
    statusLabel: 'LISTA PARA ENTREGA',
    customerLabel: 'Elena Rostova',
    deviceModel: 'iPhone 15 Pro Max 512GB',
    issueSummary:
      'Reconstrucción de pistas de bus I2C del sensor LiDAR y calibración térmica certificada.',
    originArea: 'Recepción Principal',
    targetArea: 'Lab. Dispositivos Móviles',
    assigneeLabel: 'Téc. Sofía Méndez',
    updatedRelative: 'Hace 45 min',
    priorityLabel: 'PRIORIDAD NORMAL',
  },
  {
    id: 'ord-04',
    ticketCode: 'ORD-5K8R3D',
    status: 'DIAGNOSING',
    statusLabel: 'EN DIAGNÓSTICO',
    customerLabel: 'Laboratorio Clínico Atlas',
    deviceModel: 'ThinkPad P1 Gen 6',
    issueSummary:
      'Inspección de integridad de BIOS SPI Flash y verificación de consumo en estado S0ix.',
    originArea: 'Recepción Principal',
    targetArea: 'Lab. Microelectrónica',
    assigneeLabel: 'Ing. Carlos Mendoza',
    updatedRelative: 'Hace 1 h',
    priorityLabel: 'PRIORIDAD ALTA',
  },
  {
    id: 'ord-05',
    ticketCode: 'ORD-2H6V9Q',
    status: 'CREATED',
    statusLabel: 'ASIGNADA A TÉCNICO',
    customerLabel: 'Andrés Salgado',
    deviceModel: 'iPad Pro 13" M4 OLED',
    issueSummary:
      'Sustitución de módulo de carga USB-C y diagnóstico de controlador Tristar/Hydra.',
    originArea: 'Recepción Principal',
    targetArea: 'Lab. Dispositivos Móviles',
    assigneeLabel: 'Téc. Diego Herrera',
    updatedRelative: 'Hace 2 h',
    priorityLabel: 'PRIORIDAD NORMAL',
  },
  {
    id: 'ord-06',
    ticketCode: 'ORD-7T4L8B',
    status: 'DELIVERED',
    statusLabel: 'ENTREGADA',
    customerLabel: 'Editorial Monolito',
    deviceModel: 'Mac Studio M2 Ultra',
    issueSummary:
      'Mantenimiento preventivo de cámara de vapor, reemplazo de pasta de cambio de fase y pruebas.',
    originArea: 'Recepción Empresarial',
    targetArea: 'Lab. Microelectrónica',
    assigneeLabel: 'Cerrada por Recepción',
    updatedRelative: 'Hace 3 h',
    priorityLabel: 'PRIORIDAD NORMAL',
  },
];

@Component({
  selector: 'app-home-showcase',
  standalone: true,
  imports: [RouterLink, IconComponent, OrderPreviewCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-showcase.component.html',
  styleUrl: './home-showcase.component.css',
})
export class HomeShowcaseComponent {
  protected readonly authService = inject(AuthService);

  protected readonly activeFilter = signal<OrderFilterCategory>('ALL');
  protected readonly searchQuery = signal<string>('');
  protected readonly orders = signal<readonly OrderPreviewItem[]>(INITIAL_ORDER_PREVIEWS);
  protected readonly selectedOrder = signal<OrderPreviewItem | null>(
    INITIAL_ORDER_PREVIEWS[0] ?? null,
  );

  protected readonly architecturalPrinciples = signal<readonly ArchitecturalPrinciple[]>([
    {
      index: '01',
      title: 'Organización por Áreas',
      metric: 'Recepción y Taller',
      description:
        'Estructura tu centro de servicio en áreas de recepción y laboratorios especializados según el tipo de equipo.',
    },
    {
      index: '02',
      title: 'Asignación Inteligente',
      metric: 'Turnos Automáticos',
      description:
        'Cada nueva orden se asigna de inmediato al primer técnico disponible o queda en lista de espera por prioridad.',
    },
    {
      index: '03',
      title: 'Seguimiento Transparente',
      metric: 'Consulta en Línea',
      description:
        'Tus clientes pueden consultar el avance de su equipo en cualquier momento ingresando su código de orden.',
    },
  ]);

  protected readonly filteredOrders = computed<readonly OrderPreviewItem[]>(() => {
    const category = this.activeFilter();
    const query = this.searchQuery().trim().toUpperCase();

    return this.orders().filter((item) => {
      const matchesCategory = this.matchesFilterCategory(item.status, category);
      if (!matchesCategory) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        item.ticketCode.toUpperCase().includes(query) ||
        item.deviceModel.toUpperCase().includes(query) ||
        item.targetArea.toUpperCase().includes(query) ||
        item.assigneeLabel.toUpperCase().includes(query)
      );
    });
  });

  protected readonly queueCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'ASSIGNING').length,
  );

  protected readonly activeLabCount = computed<number>(
    () =>
      this.orders().filter(
        (o) => o.status === 'CREATED' || o.status === 'DIAGNOSING' || o.status === 'IN_REPAIR',
      ).length,
  );

  protected readonly readyCount = computed<number>(
    () => this.orders().filter((o) => o.status === 'READY').length,
  );

  protected setFilter(category: OrderFilterCategory): void {
    this.activeFilter.set(category);
  }

  protected updateSearch(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.searchQuery.set(target?.value ?? '');
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected handleInspectOrder(order: OrderPreviewItem): void {
    this.selectedOrder.set(order);
  }

  protected closeInspector(): void {
    this.selectedOrder.set(null);
  }

  private matchesFilterCategory(
    status: OrderPreviewStatus,
    category: OrderFilterCategory,
  ): boolean {
    switch (category) {
      case 'QUEUE':
        return status === 'ASSIGNING';
      case 'ACTIVE_LAB':
        return status === 'CREATED' || status === 'DIAGNOSING' || status === 'IN_REPAIR';
      case 'READY_DELIVERY':
        return status === 'READY';
      default:
        return true;
    }
  }
}
