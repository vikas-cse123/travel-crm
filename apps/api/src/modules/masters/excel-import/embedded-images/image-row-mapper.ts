import type { EmbeddedImage } from '../excel-import.types.js';
import type { EmbeddedImageEntry } from './image-extractor.js';

/**
 * Groups extracted embedded images by the real Excel row they are anchored to.
 * Images anchored above the header (e.g. a stray logo) are ignored. The row is
 * taken from the drawing anchor, so blank rows and images in any column keep
 * working — mapping never depends on image order.
 */
export function mapImagesToRows(
  entries: EmbeddedImageEntry[],
  headerRowNumber: number,
): Map<number, EmbeddedImage[]> {
  const byRow = new Map<number, EmbeddedImage[]>();
  for (const entry of entries) {
    if (entry.excelRow <= headerRowNumber) continue;
    const list = byRow.get(entry.excelRow) ?? [];
    list.push({
      buffer: entry.buffer,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      size: entry.size,
    });
    byRow.set(entry.excelRow, list);
  }
  return byRow;
}