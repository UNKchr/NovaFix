import { DOCUMENT } from '@angular/common';
import {
  type DestroyRef,
  effect,
  Injectable,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from './auth.service';
import { NotificationsService } from './notifications.service';

const NOTIFICATIONS_POLL_MS = 6000;
const FOCUS_COOLDOWN_MS = 2000;

@Injectable({
  providedIn: 'root',
})
export class RealtimeSyncService {
  private readonly doc = inject(DOCUMENT);
  private readonly authService = inject(AuthService);
  private readonly notificationsService = inject(NotificationsService);

  private readonly pulseSignal = signal<number>(0);
  public readonly syncPulse = this.pulseSignal.asReadonly();

  private lastSignature: string | null = null;
  private lastWakeTimestamp = 0;
  private initialized = false;

  public initializeGlobalSync(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const win = this.doc.defaultView;
    if (win) {
      const handleWakeUp = (): void => {
        if (!this.isEnvironmentActive()) {
          return;
        }
        const now = Date.now();
        if (now - this.lastWakeTimestamp < FOCUS_COOLDOWN_MS) {
          return;
        }
        this.lastWakeTimestamp = now;
        this.syncNotificationsSilently();
        this.emitPulse();
      };

      this.doc.addEventListener('visibilitychange', () => {
        if (this.doc.visibilityState === 'visible') {
          handleWakeUp();
        }
      });

      win.addEventListener('focus', handleWakeUp);
      win.addEventListener('online', handleWakeUp);

      win.setInterval(() => {
        if (this.authService.isAuthenticated() && this.isEnvironmentActive()) {
          this.syncNotificationsSilently();
        }
      }, NOTIFICATIONS_POLL_MS);
    }

    effect(() => {
      const sig = this.notificationsService.latestEventSignature();
      const isAuth = this.authService.isAuthenticated();

      if (!isAuth) {
        this.lastSignature = null;
        return;
      }

      if (this.lastSignature === null) {
        this.lastSignature = sig;
        return;
      }

      if (sig !== this.lastSignature) {
        this.lastSignature = sig;
        untracked(() => this.emitPulse());
      }
    });
  }

  public triggerCrossViewSync(): void {
    if (this.authService.isAuthenticated()) {
      this.syncNotificationsSilently();
    }
    this.emitPulse();
  }

  public registerAutoRefresh(params: {
    readonly destroyRef: DestroyRef;
    readonly intervalMs: number;
    readonly onRefresh: () => void;
  }): void {
    const win = this.doc.defaultView;
    let intervalId: number | null = null;

    if (win) {
      intervalId = win.setInterval(() => {
        if (this.isEnvironmentActive()) {
          params.onRefresh();
        }
      }, params.intervalMs);
    }

    let previousPulse = untracked(() => this.pulseSignal());
    const pulseEffectRef = effect(() => {
      const currentPulse = this.pulseSignal();
      if (currentPulse !== previousPulse) {
        previousPulse = currentPulse;
        if (this.isEnvironmentActive()) {
          untracked(() => params.onRefresh());
        }
      }
    });

    params.destroyRef.onDestroy(() => {
      if (win && intervalId !== null) {
        win.clearInterval(intervalId);
      }
      pulseEffectRef.destroy();
    });
  }

  public isEnvironmentActive(): boolean {
    if (this.doc.visibilityState === 'hidden') {
      return false;
    }
    const win = this.doc.defaultView;
    if (win && win.navigator && win.navigator.onLine === false) {
      return false;
    }
    return true;
  }

  private syncNotificationsSilently(): void {
    this.notificationsService.loadFeed({ silent: true }).subscribe({
      error: () => {
        // Ignore transient background network errors
      },
    });
  }

  private emitPulse(): void {
    this.pulseSignal.update((current) => current + 1);
  }
}
