import sharp from 'sharp';

/**
 * Convert an image buffer to PNG when it is a WebP image. PDFKit cannot decode
 * WebP (VP8/VP8L), so vehicle/hotel/sightseeing/cruise/destination masters that
 * upload WebP would otherwise render the PDF placeholder even though the public
 * weblink (browser <img>) displays them fine. Returns the original buffer for
 * any non-WebP input; returns null on decode failure so callers keep their
 * existing fallback behaviour and PDF generation never fails.
 */
export async function webpToPng(buf: Buffer): Promise<Buffer | null> {
  if (!buf || buf.length < 12) return null;
  // RIFF....WEBP magic
  const isWebp =
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!isWebp) return null;
  try {
    return await sharp(buf).rotate().png().toBuffer();
  } catch {
    return null;
  }
}
