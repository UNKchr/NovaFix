import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { finalize, map, type Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiSuccessResponse } from '../models/api-response.model';
import type {
  NotificationItemView,
  NotificationsFeedView,
} from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private readonly http = inject(HttpClient);

  private readonly itemsSignal = signal<ReadonlyArray<NotificationItemView>>([]);
  private readonly unreadCountSignal = signal<number>(0);
  private readonly loadingSignal = signal<boolean>(false);

  public readonly items = this.itemsSignal.asReadonly();
  public readonly unreadCount = this.unreadCountSignal.asReadonly();
  public readonly isLoading = this.loadingSignal.asReadonly();

  public readonly latestEventSignature = computed<string>(() => {
    const list = this.itemsSignal();
    const topId = list[0]?.id ?? 'none';
    return `${this.unreadCountSignal()}:${list.length}:${topId}`;
  });

  public syncInitialUnreadCount(count: number): void {
    this.unreadCountSignal.set(Math.max(0, count));
  }

  public resetFeed(): void {
    this.itemsSignal.set([]);
    this.unreadCountSignal.set(0);
  }

  public loadFeed(options?: { readonly silent?: boolean }): Observable<NotificationsFeedView> {
    const isSilent = options?.silent === true;
    if (!isSilent) {
      this.loadingSignal.set(true);
    }
    return this.http
      .get<ApiSuccessResponse<NotificationsFeedView>>(`${environment.apiUrl}/notifications`)
      .pipe(
        map((res) => res.data),
        tap((feed) => {
          this.itemsSignal.set(feed.items);
          this.unreadCountSignal.set(feed.unreadCount);
        }),
        finalize(() => {
          if (!isSilent) {
            this.loadingSignal.set(false);
          }
        }),
      );
  }

  public markOneRead(notificationId: string): Observable<{ readonly read: true }> {
    return this.http
      .patch<ApiSuccessResponse<{ readonly read: true }>>(
        `${environment.apiUrl}/notifications/${encodeURIComponent(notificationId)}/read`,
        {},
      )
      .pipe(
        map((res) => res.data),
        tap(() => {
          let decremented = false;
          this.itemsSignal.update((current) =>
            current.map((item) => {
              if (item.id === notificationId && !item.isRead) {
                decremented = true;
                return { ...item, isRead: true, readAt: new Date().toISOString() };
              }
              return item;
            }),
          );
          if (decremented) {
            this.unreadCountSignal.update((count) => Math.max(0, count - 1));
          }
        }),
      );
  }

  public markAllRead(): Observable<{ readonly markedCount: number }> {
    return this.http
      .patch<ApiSuccessResponse<{ readonly markedCount: number }>>(
        `${environment.apiUrl}/notifications/read-all`,
        {},
      )
      .pipe(
        map((res) => res.data),
        tap(() => {
          const nowIso = new Date().toISOString();
          this.itemsSignal.update((current) =>
            current.map((item) => (item.isRead ? item : { ...item, isRead: true, readAt: nowIso })),
          );
          this.unreadCountSignal.set(0);
        }),
      );
  }

  public hideOne(notificationId: string): Observable<{ readonly hidden: true }> {
    return this.http
      .delete<ApiSuccessResponse<{ readonly hidden: true }>>(
        `${environment.apiUrl}/notifications/${encodeURIComponent(notificationId)}`,
      )
      .pipe(
        map((res) => res.data),
        tap(() => {
          const target = this.itemsSignal().find((item) => item.id === notificationId);
          this.itemsSignal.update((current) =>
            current.filter((item) => item.id !== notificationId),
          );
          if (target && !target.isRead) {
            this.unreadCountSignal.update((count) => Math.max(0, count - 1));
          }
        }),
      );
  }

  public clearAll(): Observable<{ readonly clearedCount: number }> {
    return this.http
      .delete<ApiSuccessResponse<{ readonly clearedCount: number }>>(
        `${environment.apiUrl}/notifications/clear`,
      )
      .pipe(
        map((res) => res.data),
        tap(() => {
          this.itemsSignal.set([]);
          this.unreadCountSignal.set(0);
        }),
      );
  }
}
