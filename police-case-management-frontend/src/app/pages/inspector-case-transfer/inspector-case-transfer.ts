import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';
import { CaseTransferService } from '../../services/case-transfer';

@Component({
  selector: 'app-inspector-case-transfer',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './inspector-case-transfer.html',
  styleUrl: './inspector-case-transfer.css',
})
export class InspectorCaseTransfer implements OnInit {
  cases: any[] = [];
  loading = true;
  errorMessage = '';
  requestingId = '';
  sortOrder: 'latest' | 'oldest' = 'latest';
  pageSize = 30;
  currentPage = 1;
  private requestsByCaseId = new Map<string, any>();
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  constructor(
    private caseService: CaseService,
    private transferService: CaseTransferService,
    private feedback: AppFeedbackService
  ) {}

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private isTransferEligible(caseItem: any): boolean {
    const status = this.normalizeText(caseItem?.status).toUpperCase();
    const approved = caseItem?.isApproved === true || this.normalizeText(caseItem?.isApproved).toLowerCase() === 'true';
    return status === 'ACTIVE' && approved;
  }

  async ngOnInit() {
    await this.fetchData();
  }

  async fetchData() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const [casesRes, requestsRes] = await Promise.all([
        firstValueFrom(this.caseService.getAssignedCases()),
        firstValueFrom(this.transferService.getMyRequests()),
      ]);
      const casesPayload = Array.isArray(casesRes) ? casesRes : Array.isArray((casesRes as any)?.cases) ? (casesRes as any).cases : [];
      const requestsPayload = Array.isArray(requestsRes) ? requestsRes : Array.isArray((requestsRes as any)?.requests) ? (requestsRes as any).requests : [];

      this.cases = casesPayload.filter((caseItem: any) => this.isTransferEligible(caseItem));
      this.currentPage = 1;
      this.requestsByCaseId = new Map(
        requestsPayload.map((request: any) => [String(request?.case_id || ''), request])
      );
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Failed to load assigned cases.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
    }
  }

  async requestTransfer(caseItem: any) {
    if (!caseItem?._id || this.requestingId) return;
    if (!this.isTransferEligible(caseItem)) {
      this.feedback.showError('Only active, approved cases can be transferred.');
      return;
    }
    const existing = this.requestsByCaseId.get(String(caseItem._id));
    if (existing && String(existing.status || '').toUpperCase() === 'PENDING') {
      this.feedback.showError('Transfer request already pending for this case.');
      return;
    }

    const reason = await this.feedback.prompt({
      title: 'Request case transfer',
      message: `Provide a reason to transfer "${caseItem.case_title || 'this case'}".`,
      inputLabel: 'Reason',
      inputPlaceholder: 'Enter the reason for transfer',
      inputRequired: true,
      inputRequiredMessage: 'Reason is required to request transfer.',
      inputMaxLength: 280,
      confirmLabel: 'Submit request',
      cancelLabel: 'Cancel',
      confirmTone: 'approve',
      cancelTone: 'check',
    });

    if (!reason) return;

    this.requestingId = String(caseItem._id);
    try {
      const response: any = await firstValueFrom(
        this.transferService.requestTransfer(String(caseItem._id), reason)
      );
      const request = response?.request || response;
      if (request?.case_id) {
        this.requestsByCaseId.set(String(request.case_id), request);
      }
      this.feedback.showMessage('Transfer request submitted.', 'success');
    } catch (err: any) {
      console.error(err);
      this.feedback.showError(err?.error?.msg || 'Failed to submit transfer request.');
    } finally {
      this.requestingId = '';
    }
  }

  requestStatus(caseItem: any): string {
    const request = this.requestsByCaseId.get(String(caseItem?._id || ''));
    if (!request) return '';
    return String(request?.status || '').toUpperCase();
  }

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.cases.length === 0;
  }

  setSortOrder(order: 'latest' | 'oldest') {
    if (this.sortOrder === order) return;
    this.sortOrder = order;
    this.currentPage = 1;
  }

  private caseTimestamp(caseItem: any): number {
    const time = new Date(caseItem?.case_date || 0).getTime();
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

  get pagedCases() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedCases.slice(start, start + size);
  }

  get groupedCases() {
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const caseItem of this.pagedCases) {
      const dateObj = new Date(caseItem?.case_date || 0);
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
