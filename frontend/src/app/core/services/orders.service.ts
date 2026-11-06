import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { finalize, map, type Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiSuccessResponse } from '../models/api-response.model';
import type {
  CreateOrderPayload,
  InternalOrderView,
  ListOrdersQuery,
  PublicOrderTrackingView,
  PublicTrackingLookupResult,
  UpdateOrderStatusPayload,
} from '../models/order.model';

export interface OrderMutationResult {
  readonly order: InternalOrderView;
  readonly message: string;
}

@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  private readonly http = inject(HttpClient);

  private readonly ordersSignal = signal<ReadonlyArray<InternalOrderView>>([]);
  private readonly loadingSignal = signal<boolean>(false);

  public readonly orders = this.ordersSignal.asReadonly();
  public readonly isLoading = this.loadingSignal.asReadonly();

  public readonly assigningCount = computed<number>(
    () => this.ordersSignal().filter((o) => o.status === 'ASSIGNING').length,
  );

  public readonly activeLabCount = computed<number>(
    () =>
      this.ordersSignal().filter(
        (o) => o.status === 'CREATED' || o.status === 'DIAGNOSING' || o.status === 'IN_REPAIR',
      ).length,
  );

  public readonly readyForDeliveryCount = computed<number>(
    () => this.ordersSignal().filter((o) => o.status === 'READY').length,
  );

  public readonly deliveredCount = computed<number>(
    () => this.ordersSignal().filter((o) => o.status === 'DELIVERED').length,
  );

  public loadInternalOrders(
    query?: ListOrdersQuery,
    options?: { readonly silent?: boolean },
  ): Observable<ReadonlyArray<InternalOrderView>> {
    const isSilent = options?.silent === true;
    if (!isSilent) {
      this.loadingSignal.set(true);
    }
    let params = new HttpParams();
    if (query?.status) {
      params = params.set('status', query.status);
    }
    const trimmedSearch = query?.search?.trim();
    if (trimmedSearch) {
      params = params.set('search', trimmedSearch);
    }

    return this.http
      .get<ApiSuccessResponse<ReadonlyArray<InternalOrderView>>>(`${environment.apiUrl}/orders`, {
        params,
      })
      .pipe(
        map((res) => res.data),
        tap((orders) => this.ordersSignal.set(orders)),
        finalize(() => {
          if (!isSilent) {
            this.loadingSignal.set(false);
          }
        }),
      );
  }

  public getPublicOrderByTicket(ticketCode: string): Observable<PublicOrderTrackingView> {
    const normalizedTicket = ticketCode.trim().toUpperCase();
    return this.http
      .get<ApiSuccessResponse<PublicOrderTrackingView>>(
        `${environment.apiUrl}/orders/public/${encodeURIComponent(normalizedTicket)}`,
      )
      .pipe(map((res) => res.data));
  }

  public lookupPublicOrder(ticketCode: string): Observable<PublicTrackingLookupResult> {
    const normalizedTicket = ticketCode.trim().toUpperCase();
    const startTime = performance.now();

    return this.http
      .get<ApiSuccessResponse<PublicOrderTrackingView>>(
        `${environment.apiUrl}/orders/public/${encodeURIComponent(normalizedTicket)}`,
      )
      .pipe(
        map((res) => {
          const elapsed = Math.max(1, Math.round(performance.now() - startTime));
          const rawCache = res.meta?.['cache'];
          const cacheStatus: 'HIT' | 'MISS' = rawCache === 'HIT' ? 'HIT' : 'MISS';

          return {
            order: res.data,
            cacheStatus,
            responseTimeMs: elapsed,
            fetchedAt: res.timestamp ?? new Date().toISOString(),
          };
        }),
      );
  }

  public createOrder(payload: CreateOrderPayload): Observable<OrderMutationResult> {
    const cleanPayload: CreateOrderPayload = {
      clientName: payload.clientName.trim(),
      clientContact: payload.clientContact.trim(),
      deviceModel: payload.deviceModel.trim(),
      issueDesc: payload.issueDesc.trim(),
      targetAreaId: payload.targetAreaId.trim(),
      priority: payload.priority,
    };

    return this.http
      .post<ApiSuccessResponse<InternalOrderView>>(`${environment.apiUrl}/orders`, cleanPayload)
      .pipe(
        map((res) => ({
          order: res.data,
          message: res.message,
        })),
        tap(({ order }) => {
          this.ordersSignal.update((current) => [order, ...current]);
        }),
      );
  }

  public updateOrderStatus(
    ticketCode: string,
    payload: UpdateOrderStatusPayload,
  ): Observable<OrderMutationResult> {
    const normalizedTicket = ticketCode.trim().toUpperCase();
    const trimmedNotes = payload.resolutionNotes?.trim();
    const trimmedReason = payload.cancellationReason?.trim();
    const trimmedComment = payload.comment?.trim();

    const cleanPayload: UpdateOrderStatusPayload = {
      status: payload.status,
      ...(trimmedNotes ? { resolutionNotes: trimmedNotes } : {}),
      ...(trimmedReason ? { cancellationReason: trimmedReason } : {}),
      ...(trimmedComment ? { comment: trimmedComment } : {}),
    };

    return this.http
      .patch<ApiSuccessResponse<InternalOrderView>>(
        `${environment.apiUrl}/orders/${encodeURIComponent(normalizedTicket)}/status`,
        cleanPayload,
      )
      .pipe(
        map((res) => ({
          order: res.data,
          message: res.message,
        })),
        tap(({ order }) => {
          this.ordersSignal.update((current) =>
            current.map((item) => (item.id === order.id ? order : item)),
          );
        }),
      );
  }

  public deleteOrder(ticketCode: string): Observable<{ readonly deletedTicketCode: string }> {
    const normalizedTicket = ticketCode.trim().toUpperCase();
    return this.http
      .delete<ApiSuccessResponse<{ readonly deletedTicketCode: string }>>(
        `${environment.apiUrl}/orders/${encodeURIComponent(normalizedTicket)}`,
      )
      .pipe(
        map((res) => res.data),
        tap(({ deletedTicketCode }) => {
          this.ordersSignal.update((current) =>
            current.filter((item) => item.ticketCode !== deletedTicketCode),
          );
        }),
      );
  }
}
