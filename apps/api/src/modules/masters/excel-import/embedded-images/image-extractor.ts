import type ExcelJS from 'exceljs';
import type { EmbeddedImage } from '../excel-import.types.js';
import { sniffImageMimeType } from '../../master-media.js';

/**
 * ExcelJS (4.4.0) parses `xl/media/*` on load and records each embedded image
 * on its worksheet. This module reads the real XLSX package structure: media
 * bytes from `xl/media` plus each drawing's anchor, so the owning Excel row is
 * taken from the anchor (never from media order).
 */

/** Structural view of the workbook model where ExcelJS stores media. */
interface WorkbookMediaModel {
  media: ExcelJS.Media[];
}

export interface EmbeddedImageEntry extends EmbeddedImage {
  /** 1-based Excel row that the image's top-left anchor sits on. */
  excelRow: number;
  /** Position of the drawing anchor within the worksheet drawing list. */
  originalIndex: number;
}

export function extractEmbeddedImageEntries(sheet: ExcelJS.Worksheet): EmbeddedImageEntry[] {
  const workbook = sheet.workbook as unknown as WorkbookMediaModel;
  const mediaByIndex = new Map<number, ExcelJS.Media>();
  workbook.media.forEach((medium, index) => mediaByIndex.set(index, medium));

  const entries: EmbeddedImageEntry[] = [];
  let originalIndex = 0;
  for (const image of sheet.getImages()) {
    if (image.type !== 'image') continue;
    // The top-left anchor is authoritative for which row owns the image.
    const anchor = image.range?.tl;
    const nativeRow = anchor?.nativeRow;
    if (typeof nativeRow !== 'number' || !Number.isFinite(nativeRow)) continue;
    const medium = mediaByIndex.get(Number(image.imageId));
    if (!medium?.buffer) continue;
    const buffer = Buffer.from(medium.buffer);
    const fileName = medium.extension ? `${medium.name}.${medium.extension}` : medium.name || 'image';
    entries.push({
      buffer,
      fileName,
      mimeType: sniffImageMimeType(buffer),
      size: buffer.length,
      excelRow: nativeRow + 1,
      originalIndex,
    });
    originalIndex++;
  }
  return entries;
}