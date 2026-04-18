import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';

@Component({
  selector: 'app-active-users',
  imports: [CommonModule, FormsModule, AppStatePanel],
  templateUrl: './active-users.html',
  styleUrl: './active-users.css',
})
export class ActiveUsers implements OnInit {
  users: any[] = [];
  loading = true;
  errorMessage = '';
  suspendConfirm: { id: string; name: string } | null = null;
  isSuspending = false;
  searchValue = '';
  pageSize = 30;
  readonly pageSizeOptions = [30];
  currentPage = 1;

  constructor(
    private adminService: AdminService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchActiveUsers();
  }

  async fetchActiveUsers() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const res = await firstValueFrom(this.adminService.getActiveUsers());
      const payload: any = res;
      const normalized = Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : [];
      this.users = normalized;
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Failed to fetch active inspectors.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
      this.syncPage();
    }
  }

  handleSuspend(userId: string, fullname: string) {
    this.suspendConfirm = { id: userId, name: fullname || 'this inspector' };
  }

  closeSuspendConfirm() {
    if (this.isSuspending) return;
    this.suspendConfirm = null;
  }

  async confirmSuspend() {
    if (!this.suspendConfirm || this.isSuspending) return;
    this.isSuspending = true;
    try {
      await firstValueFrom(this.adminService.suspendInspector(this.suspendConfirm.id));
      this.users = this.users.filter((u) => u._id !== this.suspendConfirm?.id);
      this.syncPage();
      this.feedback.showMessage('Inspector suspended successfully.', 'success');
    } catch (err) {
      console.error(err);
      this.feedback.showError('Error suspending inspector.');
    } finally {
      this.isSuspending = false;
      this.suspendConfirm = null;
    }
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

  get filteredUsers() {
    const query = this.normalizeText(this.searchValue).toLowerCase();
    if (!query) return this.users;
    return this.users.filter((user) => {
      const haystack = [
        user?.fullname,
        user?.email,
        user?.city,
        user?.police_id,
        user?.contact,
      ]
        .map((value) => this.normalizeText(value))
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  get totalUsers() {
    return this.filteredUsers.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalUsers / size));
  }

  get pagedUsers() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.filteredUsers.slice(start, start + size);
  }

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.totalUsers === 0;
  }

  get pageSummary() {
    if (this.totalUsers === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalUsers, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalUsers}`;
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
