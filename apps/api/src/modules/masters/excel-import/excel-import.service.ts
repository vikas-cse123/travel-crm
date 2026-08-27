import ExcelJS from 'exceljs';
import type {
  SupportedImportType,
  PreviewResult,
  PreviewRow,
  RowError,
  ImportResult,
  EmbeddedImage,
  ImportAdapter,
} from './excel-import.types.js';
import { getAdapter } from './adapters/index.js';
import type { AuthContext } from '../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../masters.service.js';
import { prisma } from '../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { ValidationError } from '../../../utils/errors.js';
import { extractEmbeddedImageEntries } from './embedded-images/image-extractor.js';
import { mapImagesToRows } from './embedded-images/image-row-mapper.js';
import { validateEmbeddedImage } from './embedded-images/image-validation.js';

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

interface ParsedDataRow {
  /** Real Excel row number (header is row 1). Blank rows are skipped but
   *  the remaining rows keep their true numbers so image anchors never drift. */
  rowNumber: number;
  record: Record<string, string>;
  parsed: Record<string, unknown>;
}

async function parseWorkbook(buffer: Buffer): Promise<{
  headers: string[];
  rawRows: Array<{ rowNumber: number; record: Record<string, string> }>;
  headerRowNumber: number;
  imagesByRow: Map<number, EmbeddedImage[]>;
}> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    throw new ValidationError('The file is not a valid Excel (.xlsx) workbook.');
  }
  // Prefer sheet named 'Data', else first sheet
  let sheet = workbook.getWorksheet('Data');
  if (!sheet) sheet = workbook.worksheets[0];
  if (!sheet) throw new ValidationError('No worksheet found in Excel file.');

  let headerRow: ExcelJS.Row | null = null;
  let headerRowNumber = 1;
  // Find first non-empty row as header
  for (let i = 1; i <= Math.min(5, sheet.rowCount); i++) {
    const row = sheet.getRow(i);
    const values = row.values as unknown[];
    const hasData = values.slice(1).some((v) => v != null && String(v).trim() !== '');
    if (hasData) {
      headerRow = row;
      headerRowNumber = i;
      break;
    }
  }
  if (!headerRow) throw new ValidationError('Header row not found.');

  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const val = normalizeCell(cell.value as unknown);
    if (val) headers[colNumber - 1] = val;
    else headers[colNumber - 1] = '';
  });
  while (headers.length && !headers[headers.length - 1]?.trim()) headers.pop();
  const seen = new Map<string, number>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (!n) continue;
    if (seen.has(n)) throw new ValidationError(`Duplicate header: "${h}"`);
    seen.set(n, 1);
  }
  if (headers.filter((h) => h.trim()).length === 0) throw new ValidationError('No headers found.');

  // Collect data rows, retaining the REAL Excel row number.
  const rawRows: Array<{ rowNumber: number; record: Record<string, string> }> = [];
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const hasAny = row.values
      ? (row.values as unknown[]).slice(1).some((v) => v != null && String(v).trim() !== '')
      : false;
    if (!hasAny) continue;
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const cell = row.getCell(idx + 1);
      let val = cell.value as unknown;
      if (val && typeof val === 'object' && 'text' in (val as Record<string, unknown>)) {
        val = (val as { text: string }).text;
      } else if (val && typeof val === 'object' && 'result' in (val as Record<string, unknown>)) {
        val = (val as { result: unknown }).result;
      }
      record[header] = normalizeCell(val);
    });
    rawRows.push({ rowNumber: r, record });
  }

  // Embedded images are grouped by their anchored Excel row.
  const imagesByRow = mapImagesToRows(extractEmbeddedImageEntries(sheet), headerRowNumber);

  return { headers: headers.filter((h) => h.trim()), rawRows, headerRowNumber, imagesByRow };
}

async function validateRowsWithAdapter(
  adapter: ImportAdapter,
  columns: ImportAdapter['columns'],
  rows: ParsedDataRow[],
  auth: AuthContext,
): Promise<Map<number, RowError[]>> {
  const errorsByRow = new Map<number, RowError[]>();
  const seen = new Map<string, number>();
  const existingKeys = await adapter.existingKeys(auth.companyId);

  for (const item of rows) {
    const { rowNumber, parsed, record } = item;
    const rowErrors: RowError[] = [];

    const result = adapter.zodSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? 'unknown');
        const colDef = columns.find((c) => c.field === field);
        rowErrors.push({
          row: rowNumber,
          field,
          header: colDef?.header ?? field,
          value: record[colDef?.header ?? field] ?? null,
          message: issue.message,
        });
      }
    }

    if (result.success) {
      const data = result.data as Record<string, unknown>;
      const checks = await adapter.duplicateKeys(data, auth);
      for (const check of checks) {
        if (seen.has(check.key)) {
          rowErrors.push({
            row: rowNumber,
            field: check.field,
            header: check.header,
            value: String(data[check.field] ?? ''),
            message: `Duplicate ${check.header} in Excel (first seen at row ${seen.get(check.key)}).`,
          });
        } else {
          seen.set(check.key, rowNumber);
        }
        if (existingKeys.has(check.key)) {
          rowErrors.push({
            row: rowNumber,
            field: check.field,
            header: check.header,
            value: String(data[check.field] ?? ''),
            message: `${check.header} already exists in the database.`,
          });
        }
      }
    }

    if (rowErrors.length) errorsByRow.set(rowNumber, rowErrors);
  }
  return errorsByRow;
}

const MASTER_LABEL: Record<SupportedImportType, string> = {
  CITY: 'City',
  AIRLINE: 'Airline',
  CRUISE: 'Cruise',
  VEHICLE: 'Vehicle',
  ADD_ON_SERVICE: 'Add-On Service',
  DESTINATION: 'Destination',
  SIGHTSEEING: 'Sightseeing',
  HOTEL: 'Hotel',
};

async function buildPreview(
  buffer: Buffer,
  masterType: SupportedImportType,
  auth: AuthContext,
  customMapping?: Record<string, string>,
): Promise<{ preview: PreviewResult; embeddedByRowNumber: Map<number, EmbeddedImage[]> }> {
  const adapter = getAdapter(masterType);
  const { headers, rawRows, imagesByRow } = await parseWorkbook(buffer);

  if (rawRows.length === 0) {
    throw new ValidationError('Excel file contains no data rows.');
  }
  if (rawRows.length > 500) {
    throw new ValidationError('Maximum 500 rows per import. Please split your file.');
  }

  // Masters with dynamic column groups (e.g. Cruise Room Types) expand the
  // column set from the actual file headers before any mapping/validation.
  const columns = adapter.resolveColumns ? adapter.resolveColumns(headers) : adapter.columns;

  // Build header -> field map
  const aliasMap = new Map<string, string>();
  for (const col of columns) {
    aliasMap.set(normalizeHeader(col.header), col.field);
    for (const alias of col.aliases) aliasMap.set(normalizeHeader(alias), col.field);
  }

  const columnMappings: Array<{ excelHeader: string; crmField: string | null; confidence: 'exact' | 'alias' | 'unmapped' }> = [];
  const headerToField = new Map<string, string>();
  const usedFields = new Set<string>();

  for (const h of headers) {
    const custom = customMapping?.[h];
    if (custom) {
      const field = columns.find((c) => c.field === custom || c.header === custom)?.field ?? null;
      if (field) {
        headerToField.set(h, field);
        usedFields.add(field);
        columnMappings.push({ excelHeader: h, crmField: field, confidence: 'exact' });
      } else {
        columnMappings.push({ excelHeader: h, crmField: null, confidence: 'unmapped' });
      }
      continue;
    }
    const normalized = normalizeHeader(h);
    const exact = columns.find((c) => normalizeHeader(c.header) === normalized)?.field;
    if (exact && !usedFields.has(exact)) {
      headerToField.set(h, exact);
      usedFields.add(exact);
      columnMappings.push({ excelHeader: h, crmField: exact, confidence: 'exact' });
      continue;
    }
    const aliased = aliasMap.get(normalized);
    if (aliased && !usedFields.has(aliased)) {
      headerToField.set(h, aliased);
      usedFields.add(aliased);
      columnMappings.push({ excelHeader: h, crmField: aliased, confidence: 'alias' });
      continue;
    }
    columnMappings.push({ excelHeader: h, crmField: null, confidence: 'unmapped' });
  }

  const unmappedColumns = columnMappings.filter((m) => m.confidence === 'unmapped').map((m) => m.excelHeader);

  // A template's second row is a greyed-out example row (optionally carrying a
  // sample embedded image). If the first data row matches every column's
  // example value, treat it as that example row and skip it — its image too.
  const skippedExample =
    rawRows.length > 1 &&
    columns.every((col) => (rawRows[0]!.record[col.header] ?? '').trim() === (col.example ?? ''));
  const effectiveRawRows = skippedExample ? rawRows.slice(1) : rawRows;

  const finalRows: ParsedDataRow[] = effectiveRawRows.map((raw) => {
    const parsed: Record<string, unknown> = {};
    for (const [excelHeader, field] of headerToField.entries()) {
      const rawVal = raw.record[excelHeader] ?? '';
      if (rawVal === '') continue;
      parsed[field] = rawVal;
    }
    return { rowNumber: raw.rowNumber, record: raw.record, parsed };
  });

  const errorsByRow = await validateRowsWithAdapter(adapter, columns, finalRows, auth);
  const missingRequired = columns.filter((c) => c.required && !usedFields.has(c.field));

  // Build PreviewRows
  const rows: PreviewRow[] = [];
  const embeddedByRowNumber = new Map<number, EmbeddedImage[]>();
  const masterLabel = MASTER_LABEL[masterType];

  for (const item of finalRows) {
    const { rowNumber, record, parsed } = item;
    const images = imagesByRow.get(rowNumber) ?? [];
    embeddedByRowNumber.set(rowNumber, images);
    const errs = errorsByRow.get(rowNumber) ?? [];

    for (const col of missingRequired) {
      errs.push({
        row: rowNumber,
        field: col.field,
        header: col.header,
        value: null,
        message: `${col.header} is required but no column is mapped.`,
      });
    }

    // Validate embedded images so bad rows never reach import.
    let imageStatus: 'none' | 'ok' | 'invalid' = 'none';
    if (adapter.image && images.length > 0) {
      let allValid = true;
      for (const img of images) {
        const reason = validateEmbeddedImage(img, adapter.image);
        if (reason) {
          allValid = false;
          errs.push({
            row: rowNumber,
            field: 'image',
            header: 'Image',
            value: img.fileName,
            message: `${masterLabel} — embedded image invalid: ${reason}`,
          });
        }
      }
      if (allValid && adapter.masterType === 'AIRLINE' && images.length > 1) {
        allValid = false;
        errs.push({
          row: rowNumber,
          field: 'image',
          header: 'Image',
          value: null,
          message: `${masterLabel} — supports only one logo image; remove the extra images from this row.`,
        });
      }
      imageStatus = allValid ? 'ok' : 'invalid';
    }

    // Optional relational/reference resolution (e.g. Destination city names).
    let data = parsed;
    if (adapter.resolveRow) {
      const resolved = await adapter.resolveRow(parsed, auth);
      if (resolved.problems.length) {
        for (const problem of resolved.problems) {
          errs.push({ row: rowNumber, ...problem });
        }
      } else {
        data = resolved.resolved;
      }
    }

    rows.push({
      rowNumber,
      data,
      raw: record,
      errors: errs,
      isValid: errs.length === 0,
      embeddedImageCount: images.length,
      imageStatus,
      images: images.map((img) => ({ fileName: img.fileName, mimeType: img.mimeType, size: img.size })),
    });
  }

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.length - validCount;

  return {
    preview: {
      masterType,
      totalRows: rows.length,
      validCount,
      invalidCount,
      rows,
      headers,
      columnMappings,
      unmappedColumns,
    },
    embeddedByRowNumber,
  };
}

export async function previewImport(
  buffer: Buffer,
  masterType: SupportedImportType,
  auth: AuthContext,
  customMapping?: Record<string, string>,
): Promise<PreviewResult> {
  const { preview } = await buildPreview(buffer, masterType, auth, customMapping);
  return preview;
}

export async function executeImport(
  buffer: Buffer,
  masterType: SupportedImportType,
  auth: AuthContext,
  context: MastersRequestContext,
): Promise<ImportResult> {
  const adapter = getAdapter(masterType);
  const { preview, embeddedByRowNumber } = await buildPreview(buffer, masterType, auth);

  // Partial import: only valid rows are created. Invalid/duplicate rows are
  // skipped and their errors are returned so they stay visible in the report.
  const validRows = preview.rows.filter((r) => r.isValid);
  const skippedErrors = preview.rows.filter((r) => !r.isValid).flatMap((r) => r.errors);

  let createdIds: string[] = [];
  if (validRows.length > 0) {
    // Single transaction so the valid rows commit atomically; a failure here
    // rolls everything back rather than leaving a partial write.
    try {
      createdIds = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const ids: string[] = [];
        for (const input of validRows) {
          ids.push(await adapter.create(input.data, auth, context, tx));
        }
        return ids;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      return {
        masterType,
        totalRows: preview.totalRows,
        createdCount: 0,
        skippedCount: preview.invalidCount,
        errors: [{ row: 0, field: 'unknown', header: 'unknown', value: null, message }, ...skippedErrors],
      };
    }
  }

  // Row-specific embedded images are stored through the exact same Master
  // storage flow used by manual creation. A failure here leaves the record
  // created but reports the image error.
  const imageErrors: RowError[] = [];
  if (adapter.applyImage && validRows.length > 0) {
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]!;
      const images = embeddedByRowNumber.get(row.rowNumber) ?? [];
      if (images.length === 0) continue;
      try {
        await adapter.applyImage({
          input: row.data,
          images,
          recordId: createdIds[i]!,
          auth,
          context,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image import failed';
        imageErrors.push({
          row: row.rowNumber,
          field: 'image',
          header: 'Image',
          value: null,
          message: `${MASTER_LABEL[masterType]} — image not attached: ${message}`,
        });
      }
    }
  }

  const allErrors = [...imageErrors, ...skippedErrors];
  return {
    masterType,
    totalRows: preview.totalRows,
    createdCount: createdIds.length,
    skippedCount: preview.invalidCount,
    ...(allErrors.length ? { errors: allErrors } : {}),
  };
}

export async function generateErrorReport(
  preview: PreviewResult,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Errors');
  // Use the file's actual headers so dynamic columns (e.g. Cruise Room Types)
  // appear in the report regardless of the static template column set.
  const headers = [...preview.headers, 'Import Error'];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  });
  for (const row of preview.rows) {
    if (row.isValid) continue;
    const base = preview.headers.map((header) => row.raw[header] ?? '');
    const errorMsg = row.errors.map((e) => `${e.header}: ${e.message}`).join(' | ');
    sheet.addRow([...base, errorMsg]);
  }
  sheet.columns.forEach((col) => (col.width = 20));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}