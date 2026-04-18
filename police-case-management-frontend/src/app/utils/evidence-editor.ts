export type EvidenceEditorEntry = {
  evidence_name: string;
  evidence_file: File | null;
  existing_file_url: string;
  existing_file_type: string;
};

export type EvidenceFieldErrors = {
  evidence_name?: string;
  evidence_file?: string;
};

export const MAX_EVIDENCE_FILE_SIZE_MB = 15;
export const MAX_EVIDENCE_FILE_SIZE_BYTES = MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024;

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createEmptyEvidenceEntry(): EvidenceEditorEntry {
  return {
    evidence_name: '',
    evidence_file: null,
    existing_file_url: '',
    existing_file_type: '',
  };
}

export function parseEvidenceEntries(value: unknown): EvidenceEditorEntry[] {
  if (!Array.isArray(value)) return [];

  const entries = value
    .map<EvidenceEditorEntry | null>((entry: any) => {
      if (!entry || typeof entry !== 'object') return null;
      const evidence_name = normalizeText(entry.evidence_name || entry.name);
      const existing_file_url = normalizeText(entry.evidence_file_url || entry.url);
      if (!evidence_name || !existing_file_url) return null;
      const existing_file_type = normalizeText(
        entry.evidence_file_type || entry.fileType || entry.mimetype
      ).toLowerCase();
      return {
        evidence_name,
        evidence_file: null,
        existing_file_url,
        existing_file_type,
      };
    })
    .filter((entry): entry is EvidenceEditorEntry => entry !== null);

  return entries;
}

export function validateEvidenceEntries(entries: EvidenceEditorEntry[]): {
  errors: EvidenceFieldErrors[];
  hasErrors: boolean;
} {
  const errors = entries.map<EvidenceFieldErrors>((entry) => {
    const rowErrors: EvidenceFieldErrors = {};
    const evidenceName = normalizeText(entry.evidence_name);
    const hasExisting = !!normalizeText(entry.existing_file_url);
    const hasFile = !!entry.evidence_file;

  if (!evidenceName && !hasExisting && !hasFile) {
      return rowErrors;
    }

    if (!evidenceName) {
      rowErrors.evidence_name = 'Evidence name is required.';
    }
    if (!hasExisting && !hasFile) {
      rowErrors.evidence_file = 'Evidence file is required.';
    }
    if (hasFile) {
      const mime = normalizeText(entry.evidence_file?.type).toLowerCase();
      if (!isAllowedEvidenceType(mime)) {
        rowErrors.evidence_file = 'Evidence file must be an image or video.';
      } else if ((entry.evidence_file?.size || 0) > MAX_EVIDENCE_FILE_SIZE_BYTES) {
        rowErrors.evidence_file = `Evidence file must be ${MAX_EVIDENCE_FILE_SIZE_MB} MB or smaller.`;
      }
    }

    return rowErrors;
  });

  return {
    errors,
    hasErrors: errors.some((item) => !!item.evidence_name || !!item.evidence_file),
  };
}

export function buildExistingEvidencePayload(entries: EvidenceEditorEntry[]) {
  return entries
    .filter((entry) => {
      const evidenceName = normalizeText(entry.evidence_name);
      return !!evidenceName && !!normalizeText(entry.existing_file_url) && !entry.evidence_file;
    })
    .map((entry) => ({
      evidence_name: normalizeText(entry.evidence_name),
      evidence_file_url: normalizeText(entry.existing_file_url),
      evidence_file_type:
        normalizeText(entry.existing_file_type).toLowerCase() || 'application/octet-stream',
    }));
}

export function buildNewEvidenceUploadPayload(entries: EvidenceEditorEntry[]) {
  return entries
    .filter((entry) => {
      const evidenceName = normalizeText(entry.evidence_name);
      return !!evidenceName && !!entry.evidence_file;
    })
    .map((entry) => ({
      evidence_name: normalizeText(entry.evidence_name),
      evidence_file: entry.evidence_file as File,
    }));
}

export function isImageEvidenceType(type: unknown): boolean {
  return normalizeText(type).toLowerCase().startsWith('image/');
}

export function isVideoEvidenceType(type: unknown): boolean {
  return normalizeText(type).toLowerCase().startsWith('video/');
}

export function isAllowedEvidenceType(type: unknown): boolean {
  return isImageEvidenceType(type) || isVideoEvidenceType(type);
}
