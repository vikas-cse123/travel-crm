import type { EmbeddedImage } from '../excel-import.types.js';

export interface ImageValidationConfig {
  mimeTypes: readonly string[];
  maxBytes: number;
}

/**
 * Validates an embedded image against the same rules the manual Master upload
 * enforces (allowed formats + maximum size). Returns a human reason on failure,
 * or null when the image is acceptable.
 */
export function validateEmbeddedImage(
  image: EmbeddedImage,
  config: ImageValidationConfig,
): string | null {
  if (!image.mimeType || !config.mimeTypes.includes(image.mimeType)) {
    return 'The embedded image is not a supported image format.';
  }
  if (image.size > config.maxBytes) {
    return 'The embedded image exceeds the maximum allowed size.';
  }
  return null;
}