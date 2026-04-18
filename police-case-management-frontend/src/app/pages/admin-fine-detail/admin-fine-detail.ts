import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AdminService } from '../../services/admin';
import {
  EvidenceEditorEntry,
  EvidenceFieldErrors,
  buildExistingEvidencePayload,
  buildNewEvidenceUploadPayload,
  createEmptyEvidenceEntry,
  formatFileSize,
  MAX_EVIDENCE_FILE_SIZE_MB,
  parseEvidenceEntries,
  validateEvidenceEntries,
} from '../../utils/evidence-editor';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';

type EvidenceDisplay = {
  name: string;
  url: string;
  fileType: string;
};

type FineEditErrors = {
  person_name?: string;
  person_age?: string;
  mobile_number?: string;
  aadhar_number?: string;
  email?: string;
  amount?: string;
  reason?: string;
};

@Component({
  selector: 'app-admin-fine-detail',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AppStatePanel],
  templateUrl: './admin-fine-detail.html',
  styleUrl: './admin-fine-detail.css',
})
export class AdminFineDetail implements OnInit {
  private readonly fb = inject(FormBuilder);
  fine: any | null = null;
  evidenceDisplay: EvidenceDisplay[] = [];
  loading = true;
  errorMessage = '';
  editing = false;
  saving = false;
  deleting = false;
  editErrors: FineEditErrors = {};
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;

  editForm = this.fb.nonNullable.group({
    person_name: '',
    person_age: '',
    mobile_number: '',
    aadhar_number: '',
    email: '',
    amount: '',
    reason: '',
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminService: AdminService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchFine();
  }

  get fineId(): string {
    return String(this.route.snapshot.paramMap.get('fineId') || '');
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  formatAadhar(value: unknown): string {
    const raw = this.normalizeText(value);
    if (!raw) return 'N/A';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  statusLabel(fine: any) {
    const status = this.normalizeText(fine?.status).toUpperCase();
    return status === 'PAID' ? 'Paid' : 'Unpaid';
  }

  isPaid(fine: any) {
    return this.normalizeText(fine?.status).toUpperCase() === 'PAID';
  }

  async fetchFine() {
    this.loading = true;
    this.errorMessage = '';
    const id = this.fineId;
    if (!id) {
      this.errorMessage = 'Fine not found.';
      this.loading = false;
      return;
    }

    try {
      const fine = await firstValueFrom(this.adminService.getFineById(id));
      this.setFine(fine);
      if (!this.fine) {
        this.errorMessage = 'Fine not found.';
      }
    } catch (err: any) {
      this.errorMessage = err?.error?.msg || 'Failed to load fine details.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
    }
  }

  startEdit() {
    if (!this.fine?._id) return;
    this.editing = true;
    this.editErrors = {};
    const parsedEvidence = parseEvidenceEntries(this.fine.evidence);
    this.evidenceEntries = parsedEvidence.length ? parsedEvidence : [createEmptyEvidenceEntry()];
    this.evidenceErrors = this.evidenceEntries.map(() => ({}));
    this.editForm.reset({
      person_name: this.normalizeText(this.fine.person_name),
      person_age: String(this.fine.person_age ?? ''),
      mobile_number: this.normalizeText(this.fine.mobile_number),
      aadhar_number: this.normalizeText(this.fine.aadhar_number),
      email: this.normalizeText(this.fine.email),
      amount: String(this.fine.amount ?? ''),
      reason: this.normalizeText(this.fine.reason),
    });
  }

  private setFine(fine: any) {
    this.fine = fine || null;
    this.evidenceDisplay = this.parseEvidence(this.fine?.evidence);
  }

  cancelEdit() {
    this.editing = false;
    this.editErrors = {};
    this.evidenceEntries = [createEmptyEvidenceEntry()];
    this.evidenceErrors = [];
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

  private parseEvidence(value: unknown): EvidenceDisplay[] {
    if (!Array.isArray(value)) return [];

    const evidence: EvidenceDisplay[] = [];
    for (let i = 0; i < value.length; i++) {
      const entry: any = value[i];
      if (!entry || typeof entry !== 'object') continue;

      const rawUrl = entry.evidence_file_url ?? entry.url ?? entry.file_url;
      const url = toAbsoluteAssetUrl(rawUrl);
      if (!url) continue;

      const name = this.normalizeText(entry.evidence_name) || `Evidence ${i + 1}`;
      const fileType = this.normalizeText(entry.evidence_file_type || entry.fileType || entry.mimetype).toLowerCase();
      evidence.push({ name, url, fileType });
    }

    return evidence;
  }

  isImageEvidence(evidence: EvidenceDisplay): boolean {
    return String(evidence?.fileType || '').toLowerCase().startsWith('image/');
  }

  isVideoEvidence(evidence: EvidenceDisplay): boolean {
    return String(evidence?.fileType || '').toLowerCase().startsWith('video/');
  }

  private validateEdit() {
    const data = this.editForm.getRawValue();
    const errs: FineEditErrors = {};

    const name = this.normalizeText(data.person_name);
    if (!name || name.length < 3) {
      errs.person_name = 'Name must be at least 3 characters.';
    }

    const age = Number(data.person_age);
    if (!Number.isFinite(age) || age < 18 || age > 110) {
      errs.person_age = 'Age must be between 18 and 110.';
    }

    const mobile = this.normalizeText(data.mobile_number);
    if (!/^\d{10}$/.test(mobile)) {
      errs.mobile_number = 'Mobile number must be exactly 10 digits.';
    }

    const aadhar = this.normalizeText(data.aadhar_number);
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

    this.editErrors = errs;
    return Object.keys(errs).length === 0 && !evidenceValidation.hasErrors;
  }

  async saveEdit() {
    if (!this.fine?._id || this.saving) return;
    if (!this.validateEdit()) {
      this.feedback.showError('Please fix the errors before saving.');
      return;
    }

    this.saving = true;
    try {
      const data = this.editForm.getRawValue();
      const payload = new FormData();
      payload.append('person_name', this.normalizeText(data.person_name));
      payload.append('person_age', String(Number(data.person_age)));
      payload.append('mobile_number', this.normalizeText(data.mobile_number));
      payload.append('aadhar_number', this.normalizeText(data.aadhar_number));
      payload.append('email', this.normalizeText(data.email).toLowerCase());
      payload.append('amount', String(Number(data.amount)));
      payload.append('reason', this.normalizeText(data.reason));

      const existingEvidence = buildExistingEvidencePayload(this.evidenceEntries);
      payload.append('existing_evidence', JSON.stringify(existingEvidence));

      for (const evidence of buildNewEvidenceUploadPayload(this.evidenceEntries)) {
        payload.append('evidence_names', evidence.evidence_name);
        payload.append('evidence_files', evidence.evidence_file);
      }

      const response = await firstValueFrom(this.adminService.updateFine(this.fine._id, payload));
      this.feedback.showMessage('Fine updated successfully.', 'success');
      this.editing = false;
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
      const updatedFine =
        response?.fine || (await firstValueFrom(this.adminService.getFineById(this.fine._id)));
      this.setFine(updatedFine);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to update fine.');
    } finally {
      this.saving = false;
    }
  }

  async forgiveFine() {
    if (!this.fine?._id || this.deleting) return;
    const confirmed = await this.feedback.confirm({
      title: 'Forgive fine',
      message: `Forgive fine for ${this.fine.person_name || 'citizen'}?`,
      confirmLabel: 'Forgive',
      cancelLabel: 'Cancel',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.deleting = true;
    try {
      await firstValueFrom(this.adminService.forgiveFine(this.fine._id));
      this.feedback.showMessage('Fine forgiven successfully.', 'success');
      this.router.navigate(['/commissioner/manage-fine']);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to forgive fine.');
    } finally {
      this.deleting = false;
    }
  }
}
