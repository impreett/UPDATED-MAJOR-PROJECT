import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { InspectorComplaintService } from '../../services/inspector-complaint';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
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

@Component({
  selector: 'app-citizen-complaint-edit',
  imports: [CommonModule, FormsModule, RouterLink, AppStatePanel],
  templateUrl: './citizen-complaint-edit.html',
  styleUrl: './citizen-complaint-edit.css',
})
export class CitizenComplaintEdit implements OnInit {
  complaint: any | null = null;
  loading = true;
  submitting = false;
  errorMessage = '';
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;
  reason = '';
  reasonError = '';
  private hadExistingEvidence = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private complaintService: InspectorComplaintService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchComplaint();
  }

  get complaintId(): string {
    return String(this.route.snapshot.paramMap.get('complaintId') || '');
  }

  async fetchComplaint() {
    this.loading = true;
    this.errorMessage = '';
    const id = this.complaintId;
    if (!id) {
      this.errorMessage = 'Complaint not found.';
      this.loading = false;
      return;
    }

    try {
      this.complaint = await firstValueFrom(this.complaintService.getComplaintById(id));
      if (!this.complaint) {
        this.errorMessage = 'Complaint not found.';
        return;
      }
      this.reason = String(this.complaint.reason || '').trim();
      this.reasonError = '';
      const parsedEvidence = parseEvidenceEntries(this.complaint?.evidence);
      if (parsedEvidence.length) {
        this.evidenceEntries = parsedEvidence;
      } else {
        const evidenceEntry = createEmptyEvidenceEntry();
        evidenceEntry.evidence_name = String(this.complaint.evidence_name || '').trim();
        evidenceEntry.existing_file_url = String(this.complaint.evidence_file_url || '').trim();
        evidenceEntry.existing_file_type = String(this.complaint.evidence_file_type || '')
          .trim()
          .toLowerCase();
        this.evidenceEntries = [evidenceEntry];
      }
      this.hadExistingEvidence = this.evidenceEntries.some(
        (entry) => !!String(entry.evidence_name || '').trim() || !!String(entry.existing_file_url || '').trim()
      );
      this.evidenceErrors = [];
    } catch (err: any) {
      const message = err?.error?.msg || 'Failed to load complaint details.';
      this.errorMessage = message;
      this.feedback.showError(message);
    } finally {
      this.loading = false;
    }
  }

  trackByEvidenceIndex(index: number) {
    return index;
  }

  addEvidence() {
    this.evidenceEntries.push(createEmptyEvidenceEntry());
  }

  removeEvidence(index: number) {
    if (this.evidenceEntries.length <= 1) {
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
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

  evidenceFileLabel(entry: EvidenceEditorEntry): string {
    if (!entry.evidence_file) return '';
    return `${entry.evidence_file.name} (${formatFileSize(entry.evidence_file.size)})`;
  }

  getEvidenceError(index: number, field: keyof EvidenceFieldErrors) {
    return this.evidenceErrors[index]?.[field] || '';
  }

  evidenceLink(entry: EvidenceEditorEntry): string {
    return toAbsoluteAssetUrl(entry.existing_file_url);
  }

  async onSubmit() {
    const reason = String(this.reason || '').trim();
    if (!reason || reason.length < 10) {
      this.reasonError = 'Reason must be at least 10 characters.';
      this.feedback.showError(this.reasonError);
      return;
    }
    this.reasonError = '';

    const evidenceValidation = validateEvidenceEntries(this.evidenceEntries);
    this.evidenceErrors = evidenceValidation.errors;
    if (evidenceValidation.hasErrors) {
      this.feedback.showError('Fix evidence field errors below.');
      return;
    }

    const existingEvidence = buildExistingEvidencePayload(this.evidenceEntries);
    const newEvidence = buildNewEvidenceUploadPayload(this.evidenceEntries);
    const shouldClearEvidence =
      this.hadExistingEvidence && existingEvidence.length === 0 && newEvidence.length === 0;

    const payload = new FormData();
    payload.append('reason', reason);
    payload.append('existing_evidence_json', JSON.stringify(existingEvidence));
    for (const evidence of newEvidence) {
      payload.append('evidence_names', evidence.evidence_name);
      payload.append('evidence_files', evidence.evidence_file);
    }
    if (shouldClearEvidence) payload.append('clear_evidence', '1');

    this.submitting = true;
    try {
      await firstValueFrom(this.complaintService.updateComplaintEvidence(this.complaintId, payload));
      this.feedback.showMessage('Complaint evidence updated.', 'success');
      await this.router.navigate(['/citizen/complaints', this.complaintId]);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to update complaint evidence.');
    } finally {
      this.submitting = false;
    }
  }
}
