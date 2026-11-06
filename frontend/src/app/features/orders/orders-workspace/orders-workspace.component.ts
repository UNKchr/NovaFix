import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { AreaSummaryView } from '../../../core/models/area.model';
import {
  type InternalOrderView,
  ORDER_PRIORITY_CATALOG,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_LABELS,
  type OrderPriority,
  type OrderStatus,
  type OrderTransitionStatus,
} from '../../../core/models/order.model';
import { AreasService } from '../../../core/services/areas.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { OrdersService } from '../../../core/services/orders.service';
import { RealtimeSyncService } from '../../../core/services/realtime-sync.service';
import {
  optionalSanitizedTextValidator,
  sanitizedTextValidator,
  uuidValidator,
} from '../../../core/validators/security.validators';
import { IconComponent } from '../../../shared/components/icon/icon.component';

export type WorkspaceStatusFilter = 'ALL' | OrderStatus;

interface TransitionOption {
  readonly status: OrderTransitionStatus;
  readonly label: string;
}

@Component({
  selector: 'app-orders-workspace',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-workspace.component.html',
  styleUrl: './orders-workspace.component.css',
})
export class OrdersWorkspaceComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeSync = inject(RealtimeSyncService);
  protected readonly ordersService = inject(OrdersService);
  protected readonly areasService = inject(AreasService);
  protected readonly notificationsService = inject(NotificationsService);
  protected readonly authService = inject(AuthService);

  private readonly deleteDialogRef =
    viewChild<ElementRef<HTMLDialogElement>>('deleteOrderDialog');

  protected readonly priorityCatalog = ORDER_PRIORITY_CATALOG;

  protected readonly isCreatePanelOpen = signal<boolean>(false);
  protected readonly isCreating = signal<boolean>(false);
  protected readonly createSubmitted = signal<boolean>(false);

  protected readonly activeStatusFilter = signal<WorkspaceStatusFilter>('ALL');
  protected readonly searchQuery = signal<string>('');
  protected readonly selectedOrderId = signal<string | null>(null);

  protected readonly selectedTransition = signal<OrderTransitionStatus | null>(null);
  protected readonly isUpdatingStatus = signal<boolean>(false);
  protected readonly statusSubmitted = signal<boolean>(false);

  protected readonly feedbackMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pendingDeleteOrder = signal<InternalOrderView | null>(null);

  protected readonly createOrderForm = this.fb.group({
    clientName: ['', [sanitizedTextValidator(2, 100)]],
    clientContact: ['', [sanitizedTextValidator(4, 100)]],
    deviceModel: ['', [sanitizedTextValidator(2, 100)]],
    issueDesc: ['', [sanitizedTextValidator(5, 1000)]],
    targetAreaId: ['', [uuidValidator()]],
    priority: ['NORMAL' as OrderPriority],
  });

  protected readonly transitionForm = this.fb.group({
    resolutionNotes: ['', [optionalSanitizedTextValidator(5, 1000)]],
    cancellationReason: ['', [optionalSanitizedTextValidator(5, 1000)]],
    comment: ['', [optionalSanitizedTextValidator(2, 1000)]],
  });

  protected readonly canCreateOrders = computed<boolean>(() =>
    this.authService.hasPermission('ORDER_CREATE'),
  );

  protected readonly technicalTargetAreas = computed<ReadonlyArray<AreaSummaryView>>(() =>
    this.areasService.areas().filter((area) => area.isTechnicalQueue),
  );

  protected readonly visibilityScopeLabel = computed<string>(() => {
    const user = this.authService.currentUser();
    if (!user) {
      return 'SESIÓN NO INICIADA';
    }
    if (user.isCompanyAdmin || this.authService.hasPermission('ORDER_VIEW_ALL_COMPANY')) {
      return 'ADMINISTRACIÓN GENERAL DE LA EMPRESA';
    }
    if (this.authService.hasPermission('ORDER_VIEW_AREA')) {
      return `SUPERVISIÓN DE ÁREA · ${(user.areaName ?? 'ÁREA').toUpperCase()}`;
    }
    if (this.authService.hasPermission('ORDER_CREATE')) {
      return `ÁREA DE RECEPCIÓN · ${(user.areaName ?? 'RECEPCIÓN').toUpperCase()}`;
    }
    return `LABORATORIO TÉCNICO · ${(user.areaName ?? 'TALLER').toUpperCase()}`;
  });

  protected readonly filteredOrders = computed<ReadonlyArray<InternalOrderView>>(() => {
    const filter = this.activeStatusFilter();
    const query = this.searchQuery().trim().toUpperCase();

    return this.ordersService.orders().filter((order) => {
      if (filter !== 'ALL' && order.status !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        order.ticketCode.toUpperCase().includes(query) ||
        order.clientName.toUpperCase().includes(query) ||
        order.deviceModel.toUpperCase().includes(query) ||
        order.targetArea.name.toUpperCase().includes(query) ||
        (order.assignedTo?.fullName.toUpperCase().includes(query) ?? false) ||
        order.createdBy.fullName.toUpperCase().includes(query)
      );
    });
  });

  protected readonly selectedOrder = computed<InternalOrderView | null>(() => {
    const id = this.selectedOrderId();
    const list = this.ordersService.orders();
    if (id) {
      const found = list.find((o) => o.id === id);
      if (found) {
        return found;
      }
    }
    return this.filteredOrders()[0] ?? null;
  });

  protected readonly availableTransitions = computed<ReadonlyArray<TransitionOption>>(() => {
    const order = this.selectedOrder();
    const user = this.authService.currentUser();
    if (!order || !user || order.status === 'DELIVERED') {
      return [];
    }

    const options: TransitionOption[] = [];

    if (order.status === 'READY' || order.status === 'CANCELLED') {
      const canDeliver =
        user.isCompanyAdmin ||
        order.createdBy.id === user.id ||
        (user.areaId !== null && user.areaId === order.originArea?.id);

      if (canDeliver && this.authService.hasPermission('ORDER_STATUS_DELIVERED')) {
        options.push({
          status: 'DELIVERED',
          label: 'Marcar como Entregada al Cliente',
        });
      }
      return options;
    }

    const isAssignedTech = order.assignedTo?.id === user.id;
    const isTechSupervisor =
      this.authService.hasPermission('ORDER_VIEW_AREA') && user.areaId === order.targetArea.id;

    if (!user.isCompanyAdmin && !isAssignedTech && !isTechSupervisor) {
      return [];
    }

    if (
      order.status !== 'DIAGNOSING' &&
      order.status !== 'IN_REPAIR' &&
      this.authService.hasPermission('ORDER_STATUS_DIAGNOSING')
    ) {
      options.push({
        status: 'DIAGNOSING',
        label: 'Iniciar Diagnóstico',
      });
    }

    if (
      order.status !== 'IN_REPAIR' &&
      this.authService.hasPermission('ORDER_STATUS_IN_REPAIR')
    ) {
      options.push({
        status: 'IN_REPAIR',
        label: 'Pasar a En Reparación',
      });
    }

    if (this.authService.hasPermission('ORDER_STATUS_READY')) {
      options.push({
        status: 'READY',
        label: 'Finalizar como Lista para Entrega',
      });
    }

    if (this.authService.hasPermission('ORDER_STATUS_CANCELLED')) {
      options.push({
        status: 'CANCELLED',
        label: 'Cancelar Orden con Motivo',
      });
    }

    return options;
  });

  public ngOnInit(): void {
    this.areasService.loadAreas().subscribe({
      next: () => {
        const firstTechArea = this.technicalTargetAreas()[0];
        if (firstTechArea && !this.createOrderForm.controls.targetAreaId.value) {
          this.createOrderForm.controls.targetAreaId.setValue(firstTechArea.id);
        }
      },
    });

    this.reloadWorkspace();

    this.realtimeSync.registerAutoRefresh({
      destroyRef: this.destroyRef,
      intervalMs: 8000,
      onRefresh: () => this.refreshWorkspaceSilently(),
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const ticket = params.get('ticket')?.trim().toUpperCase();
      if (ticket) {
        this.searchQuery.set(ticket);
        const match = this.ordersService
          .orders()
          .find((item) => item.ticketCode.toUpperCase() === ticket);
        if (match) {
          this.selectOrder(match);
        }
      }
    });
  }

  protected reloadWorkspace(): void {
    this.errorMessage.set(null);
    this.notificationsService.loadFeed().subscribe();
    if (this.canCreateOrders()) {
      this.areasService.loadAreas({ silent: true }).subscribe();
    }
    this.ordersService.loadInternalOrders().subscribe({
      next: (orders) => {
        const currentSelected = this.selectedOrderId();
        if (!currentSelected && orders.length > 0) {
          this.selectOrder(orders[0]!);
        }
      },
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(
            err,
            'No fue posible cargar las órdenes operativas.',
          ),
        );
      },
    });
  }

  private refreshWorkspaceSilently(): void {
    if (this.isCreating() || this.isUpdatingStatus()) {
      return;
    }

    if (this.canCreateOrders()) {
      this.areasService.loadAreas({ silent: true }).subscribe({
        error: () => {
          // Ignore background errors
        },
      });
    }

    this.ordersService.loadInternalOrders(undefined, { silent: true }).subscribe({
      next: (orders) => {
        const currentSelectedId = this.selectedOrderId();
        if (!currentSelectedId && orders.length > 0) {
          this.selectOrder(orders[0]!);
          return;
        }
        const transitions = this.availableTransitions();
        const currentTransition = this.selectedTransition();
        if (
          !this.transitionForm.dirty &&
          (!currentTransition || !transitions.some((t) => t.status === currentTransition))
        ) {
          this.selectedTransition.set(transitions[0]?.status ?? null);
        }
      },
      error: () => {
        // Ignore transient background errors
      },
    });
  }

  protected toggleCreatePanel(): void {
    const nextState = !this.isCreatePanelOpen();
    this.isCreatePanelOpen.set(nextState);
    if (nextState) {
      const defaultTechArea = this.technicalTargetAreas()[0]?.id ?? '';
      this.createSubmitted.set(false);
      this.createOrderForm.reset({
        clientName: '',
        clientContact: '',
        deviceModel: '',
        issueDesc: '',
        targetAreaId: defaultTechArea,
        priority: 'NORMAL',
      });
    }
  }

  protected onPrioritySelect(priority: OrderPriority): void {
    this.createOrderForm.controls.priority.setValue(priority);
  }

  protected isCreateFieldInvalid(
    controlName: 'clientName' | 'clientContact' | 'deviceModel' | 'issueDesc' | 'targetAreaId',
  ): boolean {
    const control = this.createOrderForm.controls[controlName];
    return control.invalid && (control.touched || this.createSubmitted());
  }

  protected onSubmitCreateOrder(): void {
    if (this.isCreating()) {
      return;
    }

    this.createSubmitted.set(true);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    if (this.createOrderForm.invalid) {
      this.createOrderForm.markAllAsTouched();
      return;
    }

    const payload = this.createOrderForm.getRawValue();
    this.isCreating.set(true);

    this.ordersService
      .createOrder(payload)
      .pipe(finalize(() => this.isCreating.set(false)))
      .subscribe({
        next: ({ order, message }) => {
          this.feedbackMessage.set(message);
          this.isCreatePanelOpen.set(false);
          this.selectOrder(order);
          this.realtimeSync.triggerCrossViewSync();
        },
        error: (err: unknown) => {
          this.errorMessage.set(
            this.authService.extractErrorMessage(err, 'No fue posible registrar la orden.'),
          );
        },
      });
  }

  protected setStatusFilter(filter: WorkspaceStatusFilter): void {
    this.activeStatusFilter.set(filter);
  }

  protected onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement | null)?.value ?? '';
    this.searchQuery.set(val);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected selectOrder(order: InternalOrderView): void {
    this.selectedOrderId.set(order.id);
    this.statusSubmitted.set(false);
    this.transitionForm.reset({
      resolutionNotes: order.resolutionNotes ?? '',
      cancellationReason: order.cancellationReason ?? '',
      comment: '',
    });

    const transitions = this.availableTransitions();
    this.selectedTransition.set(transitions[0]?.status ?? null);
  }

  protected onSelectTransitionStatus(status: OrderTransitionStatus): void {
    this.selectedTransition.set(status);
    this.statusSubmitted.set(false);
  }

  protected isTransitionNotesInvalid(): boolean {
    if (!this.statusSubmitted()) {
      return false;
    }
    const target = this.selectedTransition();
    const raw = this.transitionForm.getRawValue();

    if (target === 'READY') {
      return (
        raw.resolutionNotes.trim().length < 5 ||
        this.transitionForm.controls.resolutionNotes.invalid
      );
    }
    if (target === 'CANCELLED') {
      return (
        raw.cancellationReason.trim().length < 5 ||
        this.transitionForm.controls.cancellationReason.invalid
      );
    }
    return false;
  }

  protected onSubmitStatusTransition(): void {
    const order = this.selectedOrder();
    const targetStatus = this.selectedTransition();
    if (!order || !targetStatus || this.isUpdatingStatus()) {
      return;
    }

    this.statusSubmitted.set(true);
    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    if (this.isTransitionNotesInvalid() || this.transitionForm.invalid) {
      return;
    }

    const raw = this.transitionForm.getRawValue();
    this.isUpdatingStatus.set(true);

    this.ordersService
      .updateOrderStatus(order.ticketCode, {
        status: targetStatus,
        ...(targetStatus === 'READY' ? { resolutionNotes: raw.resolutionNotes.trim() } : {}),
        ...(targetStatus === 'CANCELLED'
          ? { cancellationReason: raw.cancellationReason.trim() }
          : {}),
        ...(raw.comment.trim().length >= 2 ? { comment: raw.comment.trim() } : {}),
      })
      .pipe(finalize(() => this.isUpdatingStatus.set(false)))
      .subscribe({
        next: ({ order: updated, message }) => {
          this.feedbackMessage.set(message);
          this.selectOrder(updated);
          this.ordersService.loadInternalOrders(undefined, { silent: true }).subscribe();
          this.realtimeSync.triggerCrossViewSync();
        },
        error: (err: unknown) => {
          this.errorMessage.set(
            this.authService.extractErrorMessage(
              err,
              'No fue posible actualizar el estado de la orden.',
            ),
          );
        },
      });
  }

  protected canDeleteOrder(order: InternalOrderView): boolean {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('ORDER_DELETE')) {
      return false;
    }
    if (!user.isCompanyAdmin && order.status === 'DELIVERED') {
      return false;
    }
    if (
      user.isCompanyAdmin ||
      this.authService.hasPermission('ORDER_VIEW_ALL_COMPANY') ||
      (this.authService.hasPermission('ORDER_VIEW_AREA') &&
        (user.areaId === order.originArea?.id || user.areaId === order.targetArea.id))
    ) {
      return true;
    }
    return (
      order.createdBy.id === user.id ||
      (user.areaId !== null &&
        user.areaId === order.originArea?.id &&
        order.createdBy.isDeleted)
    );
  }

  protected promptDeleteOrder(order: InternalOrderView): void {
    this.pendingDeleteOrder.set(order);
    const dialogEl = this.deleteDialogRef()?.nativeElement;
    if (dialogEl && !dialogEl.open) {
      dialogEl.returnValue = '';
      dialogEl.showModal();
    }
  }

  protected onDeleteDialogClose(event: Event): void {
    const dialogEl = event.target as HTMLDialogElement;
    const action = dialogEl.returnValue;
    dialogEl.returnValue = '';

    const targetOrder = this.pendingDeleteOrder();
    this.pendingDeleteOrder.set(null);

    if (action !== 'confirm-delete' || !targetOrder) {
      return;
    }

    this.errorMessage.set(null);
    this.feedbackMessage.set(null);

    this.ordersService.deleteOrder(targetOrder.ticketCode).subscribe({
      next: ({ deletedTicketCode }) => {
        this.feedbackMessage.set(
          `Orden #${deletedTicketCode} anulada y turno técnico liberado.`,
        );
        this.selectedOrderId.set(null);
        this.ordersService.loadInternalOrders(undefined, { silent: true }).subscribe();
        this.realtimeSync.triggerCrossViewSync();
      },
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(err, 'No fue posible anular la orden seleccionada.'),
        );
      },
    });
  }

  protected getStatusLabel(status: OrderStatus): string {
    return ORDER_STATUS_LABELS[status];
  }

  protected getPriorityLabel(priority: OrderPriority): string {
    return ORDER_PRIORITY_LABELS[priority];
  }
}
