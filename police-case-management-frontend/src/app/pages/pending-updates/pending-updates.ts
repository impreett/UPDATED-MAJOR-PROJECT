import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';

@Component({
  selector: 'app-pending-updates',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './pending-updates.html',
  styleUrl: './pending-updates.css',
})
export class PendingUpdates implements OnInit {
  updates: any[] = [];
  originals: Record<string, any> = {};
  loading = true;
  errorMessage = '';
  updateConfirm:
    | {
        id: string;
        title: string;
        action: 'approve' | 'reject';
      }
    | null = null;
  isSubmittingAction = false;
  sortOrder: 'latest' | 'oldest' = 'latest';
  pageSize = 30;
  currentPage = 1;
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  constructor(
    private adminService: AdminService,
    private route: ActivatedRoute,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    this.applyActionMessageFromQuery();
    await this.fetchPendingUpdates();
  }

  async fetchPendingUpdates() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const res = await firstValueFrom(this.adminService.getPendingUpdates());
      this.updates = res || [];

      const ids = Array.from(
        new Set((this.updates || []).map((u: any) => u.originalCaseId).filter(Boolean))
      );
      if (ids.length) {
        const pairs = await Promise.all(
          ids.map(async (id) => {
            try {
              const r = await firstValueFrom(this.adminService.getCaseById(id));
              return [id, r];
            } catch {
              return [id, null];
            }
          })
        );
        this.originals = Object.fromEntries(pairs);
      } else {
        this.originals = {};
      }
    } catch {
      this.errorMessage = 'Failed to fetch pending updates.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
      this.syncPage();
    }
  }

  async handleApprove(update: any, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const updateId = String(update?._id ?? '').trim();
    if (!updateId) {
      this.feedback.showError('Update ID is missing. Please refresh and try again.');
      return;
    }
    this.openUpdateConfirm(update, 'approve');
  }

  async handleDeny(update: any, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    const updateId = String(update?._id ?? '').trim();
    if (!updateId) {
      this.feedback.showError('Update ID is missing. Please refresh and try again.');
      return;
    }
    this.openUpdateConfirm(update, 'reject');
  }

  setSortOrder(order: 'latest' | 'oldest') {
    this.sortOrder = order;
    this.currentPage = 1;
  }

  get sortedUpdates() {
    return [...this.updates].sort((a, b) => {
      const aTime = new Date(a?.requestedAt || 0).getTime();
      const bTime = new Date(b?.requestedAt || 0).getTime();
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
  }

  get totalUpdates() {
    return this.sortedUpdates.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalUpdates / size));
  }

  get pagedUpdates() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedUpdates.slice(start, start + size);
  }

  get groupedUpdates() {
    const groups: Array<{ label: string; items: any[] }> = [];
    for (const updateItem of this.pagedUpdates) {
      const dateObj = new Date(updateItem?.requestedAt || 0);
      const label = Number.isNaN(dateObj.getTime())
        ? 'Unknown Date'
        : this.monthYearFormatter.format(dateObj);

      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.label !== label) {
        groups.push({ label, items: [updateItem] });
      } else {
        currentGroup.items.push(updateItem);
      }
    }
    return groups;
  }

  trackByGroup(index: number, group: { label: string }): string {
    return `${group?.label ?? 'unknown'}-${index}`;
  }

  trackByUpdate(index: number, updateItem: any): string {
    const id = updateItem?._id;
    return typeof id === 'string' && id.trim() ? id : `update-${index}`;
  }

  changesDoneFor(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeText(item))
        .filter((item) => !!item);
    }
    const text = this.normalizeText(value);
    if (!text) return [];
    return [text];
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private applyActionMessageFromQuery() {
    const action = this.route.snapshot.queryParamMap.get('action');
    if (action === 'approved') {
      this.feedback.showMessage('Update approved and applied successfully!', 'success');
    } else if (action === 'rejected') {
      this.feedback.showMessage('Update request cancelled successfully!', 'danger');
    } else {
      return;
    }
    this.clearActionQueryParamWithoutNavigation();
  }

  private openUpdateConfirm(update: any, action: 'approve' | 'reject') {
    const id = String(update?._id ?? '').trim();
    if (!id) return;
    this.updateConfirm = {
      id,
      action,
      title: String(
        update?.case_title || this.originals[update?.originalCaseId]?.case_title || 'this update request'
      ),
    };
  }

  closeUpdateConfirm() {
    if (this.isSubmittingAction) return;
    this.updateConfirm = null;
  }

  async confirmUpdateAction() {
    if (!this.updateConfirm || this.isSubmittingAction) return;
    this.isSubmittingAction = true;
    const { id, action } = this.updateConfirm;
    try {
      if (action === 'approve') {
        await firstValueFrom(this.adminService.approveUpdate(id));
        this.feedback.showMessage('Update approved and applied successfully!', 'success');
      } else {
        await firstValueFrom(this.adminService.denyUpdate(id));
        this.feedback.showMessage('Update request cancelled successfully!', 'danger');
      }
      this.updates = this.updates.filter((u) => u._id !== id);
      this.syncPage();
    } catch {
      this.feedback.showError(action === 'approve' ? 'Error approving update.' : 'Error denying update.');
    } finally {
      this.isSubmittingAction = false;
      this.updateConfirm = null;
    }
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

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.totalUpdates === 0;
  }

  get pageSummary() {
    if (this.totalUpdates === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalUpdates, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalUpdates}`;
  }

  private syncPage() {
    const total = this.totalPages;
    if (this.currentPage > total) this.currentPage = total;
    if (this.currentPage < 1) this.currentPage = 1;
  }

  private clearActionQueryParamWithoutNavigation() {
    if (typeof window === 'undefined') return;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('action');
    const next = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }

  private scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
