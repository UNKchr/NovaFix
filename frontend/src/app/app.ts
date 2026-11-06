import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { NotificationsService } from './core/services/notifications.service';
import { RealtimeSyncService } from './core/services/realtime-sync.service';
import { ThemeService } from './core/services/theme.service';
import { IconComponent } from './shared/components/icon/icon.component';
import { NotificationsDrawerComponent } from './shared/components/notifications-drawer/notifications-drawer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    NotificationsDrawerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly authService = inject(AuthService);
  protected readonly notificationsService = inject(NotificationsService);
  private readonly realtimeSync = inject(RealtimeSyncService);
  private readonly router = inject(Router);

  private readonly notificationsDrawerRef =
    viewChild<NotificationsDrawerComponent>('notificationsDrawer');

  constructor() {
    this.realtimeSync.initializeGlobalSync();

    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.notificationsService.syncInitialUnreadCount(user.unreadNotificationsCount);
        this.notificationsService.loadFeed().subscribe({
          error: () => {
            // Silently ignore initial feed sync errors if offline
          },
        });
      } else {
        this.notificationsService.resetFeed();
      }
    });
  }

  protected openNotifications(): void {
    this.notificationsDrawerRef()?.openDrawer();
  }

  protected navigateToOrderTicket(ticketCode: string): void {
    void this.router.navigate(['/orders'], {
      queryParams: { ticket: ticketCode },
    });
  }

  protected handleLogout(): void {
    this.authService.logout();
  }
}
