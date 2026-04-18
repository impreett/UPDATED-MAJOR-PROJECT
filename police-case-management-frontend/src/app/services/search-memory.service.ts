import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SearchMemoryService {
  private readonly storageKey = 'pcm_search_states';
  private states: Record<string, unknown> = this.loadStates();

  save<T extends Record<string, unknown>>(key: string, state: T) {
    if (!this.canUseStorage()) return;
    const normalizedKey = this.normalizeKey(key);
    if (!normalizedKey) return;
    this.states[normalizedKey] = { ...state };
    this.persistStates();
  }

  load<T extends Record<string, unknown>>(key: string): T | null {
    if (!this.canUseStorage()) return null;
    const normalizedKey = this.normalizeKey(key);
    if (!normalizedKey) return null;
    const value = this.states[normalizedKey];
    if (!value || typeof value !== 'object') return null;
    return value as T;
  }

  private persistStates() {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.states));
    } catch {
      // Ignore storage errors.
    }
  }

  private loadStates(): Record<string, unknown> {
    if (!this.canUseStorage()) return {};
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  }

  private canUseStorage() {
    return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
  }

  private normalizeKey(key: string) {
    return String(key || '').trim();
  }
}
