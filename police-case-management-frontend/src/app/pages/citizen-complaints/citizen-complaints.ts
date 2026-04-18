import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { InspectorComplaintService } from '../../services/inspector-complaint';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
import { isImageEvidenceType, isVideoEvidenceType } from '../../utils/evidence-editor';

@Component({
  selector: 'app-citizen-complaints',
  imports: [CommonModule, FormsModule, RouterLink, AppStatePanel],
  templateUrl: './citizen-complaints.html',
  styleUrl: './citizen-complaints.css',
})
export class CitizenComplaints implements OnInit {
  complaints: any[] = [];
  loading = true;
  errorMessage = '';
  searchValue = '';
  pageSize = 30;
  readonly pageSizeOptions = [30];
  currentPage = 1;
  sortOrder: 'latest' | 'oldest' = 'latest';
  withdrawingId: string | null = null;

  constructor(
    private complaintService: InspectorComplaintService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchComplaints();
  }

  async fetchComplaints() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom(this.complaintService.getMyComplaints());
      this.complaints = response || [];
    } catch {
      this.errorMessage = 'Failed to fetch your complaints.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
      this.syncPage();
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private getEvidenceEntries(complaint: any) {
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

    const legacyName = this.normalizeText(complaint?.evidence_name);
    const legacyUrl = this.normalizeText(complaint?.evidence_file_url);
    const legacyType = this.normalizeText(complaint?.evidence_file_type).toLowerCase();
    if (!entries.length && (legacyName || legacyUrl)) {
      entries.push({
        evidence_name: legacyName,
        evidence_file_url: legacyUrl,
        evidence_file_type: legacyType,
      });
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

  actionTaken(complaint: any): string {
    const status = this.normalizeText(complaint?.status).toUpperCase();
    const note = this.normalizeText(complaint?.commissioner_note);
    if (status !== 'DONE') return '';
    return note;
  }

  canEdit(complaint: any): boolean {
    const status = this.normalizeText(complaint?.status).toUpperCase();
    return status !== 'DONE';
  }

  canWithdraw(complaint: any): boolean {
    const status = this.normalizeText(complaint?.status).toUpperCase();
    return status === 'NEW';
  }

  async withdrawComplaint(complaint: any) {
    const id = this.normalizeText(complaint?._id);
    if (!id || this.withdrawingId) return;

    const confirmed = await this.feedback.confirm({
      title: 'Withdraw complaint',
      message: 'Are you sure you want to withdraw this complaint?',
      confirmLabel: 'Withdraw',
      cancelLabel: 'Keep',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.withdrawingId = id;
    try {
      await firstValueFrom(this.complaintService.withdrawComplaint(id));
      this.complaints = this.complaints.filter((item) => String(item?._id) !== id);
      this.syncPage();
      this.feedback.showMessage('Complaint withdrawn.', 'success');
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to withdraw complaint.');
    } finally {
      this.withdrawingId = null;
    }
  }

  evidenceName(complaint: any): string {
    const entries = this.getEvidenceEntries(complaint);
    if (!entries.length) return 'None';
    const primaryName = this.normalizeText(entries[0]?.evidence_name) || 'Evidence';
    if (entries.length === 1) return primaryName;
    return `${primaryName} (+${entries.length - 1} more)`;
  }

  evidenceUrl(complaint: any): string {
    const entry = this.getEvidenceEntries(complaint)[0];
    return toAbsoluteAssetUrl(entry?.evidence_file_url);
  }

  evidenceType(complaint: any): string {
    const entry = this.getEvidenceEntries(complaint)[0];
    return this.normalizeText(entry?.evidence_file_type).toLowerCase();
  }

  isImageEvidence(complaint: any): boolean {
    return isImageEvidenceType(this.evidenceType(complaint));
  }

  isVideoEvidence(complaint: any): boolean {
    return isVideoEvidenceType(this.evidenceType(complaint));
  }

  trackByComplaint(index: number, complaint: any) {
    return complaint?._id || index;
  }

  onSearchChange(value: string) {
    this.searchValue = value || '';
    this.currentPage = 1;
  }

  onPageSizeChange(value: number) {
    const size = Number(value) || this.pageSize;
    this.pageSize = size;
    this.currentPage = 1;
  }

  setSort(order: 'latest' | 'oldest') {
    if (this.sortOrder === order) return;
    this.sortOrder = order;
    this.currentPage = 1;
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

  get filteredComplaints() {
    const query = this.normalizeText(this.searchValue).toLowerCase();
    if (!query) return this.complaints;
    return this.complaints.filter((complaint) => {
      const evidenceNames = this.getEvidenceEntries(complaint)
        .map((entry) => entry.evidence_name)
        .join(' ');
      const haystack = [
        complaint?.inspector_name,
        complaint?.inspector_police_id,
        complaint?.inspector_city,
        complaint?.reason,
        complaint?.status,
        complaint?.createdAt,
        evidenceNames,
      ]
        .map((value) => this.normalizeText(value))
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  get totalComplaints() {
    return this.filteredComplaints.length;
  }

  get sortedComplaints() {
    const items = [...this.filteredComplaints];
    items.sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
    return items;
  }

  get groupedComplaints() {
    const groups: Array<{ key: string; label: string; items: any[] }> = [];
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
    for (const complaint of this.pagedComplaints) {
      const rawDate = complaint?.createdAt || complaint?.created_on || complaint?.updatedAt || complaint?.createdAt;
      const date = new Date(rawDate || 0);
      const isValid = !Number.isNaN(date.getTime());
      const key = isValid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown';
      const label = isValid ? formatter.format(date) : 'Unknown date';
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({ key, label, items: [complaint] });
      } else {
        lastGroup.items.push(complaint);
      }
    }
    return groups;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalComplaints / size));
  }

  get pagedComplaints() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedComplaints.slice(start, start + size);
  }

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.totalComplaints === 0;
  }

  trackByGroup(index: number, group: { key: string }) {
    return group.key || index;
  }

  get pageSummary() {
    if (this.totalComplaints === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalComplaints, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalComplaints}`;
  }

  private syncPage() {
    const total = this.totalPages;
    if (this.currentPage > total) this.currentPage = total;
    if (this.currentPage < 1) this.currentPage = 1;
  }

  private scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
