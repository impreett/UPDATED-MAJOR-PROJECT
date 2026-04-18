import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AdminService } from '../../services/admin';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
import { isImageEvidenceType, isVideoEvidenceType } from '../../utils/evidence-editor';

@Component({
  selector: 'app-inspector-compliance-detail',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './inspector-compliance-detail.html',
  styleUrl: './inspector-compliance-detail.css',
})
export class InspectorComplianceDetail implements OnInit {
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
    private adminService: AdminService,
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
      this.complaint = await firstValueFrom(this.adminService.getInspectorComplaint(id));
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
    if (status === 'NEW') return 'New';
    if (status === 'WORKING') return 'Under review';
    if (status === 'DONE') return 'Resolved';
    if (status === 'REJECTED') return 'Rejected';
    if (status === 'FAKE') return 'Marked fake';
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

  get isNew(): boolean {
    return this.normalizeText(this.complaint?.status).toUpperCase() === 'NEW';
  }

  get isWorking(): boolean {
    return this.normalizeText(this.complaint?.status).toUpperCase() === 'WORKING';
  }

  async markWorking() {
    await this.performAction(() => this.adminService.markComplaintWorking(this.complaintId), 'Marked as under work.');
  }

  async reject() {
    await this.performAction(() => this.adminService.rejectComplaint(this.complaintId), 'Marked as rejected.');
  }

  async complete() {
    const name = this.normalizeText(this.complaint?.inspector_name) || 'Inspector';
    const policeId = this.normalizeText(this.complaint?.inspector_police_id);
    const label = policeId ? `${name} (${policeId})` : name;
    const note = await this.feedback.prompt({
      title: 'Complete complaint',
      message: `Action taken on inspector: ${label}`,
      inputLabel: 'Action taken',
      inputPlaceholder: 'Describe the action taken',
      confirmLabel: 'Complete',
      cancelLabel: 'Cancel',
      confirmTone: 'approve',
      cancelTone: 'check',
      inputRequired: true,
      inputRequiredMessage: 'Action taken is required.',
    });
    if (!note) return;
    await this.performAction(
      () => this.adminService.completeComplaint(this.complaintId, note),
      'Marked as done.'
    );
  }

  async markFake() {
    await this.performAction(() => this.adminService.markComplaintFake(this.complaintId), 'Marked as fake.');
  }

  private async performAction(action: () => any, successMessage: string) {
    if (!this.complaintId || this.acting) return;
    this.acting = true;
    try {
      await firstValueFrom(action());
      this.feedback.showMessage(successMessage, 'success');
      await this.fetchComplaint();
    } catch {
      this.feedback.showError('Action failed.');
    } finally {
      this.acting = false;
    }
  }
}
