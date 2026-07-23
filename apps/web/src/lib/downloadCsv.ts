/**
 * Trigger a browser download for a CSV payload returned by the API.
 *
 * The API returns CSV inside the normal JSON envelope as
 * `{ fileName, mimeType, content }`, so the browser reconstructs the file
 * locally. Extracted from the original lead-export implementation so the Lead,
 * Quotation, Booking, Client-payment and Vendor-payable exports all behave
 * identically (and all revoke their object URL).
 */
export interface CsvPayload {
  fileName: string;
  mimeType: string;
  content: string;
}

export function downloadCsv(payload: CsvPayload): string {
  const { fileName, mimeType, content } = payload;
  if (typeof content !== 'string') throw new Error('The export returned no content.');
  const blob = new Blob([content], { type: `${mimeType || 'text/csv'};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || 'export.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Always released, even if the click handler throws.
    URL.revokeObjectURL(url);
  }
  return fileName;
}
