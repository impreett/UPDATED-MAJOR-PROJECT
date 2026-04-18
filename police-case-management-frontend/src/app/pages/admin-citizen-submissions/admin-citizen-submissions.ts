import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AdminService } from '../../services/admin';

@Component({
  selector: 'app-admin-citizen-submissions',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './admin-citizen-submissions.html',
  styleUrl: './admin-citizen-submissions.css',
})
export class AdminCitizenSubmissions implements OnInit {
  submissions: any[] = [];
  loading = true;
  errorMessage = '';
  pageSize = 30;
  currentPage = 1;
  sortOrder: 'latest' | 'oldest' = 'latest';
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  assignModal: { caseItem: any } | null = null;
  activeInspectors: any[] = [];
  loadingInspectors = false;
  assigningId = '';

  constructor(
    private adminService: AdminService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchSubmissions();
  }

  async fetchSubmissions() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom(this.adminService.getCitizenSubmissions());
      const payload = Array.isArray(response)
        ? response
        : Array.isArray((response as any)?.cases)
        ? (response as any).cases
        : [];
      this.submissions = payload;
      this.currentPage = 1;
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Failed to load citizen submissions.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
    }
  }

  openAssignModal(caseItem: any) {
    if (!caseItem) return;
    this.assignModal = { caseItem };
    this.loadInspectors();
  }

  closeAssignModal() {
    if (this.assigningId) return;
    this.assignModal = null;
  }

  async loadInspectors() {
    this.loadingInspectors = true;
    this.activeInspectors = [];
    try {
      const response = await firstValueFrom(this.adminService.getActiveUsers());
      const payload = Array.isArray(response)
        ? response
        : Array.isArray((response as any)?.users)
        ? (response as any).users
        : [];
      this.activeInspectors = payload;
    } catch (err) {
      console.error(err);
      this.feedback.showError('Failed to load active inspectors.');
    } finally {
      this.loadingInspectors = false;
    }
  }

  async assignInspector(inspector: any) {
    const caseId = String(this.assignModal?.caseItem?._id || '');
    const inspectorId = String(inspector?._id || '');
    if (!caseId || !inspectorId || this.assigningId) return;

    this.assigningId = inspectorId;
    try {
      await firstValueFrom(this.adminService.assignCitizenSubmission(caseId, inspectorId));
      this.feedback.showMessage('Citizen case assigned successfully.', 'success');
      this.submissions = this.submissions.filter((item) => String(item?._id) !== caseId);
      this.assignModal = null;
    } catch (err: any) {
      console.error(err);
      this.feedback.showError(err?.error?.msg || 'Failed to assign citizen case.');
    } finally {
      this.assigningId = '';
    }
  }

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.submissions.length === 0;
  }

  submittedBy(caseItem: any) {
    return caseItem?.submitted_by_name || caseItem?.submitted_by_email || 'Citizen';
  }

  forwardedBy(caseItem: any) {
    return caseItem?.citizen_review_by_inspector_name || 'Inspector';
  }

  setSortOrder(order: 'latest' | 'oldest') {
    if (this.sortOrder === order) return;
    this.sortOrder = order;
    this.currentPage = 1;
  }

  private caseTimestamp(caseItem: any): number {
    const raw = caseItem?.case_date || caseItem?.createdAt || caseItem?.submitted_at || caseItem?.updatedAt;
    const time = new Date(raw || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  get sortedSubmissions() {
    const items = [...this.submissions];
    items.sort((a, b) => {
      const aTime = this.caseTimestamp(a);
      const bTime = this.caseTimestamp(b);
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
    return items;
  }

  get totalCases() {
    return this.sortedSubmissions.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalCases / size));
  }

  get pageSummary() {
    if (this.totalCases === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalCases, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalCases}`;
  }

  get pagedSubmissions() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedSubmissions.slice(start, start + size);
  }

  get groupedSubmissions() {
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const caseItem of this.pagedSubmissions) {
      const dateObj = new Date(
        caseItem?.case_date || caseItem?.createdAt || caseItem?.submitted_at || caseItem?.updatedAt || 0
      );
      const label = Number.isNaN(dateObj.getTime())
        ? 'Unknown Date'
        : this.monthYearFormatter.format(dateObj);

      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.label !== label) {
        groups.push({ label, items: [caseItem] });
      } else {
        currentGroup.items.push(caseItem);
      }
    }
    return groups;
  }

  trackByGroup(_index: number, group: { label: string }) {
    return group.label;
  }

  trackByCase(index: number, caseItem: any) {
    return caseItem?._id || index;
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
