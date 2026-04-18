import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CaseService } from '../../services/case';
import { AppFeedbackService } from '../../services/app-feedback.service';

@Component({
  selector: 'app-citizen-case-status',
  imports: [CommonModule, RouterLink],
  templateUrl: './citizen-case-status.html',
  styleUrl: './citizen-case-status.css',
})
export class CitizenCaseStatus implements OnInit {
  cases: any[] = [];
  loading = true;
  actionLoadingId = '';
  sortOrder: 'latest' | 'oldest' = 'latest';
  pageSize = 30;
  currentPage = 1;

  constructor(
    private caseService: CaseService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    try {
      const response = await firstValueFrom(this.caseService.getCitizenCaseStatus());
      this.cases = response || [];
    } catch {
      this.feedback.showError('Failed to fetch your submitted cases.');
    } finally {
      this.loading = false;
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private inspectorNameForReview(caseItem: any): string {
    const name = this.normalizeText(caseItem?.citizen_review_by_inspector_name);
    if (name) return name;
    const fallbackHandler = this.normalizeText(caseItem?.case_handler);
    if (!fallbackHandler || fallbackHandler.toUpperCase() === 'INSPECTOR REVIEW POOL') return '';
    return fallbackHandler;
  }

  displayStatus(caseItem: any): string {
    if (caseItem?.withdrawn_by_citizen) return 'Withdrawn by citizen';

    const review = String(caseItem?.citizen_review_status || '').trim().toUpperCase();
    if (review === 'INSPECTOR_REVIEW') return 'Waiting for commissioner review';
    if (review === 'INSPECTOR_ACCEPTED') {
      const inspectorName = this.inspectorNameForReview(caseItem);
      return inspectorName
        ? `Your case is being handled by Officer ${inspectorName}. Contact them at your respective police station.`
        : 'Your case is being handled by the assigned officer. Contact them at your respective police station.';
    }
    if (review === 'FAKE') {
      const inspectorName = this.inspectorNameForReview(caseItem);
      return inspectorName
        ? `Marked as fake by Inspector ${inspectorName}`
        : 'Marked as fake by inspector';
    }
    if (review === 'COMMISSIONER_REVIEW') {
      const inspectorName = this.inspectorNameForReview(caseItem);
      return inspectorName
        ? `Case sent to commissioner for review by Officer ${inspectorName}`
        : 'Case sent to commissioner for review';
    }
    if (review === 'COMMISSIONER_APPROVED') return 'Approved by commissioner';
    if (review === 'COMMISSIONER_REJECTED') return 'Rejected by commissioner';
    const statusText = this.normalizeText(caseItem?.status);
    if (statusText) return statusText;
    return caseItem?.isApproved ? 'Approved' : 'Pending';
  }

  setSort(order: 'latest' | 'oldest') {
    if (this.sortOrder === order) return;
    this.sortOrder = order;
    this.currentPage = 1;
  }

  private caseTimestamp(caseItem: any): number {
    const raw = caseItem?.createdAt || caseItem?.created_on || caseItem?.case_date || caseItem?.updatedAt || caseItem?.updated_on;
    const time = new Date(raw || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  get sortedCases() {
    const items = [...this.cases];
    items.sort((a, b) => {
      const aTime = this.caseTimestamp(a);
      const bTime = this.caseTimestamp(b);
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
    return items;
  }

  get pagedCases() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedCases.slice(start, start + size);
  }

  get groupedCases() {
    const groups: Array<{ key: string; label: string; items: any[] }> = [];
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
    for (const caseItem of this.pagedCases) {
      const raw = caseItem?.createdAt || caseItem?.created_on || caseItem?.case_date;
      const date = new Date(raw || 0);
      const isValid = !Number.isNaN(date.getTime());
      const key = isValid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown';
      const label = isValid ? formatter.format(date) : 'Unknown date';
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({ key, label, items: [caseItem] });
      } else {
        lastGroup.items.push(caseItem);
      }
    }
    return groups;
  }

  evidenceLabel(caseItem: any): string {
    const evidence = Array.isArray(caseItem?.evidence) ? caseItem.evidence : [];
    if (!evidence.length) return 'No evidence';
    const names = evidence
      .map((evidence: any) => this.normalizeText(evidence?.evidence_name || evidence?.name))
      .filter(Boolean);
    if (names.length) return names.join(', ');
    return `${evidence.length} file${evidence.length > 1 ? 's' : ''}`;
  }

  canManageCase(caseItem: any): boolean {
    if (!caseItem || caseItem?.withdrawn_by_citizen) return false;
    if (caseItem?.is_removed && !caseItem?.withdrawn_by_citizen) return false;

    const review = String(caseItem?.citizen_review_status || '').trim().toUpperCase();
    if (!review) {
      return !caseItem?.isApproved && !caseItem?.is_removed;
    }

    return review === 'INSPECTOR_REVIEW' || review === 'COMMISSIONER_REVIEW';
  }

  async withdrawCase(caseItem: any) {
    const id = String(caseItem?._id || '').trim();
    if (!id || this.actionLoadingId) return;

    const confirmed = await this.feedback.confirm({
      title: 'Withdraw case?',
      message: 'Are you sure you want to withdraw',
      subject: String(caseItem?.case_title || 'this case'),
      messageSuffix: '?',
      confirmLabel: 'Withdraw',
      cancelLabel: 'Cancel',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.actionLoadingId = id;
    try {
      await firstValueFrom(this.caseService.withdrawCitizenCase(id));
      this.cases = this.cases.map((item) =>
        item?._id === id
          ? {
              ...item,
              is_removed: true,
              withdrawn_by_citizen: true,
              withdrawn_at: new Date().toISOString(),
              updated_on: new Date().toISOString(),
            }
          : item
      );
      this.feedback.showMessage('Case withdrawn successfully.', 'success');
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to withdraw case.');
    } finally {
      this.actionLoadingId = '';
    }
  }

  trackByCase(index: number, caseItem: any) {
    return caseItem?._id || index;
  }

  trackByGroup(index: number, group: { key: string }) {
    return group.key || index;
  }

  get totalCases() {
    return this.sortedCases.length;
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
