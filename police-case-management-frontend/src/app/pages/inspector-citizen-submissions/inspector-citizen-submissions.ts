import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';

@Component({
  selector: 'app-inspector-citizen-submissions',
  imports: [CommonModule, RouterLink],
  templateUrl: './inspector-citizen-submissions.html',
  styleUrl: './inspector-citizen-submissions.css',
})
export class InspectorCitizenSubmissions implements OnInit, AfterViewInit {
  @ViewChild('filterTabs') filterTabs?: ElementRef<HTMLElement>;

  cases: any[] = [];
  loading = true;
  sortOrder: 'latest' | 'oldest' = 'latest';
  updateFilter: 'all' | 'recent' | 'updated' = 'all';
  pageSize = 30;
  currentPage = 1;
  private actionCaseIds = new Set<string>();
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  constructor(
    private caseService: CaseService,
    private feedback: AppFeedbackService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      const response = await firstValueFrom(this.caseService.getInspectorCitizenSubmissions());
      const payload = response || [];
      this.cases = payload.filter((caseItem) => {
        const review = this.reviewStatus(caseItem);
        return !review || review === 'INSPECTOR_REVIEW';
      });
    } catch {
      this.feedback.showError('Failed to fetch citizen submissions.');
    } finally {
      this.loading = false;
      setTimeout(() => this.syncFilterTabMetrics());
    }
  }

  ngAfterViewInit() {
    this.syncFilterTabMetrics();
    setTimeout(() => this.syncFilterTabMetrics());
    if (typeof document !== 'undefined' && 'fonts' in document) {
      (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
        .then(() => this.syncFilterTabMetrics())
        .catch(() => {});
    }
  }

  setSortOrder(order: 'latest' | 'oldest') {
    this.sortOrder = order;
    this.currentPage = 1;
  }

  setUpdateFilter(filter: 'all' | 'recent' | 'updated') {
    this.updateFilter = filter;
    this.currentPage = 1;
    setTimeout(() => this.syncFilterTabMetrics());
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.syncFilterTabMetrics();
  }

  isActionLoading(caseItem: any): boolean {
    const id = String(caseItem?._id || '').trim();
    return !!id && this.actionCaseIds.has(id);
  }

  private reviewStatus(caseItem: any): string {
    return this.normalizeText(caseItem?.citizen_review_status).toUpperCase();
  }

  canReview(caseItem: any): boolean {
    const review = this.reviewStatus(caseItem);
    return review === 'INSPECTOR_REVIEW' || !review;
  }

  private applyCaseUpdate(updatedCase: any) {
    if (!updatedCase?._id) return;
    this.cases = this.cases.map((item) =>
      item?._id === updatedCase._id ? { ...item, ...updatedCase } : item
    );
  }

  async markFake(caseItem: any) {
    const id = String(caseItem?._id || '').trim();
    if (!id || this.actionCaseIds.has(id) || !this.canReview(caseItem)) return;

    const shouldContinue = await this.feedback.confirm({
      title: 'Mark as fake?',
      message: 'Are you sure you want to mark',
      subject: String(caseItem?.case_title || 'this case'),
      messageSuffix: ' as fake?',
      confirmLabel: 'Mark fake',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!shouldContinue) return;

    this.actionCaseIds.add(id);
    try {
      const response: any = await firstValueFrom(this.caseService.markCitizenCaseFake(id));
      if (response?.case) {
        this.applyCaseUpdate(response.case);
      }
      this.feedback.showMessage('Citizen case marked as fake.', 'success');
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to mark case as fake.');
    } finally {
      this.actionCaseIds.delete(id);
    }
  }

  async sendToCommissioner(caseItem: any) {
    const id = String(caseItem?._id || '').trim();
    if (!id || this.actionCaseIds.has(id) || !this.canReview(caseItem)) return;

    const shouldContinue = await this.feedback.confirm({
      title: 'Send commissioner review?',
      message: 'Send',
      subject: String(caseItem?.case_title || 'this case'),
      messageSuffix: ' for commissioner review?',
      confirmLabel: 'Send review',
      confirmTone: 'approve',
      cancelTone: 'check',
    });
    if (!shouldContinue) return;

    this.actionCaseIds.add(id);
    try {
      const response: any = await firstValueFrom(
        this.caseService.sendCitizenCaseToCommissionerReview(id)
      );
      if (response?.case) {
        this.applyCaseUpdate(response.case);
      }
      this.feedback.showMessage('Case sent to commissioner review.', 'success');
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to send case for review.');
    } finally {
      this.actionCaseIds.delete(id);
    }
  }

  async addAsCase(caseItem: any) {
    const id = String(caseItem?._id || '').trim();
    if (!id || this.actionCaseIds.has(id) || !this.canReview(caseItem)) return;
    this.router.navigate(['/inspector/add-case'], { queryParams: { citizenCaseId: id } });
  }

  trackByCase(index: number, caseItem: any) {
    return caseItem?._id || index;
  }

  trackByGroup(_index: number, group: { label: string }) {
    return group.label;
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private inspectorNameForReview(caseItem: any): string {
    const fromReviewer = this.normalizeText(caseItem?.citizen_review_by_inspector_name);
    if (fromReviewer) return fromReviewer;
    const fromHandler = this.normalizeText(caseItem?.case_handler);
    if (!fromHandler || fromHandler.toUpperCase() === 'INSPECTOR REVIEW POOL') return '';
    return fromHandler;
  }

  displayStatus(caseItem: any): string {
    const review = this.reviewStatus(caseItem);
    if (review === 'INSPECTOR_REVIEW') return 'Awaiting inspector action';
    if (review === 'INSPECTOR_ACCEPTED') {
      const inspectorName = this.inspectorNameForReview(caseItem);
      return inspectorName
        ? `Added as case by Inspector ${inspectorName}`
        : 'Added as case by inspector';
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
        ? `Sent to commissioner for review by Inspector ${inspectorName}`
        : 'Sent to commissioner for review';
    }
    if (review === 'COMMISSIONER_APPROVED') return 'Approved by commissioner';
    if (review === 'COMMISSIONER_REJECTED') return 'Rejected by commissioner';
    return this.normalizeText(caseItem?.status) || 'N/A';
  }

  get pagedCases() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedCases.slice(start, start + size);
  }

  get groupedCases() {
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const caseItem of this.pagedCases) {
      const dateSource =
        this.updateFilter === 'all'
          ? caseItem?.case_date
          : caseItem?.updated_on || caseItem?.updatedAt;
      const dateObj = new Date(dateSource || 0);
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

  get sortedCases() {
    return [...this.filteredCases].sort((a, b) => {
      const aTime =
        this.updateFilter === 'all'
          ? new Date(a?.case_date || 0).getTime()
          : this.getUpdatedTimestamp(a);
      const bTime =
        this.updateFilter === 'all'
          ? new Date(b?.case_date || 0).getTime()
          : this.getUpdatedTimestamp(b);
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
  }

  get filteredCases() {
    if (this.updateFilter === 'recent') {
      return this.cases.filter((caseItem) => this.isRecentlyUpdatedCase(caseItem));
    }
    if (this.updateFilter === 'updated') {
      return this.cases.filter((caseItem) => this.isUpdatedCase(caseItem));
    }
    return this.cases;
  }

  private getUpdatedTimestamp(caseItem: any) {
    const raw = caseItem?.updated_on || caseItem?.updatedAt;
    const time = new Date(raw || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private isUpdatedCase(caseItem: any) {
    return this.getUpdatedTimestamp(caseItem) > 0;
  }

  private isRecentlyUpdatedCase(caseItem: any) {
    const updatedAt = this.getUpdatedTimestamp(caseItem);
    if (!updatedAt) return false;
    return Date.now() - updatedAt <= 24 * 60 * 60 * 1000;
  }

  private syncFilterTabMetrics() {
    const tabs = this.filterTabs?.nativeElement;
    if (!tabs) return;
    const labels = Array.from(tabs.querySelectorAll('label.tab')) as HTMLElement[];
    if (labels.length < 3) return;

    const setPxVar = (name: string, value: number) =>
      tabs.style.setProperty(name, `${Math.ceil(value)}px`);

    setPxVar('--filter-all-w', labels[0].offsetWidth);
    setPxVar('--filter-recent-w', labels[1].offsetWidth);
    setPxVar('--filter-updated-w', labels[2].offsetWidth);

    setPxVar('--filter-all-x', labels[0].offsetLeft);
    setPxVar('--filter-recent-x', labels[1].offsetLeft);
    setPxVar('--filter-updated-x', labels[2].offsetLeft);
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
