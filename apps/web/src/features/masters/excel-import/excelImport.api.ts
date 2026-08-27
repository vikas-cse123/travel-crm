export type SupportedMasterType =
  | 'CITY'
  | 'AIRLINE'
  | 'CRUISE'
  | 'VEHICLE'
  | 'ADD_ON_SERVICE'
  | 'DESTINATION'
  | 'SIGHTSEEING';

export interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  data: Record<string, unknown>;
  errors: Array<{ row: number; field: string; header: string; value: string | null; message: string }>;
  isValid: boolean;
  embeddedImageCount: number;
  imageStatus: 'none' | 'ok' | 'invalid';
  images: Array<{ fileName: string; mimeType: string | null; size: number }>;
}

export interface PreviewResult {
  masterType: SupportedMasterType;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: PreviewRow[];
  headers: string[];
  columnMappings: Array<{ excelHeader: string; crmField: string | null; confidence: string }>;
  unmappedColumns: string[];
}

export interface ImportResult {
  masterType: SupportedMasterType;
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  errors?: Array<{ row: number; field: string; header: string; value: string | null; message: string }>;
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${encodeURIComponent(name)}=`));
  return match ? decodeURIComponent(match.slice(match.indexOf('=') + 1)) : undefined;
}

export async function downloadTemplate(masterType: SupportedMasterType): Promise<Blob> {
  const response = await fetch(`/api/masters/import/template/${masterType}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to download template');
  return response.blob();
}

export async function previewImport(masterType: SupportedMasterType, file: File): Promise<PreviewResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('masterType', masterType);
  const csrf = readCookie('interscale_csrf');
  const init: RequestInit = {
    method: 'POST',
    body: form,
    credentials: 'include',
    ...(csrf ? { headers: { 'X-CSRF-Token': csrf } } : {}),
  };
  const res = await fetch(`/api/masters/import/preview`, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Preview failed');
  return json.data as PreviewResult;
}

export async function executeImport(masterType: SupportedMasterType, file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('masterType', masterType);
  const csrf = readCookie('interscale_csrf');
  const init: RequestInit = {
    method: 'POST',
    body: form,
    credentials: 'include',
    ...(csrf ? { headers: { 'X-CSRF-Token': csrf } } : {}),
  };
  const res = await fetch(`/api/masters/import/execute`, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? json.error?.details ?? 'Import failed');
  return json.data as ImportResult;
}

export async function downloadErrorReport(masterType: SupportedMasterType, file: File): Promise<Blob> {
  const form = new FormData();
  form.append('file', file);
  form.append('masterType', masterType);
  const csrf = readCookie('interscale_csrf');
  const init: RequestInit = {
    method: 'POST',
    body: form,
    credentials: 'include',
    ...(csrf ? { headers: { 'X-CSRF-Token': csrf } } : {}),
  };
  const res = await fetch(`/api/masters/import/error-report`, init);
  if (!res.ok) throw new Error('Failed to generate error report');
  return res.blob();
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
