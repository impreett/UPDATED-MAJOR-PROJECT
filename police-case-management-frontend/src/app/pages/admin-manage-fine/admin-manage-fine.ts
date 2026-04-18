import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AdminService } from '../../services/admin';
import { IssueFine } from '../issue-fine/issue-fine';
import { RouterLink } from '@angular/router';
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
  selector: 'app-admin-manage-fine',
  imports: [CommonModule, ReactiveFormsModule, IssueFine, RouterLink],
  templateUrl: './admin-manage-fine.html',
  styleUrl: './admin-manage-fine.css',
})
export class AdminManageFine implements OnInit, AfterViewInit {
  @ViewChild('fineFilterTabs') fineFilterTabs?: ElementRef<HTMLElement>;

  private readonly fb = inject(FormBuilder);
  activeTab: 'manage' | 'add' = 'manage';
  fines: any[] = [];
  loading = false;
  errorMessage = '';
  fineStatusFilter: 'all' | 'paid' | 'unpaid' = 'all';
  sortOrder: 'latest' | 'oldest' = 'latest';
  pageSize = 30;
  editingId = '';
  savingId = '';
  deletingId = '';
  editErrors: FineEditErrors = {};
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  editForm = this.fb.nonNullable.group({
    person_name: '',
    person_age: '',
    mobile_number: '',
    aadhar_number: '',
    email: '',
    amount: '',
    reason: '',
  });

  constructor(private adminService: AdminService, private feedback: AppFeedbackService) {}

  async ngOnInit() {
    if (this.activeTab === 'manage') {
      await this.fetchFines();
    }
  }

  ngAfterViewInit() {
    this.syncFineFilterTabMetrics();
    setTimeout(() => this.syncFineFilterTabMetrics());
    if (typeof document !== 'undefined' && 'fonts' in document) {
      (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
        .then(() => this.syncFineFilterTabMetrics())
        .catch(() => {});
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.syncFineFilterTabMetrics();
  }

  setTab(tab: 'manage' | 'add') {
    this.activeTab = tab;
    if (tab === 'manage' && !this.fines.length) {
      void this.fetchFines();
    }
    if (tab === 'manage') {
      setTimeout(() => this.syncFineFilterTabMetrics());
    }
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

  setFineStatusFilter(filter: 'all' | 'paid' | 'unpaid') {
    if (this.fineStatusFilter === filter) return;
    this.fineStatusFilter = filter;
    this.currentPage = 1;
    setTimeout(() => this.syncFineFilterTabMetrics());
  }

  setSort(order: 'latest' | 'oldest') {
    if (this.sortOrder === order) return;
    this.sortOrder = order;
    this.currentPage = 1;
  }

  currentPage = 1;

  get filteredFines() {
    if (this.fineStatusFilter === 'paid') {
      return this.fines.filter((fine) => this.isPaid(fine));
    }
    if (this.fineStatusFilter === 'unpaid') {
      return this.fines.filter((fine) => !this.isPaid(fine));
    }
    return this.fines;
  }

  private fineTimestamp(fine: any): number {
    const raw = fine?.createdAt || fine?.issued_at || fine?.paid_at || fine?.updatedAt;
    const time = new Date(raw || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  get sortedFines() {
    const items = [...this.filteredFines];
    items.sort((a, b) => {
      const aTime = this.fineTimestamp(a);
      const bTime = this.fineTimestamp(b);
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
    return items;
  }

  get totalFines() {
    return this.sortedFines.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalFines / size));
  }

  get pagedFines() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedFines.slice(start, start + size);
  }

  get groupedFines() {
    const groups: Array<{ key: string; label: string; items: any[] }> = [];
    for (const fine of this.pagedFines) {
      const raw = fine?.createdAt || fine?.issued_at || fine?.paid_at;
      const date = new Date(raw || 0);
      const isValid = !Number.isNaN(date.getTime());
      const key = isValid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown';
      const label = isValid ? this.monthYearFormatter.format(date) : 'Unknown date';
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({ key, label, items: [fine] });
      } else {
        lastGroup.items.push(fine);
      }
    }
    return groups;
  }

  trackByGroup(index: number, group: { key: string }) {
    return group.key || index;
  }

  trackByFine(index: number, fine: any) {
    return fine?._id || index;
  }

  get pageSummary() {
    if (this.totalFines === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalFines, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalFines}`;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage -= 1;
      this.scrollToTop();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage += 1;
      this.scrollToTop();
    }
  }

  async fetchFines() {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.fines = (await firstValueFrom(this.adminService.getAllFines())) || [];
    } catch (err: any) {
      this.errorMessage = err?.error?.msg || 'Failed to fetch fines.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
    }
  }

  private syncFineFilterTabMetrics() {
    const tabs = this.fineFilterTabs?.nativeElement;
    if (!tabs) return;
    const labels = Array.from(tabs.querySelectorAll('label.tab')) as HTMLElement[];
    if (labels.length < 3) return;

    const setPxVar = (name: string, value: number) =>
      tabs.style.setProperty(name, `${Math.ceil(value)}px`);

    setPxVar('--filter-all-w', labels[0].offsetWidth);
    setPxVar('--filter-paid-w', labels[1].offsetWidth);
    setPxVar('--filter-unpaid-w', labels[2].offsetWidth);

    setPxVar('--filter-all-x', labels[0].offsetLeft);
    setPxVar('--filter-paid-x', labels[1].offsetLeft);
    setPxVar('--filter-unpaid-x', labels[2].offsetLeft);
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

  startEdit(fine: any) {
    if (!fine?._id) return;
    this.editingId = fine._id;
    this.editErrors = {};
    const parsedEvidence = parseEvidenceEntries(fine.evidence);
    this.evidenceEntries = parsedEvidence.length ? parsedEvidence : [createEmptyEvidenceEntry()];
    this.evidenceErrors = this.evidenceEntries.map(() => ({}));
    this.editForm.reset({
      person_name: this.normalizeText(fine.person_name),
      person_age: String(fine.person_age ?? ''),
      mobile_number: this.normalizeText(fine.mobile_number),
      aadhar_number: this.normalizeText(fine.aadhar_number),
      email: this.normalizeText(fine.email),
      amount: String(fine.amount ?? ''),
      reason: this.normalizeText(fine.reason),
    });
  }

  cancelEdit() {
    this.editingId = '';
    this.editErrors = {};
    this.evidenceEntries = [createEmptyEvidenceEntry()];
    this.evidenceErrors = [];
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

  async saveEdit(fine: any) {
    if (!fine?._id || this.savingId) return;
    if (!this.validateEdit()) {
      this.feedback.showError('Please fix the errors before saving.');
      return;
    }

    this.savingId = fine._id;
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

      await firstValueFrom(this.adminService.updateFine(fine._id, payload));
      this.feedback.showMessage('Fine updated successfully.', 'success');
      this.editingId = '';
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
      await this.fetchFines();
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to update fine.');
    } finally {
      this.savingId = '';
    }
  }

  async forgiveFine(fine: any) {
    if (!fine?._id || this.deletingId) return;
    const confirmed = await this.feedback.confirm({
      title: 'Forgive fine',
      message: `Forgive fine for ${fine.person_name || 'citizen'}?`,
      confirmLabel: 'Forgive',
      cancelLabel: 'Cancel',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.deletingId = fine._id;
    try {
      await firstValueFrom(this.adminService.forgiveFine(fine._id));
      this.feedback.showMessage('Fine forgiven successfully.', 'success');
      this.fines = this.fines.filter((item) => String(item?._id) !== String(fine._id));
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to forgive fine.');
    } finally {
      this.deletingId = '';
    }
  }

  private scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
