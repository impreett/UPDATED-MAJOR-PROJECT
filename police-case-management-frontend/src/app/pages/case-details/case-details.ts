import { CommonModule, Location } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';
import { API_BASE } from '../../services/config';

type PersonDisplay = {
  name: string;
  age: string;
};

type EvidenceDisplay = {
  name: string;
  url: string;
  fileType: string;
};

@Component({
  selector: 'app-case-details',
  imports: [CommonModule, RouterLink],
  templateUrl: './case-details.html',
  styleUrl: './case-details.css',
})
export class CaseDetails implements OnInit, OnDestroy {
  caseItem: any = null;
  loading = true;
  error: string | null = null;
  user: any = null;
  actionMessage = '';
  actionMessageType: 'success' | 'danger' | 'info' = 'info';
  private actionMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly actionMessageDurationMs = 7000;
  id = '';
  navigationSource = '';
  victimPeople: PersonDisplay[] = [];
  suspectPeople: PersonDisplay[] = [];
  guiltyPeople: PersonDisplay[] = [];
  changesDone: string[] = [];
  evidence: EvidenceDisplay[] = [];
  private pendingDecisionCompleted = false;

  constructor(
    private route: ActivatedRoute,
    private location: Location,
    private router: Router,
    private auth: AuthService,
    private adminService: AdminService,
    private caseService: CaseService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.navigationSource = this.route.snapshot.queryParamMap.get('from') || '';
    this.user = this.auth.getUser();

    try {
      let res;
      if (this.user?.isAdmin) {
        res = await firstValueFrom(this.adminService.getCaseById(this.id));
      } else {
        res = await firstValueFrom(this.caseService.getCaseById(this.id));
      }
      this.caseItem = res;
      this.victimPeople = this.parsePeople(this.caseItem?.victim);
      this.suspectPeople = this.parsePeople(this.caseItem?.suspects);
      this.guiltyPeople = this.parsePeople(this.caseItem?.guilty_name);
      this.changesDone = this.parseChangesDone(this.caseItem?.changes_done);
      this.evidence = this.parseEvidence(this.caseItem?.evidence);
    } catch {
      this.error = 'Could not fetch case details.';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.clearActionMessageTimer();
  }

  closeActionMessage() {
    this.clearActionMessageTimer();
    this.actionMessage = '';
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private parsePeople(value: unknown): PersonDisplay[] {
    if (Array.isArray(value)) {
      return value
        .map((entry: any) => {
          if (!entry || typeof entry !== 'object') return null;
          const name = this.normalizeText(entry.name);
          if (!name) return null;
          const ageValue =
            entry.age === null || entry.age === undefined || entry.age === ''
              ? 'Unidentified'
              : String(entry.age);
          return { name, age: ageValue };
        })
        .filter((entry): entry is PersonDisplay => !!entry);
    }

    const text = this.normalizeText(value);
    if (!text || text.toUpperCase() === 'N/A') return [];

    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const withAge = part.match(/^Name:\s*(.+?)\s+Age:\s*([^,]+)$/i);
        if (withAge) {
          const parsedAge = this.normalizeText(withAge[2]);
          return {
            name: this.normalizeText(withAge[1]),
            age: parsedAge || 'Unidentified',
          };
        }

        const nameOnly = part.match(/^Name:\s*(.+)$/i);
        if (nameOnly) {
          return {
            name: this.normalizeText(nameOnly[1]),
            age: 'Unidentified',
          };
        }

        return {
          name: this.normalizeText(part),
          age: 'Unidentified',
        };
      })
      .filter((entry) => !!entry.name);
  }

  private parseChangesDone(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeText(item)).filter(Boolean);
    }
    const text = this.normalizeText(value);
    return text ? [text] : [];
  }

  private assetBaseUrl(): string {
    const base = String(API_BASE || '').trim();
    if (!base) return '';
    return base.replace(/\/api\/?$/i, '');
  }

  private toAbsoluteAssetUrl(rawUrl: unknown): string {
    const url = this.normalizeText(rawUrl);
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;

    const assetBase = this.assetBaseUrl();
    if (!assetBase) return url;

    if (url.startsWith('/')) return `${assetBase}${url}`;
    return `${assetBase}/${url}`;
  }

  private parseEvidence(value: unknown): EvidenceDisplay[] {
    if (!Array.isArray(value)) return [];

    const evidence: EvidenceDisplay[] = [];
    for (let i = 0; i < value.length; i++) {
      const entry: any = value[i];
      if (!entry || typeof entry !== 'object') continue;

      const rawUrl = entry.evidence_file_url ?? entry.url ?? entry.file_url;
      const url = this.toAbsoluteAssetUrl(rawUrl);
      if (!url) continue;

      const name = this.normalizeText(entry.evidence_name) || `Evidence ${i + 1}`;
      const fileType = this.normalizeText(entry.evidence_file_type || entry.fileType || entry.mimetype).toLowerCase();
      evidence.push({ name, url, fileType });
    }

    return evidence;
  }

  isImageEvidence(evidence: EvidenceDisplay): boolean {
    return String(evidence?.fileType || '').toLowerCase().startsWith('image/');
  }

  isVideoEvidence(evidence: EvidenceDisplay): boolean {
    return String(evidence?.fileType || '').toLowerCase().startsWith('video/');
  }

  submittedByLabel(caseItem: any): string {
    const name = this.normalizeText(caseItem?.submitted_by_name);
    if (name) return name;

    const role = this.normalizeText(caseItem?.submitted_by_role).toLowerCase();
    if (role === 'citizen') return 'Citizen';
    if (role === 'inspector') return 'Inspector';
    if (role === 'commissioner') return 'Commissioner';
    return role || 'N/A';
  }

  get peopleNameColumnWidth(): string {
    const people = [...this.victimPeople, ...this.suspectPeople, ...this.guiltyPeople];
    const longest = people.reduce((max, person) => {
      const displayLength = `Name: ${person.name}`.length;
      return displayLength > max ? displayLength : max;
    }, 10);
    return `${longest}ch`;
  }

  formatPeopleDisplay(people: PersonDisplay[], emptyText: string): string {
    if (!people.length) return emptyText;
    return people
      .map((person) => `Name: ${person.name}   Age: ${person.age}`)
      .join(', ');
  }

  private inspectorNameForReview(caseItem: any): string {
    const inspectorName = this.normalizeText(caseItem?.citizen_review_by_inspector_name);
    if (inspectorName) return inspectorName;
    const fallbackHandler = this.normalizeText(caseItem?.case_handler);
    if (!fallbackHandler || fallbackHandler.toUpperCase() === 'INSPECTOR REVIEW POOL') return '';
    return fallbackHandler;
  }

  private isCitizenSubmission(caseItem: any): boolean {
    return String(caseItem?.submitted_by_role || '').trim().toLowerCase() === 'citizen';
  }

  private citizenReviewStatus(caseItem: any): string {
    return this.normalizeText(caseItem?.citizen_review_status).toUpperCase();
  }

  private canCommissionerDecideCase(caseItem: any): boolean {
    if (!caseItem || caseItem?.isApproved || caseItem?.is_removed) {
      return false;
    }
    if (!this.isCitizenSubmission(caseItem)) {
      return true;
    }
    return this.citizenReviewStatus(caseItem) === 'COMMISSIONER_REVIEW';
  }

  displayCaseStatus(caseItem: any): string {
    if (caseItem?.withdrawn_by_citizen) {
      return 'Withdrawn by citizen';
    }

    if (!this.isCitizenSubmission(caseItem)) {
      return this.normalizeText(caseItem?.status) || 'N/A';
    }

    const review = this.citizenReviewStatus(caseItem);
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
    return this.normalizeText(caseItem?.status) || (caseItem?.isApproved ? 'Approved' : 'Pending');
  }

  showApprovalRow(caseItem: any): boolean {
    return !this.isCitizenSubmission(caseItem);
  }

  private isCitizenOwnerCase(caseItem: any): boolean {
    return (
      Boolean(this.user?.isCitizen) &&
      this.isCitizenSubmission(caseItem) &&
      String(caseItem?.submitted_by_user || '') === String(this.user?.id || '')
    );
  }

  private canCitizenManageCase(caseItem: any): boolean {
    if (!this.isCitizenOwnerCase(caseItem)) return false;
    if (caseItem?.withdrawn_by_citizen) return false;
    if (caseItem?.is_removed && !caseItem?.withdrawn_by_citizen) return false;

    const review = this.citizenReviewStatus(caseItem);
    if (!review) {
      return !caseItem?.isApproved && !caseItem?.is_removed;
    }

    return review === 'INSPECTOR_REVIEW' || review === 'COMMISSIONER_REVIEW';
  }

  async handleApprove() {
    try {
      await firstValueFrom(this.adminService.approveCase(this.id));
      this.showActionMessage('Case approved!', 'success');
      if (this.caseItem) {
        this.caseItem = {
          ...this.caseItem,
          isApproved: true,
          updated_on: new Date().toISOString(),
          citizen_review_status: this.isCitizenSubmission(this.caseItem)
            ? 'COMMISSIONER_APPROVED'
            : this.caseItem.citizen_review_status,
        };
      }
      this.pendingDecisionCompleted = true;
      window.scrollTo(0, 0);
    } catch (err: any) {
      this.showActionMessage(err?.error?.msg || 'Error approving case.', 'danger');
      window.scrollTo(0, 0);
    }
  }

  async handleDeny() {
    const confirmed = await this.feedback.confirm({
      title: 'Deny case?',
      message: 'Are you sure you want to deny this case?',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.adminService.denyCase(this.id));
      if (this.caseItem) {
        this.caseItem = {
          ...this.caseItem,
          is_removed: true,
          updated_on: new Date().toISOString(),
          citizen_review_status: this.isCitizenSubmission(this.caseItem)
            ? 'COMMISSIONER_REJECTED'
            : this.caseItem.citizen_review_status,
        };
      }
      this.pendingDecisionCompleted = true;
      this.showActionMessage('Case denied!', 'success');
      window.scrollTo(0, 0);
    } catch (err: any) {
      this.showActionMessage(err?.error?.msg || 'Error denying case.', 'danger');
      window.scrollTo(0, 0);
    }
  }

  goBack() {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }
    this.router.navigateByUrl('/');
  }

  private showActionMessage(message: string, type: 'success' | 'danger' | 'info' = 'info') {
    this.clearActionMessageTimer();
    this.actionMessageType = type;
    this.actionMessage = message;
    this.actionMessageTimer = setTimeout(() => {
      this.actionMessage = '';
      this.actionMessageTimer = null;
    }, this.actionMessageDurationMs);
  }

  private clearActionMessageTimer() {
    if (this.actionMessageTimer) {
      clearTimeout(this.actionMessageTimer);
      this.actionMessageTimer = null;
    }
  }

  get showPendingDecisionActions(): boolean {
    return (
      Boolean(this.user?.isAdmin) &&
      this.navigationSource === 'admin-pending-cases' &&
      this.canCommissionerDecideCase(this.caseItem) &&
      !this.pendingDecisionCompleted
    );
  }

  get showRemoveAction(): boolean {
    return (
      Boolean(this.user?.isAdmin) &&
      this.navigationSource === 'admin-remove-case' &&
      Boolean(this.caseItem) &&
      !Boolean(this.caseItem?.is_removed)
    );
  }

  get showRestoreAction(): boolean {
    return (
      Boolean(this.user?.isAdmin) &&
      this.navigationSource === 'admin-removed-cases' &&
      Boolean(this.caseItem) &&
      Boolean(this.caseItem?.is_removed)
    );
  }

  get showCitizenManageActions(): boolean {
    return this.canCitizenManageCase(this.caseItem);
  }

  get citizenEditRoute(): any[] {
    return ['/citizen/edit-case', this.id];
  }

  async handleWithdrawFromCaseDetails() {
    const confirmed = await this.feedback.confirm({
      title: 'Withdraw case?',
      message: 'Are you sure you want to withdraw',
      subject: String(this.caseItem?.case_title || 'this case'),
      messageSuffix: '?',
      confirmLabel: 'Withdraw',
      cancelLabel: 'Cancel',
      confirmTone: 'reject',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    try {
      await firstValueFrom(this.caseService.withdrawCitizenCase(this.id));
      if (this.caseItem) {
        this.caseItem = {
          ...this.caseItem,
          is_removed: true,
          withdrawn_by_citizen: true,
          withdrawn_at: new Date().toISOString(),
          updated_on: new Date().toISOString(),
        };
      }
      this.showActionMessage('Case withdrawn successfully.', 'success');
      window.scrollTo(0, 0);
    } catch (err: any) {
      this.showActionMessage(err?.error?.msg || 'Failed to withdraw case.', 'danger');
      window.scrollTo(0, 0);
    }
  }

  async handleRemoveFromCaseDetails() {
    const confirmed = await this.feedback.confirm({
      title: 'Remove case?',
      message: 'Are you sure you want to remove',
      subject: String(this.caseItem?.case_title || 'this case'),
      messageSuffix: '?',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      confirmTone: 'approve',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    try {
      await firstValueFrom(this.caseService.removeCase(this.id));
      this.showActionMessage('Case removed successfully!', 'success');
      if (this.caseItem) {
        this.caseItem = { ...this.caseItem, is_removed: true };
      }
      window.scrollTo(0, 0);
    } catch {
      this.showActionMessage('Error removing case.', 'danger');
      window.scrollTo(0, 0);
    }
  }

  async handleRestoreFromCaseDetails() {
    try {
      await firstValueFrom(this.caseService.restoreCase(this.id));
      this.showActionMessage('Case restored successfully!', 'success');
      if (this.caseItem) {
        this.caseItem = { ...this.caseItem, is_removed: false };
      }
      window.scrollTo(0, 0);
    } catch {
      this.showActionMessage('Error restoring case.', 'danger');
      window.scrollTo(0, 0);
    }
  }
}
