import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { FineService } from '../../services/fines';
import {
  EvidenceEditorEntry,
  EvidenceFieldErrors,
  buildNewEvidenceUploadPayload,
  createEmptyEvidenceEntry,
  formatFileSize,
  MAX_EVIDENCE_FILE_SIZE_MB,
  validateEvidenceEntries,
} from '../../utils/evidence-editor';

type FineErrors = {
  person_name?: string;
  person_age?: string;
  mobile_number?: string;
  aadhar_number?: string;
  email?: string;
  amount?: string;
  reason?: string;
};

@Component({
  selector: 'app-issue-fine',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './issue-fine.html',
  styleUrl: './issue-fine.css',
})
export class IssueFine {
  private readonly fb = inject(FormBuilder);
  private readonly fineService = inject(FineService);
  private readonly feedback = inject(AppFeedbackService);

  submitting = false;
  errors: FineErrors = {};
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;

  form = this.fb.nonNullable.group({
    person_name: '',
    person_age: '',
    mobile_number: '',
    aadhar_number: '',
    email: '',
    amount: '',
    reason: '',
  });

  private normalizeText(value: unknown) {
    return String(value || '').trim();
  }

  private extractDigits(value: unknown, maxLen: number) {
    return String(value || '')
      .replace(/\D/g, '')
      .slice(0, maxLen);
  }

  private groupDigits(value: string, size: number) {
    return value.replace(new RegExp(`(\\d{${size}})(?=\\d)`, 'g'), '$1 ');
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  trackByEvidenceIndex(index: number) {
    return index;
  }

  addEvidence() {
    this.evidenceEntries.push(createEmptyEvidenceEntry());
    this.evidenceErrors.push({});
  }

  removeEvidence(index: number, input?: HTMLInputElement | null) {
    if (this.evidenceEntries.length <= 1) {
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
      if (input) {
        input.value = '';
      }
      return;
    }
    this.evidenceEntries.splice(index, 1);
    this.evidenceErrors.splice(index, 1);
  }

  onEvidenceNameChange(index: number, value: string) {
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_name = value;
  }

  onEvidenceFileChange(index: number, event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_file = file;
  }

  clearEvidenceFile(index: number, input?: HTMLInputElement | null) {
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_file = null;
    if (input) {
      input.value = '';
    }
  }

  getEvidenceError(index: number, field: keyof EvidenceFieldErrors): string {
    return this.evidenceErrors[index]?.[field] || '';
  }

  evidenceFileLabel(entry: EvidenceEditorEntry): string {
    const file = entry.evidence_file;
    if (!file) return '';
    return `${file.name} (${formatFileSize(file.size)})`;
  }

  onMobileInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const digits = this.extractDigits(input.value, 10);
    const formatted = this.groupDigits(digits, 5);
    input.value = formatted;
    this.form.controls.mobile_number.setValue(formatted, { emitEvent: false });
  }

  onAadharInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const digits = this.extractDigits(input.value, 12);
    const formatted = this.groupDigits(digits, 4);
    input.value = formatted;
    this.form.controls.aadhar_number.setValue(formatted, { emitEvent: false });
  }

  validate() {
    const data = this.form.getRawValue();
    const errs: FineErrors = {};

    const name = this.normalizeText(data.person_name);
    if (!name || name.length < 3) {
      errs.person_name = 'Name must be at least 3 characters.';
    }

    const age = Number(data.person_age);
    if (!Number.isFinite(age) || age < 18 || age > 110) {
      errs.person_age = 'Age must be between 18 and 110.';
    }

    const mobile = this.extractDigits(data.mobile_number, 10);
    if (!/^\d{10}$/.test(mobile)) {
      errs.mobile_number = 'Mobile number must be exactly 10 digits.';
    }

    const aadhar = this.extractDigits(data.aadhar_number, 12);
    if (!/^\d{12}$/.test(aadhar)) {
      errs.aadhar_number = 'Aadhar card number must be exactly 12 digits.';
    }

    const email = this.normalizeText(data.email).toLowerCase();
    if (!email || !this.isValidEmail(email)) {
      errs.email = 'Valid email is required.';
    }

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 25000) {
      errs.amount = 'Amount must be between 100 and 25000.';
    }

    const reason = this.normalizeText(data.reason);
    if (!reason || reason.length < 5) {
      errs.reason = 'Reason must be at least 5 characters.';
    }

    const evidenceValidation = validateEvidenceEntries(this.evidenceEntries);
    this.evidenceErrors = evidenceValidation.errors;

    this.errors = errs;
    return Object.keys(errs).length === 0 && !evidenceValidation.hasErrors;
  }

  async onSubmit() {
    if (this.submitting) return;
    if (!this.validate()) {
      this.feedback.showError('Please fix the errors before submitting.');
      return;
    }

    this.submitting = true;
    const data = this.form.getRawValue();
    try {
      const payload = new FormData();
      payload.append('person_name', this.normalizeText(data.person_name));
      payload.append('person_age', String(Number(data.person_age)));
      payload.append('mobile_number', this.extractDigits(data.mobile_number, 10));
      payload.append('aadhar_number', this.extractDigits(data.aadhar_number, 12));
      payload.append('email', this.normalizeText(data.email).toLowerCase());
      payload.append('amount', String(Number(data.amount)));
      payload.append('reason', this.normalizeText(data.reason));

      for (const evidence of buildNewEvidenceUploadPayload(this.evidenceEntries)) {
        payload.append('evidence_names', evidence.evidence_name);
        payload.append('evidence_files', evidence.evidence_file);
      }

      await firstValueFrom(this.fineService.issueFine(payload));

      this.feedback.showMessage('Fine issued successfully.', 'success');
      this.form.reset({
        person_name: '',
        person_age: '',
        mobile_number: '',
        aadhar_number: '',
        email: '',
        amount: '',
        reason: '',
      });
      this.errors = {};
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to issue fine.');
    } finally {
      this.submitting = false;
    }
  }
}
