import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { ReportService } from '../../services/report';
import { AppFeedbackService } from '../../services/app-feedback.service';

@Component({
  selector: 'app-view-reports',
  imports: [CommonModule, FormsModule, AppStatePanel],
  templateUrl: './view-reports.html',
  styleUrl: './view-reports.css',
})
export class ViewReports implements OnInit {
  reports: any[] = [];
  loading = true;
  errorMessage = '';
  sortOrder: 'latest' | 'oldest' = 'latest';
  readConfirm: { id: string; from: string } | null = null;
  isMarkingRead = false;
  searchValue = '';
  pageSize = 30;
  readonly pageSizeOptions = [30];
  currentPage = 1;
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  constructor(
    private reportService: ReportService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchReports();
  }

  async fetchReports() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const res = await firstValueFrom(this.reportService.getReports());
      this.reports = res || [];
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Failed to fetch reports.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
      this.syncPage();
    }
  }

  handleMarkAsRead(reportId: string, from: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.readConfirm = { id: reportId, from: from || 'this sender' };
  }

  closeReadConfirm() {
    if (this.isMarkingRead) return;
    this.readConfirm = null;
  }

  async confirmMarkAsRead() {
    if (!this.readConfirm || this.isMarkingRead) return;
    this.isMarkingRead = true;
    const sender = this.readConfirm.from;
    try {
      await firstValueFrom(this.reportService.deleteReport(this.readConfirm.id));
      this.reports = this.reports.filter((report) => report._id !== this.readConfirm?.id);
      this.syncPage();
      this.feedback.showMessage(`Report from ${sender} marked as read!`, 'success');
    } catch (err) {
      console.error(err);
      this.feedback.showError('Error removing report.');
    } finally {
      this.isMarkingRead = false;
      this.readConfirm = null;
    }
  }

  setSortOrder(order: 'latest' | 'oldest') {
    this.sortOrder = order;
    this.currentPage = 1;
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

  private getReportTime(report: any) {
    const time = new Date(report?.date || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  get filteredReports() {
    const query = this.normalizeText(this.searchValue).toLowerCase();
    if (!query) return this.reports;
    return this.reports.filter((report) => {
      const haystack = [
        report?.email,
        report?.reportText,
        report?.date,
        report?._id,
      ]
        .map((value) => this.normalizeText(value))
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  get sortedReports() {
    return [...this.filteredReports].sort((a, b) => {
      const aTime = this.getReportTime(a);
      const bTime = this.getReportTime(b);
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
  }

  get totalReports() {
    return this.sortedReports.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalReports / size));
  }

  get pagedReports() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedReports.slice(start, start + size);
  }

  get groupedReports() {
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const report of this.pagedReports) {
      const dateObj = new Date(report?.date || 0);
      const label = Number.isNaN(dateObj.getTime())
        ? 'Unknown Date'
        : this.monthYearFormatter.format(dateObj);
      const current = groups[groups.length - 1];
      if (!current || current.label !== label) {
        groups.push({ label, items: [report] });
      } else {
        current.items.push(report);
      }
    }
    return groups;
  }

  trackByGroup(index: number, group: { label: string }): string {
    return `${group?.label ?? 'unknown'}-${index}`;
  }

  trackByReport(index: number, report: any): string {
    const id = report?._id;
    return typeof id === 'string' && id.trim() ? id : `report-${index}`;
  }

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.totalReports === 0;
  }

  get pageSummary() {
    if (this.totalReports === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalReports, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalReports}`;
  }

  private syncPage() {
    const total = this.totalPages;
    if (this.currentPage > total) this.currentPage = total;
    if (this.currentPage < 1) this.currentPage = 1;
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
