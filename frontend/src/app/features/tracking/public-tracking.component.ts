import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { ApiErrorResponse } from '../../core/models/api-response.model';
import {
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_LABELS,
  type OrderPriority,
  type OrderStatus,
  type PublicOrderTrackingView,
  type PublicTrackingLookupResult,
} from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService } from '../../core/services/orders.service';
import { RealtimeSyncService } from '../../core/services/realtime-sync.service';
import {
  isValidTicketCode,
  ticketCodeValidator,
} from '../../core/validators/security.validators';
import { IconComponent } from '../../shared/components/icon/icon.component';

export type LifecycleStageState = 'COMPLETED' | 'ACTIVE' | 'PENDING' | 'SKIPPED';

export interface TrackingLifecycleStage {
  readonly index: string;
  readonly title: string;
  readonly subtitle: string;
  readonly state: LifecycleStageState;
}

@Component({
  selector: 'app-public-tracking',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-tracking.component.html',
  styleUrl: './public-tracking.component.css',
})
export class PublicTrackingComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ordersService = inject(OrdersService);
  private readonly realtimeSync = inject(RealtimeSyncService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);

  protected readonly isSearching = signal<boolean>(false);
  protected readonly lookupResult = signal<PublicTrackingLookupResult | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastQueriedCode = signal<string | null>(null);

  protected readonly searchForm = this.fb.group({
    ticketCode: ['', [Validators.required, ticketCodeValidator()]],
  });

  protected readonly lifecycleStages = computed<ReadonlyArray<TrackingLifecycleStage>>(() => {
    const result = this.lookupResult();
    if (!result) {
      return [];
    }

    const order = result.order;
    const status = order.status;
    const isCancelledFlow = this.isCancelledOrder(order);

    if (isCancelledFlow) {
      const visitedStatuses = new Set<OrderStatus>(order.history.map((item) => item.status));
      const wasAssignedToTech =
        visitedStatuses.has('CREATED') ||
        visitedStatuses.has('DIAGNOSING') ||
        visitedStatuses.has('IN_REPAIR');
      const wasDiagnosed =
        visitedStatuses.has('DIAGNOSING') || visitedStatuses.has('IN_REPAIR');
      const isAlreadyReturned = status === 'DELIVERED';

      return [
        {
          index: '01',
          title: 'INGRESO REGISTRADO',
          subtitle: 'Recepción y apertura de ticket único',
          state: 'COMPLETED',
        },
        {
          index: '02',
          title: wasAssignedToTech ? 'ASIGNADO A TALLER' : 'EN ESPERA DE TURNO',
          subtitle: wasAssignedToTech
            ? 'Asignada a laboratorio especializado'
            : 'Cancelada antes de ingresar a taller',
          state: wasAssignedToTech ? 'COMPLETED' : 'SKIPPED',
        },
        {
          index: '03',
          title: 'EN DIAGNÓSTICO',
          subtitle: wasDiagnosed
            ? 'Evaluación técnica previa a la cancelación'
            : 'Sin intervención ni reparación aplicada',
          state: wasDiagnosed ? 'COMPLETED' : 'SKIPPED',
        },
        {
          index: '04',
          title: 'ORDEN CANCELADA',
          subtitle: 'Servicio cancelado con motivo registrado',
          state: isAlreadyReturned ? 'COMPLETED' : 'ACTIVE',
        },
        {
          index: '05',
          title: isAlreadyReturned ? 'DEVUELTO AL CLIENTE' : 'LISTO PARA RETIRO',
          subtitle: isAlreadyReturned
            ? 'Equipo devuelto al titular sin reparación'
            : 'Disponible en recepción para su devolución',
          state: isAlreadyReturned ? 'COMPLETED' : 'PENDING',
        },
      ];
    }

    const rankMap: Readonly<Record<OrderStatus, number>> = {
      ASSIGNING: 2,
      CREATED: 2,
      DIAGNOSING: 3,
      IN_REPAIR: 4,
      READY: 5,
      DELIVERED: 6,
      CANCELLED: 5,
    };

    const currentRank = rankMap[status];

    const resolveState = (stageIndex: number): LifecycleStageState => {
      if (status === 'DELIVERED') {
        return 'COMPLETED';
      }
      if (stageIndex < currentRank) {
        return 'COMPLETED';
      }
      if (stageIndex === currentRank) {
        return 'ACTIVE';
      }
      return 'PENDING';
    };

    const finalStageTitle =
      status === 'DELIVERED' ? 'ENTREGADA AL CLIENTE' : 'LISTA PARA ENTREGA';

    const finalStageSubtitle =
      status === 'DELIVERED'
        ? 'Orden finalizada y equipo retirado'
        : 'Control de calidad y aviso de retiro';

    return [
      {
        index: '01',
        title: 'INGRESO REGISTRADO',
        subtitle: 'Recepción y apertura de ticket único',
        state: 'COMPLETED',
      },
      {
        index: '02',
        title: status === 'ASSIGNING' ? 'EN ESPERA DE TURNO' : 'ASIGNADO A TALLER',
        subtitle:
          status === 'ASSIGNING'
            ? 'En espera del primer técnico disponible'
            : 'Asignada a laboratorio especializado',
        state: status === 'ASSIGNING' ? 'ACTIVE' : 'COMPLETED',
      },
      {
        index: '03',
        title: 'EN DIAGNÓSTICO',
        subtitle: 'Inspección técnica y evaluación de falla',
        state: resolveState(3),
      },
      {
        index: '04',
        title: 'EN REPARACIÓN',
        subtitle: 'Intervención en laboratorio y pruebas',
        state: resolveState(4),
      },
      {
        index: '05',
        title: finalStageTitle,
        subtitle: finalStageSubtitle,
        state: resolveState(5),
      },
    ];
  });

  public ngOnInit(): void {
    this.realtimeSync.registerAutoRefresh({
      destroyRef: this.destroyRef,
      intervalMs: 10000,
      onRefresh: () => this.refreshSilently(),
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const rawCode = params.get('code');
      if (!rawCode) {
        return;
      }

      const normalized = rawCode.trim().toUpperCase();
      if (!isValidTicketCode(normalized)) {
        this.searchForm.controls.ticketCode.setValue(normalized);
        this.searchForm.controls.ticketCode.markAsTouched();
        this.lookupResult.set(null);
        this.errorMessage.set(
          'El código en el enlace no cumple el formato oficial ORD-XXXXXX (4 a 8 caracteres alfanuméricos).',
        );
        return;
      }

      if (this.lastQueriedCode() !== normalized || !this.lookupResult()) {
        this.searchForm.controls.ticketCode.setValue(normalized);
        this.executeLookup(normalized, false);
      }
    });
  }

  protected normalizeTicketInput(): void {
    const ctrl = this.searchForm.controls.ticketCode;
    const raw = ctrl.value;
    const upper = raw.toUpperCase();
    if (raw !== upper) {
      ctrl.setValue(upper, { emitEvent: false });
    }
  }

  protected onSubmitSearch(): void {
    this.normalizeTicketInput();
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      return;
    }

    const normalizedCode = this.searchForm.controls.ticketCode.value.trim().toUpperCase();
    this.executeLookup(normalizedCode, true);
  }

  protected refreshCurrentTicket(): void {
    const currentCode = this.lookupResult()?.order.ticketCode ?? this.lastQueriedCode();
    if (!currentCode || !isValidTicketCode(currentCode)) {
      return;
    }
    this.executeLookup(currentCode, false);
  }

  private refreshSilently(): void {
    const currentResult = this.lookupResult();
    if (this.isSearching() || !currentResult || currentResult.order.status === 'DELIVERED') {
      return;
    }
    const currentCode = currentResult.order.ticketCode;
    if (!isValidTicketCode(currentCode)) {
      return;
    }
    this.ordersService.lookupPublicOrder(currentCode).subscribe({
      next: (result) => {
        this.lookupResult.set(result);
      },
      error: () => {
        // Ignore transient background errors
      },
    });
  }

  protected clearTrackingSearch(): void {
    this.searchForm.reset({ ticketCode: '' });
    this.lookupResult.set(null);
    this.errorMessage.set(null);
    this.lastQueriedCode.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { code: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected isCancelledOrder(order: PublicOrderTrackingView): boolean {
    return (
      order.status === 'CANCELLED' ||
      order.cancellationReason !== null ||
      order.history.some((item) => item.status === 'CANCELLED')
    );
  }

  protected orderBannerStatusLabel(order: PublicOrderTrackingView): string {
    if (order.status === 'DELIVERED' && this.isCancelledOrder(order)) {
      return 'CANCELADA · DEVUELTA AL CLIENTE';
    }
    return ORDER_STATUS_LABELS[order.status];
  }

  protected timelineStatusLabel(
    order: PublicOrderTrackingView,
    status: OrderStatus,
  ): string {
    if (status === 'DELIVERED' && this.isCancelledOrder(order)) {
      return 'DEVUELTA AL CLIENTE (SIN REPARACIÓN)';
    }
    return ORDER_STATUS_LABELS[status];
  }

  protected statusLabel(status: OrderStatus): string {
    return ORDER_STATUS_LABELS[status];
  }

  protected priorityLabel(priority: OrderPriority): string {
    return ORDER_PRIORITY_LABELS[priority];
  }

  protected isFieldInvalid(): boolean {
    const control = this.searchForm.controls.ticketCode;
    return control.invalid && (control.dirty || control.touched);
  }

  private executeLookup(normalizedCode: string, syncUrl: boolean): void {
    this.isSearching.set(true);
    this.errorMessage.set(null);
    this.lastQueriedCode.set(normalizedCode);

    if (syncUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { code: normalizedCode },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.ordersService
      .lookupPublicOrder(normalizedCode)
      .pipe(finalize(() => this.isSearching.set(false)))
      .subscribe({
        next: (result) => {
          this.lookupResult.set(result);
        },
        error: (err: unknown) => {
          this.lookupResult.set(null);
          this.errorMessage.set(
            this.extractErrorMessage(
              err,
              `No se encontró ninguna orden registrada con el código ${normalizedCode}. Verifica los caracteres e intenta nuevamente.`,
            ),
          );
        },
      });
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const apiErr = err.error as ApiErrorResponse | undefined;
      if (apiErr?.error?.message) {
        return apiErr.error.message;
      }
    }
    return fallback;
  }
}
