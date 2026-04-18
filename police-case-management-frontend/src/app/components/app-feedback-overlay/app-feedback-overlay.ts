import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import {
  AppConfirmTone,
  AppFeedbackService,
  AppFeedbackTone,
} from '../../services/app-feedback.service';

@Component({
  selector: 'app-feedback-overlay',
  imports: [CommonModule],
  templateUrl: './app-feedback-overlay.html',
  styleUrl: './app-feedback-overlay.css',
})
export class AppFeedbackOverlay {
  protected readonly feedback = inject(AppFeedbackService);
  private lastConfirmId = 0;
  promptValue = '';
  promptError = '';

  constructor() {
    effect(() => {
      const current = this.feedback.confirmDialog();
      if (!current) {
        this.promptValue = '';
        this.promptError = '';
        this.lastConfirmId = 0;
        return;
      }
      if (current.id !== this.lastConfirmId) {
        this.lastConfirmId = current.id;
        this.promptValue = current.inputValue || '';
        this.promptError = '';
      }
    });
  }

  get messageTopOffset(): string {
    if (typeof document === 'undefined') return '12px';
    if (document.body?.classList.contains('header-hidden')) return '12px';
    const header = document.querySelector('header.site-header') as HTMLElement | null;
    if (!header) return '12px';
    return `${Math.max(12, Math.round(header.getBoundingClientRect().bottom + 12))}px`;
  }

  closeMessage() {
    this.feedback.clearMessage();
  }

  respondToConfirm(result: boolean) {
    const current = this.feedback.confirmDialog();
    if (!current) return;
    if (current.mode === 'prompt' && result) {
      const value = this.promptValue.trim();
      if (current.inputRequired && !value) {
        this.promptError = current.inputRequiredMessage || 'This field is required.';
        return;
      }
      this.feedback.respondToConfirm(true, value);
      return;
    }
    this.feedback.respondToConfirm(result);
  }

  onPromptInput(value: string) {
    this.promptValue = value;
    this.promptError = '';
  }

  onConfirmBackdropClick() {
    const current = this.feedback.confirmDialog();
    if (current?.closeOnBackdrop) {
      this.feedback.respondToConfirm(false);
    }
  }

  alertClassFor(tone: AppFeedbackTone): string {
    if (tone === 'success') return 'alert-success';
    if (tone === 'danger') return 'alert-danger';
    if (tone === 'warning') return 'alert-warning';
    return 'alert-info';
  }

  buttonClassFor(tone: AppConfirmTone): string {
    if (tone === 'approve') return 'pending-action-btn pending-approve-btn neu-button';
    if (tone === 'reject') return 'pending-action-btn pending-reject-btn neu-button';
    return 'pending-action-btn pending-check-btn neu-button';
  }

  labelChars(text: string): string[] {
    return Array.from(String(text || ''));
  }
}
