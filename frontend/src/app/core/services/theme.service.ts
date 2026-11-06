import { DOCUMENT } from '@angular/common';
import { computed, effect, Injectable, inject, signal } from '@angular/core';

export type ThemePreference = 'light dark' | 'light' | 'dark';

const STORAGE_KEY = 'color-scheme';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly preferenceSignal = signal<ThemePreference>(this.readInitialPreference());

  public readonly preference = this.preferenceSignal.asReadonly();

  public readonly isDarkActive = computed<boolean>(() => {
    const pref = this.preferenceSignal();
    if (pref === 'dark') {
      return true;
    }
    if (pref === 'light') {
      return false;
    }
    const defaultView = this.document.defaultView;
    if (!defaultView || typeof defaultView.matchMedia !== 'function') {
      return false;
    }
    return defaultView.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  public readonly themeLabel = computed<string>(() => {
    const pref = this.preferenceSignal();
    if (pref === 'dark') {
      return 'Oscuro';
    }
    if (pref === 'light') {
      return 'Claro';
    }
    return 'Sistema';
  });

  constructor() {
    effect(() => {
      const currentPreference = this.preferenceSignal();
      const meta = this.document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.setAttribute('content', currentPreference);
      }
      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, currentPreference);
      } catch {
        // Ignore storage errors in restricted browsing contexts
      }
    });
  }

  public cycleTheme(): void {
    const current = this.preferenceSignal();
    if (current === 'light dark') {
      this.preferenceSignal.set('dark');
    } else if (current === 'dark') {
      this.preferenceSignal.set('light');
    } else {
      this.preferenceSignal.set('light dark');
    }
  }

  public setTheme(preference: ThemePreference): void {
    this.preferenceSignal.set(preference);
  }

  private readInitialPreference(): ThemePreference {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'light dark') {
        return stored;
      }
    } catch {
      // Fallback to system preference
    }
    return 'light dark';
  }
}
