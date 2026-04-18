import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'pcm_theme_dark';
  readonly isDarkMode = signal(false);

  constructor() {
    this.initialize();
  }

  toggle() {
    this.setDarkMode(!this.isDarkMode());
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode.set(enabled);
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dark-mode', enabled);
    }
    try {
      localStorage.setItem(this.storageKey, enabled ? '1' : '0');
    } catch {
      // Ignore storage errors.
    }
  }

  private initialize() {
    let enabled = false;
    try {
      enabled = localStorage.getItem(this.storageKey) === '1';
    } catch {
      enabled = false;
    }
    this.setDarkMode(enabled);
  }
}
