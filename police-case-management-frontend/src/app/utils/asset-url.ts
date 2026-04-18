import { API_BASE } from '../services/config';

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function assetBaseUrl(): string {
  const base = normalizeText(API_BASE);
  if (!base) return '';
  return base.replace(/\/api\/?$/i, '');
}

export function toAbsoluteAssetUrl(rawUrl: unknown): string {
  const url = normalizeText(rawUrl);
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const assetBase = assetBaseUrl();
  if (!assetBase) return url;

  if (url.startsWith('/')) return `${assetBase}${url}`;
  return `${assetBase}/${url}`;
}
