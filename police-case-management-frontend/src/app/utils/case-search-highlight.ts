function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value
      .map((item) => toDisplayText(item))
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
      .map((item) => toDisplayText(item))
      .filter((item) => !!item)
      .join(' ');
  }

  return String(value);
}

function shouldHighlightField(searchField: string, fieldKey?: string): boolean {
  if (searchField === 'for-all') return true;
  if (!fieldKey) return false;
  return searchField === fieldKey;
}

function getHighlightTerm(searchField: string, searchValue: string): string {
  const query = String(searchValue ?? '').trim();
  if (!query) return '';

  if (searchField === 'isApproved') {
    if (query === '1') return 'Approved';
    if (query === '0') return 'Pending';
  }

  if (searchField === 'case_date') {
    const match = query.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return query;
}

export function highlightCaseSearchText(
  value: unknown,
  fallback: string,
  fieldKey: string | undefined,
  searchField: string,
  searchValue: string
): string {
  const plainText = toDisplayText(value).trim() || fallback;
  const safeText = escapeHtml(plainText);
  const term = getHighlightTerm(searchField, searchValue);
  if (!term) return safeText;
  if (!shouldHighlightField(searchField, fieldKey)) return safeText;

  const safeTermRegex = escapeRegExp(term);
  if (!safeTermRegex) return safeText;

  const regex = new RegExp(`(${safeTermRegex})`, 'gi');
  return safeText.replace(regex, '<span class="search-highlight-inline">$1</span>');
}
