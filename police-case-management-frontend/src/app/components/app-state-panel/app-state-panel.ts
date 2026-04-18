import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

type AppStateMode = 'loading' | 'error' | 'empty' | 'idle';

@Component({
  selector: 'app-state-panel',
  imports: [CommonModule],
  templateUrl: './app-state-panel.html',
  styleUrl: './app-state-panel.css',
})
export class AppStatePanel {
  @Input() loading = false;
  @Input() error = '';
  @Input() empty = false;

  @Input() loadingTitle = 'Loading...';
  @Input() loadingMessage = 'Fetching data. Please wait.';
  @Input() emptyTitle = 'Nothing to show yet';
  @Input() emptyMessage = 'No records are available right now.';
  @Input() errorTitle = 'Something went wrong';
  @Input() errorMessage = 'We could not load this data. Please try again.';
  @Input() retryLabel = 'Retry';
  @Input() showRetry = true;

  @Output() retry = new EventEmitter<void>();

  get mode(): AppStateMode {
    if (this.loading) return 'loading';
    if (this.normalizeText(this.error)) return 'error';
    if (this.empty) return 'empty';
    return 'idle';
  }

  get visible(): boolean {
    return this.mode !== 'idle';
  }

  get title(): string {
    switch (this.mode) {
      case 'loading':
        return this.loadingTitle;
      case 'error':
        return this.errorTitle;
      case 'empty':
        return this.emptyTitle;
      default:
        return '';
    }
  }

  get message(): string {
    switch (this.mode) {
      case 'loading':
        return this.loadingMessage;
      case 'error':
        return this.normalizeText(this.error) || this.errorMessage;
      case 'empty':
        return this.emptyMessage;
      default:
        return '';
    }
  }

  get showRetryButton(): boolean {
    return this.mode === 'error' && this.showRetry;
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }
}
