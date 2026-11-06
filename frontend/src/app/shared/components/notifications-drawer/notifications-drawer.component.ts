import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { NotificationItemView } from '../../../core/models/notification.model';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-notifications-drawer',
  standalone: true,
  imports: [DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-drawer.component.html',
  styleUrl: './notifications-drawer.component.css',
})
export class NotificationsDrawerComponent {
  protected readonly notificationsService = inject(NotificationsService);
  private readonly authService = inject(AuthService);

  private readonly dialogRef =
    viewChild<ElementRef<HTMLDialogElement>>('notificationsDialog');

  public readonly selectTicket = output<string>();

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly statusMessage = signal<string | null>(null);

  public openDrawer(): void {
    this.errorMessage.set(null);
    this.statusMessage.set(null);
    this.reloadFeed();

    const dialogEl = this.dialogRef()?.nativeElement;
    if (dialogEl && !dialogEl.open) {
      dialogEl.returnValue = '';
      dialogEl.showModal();
    }
  }

  public closeDrawer(): void {
    const dialogEl = this.dialogRef()?.nativeElement;
    if (dialogEl?.open) {
      dialogEl.close();
    }
  }

  protected reloadFeed(): void {
    this.errorMessage.set(null);
    this.notificationsService.loadFeed().subscribe({
      error: (err: unknown) => {
        this.errorMessage.set(
          this.authService.extractErrorMessage(
            err,
            'No fue posible sincronizar las notificaciones.',
          ),
        );
      },
    });
  }

  protected handleMarkOneRead(item: NotificationItemView): void {
    if (item.isRead) {
      return;
    }
    this.notificationsService.markOneRead(item.id).subscribe();
  }

  protected handleMarkAllRead(): void {
    this.statusMessage.set(null);
    this.notificationsService.markAllRead().subscribe({
      next: () => {
        this.statusMessage.set('Todas las notificaciones visibles fueron marcadas como leídas.');
      },
    });
  }

  protected handleHideOne(item: NotificationItemView): void {
    this.notificationsService.hideOne(item.id).subscribe();
  }

  protected handleClearAll(): void {
    this.statusMessage.set(null);
    this.notificationsService.clearAll().subscribe({
      next: ({ clearedCount }) => {
        this.statusMessage.set(
          `Se ocultaron ${clearedCount} notificaciones de tu bandeja. Las nuevas notificaciones que lleguen a partir de ahora se mostrarán normalmente.`,
        );
      },
    });
  }

  protected handleInspectTicket(item: NotificationItemView): void {
    if (!item.isRead) {
      this.notificationsService.markOneRead(item.id).subscribe();
    }
    this.closeDrawer();
    this.selectTicket.emit(item.ticketCode);
  }
}
