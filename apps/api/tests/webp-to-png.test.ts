import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { webpToPng } from '../src/services/pdf/webp-to-png.js';

/**
 * PDF WebP support. PDFKit cannot decode WebP, so any master image uploaded as
 * WebP (vehicles, hotels, cruises, ...) previously rendered the PDF placeholder
 * even though the public weblink (browser <img>) showed it. webpToPng converts
 * WebP bytes to PNG so the existing PDF image pipeline can embed them.
 */
describe('webpToPng', () => {
  it('converts a WebP image to PNG', async () => {
    const webp = await sharp({
      create: { width: 8, height: 6, channels: 3, background: '#2b6cb0' },
    })
      .webp()
      .toBuffer();
    // Confirm the fixture really is WebP.
    expect(webp.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');

    const png = await webpToPng(webp);
    expect(png).not.toBeNull();
    // Output is a valid PNG.
    expect(png!.subarray(0, 4).toString('latin1')).toBe('\x89PNG');
  });

  it('returns null for a JPEG image (caller keeps the original buffer)', async () => {
    const jpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    expect(jpeg.subarray(0, 2).toString('latin1')).toBe('\xff\xd8');
    expect(await webpToPng(jpeg)).toBeNull();
  });

  it('returns null for a tiny or malformed buffer without throwing', async () => {
    expect(await webpToPng(Buffer.from(''))).toBeNull();
    expect(await webpToPng(Buffer.from('RIFF0000WEBP'))).toBeNull();
    expect(await webpToPng(Buffer.from('not webp at all'))).toBeNull();
  });
});
