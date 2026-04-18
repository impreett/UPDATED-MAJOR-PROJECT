import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { InspectorComplaintService } from '../../services/inspector-complaint';
import {
  EvidenceEditorEntry,
  EvidenceFieldErrors,
  buildNewEvidenceUploadPayload,
  createEmptyEvidenceEntry,
  formatFileSize,
  MAX_EVIDENCE_FILE_SIZE_MB,
  validateEvidenceEntries,
} from '../../utils/evidence-editor';

@Component({
  selector: 'app-report-police-inspector',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './report-police-inspector.html',
  styleUrl: './report-police-inspector.css',
})
export class ReportPoliceInspector implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  loading = true;
  submitting = false;
  inspectors: any[] = [];
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  evidencePreviewUrls: string[] = [''];
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;
  badgeError = '';

  form = this.fb.nonNullable.group({
    filter_city: '',
    inspector_id: '',
    inspector_city: '',
    inspector_badge: '',
    reason: '',
  });

  constructor(
    private route: ActivatedRoute,
    private complaintService: InspectorComplaintService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    try {
      const response = await firstValueFrom(this.complaintService.getInspectors());
      this.inspectors = response || [];
      const prefillName = String(this.route.snapshot.queryParamMap.get('inspectorName') || '').trim();
      if (prefillName) {
        const found = this.inspectors.find((i) => String(i?.fullname || '').trim() === prefillName);
        if (found?._id) {
          this.form.controls.inspector_id.setValue(String(found._id));
          this.applyInspectorDetails(found);
          this.badgeError = '';
        }
      }
    } catch {
      this.feedback.showError('Failed to fetch inspector list.');
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.resetAllPreviewUrls();
  }

  trackByEvidenceIndex(index: number) {
    return index;
  }

  addEvidence() {
    this.evidenceEntries.push(createEmptyEvidenceEntry());
    this.evidenceErrors.push({});
    this.evidencePreviewUrls.push('');
  }

  removeEvidence(index: number, input?: HTMLInputElement | null) {
    if (this.evidenceEntries.length <= 1) {
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
      this.evidencePreviewUrls = [''];
      if (input) {
        input.value = '';
      }
      return;
    }
    this.evidenceEntries.splice(index, 1);
    this.evidenceErrors.splice(index, 1);
    this.evidencePreviewUrls.splice(index, 1);
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
    this.setPreviewUrl(index, file);
  }

  onInspectorChange(inspectorId: string) {
    const id = String(inspectorId || '').trim();
    if (!id) {
      this.form.controls.inspector_city.setValue('');
      this.form.controls.inspector_badge.setValue('');
      this.badgeError = '';
      return;
    }
    const selected = this.inspectors.find((inspector) => String(inspector?._id || '') === id);
    this.applyInspectorDetails(selected);
    this.badgeError = '';
    const city = this.normalizeText(selected?.city);
    if (city) {
      this.form.controls.filter_city.setValue(city);
    }
  }

  onCityFilterChange(city: string) {
    const selectedCity = this.normalizeText(city);
    const selectedInspector = this.findInspectorById(this.form.controls.inspector_id.value);
    if (
      selectedInspector &&
      selectedCity &&
      this.normalizeText(selectedInspector?.city) !== selectedCity
    ) {
      this.form.controls.inspector_id.setValue('');
      this.form.controls.inspector_city.setValue('');
      this.form.controls.inspector_badge.setValue('');
      this.badgeError = '';
    }
  }

  onBadgeInput(value: string) {
    const badge = this.normalizeBadge(value);
    if (!badge) {
      this.badgeError = '';
      this.form.controls.inspector_id.setValue('');
      this.form.controls.inspector_city.setValue('');
      return;
    }

    const match = this.findInspectorByBadge(badge);
    if (!match) {
      this.badgeError = 'No inspector found with that badge ID.';
      this.form.controls.inspector_id.setValue('');
      this.form.controls.inspector_city.setValue('');
      return;
    }

    this.badgeError = '';
    const city = this.normalizeText(match?.city);
    if (city) {
      this.form.controls.filter_city.setValue(city);
    }
    this.form.controls.inspector_id.setValue(String(match?._id || ''));
    this.applyInspectorDetails(match);
  }

  private applyInspectorDetails(inspector: any) {
    if (!inspector) {
      this.form.controls.inspector_city.setValue('');
      return;
    }
    const city = this.normalizeText(inspector?.city);
    const badge = this.getInspectorBadge(inspector);
    this.form.controls.inspector_city.setValue(city);
    if (badge) {
      this.form.controls.inspector_badge.setValue(badge);
    }
  }

  clearEvidenceFile(index: number, input?: HTMLInputElement | null) {
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_file = null;
    this.setPreviewUrl(index, null);
    if (input) {
      input.value = '';
    }
  }

  evidenceFileLabel(entry: EvidenceEditorEntry): string {
    if (!entry.evidence_file) return '';
    return `${entry.evidence_file.name} (${formatFileSize(entry.evidence_file.size)})`;
  }

  getEvidenceError(index: number, field: keyof EvidenceFieldErrors) {
    return this.evidenceErrors[index]?.[field] || '';
  }

  evidencePreviewUrl(index: number): string {
    return this.evidencePreviewUrls[index] || '';
  }

  async onSubmit() {
    const data = this.form.getRawValue();
    if (!data.inspector_id) {
      this.feedback.showError('Please select an inspector.');
      return;
    }
    if (!data.reason.trim() || data.reason.trim().length < 10) {
      this.feedback.showError('Reason must be at least 10 characters.');
      return;
    }
    const evidenceValidation = validateEvidenceEntries(this.evidenceEntries);
    this.evidenceErrors = evidenceValidation.errors;
    if (evidenceValidation.hasErrors) {
      this.feedback.showError('Fix evidence field errors below.');
      return;
    }

    const payload = new FormData();
    payload.append('inspector_id', data.inspector_id);
    payload.append('reason', data.reason.trim());
    for (const evidence of buildNewEvidenceUploadPayload(this.evidenceEntries)) {
      payload.append('evidence_names', evidence.evidence_name);
      payload.append('evidence_files', evidence.evidence_file);
    }

    this.submitting = true;
    try {
      await firstValueFrom(this.complaintService.submitComplaint(payload));
      this.feedback.showMessage('Inspector report submitted successfully.', 'success');
      this.form.reset({
        filter_city: '',
        inspector_id: '',
        inspector_city: '',
        inspector_badge: '',
        reason: '',
      });
      this.badgeError = '';
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
      this.resetAllPreviewUrls();
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to submit inspector report.');
    } finally {
      this.submitting = false;
    }
  }

  get cityOptions(): string[] {
    const cities = this.inspectors
      .map((inspector) => this.normalizeText(inspector?.city))
      .filter((city) => !!city);
    return Array.from(new Set(cities)).sort((a, b) => a.localeCompare(b));
  }

  get filteredInspectors(): any[] {
    const selectedCity = this.normalizeText(this.form.controls.filter_city.value);
    if (!selectedCity) return this.inspectors;
    return this.inspectors.filter(
      (inspector) => this.normalizeText(inspector?.city) === selectedCity
    );
  }

  private findInspectorById(id: string) {
    const normalized = String(id || '').trim();
    if (!normalized) return null;
    return this.inspectors.find((inspector) => String(inspector?._id || '') === normalized) || null;
  }

  private findInspectorByBadge(badge: string) {
    const normalized = this.normalizeBadge(badge);
    if (!normalized) return null;
    return (
      this.inspectors.find(
        (inspector) => this.normalizeBadge(this.getInspectorBadge(inspector)) === normalized
      ) || null
    );
  }

  private getInspectorBadge(inspector: any): string {
    return this.normalizeText(
      inspector?.badge_number ??
        inspector?.badge ??
        inspector?.badgeNo ??
        inspector?.badgeId ??
        inspector?.police_id ??
        ''
    );
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private normalizeBadge(value: unknown): string {
    return this.normalizeText(value).toUpperCase();
  }

  private setPreviewUrl(index: number, file: File | null) {
    if (this.evidencePreviewUrls[index]) {
      URL.revokeObjectURL(this.evidencePreviewUrls[index]);
    }
    this.evidencePreviewUrls[index] = file ? URL.createObjectURL(file) : '';
  }

  private resetPreviewUrl(index: number) {
    if (this.evidencePreviewUrls[index]) {
      URL.revokeObjectURL(this.evidencePreviewUrls[index]);
    }
    this.evidencePreviewUrls[index] = '';
  }

  private resetAllPreviewUrls() {
    this.evidencePreviewUrls.forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
    this.evidencePreviewUrls = [''];
  }
}
