export type PersonDisplay = {
  name: string;
  age: string;
};

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function parsePeople(value: unknown): PersonDisplay[] {
  if (Array.isArray(value)) {
    return value
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') return null;
        const name = normalizeText(entry.name);
        if (!name) return null;
        const ageValue =
          entry.age === null || entry.age === undefined || entry.age === ''
            ? 'Unidentified'
            : String(entry.age);
        return { name, age: ageValue };
      })
      .filter((entry): entry is PersonDisplay => !!entry);
  }

  const text = normalizeText(value);
  if (!text || text.toUpperCase() === 'N/A') return [];

  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const withAge = part.match(/^Name:\s*(.+?)\s+Age:\s*([^,]+)$/i);
      if (withAge) {
        const parsedAge = normalizeText(withAge[2]);
        return {
          name: normalizeText(withAge[1]),
          age: parsedAge || 'Unidentified',
        };
      }

      const nameOnly = part.match(/^Name:\s*(.+)$/i);
      if (nameOnly) {
        return {
          name: normalizeText(nameOnly[1]),
          age: 'Unidentified',
        };
      }

      return {
        name: normalizeText(part),
        age: 'Unidentified',
      };
    })
    .filter((entry) => !!entry.name);
}

export function peopleForCaseField(
  caseItem: any,
  field: 'victim' | 'suspects' | 'guilty_name'
): PersonDisplay[] {
  return parsePeople(caseItem?.[field]);
}

export function peopleNameColumnWidthFor(caseItem: any): string {
  const people = [
    ...peopleForCaseField(caseItem, 'victim'),
    ...peopleForCaseField(caseItem, 'suspects'),
    ...peopleForCaseField(caseItem, 'guilty_name'),
  ];
  const longest = people.reduce((max, person) => {
    const displayLength = `Name: ${person.name}`.length;
    return displayLength > max ? displayLength : max;
  }, 10);
  return `${longest}ch`;
}

export function displayDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'N/A';

  const dateObj = new Date(raw);
  if (Number.isNaN(dateObj.getTime())) return raw;

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
}

export function displayApproval(value: unknown): string {
  return value ? 'Approved' : 'Pending';
}

export function shouldShowCaseField(searchField: string, field: string): boolean {
  if (searchField === 'for-all') return true;
  if (searchField === 'case_title') return false;
  return searchField === field;
}
