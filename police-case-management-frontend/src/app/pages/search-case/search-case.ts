import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { AdminService } from '../../services/admin';
import { CaseService } from '../../services/case';
import { SearchMemoryService } from '../../services/search-memory.service';

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

type PersonDisplay = {
  name: string;
  age: string;
};

@Component({
  selector: 'app-search-case',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './search-case.html',
  styleUrl: './search-case.css',
})
export class SearchCase implements OnInit, OnDestroy {
  cases: any[] = [];
  loading = false;
  searchField: SearchField = 'for-all';
  searchQuery = '';
  officers: string[] = [];
  user: any = null;
  todayStr = new Date().toISOString().split('T')[0];
  pageSize = 30;
  currentPage = 1;
  private readonly searchStateKey = 'search-case';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private auth: AuthService,
    private adminService: AdminService,
    private caseService: CaseService,
    private searchMemory: SearchMemoryService
  ) {}

  async ngOnInit() {
    this.user = this.auth.getUser();
    this.restoreSearchState();
    try {
      const res = await firstValueFrom(this.caseService.getOfficers({ includeSuspended: true }));
      this.officers = (res || []).map((o: any) => o.fullname || o);
    } catch {
      console.error('Failed to fetch officers');
    }
    await this.fetchCases();
  }

  async fetchCases() {
    this.loading = true;
    try {
      const query = String(this.searchQuery ?? '').trim();
      const params = {
        field: this.searchField,
        query,
        page: 1,
        limit: 0,
      };
      const res = this.user?.isAdmin
        ? await firstValueFrom(this.adminService.searchCases(params))
        : await firstValueFrom(this.caseService.getCases(params));
      this.cases = res || [];
      this.currentPage = 1;
    } catch (err) {
      console.error('Error fetching cases:', err);
      this.cases = [];
    } finally {
      this.loading = false;
    }
  }

  onSearchFieldChange(value: string) {
    this.searchField = this.isSearchField(value) ? value : 'for-all';
    this.searchQuery = '';
    this.currentPage = 1;
    this.persistSearchState();
    this.scheduleFetchCases();
  }

  onSearchQueryChange(value: string) {
    this.searchQuery = value;
    this.currentPage = 1;
    this.persistSearchState();
    this.scheduleFetchCases();
  }

  ngOnDestroy() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  shouldShowField(field: string): boolean {
    if (this.searchField === 'for-all') return true;
    if (this.searchField === 'case_title') return false;
    return this.searchField === field;
  }

  peopleForCaseField(caseItem: any, field: 'victim' | 'suspects' | 'guilty_name'): PersonDisplay[] {
    return this.parsePeople(caseItem?.[field]);
  }

  peopleNameColumnWidthFor(caseItem: any): string {
    const people = [
      ...this.peopleForCaseField(caseItem, 'victim'),
      ...this.peopleForCaseField(caseItem, 'suspects'),
      ...this.peopleForCaseField(caseItem, 'guilty_name'),
    ];
    const longest = people.reduce((max, person) => {
      const displayLength = `Name: ${person.name}`.length;
      return displayLength > max ? displayLength : max;
    }, 10);
    return `${longest}ch`;
  }

  highlightText(value: unknown, fallback = '', fieldKey?: string): string {
    const plainText = this.toDisplayText(value).trim() || fallback;
    return this.applyHighlight(plainText, fieldKey);
  }

  displayDate(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return 'N/A';

    const dateObj = new Date(raw);
    if (Number.isNaN(dateObj.getTime())) return raw;

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}-${month}-${year}`;
  }

  displayApproval(value: unknown): string {
    return value ? 'Approved' : 'Pending';
  }

  private applyHighlight(text: string, fieldKey?: string): string {
    const safeText = this.escapeHtml(text);
    const term = this.getHighlightTerm();
    if (!term) return safeText;
    if (!this.shouldHighlightField(fieldKey)) return safeText;

    const safeTermRegex = this.escapeRegExp(term);
    if (!safeTermRegex) return safeText;

    const regex = new RegExp(`(${safeTermRegex})`, 'gi');
    return safeText.replace(regex, '<span class="search-highlight-inline">$1</span>');
  }

  private shouldHighlightField(fieldKey?: string): boolean {
    if (this.searchField === 'for-all') return true;
    if (!fieldKey) return false;
    return this.searchField === fieldKey;
  }

  private getHighlightTerm(): string {
    const query = String(this.searchQuery ?? '').trim();
    if (!query) return '';

    if (this.searchField === 'isApproved') {
      if (query === '1') return 'Approved';
      if (query === '0') return 'Pending';
    }

    if (this.searchField === 'case_date') {
      const match = query.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    }

    return query;
  }

  private toDisplayText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      return value
        .map((item) => this.toDisplayText(item))
        .filter((item) => !!item)
        .join(', ');
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const maybeName = String(obj['name'] ?? '').trim();
      const maybeAge = String(obj['age'] ?? '').trim();
      if (maybeName || maybeAge) {
        const parts = [];
        if (maybeName) parts.push(`Name: ${maybeName}`);
        if (maybeAge) parts.push(`Age: ${maybeAge}`);
        return parts.join(' ');
      }
      return Object.values(obj)
        .map((item) => this.toDisplayText(item))
        .filter((item) => !!item)
        .join(' ');
    }

    return String(value);
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private scheduleFetchCases() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.fetchCases();
    }, 250);
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

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isSearchField(value: string): value is SearchField {
    const allowed: SearchField[] = [
      'for-all',
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
    return allowed.includes(value as SearchField);
  }

  private restoreSearchState() {
    const state = this.searchMemory.load<{ searchField?: unknown; searchQuery?: unknown }>(
      this.searchStateKey
    );
    if (!state) return;

    const storedField = String(state.searchField ?? '').trim();
    const resolvedField = this.isSearchField(storedField) ? storedField : 'for-all';
    const isAdminOnlyField = resolvedField === 'isApproved';
    this.searchField = isAdminOnlyField && !this.user?.isAdmin ? 'for-all' : resolvedField;
    this.searchQuery = typeof state.searchQuery === 'string' ? state.searchQuery : '';
  }

  private persistSearchState() {
    this.searchMemory.save(this.searchStateKey, {
      searchField: this.searchField,
      searchQuery: this.searchQuery,
    });
  }

  get totalCases() {
    return this.cases.length;
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
    return this.cases.slice(start, start + size);
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
