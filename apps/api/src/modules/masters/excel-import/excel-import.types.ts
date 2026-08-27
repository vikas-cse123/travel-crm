export const SUPPORTED_IMPORT_TYPES = [
  'CITY',
  'AIRLINE',
  'CRUISE',
  'VEHICLE',
  'ADD_ON_SERVICE',
  'DESTINATION',
  'SIGHTSEEING',
  'HOTEL',
] as const;
export type SupportedImportType = (typeof SUPPORTED_IMPORT_TYPES)[number];

import type { Prisma } from '@prisma/client';
import type { ZodType } from 'zod';
import type { AuthContext } from '../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../masters/masters.service.js';

export interface ImportColumnDefinition {
  field: string;
  header: string;
  aliases: string[];
  required: boolean;
  example?: string;
  description: string;
}

/** A single image embedded in an Excel data row (extracted from xl/media). */
export interface EmbeddedImage {
  buffer: Buffer;
  /** Original file name reported by the workbook (name + extension). */
  fileName: string;
  /** Magic-byte sniffed mime type, or null when the bytes are unrecognised. */
  mimeType: string | null;
  size: number;
}

export interface RowError {
  row: number; // Excel row number (1-based including header)
  field: string;
  header: string;
  value: string | null;
  message: string;
}

export interface UniquenessCheck {
  key: string;
  field: string;
  header: string;
}

export interface PreviewRow {
  rowNumber: number;
  data: Record<string, unknown>;
  raw: Record<string, string>;
  errors: RowError[];
  isValid: boolean;
  /** Number of embedded images anchored to this Excel row (0 = none). */
  embeddedImageCount: number;
  /** Human-oriented per-row image status for the client. */
  imageStatus: 'none' | 'ok' | 'invalid';
  /** Per-image summary (no binaries leave the server). */
  images: Array<{ fileName: string; mimeType: string | null; size: number }>;
}

export interface PreviewResult {
  masterType: SupportedImportType;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: PreviewRow[];
  headers: string[];
  columnMappings: Array<{ excelHeader: string; crmField: string | null; confidence: 'exact' | 'alias' | 'unmapped' }>;
  unmappedColumns: string[];
}

export interface ImportResult {
  masterType: SupportedImportType;
  totalRows: number;
  /** Valid rows that were actually created. */
  createdCount: number;
  /** Invalid/duplicate rows that were skipped (never created). */
  skippedCount: number;
  /** Errors for the skipped rows. A fatal error is reported with `row: 0`. */
  errors?: RowError[];
}

export interface ImportApplyImageArgs {
  /** Validated row data. */
  input: Record<string, unknown>;
  /**
   * Every embedded image anchored to the row, in the order the drawing
   * anchors appear in the XLSX. The adapter decides how to store them.
   */
  images: EmbeddedImage[];
  /** Id of the freshly created record the images belong to. */
  recordId: string;
  auth: AuthContext;
  context: MastersRequestContext;
}

/** Outcome of the optional per-row reference resolution step. */
export interface ResolveRowResult {
  /** Input ready for `create` (e.g. reference names resolved to ids). */
  resolved: Record<string, unknown>;
  /** Per-row problems that make the row invalid. */
  problems: Array<{ field: string; header: string; value: string | null; message: string }>;
}

export interface ImportAdapter {
  masterType: SupportedImportType;
  permission: string;
  columns: ImportColumnDefinition[];
  /**
   * Optional expansion of `columns` based on the actual Excel headers. Used by
   * masters with dynamic column groups (e.g. Cruise Room Types) so the importer
   * recognises any number of user-added groups, not just the template's.
   */
  resolveColumns?: (headers: string[]) => ImportColumnDefinition[];
  zodSchema: ZodType;
  duplicateKeys: (
    input: Record<string, unknown>,
    auth: AuthContext,
  ) => UniquenessCheck[] | Promise<UniquenessCheck[]>;
  existingKeys: (companyId: string) => Promise<Set<string>>;
  /** Create the record and return its id. */
  create: (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => Promise<string>;
  /** Image capability constraints, present only for image-capable masters. */
  image?: { mimeTypes: readonly string[]; maxBytes: number };
  /**
   * Optional per-row resolution for relational/reference fields (e.g. resolving
   * city names to ids for Destinations). Runs during preview AND execute.
   */
  resolveRow?: (input: Record<string, unknown>, auth: AuthContext) => Promise<ResolveRowResult>;
  /**
   * Attach the row's embedded images through the exact same storage
   * implementation used when a master is created manually.
   */
  applyImage?: (args: ImportApplyImageArgs) => Promise<void>;
}