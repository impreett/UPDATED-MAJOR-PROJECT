import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';

type ComplianceTab = 'new' | 'working' | 'done';

@Component({
  selector: 'app-inspector-compliance',
  imports: [CommonModule, RouterLink],
  templateUrl: './inspector-compliance.html',
  styleUrl: './inspector-compliance.css',
})
export class InspectorCompliance implements OnInit {
  activeTab: ComplianceTab = 'new';
  complaints: any[] = [];
  loading = true;
  actingId = '';
  pageSize = 30;
  currentPage = 1;

  constructor(
    private adminService: AdminService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchComplaints();
  }

  async setTab(tab: ComplianceTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.currentPage = 1;
    await this.fetchComplaints();
  }

  async markWorking(id: string) {
    await this.performAction(id, () => this.adminService.markComplaintWorking(id), 'Marked as under work.');
  }

  async reject(id: string) {
    await this.performAction(id, () => this.adminService.rejectComplaint(id), 'Marked as rejected.');
  }

  async complete(id: string, inspectorName?: string, inspectorPoliceId?: string) {
    const name = this.normalizeText(inspectorName) || 'Inspector';
    const policeId = this.normalizeText(inspectorPoliceId);
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
    await this.performAction(id, () => this.adminService.completeComplaint(id, note), 'Marked as done.');
  }

  async markFake(id: string) {
    await this.performAction(id, () => this.adminService.markComplaintFake(id), 'Marked as fake.');
  }

  private async fetchComplaints() {
    this.loading = true;
    try {
      this.complaints = await firstValueFrom(this.adminService.getInspectorCompliance(this.activeTab));
      this.currentPage = 1;
    } catch {
      this.feedback.showError('Failed to fetch inspector compliance items.');
    } finally {
      this.loading = false;
    }
  }

  private async performAction(id: string, action: () => any, successMessage: string) {
    if (!id || this.actingId) return;
    this.actingId = id;
    try {
      await firstValueFrom(action());
      this.feedback.showMessage(successMessage, 'success');
      await this.fetchComplaints();
    } catch {
      this.feedback.showError('Action failed.');
    } finally {
      this.actingId = '';
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  evidenceName(item: any): string {
    const entries: Array<{ evidence_name: string }> = [];
    if (Array.isArray(item?.evidence)) {
      for (const entry of item.evidence) {
        if (!entry || typeof entry !== 'object') continue;
        const evidence_name = this.normalizeText(entry.evidence_name || entry.name);
        const evidence_file_url = this.normalizeText(entry.evidence_file_url || entry.url);
        if (!evidence_name && !evidence_file_url) continue;
        entries.push({ evidence_name });
      }
    }
    if (!entries.length) {
      const legacyName = this.normalizeText(item?.evidence_name);
      const legacyUrl = this.normalizeText(item?.evidence_file_url);
      if (legacyName || legacyUrl) {
        entries.push({ evidence_name: legacyName });
      }
    }

    if (!entries.length) return 'None';
    const primary = this.normalizeText(entries[0]?.evidence_name) || 'Evidence';
    if (entries.length === 1) return primary;
    return `${primary} (+${entries.length - 1} more)`;
  }

  get totalComplaints() {
    return this.complaints.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalComplaints / size));
  }

  get pagedComplaints() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.complaints.slice(start, start + size);
  }

  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  get groupedComplaints() {
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const item of this.pagedComplaints) {
      const dateObj = new Date(item?.createdAt || 0);
      const label = Number.isNaN(dateObj.getTime())
        ? 'Unknown Date'
        : this.monthYearFormatter.format(dateObj);
      const current = groups[groups.length - 1];
      if (!current || current.label !== label) {
        groups.push({ label, items: [item] });
      } else {
        current.items.push(item);
      }
    }
    return groups;
  }

  trackByGroup(index: number, group: { label: string }): string {
    return `${group?.label ?? 'unknown'}-${index}`;
  }

  trackByComplaint(index: number, item: any): string {
    const id = item?._id;
    return typeof id === 'string' && id.trim() ? id : `complaint-${index}`;
  }

  get pageSummary() {
    if (this.totalComplaints === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalComplaints, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalComplaints}`;
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

  private scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
