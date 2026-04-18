import { Injectable, NgZone } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { auditTime, filter, fromEvent } from 'rxjs';

type ScrollPoint = [number, number];

@Injectable({ providedIn: 'root' })
export class ScrollMemoryService {
  private readonly storageKey = 'pcm_scroll_positions';
  private readonly restoreDelaysMs = [0, 80, 220];
  private scrollPositions: Record<string, ScrollPoint> = {};
  private currentUrl = '';

  constructor(
    private router: Router,
    private zone: NgZone
  ) {
    if (typeof window === 'undefined') return;

    this.scrollPositions = this.loadPositions();
    this.currentUrl = this.normalizeUrl(this.router.url || '/');
    this.restorePosition(this.currentUrl);
    this.bindRouterEvents();
    this.bindWindowEvents();
  }

  private bindRouterEvents() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.saveCurrentPosition();
          return;
        }

        if (event instanceof NavigationEnd) {
          this.currentUrl = this.normalizeUrl(event.urlAfterRedirects || '/');
          this.restorePosition(this.currentUrl);
        }
      });
  }

  private bindWindowEvents() {
    this.zone.runOutsideAngular(() => {
      fromEvent(window, 'scroll')
        .pipe(auditTime(120))
        .subscribe(() => {
          this.saveCurrentPosition();
        });

      fromEvent(window, 'beforeunload').subscribe(() => {
        this.saveCurrentPosition();
      });
    });
  }

  private restorePosition(url: string) {
    const point = this.scrollPositions[url];
    const left = point ? point[0] : 0;
    const top = point ? point[1] : 0;

    // Retry a few times so async page content can still restore accurately.
    for (const delay of this.restoreDelaysMs) {
      window.setTimeout(() => {
        window.scrollTo({ left, top, behavior: 'auto' });
      }, delay);
    }
  }

  private saveCurrentPosition() {
    if (!this.currentUrl) return;
    this.scrollPositions[this.currentUrl] = [window.scrollX || 0, window.scrollY || 0];
    this.persistPositions();
  }

  private persistPositions() {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.scrollPositions));
    } catch {
      // Ignore storage errors.
    }
  }

  private loadPositions(): Record<string, ScrollPoint> {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, ScrollPoint>;
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  }

  private normalizeUrl(url: string): string {
    const normalized = String(url || '').trim();
    return normalized || '/';
  }
}

