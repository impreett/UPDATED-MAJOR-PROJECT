import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { SearchMemoryService } from '../../services/search-memory.service';
import {
  displayApproval as formatApproval,
  displayDate as formatDate,
  peopleForCaseField as getPeopleForCaseField,
  peopleNameColumnWidthFor as getPeopleNameColumnWidthFor,
  shouldShowCaseField,
  type PersonDisplay,
} from '../../utils/case-search-display';
import { highlightCaseSearchText } from '../../utils/case-search-highlight';

type SearchField =
  | 'for-all'
  | 'case_title'
  | 'case_type'
  | 'case_description'
  | 'suspects'
  | 'victim'
  | 'guilty_name'
  | 'case_date'
  | 'case_handler'
  | 'status'
  | 'isApproved';

@Component({
  selector: 'app-admin-update-case',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-update-case.html',
  styleUrl: './admin-update-case.css',
})
export class AdminUpdateCase implements OnInit {
  cases: any[] = [];
  loading = true;
  sortOrder: 'latest' | 'oldest' = 'latest';
  searchField: SearchField = 'for-all';
  searchValue = '';
  pageSize = 30;
  currentPage = 1;
  private readonly searchStateKey = 'admin-update-case';
  caseTypes: string[] = [
    'Homicide (Murder)',
    'Manslaughter',
    'Rape / Sexual Assault',
    'Kidnapping / Abduction',
    'Aggravated Assault',
    'Simple Assault / Battery',
    'Robbery',
    'Burglary / House Breaking',
    'Theft (Larceny)',
    'Motor Vehicle Theft',
    'Vandalism / Criminal Damage',
    'Extortion / Blackmail',
    'Cybercrime / Hacking',
    'Fraud / Cheating',
    'Forgery / Counterfeiting',
    'Embezzlement / Breach of Trust',
    'Money Laundering',
    'Drug Offense (NDPS)',
    'Smuggling / Contraband',
    'Illegal Weapons',
    'Illegal Gambling',
    'Public Order / Rioting',
    'Domestic Violence',
    'Missing Person Report',
    'Traffic Accident (Non-Fatal)',
  ];
  todayStr = new Date().toISOString().split('T')[0];
  private readonly searchableFields: SearchField[] = [
    'case_title',
    'case_type',
    'case_description',
    'suspects',
    'victim',
    'guilty_name',
    'case_date',
    'case_handler',
    'status',
    'isApproved',
  ];
  private readonly monthYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  });

  constructor(
    private adminService: AdminService,
    private feedback: AppFeedbackService,
    private searchMemory: SearchMemoryService
  ) {}

  async ngOnInit() {
    this.restoreSearchState();
    try {
      const res = await firstValueFrom(this.adminService.getAllCases());
      this.cases = res || [];
    } catch {
      this.feedback.showError('Failed to fetch cases.');
    } finally {
      this.loading = false;
    }
  }

  setSortOrder(order: 'latest' | 'oldest') {
    this.sortOrder = order;
    this.currentPage = 1;
    this.persistSearchState();
  }

  onSearchFieldChange(value: string) {
    this.searchField = (value as SearchField) || 'for-all';
    this.searchValue = '';
    this.currentPage = 1;
    this.persistSearchState();
  }

  onSearchValueChange(value: string) {
    this.searchValue = value || '';
    this.currentPage = 1;
    this.persistSearchState();
  }

  shouldShowField(field: string): boolean {
    return shouldShowCaseField(this.searchField, field);
  }

  peopleForCaseField(
    caseItem: any,
    field: 'victim' | 'suspects' | 'guilty_name'
  ): PersonDisplay[] {
    return getPeopleForCaseField(caseItem, field);
  }

  peopleNameColumnWidthFor(caseItem: any): string {
    return getPeopleNameColumnWidthFor(caseItem);
  }

  displayDate(value: unknown): string {
    return formatDate(value);
  }

  displayApproval(value: unknown): string {
    return formatApproval(value);
  }

  getUpdateTargetId(caseItem: any): string | null {
    const rawId = caseItem?._id ?? caseItem?.case_id ?? caseItem?.originalCaseId;
    const normalized = String(rawId ?? '').trim();
    if (!normalized) return null;
    if (normalized.toLowerCase() === 'n/a' || normalized.toLowerCase() === 'undefined') return null;
    return normalized;
  }

  highlightText(value: unknown, fallback = '', fieldKey?: string): string {
    return highlightCaseSearchText(value, fallback, fieldKey, this.searchField, this.searchValue);
  }

  get officers() {
    const names = this.cases
      .map((caseItem) => String(caseItem?.case_handler ?? '').trim())
      .filter((name) => !!name);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }

  get filteredCases() {
    const query = this.searchValue;
    const normalizedQuery = this.normalize(query);
    if (!normalizedQuery) return this.cases;

    return this.cases.filter((caseItem) => {
      if (this.searchField === 'for-all') {
        return this.normalize(this.getWholeCaseSearchText(caseItem)).includes(normalizedQuery);
      }

      if (
        this.searchField === 'case_type' ||
        this.searchField === 'case_handler' ||
        this.searchField === 'status'
      ) {
        return this.normalize(caseItem?.[this.searchField]) === normalizedQuery;
      }

      if (this.searchField === 'case_date') {
        return this.getDateValue(caseItem?.case_date) === query;
      }

      if (this.searchField === 'isApproved') {
        if (query !== '1' && query !== '0') return false;
        return Boolean(caseItem?.isApproved) === (query === '1');
      }

      return this.normalize(this.getFieldValue(caseItem, this.searchField)).includes(normalizedQuery);
    });
  }

  get sortedCases() {
    return [...this.filteredCases].sort((a, b) => {
      const aTime = new Date(a?.case_date || 0).getTime();
      const bTime = new Date(b?.case_date || 0).getTime();
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

  private getWholeCaseSearchText(caseItem: any): string {
    const parts: string[] = [];
    const walk = (value: unknown) => {
      if (value === null || value === undefined) return;

      if (value instanceof Date) {
        parts.push(value.toISOString(), this.formatDateForSearch(value));
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }

      if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(walk);
        return;
      }

      if (typeof value === 'boolean') {
        parts.push(value ? 'true approved yes 1' : 'false pending no 0');
        return;
      }

      const text = String(value).trim();
      if (!text) return;

      parts.push(text);

      const parsedDate = new Date(text);
      if (!Number.isNaN(parsedDate.getTime())) {
        parts.push(this.formatDateForSearch(parsedDate), this.getDateValue(text));
      }
    };

    walk(caseItem);
    return parts.join(' ');
  }

  private formatDateForSearch(dateObj: Date): string {
    const localDay = String(dateObj.getDate()).padStart(2, '0');
    const localMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const localYear = dateObj.getFullYear();
    const utcDay = String(dateObj.getUTCDate()).padStart(2, '0');
    const utcMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const utcYear = dateObj.getUTCFullYear();
    return `${localDay}-${localMonth}-${localYear} ${localYear}-${localMonth}-${localDay} ${utcDay}-${utcMonth}-${utcYear} ${utcYear}-${utcMonth}-${utcDay}`;
  }

  private getFieldValue(caseItem: any, field: SearchField): string {
    switch (field) {
      case 'suspects':
        return this.peopleToText(caseItem?.suspects);
      case 'victim':
        return this.peopleToText(caseItem?.victim);
      case 'guilty_name':
        return this.peopleToText(caseItem?.guilty_name);
      case 'case_date':
        return this.getDateSearchText(caseItem?.case_date);
      case 'isApproved':
        return caseItem?.isApproved ? 'approved' : 'pending';
      default:
        return String(caseItem?.[field] ?? '');
    }
  }

  private peopleToText(value: unknown): string {
    if (Array.isArray(value)) {
      return value
        .map((person) => this.personToText(person))
        .filter((text) => !!text)
        .join(' ');
    }
    return this.personToText(value);
  }

  private personToText(value: unknown): string {
    if (value && typeof value === 'object') {
      const person = value as { name?: unknown; age?: unknown };
      return `${String(person.name ?? '')} ${String(person.age ?? '')}`.trim();
    }
    return String(value ?? '');
  }

  private getDateSearchText(value: unknown): string {
    const raw = String(value ?? '');
    const dateObj = new Date(raw);
    if (Number.isNaN(dateObj.getTime())) return raw;

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${raw} ${day}-${month}-${year}`;
  }

  private getDateValue(value: unknown): string {
    const raw = String(value ?? '');
    const rawDateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (rawDateMatch?.[1]) return rawDateMatch[1];

    const dateObj = new Date(raw);
    if (Number.isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalize(value: unknown): string {
    return String(value ?? '').toLowerCase().trim();
  }

  private isSearchField(value: string): value is SearchField {
    return value === 'for-all' || this.searchableFields.includes(value as SearchField);
  }

  private restoreSearchState() {
    const state = this.searchMemory.load<{
      sortOrder?: unknown;
      searchField?: unknown;
      searchValue?: unknown;
    }>(this.searchStateKey);
    if (!state) return;

    if (state.sortOrder === 'latest' || state.sortOrder === 'oldest') {
      this.sortOrder = state.sortOrder;
    }

    const storedField = String(state.searchField ?? '').trim();
    if (this.isSearchField(storedField)) {
      this.searchField = storedField;
    }

    this.searchValue = typeof state.searchValue === 'string' ? state.searchValue : '';
  }

  private persistSearchState() {
    this.searchMemory.save(this.searchStateKey, {
      sortOrder: this.sortOrder,
      searchField: this.searchField,
      searchValue: this.searchValue,
    });
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
