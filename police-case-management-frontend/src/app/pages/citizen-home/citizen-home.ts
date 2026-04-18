import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CaseService } from '../../services/case';
import { AppFeedbackService } from '../../services/app-feedback.service';

@Component({
  selector: 'app-citizen-home',
  imports: [CommonModule, RouterLink],
  templateUrl: './citizen-home.html',
  styleUrl: './citizen-home.css',
})
export class CitizenHome implements OnInit, AfterViewInit {
  @ViewChild('filterTabs') filterTabs?: ElementRef<HTMLElement>;

  cases: any[] = [];
  loading = true;
  sortOrder: 'latest' | 'oldest' = 'latest';
  updateFilter: 'all' | 'recent' | 'updated' = 'all';
  pageSize = 30;
  currentPage = 1;
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  constructor(
    private caseService: CaseService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    try {
      const response = await firstValueFrom(this.caseService.getCompletedCases());
      this.cases = response || [];
    } catch {
      this.feedback.showError('Failed to fetch completed cases.');
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

  get filteredCases() {
    if (this.updateFilter === 'recent') {
      return this.cases.filter((caseItem) => this.isRecentlyUpdatedCase(caseItem));
    }
    if (this.updateFilter === 'updated') {
      return this.cases.filter((caseItem) => this.isUpdatedCase(caseItem));
    }
    return this.cases;
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
      const current = groups[groups.length - 1];
      if (!current || current.label !== label) {
        groups.push({ label, items: [caseItem] });
      } else {
        current.items.push(caseItem);
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
