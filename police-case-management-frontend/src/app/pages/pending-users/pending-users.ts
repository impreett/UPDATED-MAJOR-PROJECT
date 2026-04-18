import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';

@Component({
  selector: 'app-pending-users',
  imports: [CommonModule, FormsModule, AppStatePanel],
  templateUrl: './pending-users.html',
  styleUrl: './pending-users.css',
})
export class PendingUsers implements OnInit {
  users: any[] = [];
  loading = true;
  errorMessage = '';
  userConfirm:
    | {
        id: string;
        name: string;
        action: 'unsuspend' | 'remove';
      }
    | null = null;
  isSubmittingAction = false;
  searchValue = '';
  pageSize = 30;
  readonly pageSizeOptions = [30];
  currentPage = 1;

  constructor(
    private adminService: AdminService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchSuspendedInspectors();
  }

  async fetchSuspendedInspectors() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const res = await firstValueFrom(this.adminService.getSuspendedInspectors());
      this.users = res || [];
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Failed to fetch suspended inspectors.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
      this.syncPage();
    }
  }

  handleUnsuspend(user: any) {
    this.openUserConfirm(user, 'unsuspend');
  }

  handleRemove(user: any) {
    this.openUserConfirm(user, 'remove');
  }

  private openUserConfirm(user: any, action: 'unsuspend' | 'remove') {
    const id = String(user?._id ?? '');
    if (!id) return;
    this.userConfirm = {
      id,
      name: String(user?.fullname ?? 'this inspector'),
      action,
    };
  }

  closeUserConfirm() {
    if (this.isSubmittingAction) return;
    this.userConfirm = null;
  }

  async confirmUserAction() {
    if (!this.userConfirm || this.isSubmittingAction) return;
    this.isSubmittingAction = true;
    const { id, action } = this.userConfirm;
    try {
      if (action === 'unsuspend') {
        await firstValueFrom(this.adminService.unsuspendInspector(id));
        this.feedback.showMessage('Inspector unsuspended successfully.', 'success');
      } else {
        await firstValueFrom(this.adminService.denyUser(id));
        this.feedback.showMessage('Inspector removed successfully.', 'success');
      }
      this.users = this.users.filter((user) => user._id !== id);
      this.syncPage();
    } catch (err) {
      console.error(err);
      this.feedback.showError(action === 'unsuspend' ? 'Error unsuspending inspector.' : 'Error removing inspector.');
    } finally {
      this.isSubmittingAction = false;
      this.userConfirm = null;
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
