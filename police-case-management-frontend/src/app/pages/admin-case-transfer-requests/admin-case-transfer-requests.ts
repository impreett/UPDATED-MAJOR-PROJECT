import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AdminService } from '../../services/admin';
import { CaseTransferService } from '../../services/case-transfer';

@Component({
  selector: 'app-admin-case-transfer-requests',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './admin-case-transfer-requests.html',
  styleUrl: './admin-case-transfer-requests.css',
})
export class AdminCaseTransferRequests implements OnInit {
  allRequests: any[] = [];
  activeTab: 'pending' | 'transferred' | 'rejected' = 'pending';
  loading = true;
  errorMessage = '';
  pageSize = 30;
  currentPage = 1;

  transferModal: { request: any } | null = null;
  activeInspectors: any[] = [];
  loadingInspectors = false;
  assigningId = '';

  constructor(
    private transferService: CaseTransferService,
    private adminService: AdminService,
    private feedback: AppFeedbackService
  ) {}

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  async ngOnInit() {
    await this.fetchRequests();
  }

  async fetchRequests() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom(this.transferService.getAllRequests());
      const payload = Array.isArray(response)
        ? response
        : Array.isArray((response as any)?.requests)
        ? (response as any).requests
        : [];
      this.allRequests = payload.filter(
        (request: any) => this.normalizeText(request?.case_status).toUpperCase() === 'ACTIVE'
      );
      this.currentPage = 1;
    } catch (err) {
      console.error(err);
      this.errorMessage = 'Failed to load transfer requests.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
    }
  }

  openTransferModal(request: any) {
    if (!request) return;
    this.transferModal = { request };
    this.loadInspectors();
  }

  async rejectRequest(request: any) {
    if (!request?._id) return;
    const confirmed = await this.feedback.confirm({
      title: 'Reject transfer request',
      message: `Reject transfer request for "${request.case_title || 'this case'}"?`,
      confirmLabel: 'Reject',
      cancelLabel: 'Cancel',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    try {
      await firstValueFrom(this.transferService.rejectTransfer(String(request._id)));
      this.feedback.showMessage('Transfer request rejected.', 'success');
      await this.fetchRequests();
    } catch (err: any) {
      console.error(err);
      this.feedback.showError(err?.error?.msg || 'Failed to reject transfer request.');
    }
  }

  closeTransferModal() {
    if (this.assigningId) return;
    this.transferModal = null;
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
      const excludeId = String(this.transferModal?.request?.from_inspector_id || '');
      this.activeInspectors = payload.filter((inspector: any) => {
        if (!inspector?._id) return false;
        if (excludeId && String(inspector._id) === excludeId) return false;
        return true;
      });
    } catch (err) {
      console.error(err);
      this.feedback.showError('Failed to load active inspectors.');
    } finally {
      this.loadingInspectors = false;
    }
  }

  async assignTransfer(inspector: any) {
    if (!this.transferModal?.request?._id || !inspector?._id || this.assigningId) return;
    this.assigningId = String(inspector._id);
    try {
      await firstValueFrom(
        this.transferService.assignTransfer(String(this.transferModal.request._id), String(inspector._id))
      );
      this.feedback.showMessage('Case transferred successfully.', 'success');
      await this.fetchRequests();
      this.transferModal = null;
    } catch (err: any) {
      console.error(err);
      this.feedback.showError(err?.error?.msg || 'Failed to transfer case.');
    } finally {
      this.assigningId = '';
    }
  }

  statusLabel(request: any) {
    return String(request?.status || '').toUpperCase() || 'PENDING';
  }

  setTab(tab: 'pending' | 'transferred' | 'rejected') {
    this.activeTab = tab;
    this.currentPage = 1;
  }

  get requests() {
    return this.allRequests.filter(req => {
      const status = this.statusLabel(req);
      if (this.activeTab === 'pending') return status === 'PENDING';
      if (this.activeTab === 'transferred') return status === 'APPROVED';
      if (this.activeTab === 'rejected') return status === 'REJECTED';
      return false;
    });
  }

  get isEmpty() {
    return !this.loading && !this.errorMessage && this.requests.length === 0;
  }

  get totalCases() {
    return this.requests.length;
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

  get pagedRequests() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.requests.slice(start, start + size);
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
