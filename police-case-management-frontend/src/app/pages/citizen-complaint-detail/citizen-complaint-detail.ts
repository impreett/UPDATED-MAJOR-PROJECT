import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { InspectorComplaintService } from '../../services/inspector-complaint';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
import { isImageEvidenceType, isVideoEvidenceType } from '../../utils/evidence-editor';

@Component({
  selector: 'app-citizen-complaint-detail',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './citizen-complaint-detail.html',
  styleUrl: './citizen-complaint-detail.css',
})
export class CitizenComplaintDetail implements OnInit {
  complaint: any | null = null;
  loading = true;
  errorMessage = '';
  acting = false;
  evidenceEntries: Array<{
    evidence_name: string;
    evidence_file_url: string;
    evidence_file_type: string;
  }> = [];

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

  get inspectorName(): string {
    return this.normalizeText(this.complaint?.inspector_name);
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
      } else {
        this.evidenceEntries = this.buildEvidenceEntries(this.complaint);
      }
    } catch (err: any) {
      const message = err?.error?.msg || 'Failed to load complaint details.';
      this.errorMessage = message;
      this.feedback.showError(message);
    } finally {
      this.loading = false;
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private buildEvidenceEntries(complaint: any) {
    const entries: Array<{
      evidence_name: string;
      evidence_file_url: string;
      evidence_file_type: string;
    }> = [];

    if (Array.isArray(complaint?.evidence)) {
      for (const entry of complaint.evidence) {
        if (!entry || typeof entry !== 'object') continue;
        const evidence_name = this.normalizeText(entry.evidence_name || entry.name);
        const evidence_file_url = this.normalizeText(entry.evidence_file_url || entry.url);
        const evidence_file_type = this.normalizeText(
          entry.evidence_file_type || entry.fileType || entry.mimetype
        ).toLowerCase();
        if (!evidence_name && !evidence_file_url) continue;
        entries.push({ evidence_name, evidence_file_url, evidence_file_type });
      }
    }

    if (!entries.length) {
      const legacyName = this.normalizeText(complaint?.evidence_name);
      const legacyUrl = this.normalizeText(complaint?.evidence_file_url);
      const legacyType = this.normalizeText(complaint?.evidence_file_type).toLowerCase();
      if (legacyName || legacyUrl) {
        entries.push({
          evidence_name: legacyName,
          evidence_file_url: legacyUrl,
          evidence_file_type: legacyType,
        });
      }
    }

    return entries;
  }

  displayStatus(complaint: any): string {
    const status = this.normalizeText(complaint?.status).toUpperCase();
    if (status === 'NEW') return 'Waiting for commissioner to review';
    if (status === 'WORKING') return 'Commissioner marked this as under work';
    if (status === 'DONE') return 'Completed';
    if (status === 'REJECTED') return 'Complaint rejected by commissioner';
    if (status === 'FAKE') return 'Complaint marked as fake';
    return status || 'Unknown';
  }

  evidenceSummary(): string {
    if (!this.evidenceEntries.length) return 'None';
    const primaryName = this.normalizeText(this.evidenceEntries[0]?.evidence_name) || 'Evidence';
    if (this.evidenceEntries.length === 1) return primaryName;
    return `${primaryName} (+${this.evidenceEntries.length - 1} more)`;
  }

  evidenceUrl(entry: { evidence_file_url: string }): string {
    return toAbsoluteAssetUrl(entry?.evidence_file_url);
  }

  evidenceType(entry: { evidence_file_type: string }): string {
    return this.normalizeText(entry?.evidence_file_type).toLowerCase();
  }

  isImageEvidence(entry: { evidence_file_type: string }): boolean {
    return isImageEvidenceType(this.evidenceType(entry));
  }

  isVideoEvidence(entry: { evidence_file_type: string }): boolean {
    return isVideoEvidenceType(this.evidenceType(entry));
  }

  get canWithdraw(): boolean {
    const status = this.normalizeText(this.complaint?.status).toUpperCase();
    return status === 'NEW';
  }

  get canEdit(): boolean {
    const status = this.normalizeText(this.complaint?.status).toUpperCase();
    return status !== 'DONE';
  }

  actionTaken(complaint: any): string {
    const status = this.normalizeText(complaint?.status).toUpperCase();
    const note = this.normalizeText(complaint?.commissioner_note);
    if (status !== 'DONE') return '';
    return note;
  }

  async withdrawComplaint() {
    if (!this.complaintId || this.acting) return;
    const confirmed = await this.feedback.confirm({
      title: 'Withdraw complaint',
      message: 'Are you sure you want to withdraw this complaint?',
      confirmLabel: 'Withdraw',
      cancelLabel: 'Keep',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.acting = true;
    try {
      await firstValueFrom(this.complaintService.withdrawComplaint(this.complaintId));
      this.feedback.showMessage('Complaint withdrawn.', 'success');
      await this.router.navigate(['/citizen/complaints']);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to withdraw complaint.');
    } finally {
      this.acting = false;
    }
  }
}
