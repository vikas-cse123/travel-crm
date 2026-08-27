import type { AIRLINE_LOGO_MIME_TYPES } from '@interscale/shared';

export type MasterImageMimeType = (typeof AIRLINE_LOGO_MIME_TYPES)[number];

/**
 * Sniff the image type from its magic bytes (the reliable signal, not headers).
 * Shared by the Airline Master service and the Excel-import image pipeline so
 * there is exactly one implementation.
 */
export function sniffImageMimeType(bytes: Buffer): MasterImageMimeType | 'image/gif' | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      bytes.subarray(0, 6).toString('ascii') === 'GIF89a')
  )
    return 'image/gif';
  return null;
}