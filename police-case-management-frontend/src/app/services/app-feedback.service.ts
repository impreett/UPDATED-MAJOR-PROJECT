import { Injectable, signal } from '@angular/core';

export type AppFeedbackTone = 'success' | 'danger' | 'info' | 'warning';
export type AppConfirmTone = 'approve' | 'reject' | 'check';

export type AppConfirmOptions = {
  title?: string;
  message: string;
  subject?: string;
  messageSuffix?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: AppConfirmTone;
  cancelTone?: AppConfirmTone;
  closeOnBackdrop?: boolean;
};

export type AppPromptOptions = AppConfirmOptions & {
  inputLabel?: string;
  inputPlaceholder?: string;
  inputHint?: string;
  inputValue?: string;
  inputRequired?: boolean;
  inputRequiredMessage?: string;
  inputMaxLength?: number;
};

type AppMessageState = {
  title: string;
  text: string;
  tone: AppFeedbackTone;
  autoCloseMs: number;
};

type AppConfirmState = {
  id: number;
  mode: 'confirm' | 'prompt';
  title: string;
  message: string;
  subject: string;
  messageSuffix: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmTone: AppConfirmTone;
  cancelTone: AppConfirmTone;
  closeOnBackdrop: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputHint?: string;
  inputValue?: string;
  inputRequired?: boolean;
  inputRequiredMessage?: string;
  inputMaxLength?: number;
  resolve: (result: boolean | string | null) => void;
};

@Injectable({ providedIn: 'root' })
export class AppFeedbackService {
  readonly message = signal<AppMessageState | null>(null);
  readonly confirmDialog = signal<AppConfirmState | null>(null);

  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly defaultMessageDurationMs = 7000;
  private confirmCounter = 0;

  showMessage(
    text: string,
    tone: AppFeedbackTone = 'info',
    options?: { title?: string; autoCloseMs?: number }
  ) {
    const safeText = String(text || '').trim();
    if (!safeText) return;

    this.clearMessage();

    const nextMessage: AppMessageState = {
      title: String(options?.title || '').trim(),
      text: safeText,
      tone,
      autoCloseMs: Number.isFinite(options?.autoCloseMs)
        ? Math.max(0, Number(options?.autoCloseMs))
        : this.defaultMessageDurationMs,
    };

    this.message.set(nextMessage);

    if (nextMessage.autoCloseMs > 0) {
      this.messageTimer = setTimeout(() => {
        this.message.set(null);
        this.messageTimer = null;
      }, nextMessage.autoCloseMs);
    }
  }

  showError(text: string, options?: { title?: string; autoCloseMs?: number }) {
    this.showMessage(text, 'danger', options);
  }

  clearMessage() {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    this.message.set(null);
  }

  confirm(options: AppConfirmOptions): Promise<boolean> {
    const existing = this.confirmDialog();
    if (existing) {
      existing.resolve(existing.mode === 'prompt' ? null : false);
      this.confirmDialog.set(null);
    }

    const message = String(options?.message || '').trim() || 'Are you sure?';
    const subject = String(options?.subject || '').trim();
    const messageSuffix = String(options?.messageSuffix || '').trim();
    const title = String(options?.title || '').trim() || 'Please confirm';
    const confirmLabel = String(options?.confirmLabel || '').trim() || 'Yes';
    const cancelLabel = String(options?.cancelLabel || '').trim() || 'No';
    const confirmTone = options?.confirmTone || 'approve';
    const cancelTone = options?.cancelTone || 'check';
    const closeOnBackdrop = options?.closeOnBackdrop !== false;

    return new Promise<boolean>((resolve) => {
      const handleResolve = (result: boolean | string | null) => {
        if (typeof result === 'string') {
          resolve(result.trim().length > 0);
          return;
        }
        resolve(Boolean(result));
      };
      this.confirmDialog.set({
        id: ++this.confirmCounter,
        mode: 'confirm',
        title,
        message,
        subject,
        messageSuffix,
        confirmLabel,
        cancelLabel,
        confirmTone,
        cancelTone,
        closeOnBackdrop,
        resolve: handleResolve,
      });
    });
  }

  prompt(options: AppPromptOptions): Promise<string | null> {
    const existing = this.confirmDialog();
    if (existing) {
      existing.resolve(existing.mode === 'prompt' ? null : false);
      this.confirmDialog.set(null);
    }

    const message = String(options?.message || '').trim() || 'Please provide a response.';
    const subject = String(options?.subject || '').trim();
    const messageSuffix = String(options?.messageSuffix || '').trim();
    const title = String(options?.title || '').trim() || 'Input required';
    const confirmLabel = String(options?.confirmLabel || '').trim() || 'Submit';
    const cancelLabel = String(options?.cancelLabel || '').trim() || 'Cancel';
    const confirmTone = options?.confirmTone || 'approve';
    const cancelTone = options?.cancelTone || 'check';
    const closeOnBackdrop = options?.closeOnBackdrop !== false;

    return new Promise<string | null>((resolve) => {
      const handleResolve = (result: boolean | string | null) => {
        if (typeof result === 'string') {
          resolve(result);
          return;
        }
        resolve(null);
      };
      this.confirmDialog.set({
        id: ++this.confirmCounter,
        mode: 'prompt',
        title,
        message,
        subject,
        messageSuffix,
        confirmLabel,
        cancelLabel,
        confirmTone,
        cancelTone,
        closeOnBackdrop,
        inputLabel: String(options?.inputLabel || '').trim(),
        inputPlaceholder: String(options?.inputPlaceholder || '').trim(),
        inputHint: String(options?.inputHint || '').trim(),
        inputValue: String(options?.inputValue || ''),
        inputRequired: options?.inputRequired !== false,
        inputRequiredMessage: String(options?.inputRequiredMessage || '').trim(),
        inputMaxLength: options?.inputMaxLength,
        resolve: handleResolve,
      });
    });
  }

  respondToConfirm(result: boolean, inputValue?: string) {
    const current = this.confirmDialog();
    if (!current) return;
    this.confirmDialog.set(null);
    if (current.mode === 'prompt') {
      current.resolve(result ? String(inputValue || '').trim() : null);
      return;
    }
    current.resolve(result);
  }
}
