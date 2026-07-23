/**
 * Shared CSV helpers (Phase 19).
 *
 * Centralises the field-escaping and row-serialisation logic that the reports
 * exports rely on so every export quotes identically and applies the same row
 * cap. Existing Lead/Customer/Vendor exports keep their own inline builders
 * untouched; this utility is used by the new Reports exports and is available
 * for future consolidation.
 */

/** Quote a single field, escaping embedded quotes (RFC-4180 style). */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replaceAll('"', '""')}"`;
}

/** Full ISO-8601 timestamp, or '' for a missing/invalid date. */
export function csvDateTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Calendar date (YYYY-MM-DD), or '' for a missing/invalid date. */
export function csvDate(value: Date | string | null | undefined): string {
  const iso = csvDateTime(value);
  return iso ? iso.slice(0, 10) : '';
}

/** A file-name-safe slug + ISO date, e.g. `bookings-2026-07-24.csv`. */
export function csvFileName(prefix: string, on: Date = new Date()): string {
  const slug = prefix.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-') || 'report';
  return `${slug}-${on.toISOString().slice(0, 10)}.csv`;
}

export interface BuildCsvOptions {
  /** Maximum data rows to emit (excludes the header). Default 5000. */
  rowLimit?: number;
  /** Prefix a UTF-8 BOM so spreadsheet apps detect encoding. Default false. */
  bom?: boolean;
}

export interface BuiltCsv {
  content: string;
  /** Data rows actually written (never exceeds rowLimit). */
  exportedCount: number;
  /** True when input rows exceeded rowLimit and were cut. */
  truncated: boolean;
  rowLimit: number;
}

/**
 * Serialise a header + rows into CSV, enforcing a row cap and reporting whether
 * truncation occurred. Rows beyond `rowLimit` are dropped and `truncated` is set
 * so callers can surface it — never a silent cut.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
  options: BuildCsvOptions = {},
): BuiltCsv {
  const rowLimit = options.rowLimit ?? 5000;
  const truncated = rows.length > rowLimit;
  const limited = truncated ? rows.slice(0, rowLimit) : rows;
  const serialise = (cols: readonly unknown[]) => cols.map(csvField).join(',');
  const body = [serialise(headers), ...limited.map(serialise)].join('\n');
  return {
    content: (options.bom ? '\uFEFF' : '') + body,
    exportedCount: limited.length,
    truncated,
    rowLimit,
  };
}
