import type { SearchApiImage } from '@interscale/shared';

/**
 * Canonical hotel image resolution. These are the ONLY helpers used to turn a
 * provider image entry into a URL — both the Live Search / Bookmark carousels
 * and the quotation bookmark import must resolve the same source image.
 *
 * Provider images carry two candidates (`original` and `thumbnail`); the
 * `original` is preferred and the `thumbnail` is the exact same provider image
 * at a smaller size. Every candidate is used verbatim — no URL rewriting,
 * proxying, parameter stripping or base-URL concatenation ever happens here.
 */

/** Preferred URL for a provider image: the exact `original`, else `thumbnail`. */
export function resolveHotelImageUrl(
  image: Pick<SearchApiImage, 'original' | 'thumbnail'> | null | undefined,
): string | null {
  if (!image) return null;
  return image.original || image.thumbnail || null;
}

/**
 * All candidate URLs for a provider image in preference order (`original`
 * first, then `thumbnail` when it is a different URL). This mirrors what the
 * carousels render: the first candidate that loads, with the next as fallback.
 */
export function resolveHotelImageCandidates(
  image: Pick<SearchApiImage, 'original' | 'thumbnail'> | null | undefined,
): string[] {
  if (!image) return [];
  const candidates: string[] = [];
  if (image.original) candidates.push(image.original);
  if (image.thumbnail && image.thumbnail !== image.original) candidates.push(image.thumbnail);
  return candidates;
}

/** One normalized snapshot image, keeping the exact bookmark candidate URLs. */
export interface NormalizedHotelImage {
  /** The bookmark card's preferred URL for this image (original, else thumbnail). */
  url: string;
  /**
   * The bookmark card's fallback URL for the same image, stored so renderers
   * can fall back exactly like the carousel when `url` fails to load.
   */
  thumbnailUrl: string | null;
}

/**
 * Normalize a bookmark image list for import into a quotation:
 * - keeps every entry that resolves to a usable URL, in the same order
 * - drops entries with no URL (empty/null), malformed non-image values
 * - drops exact-duplicate URLs (a second entry pointing at the same URL)
 * - caps the count so the quotation schema (max 12) always accepts the result
 */
export function normalizeHotelImages(
  images: Array<Pick<SearchApiImage, 'original' | 'thumbnail'>> | null | undefined,
  max = 12,
): NormalizedHotelImage[] {
  const normalized: NormalizedHotelImage[] = [];
  const seen = new Set<string>();
  for (const image of images ?? []) {
    if (normalized.length >= max) break;
    const candidates = resolveHotelImageCandidates(image);
    const url = candidates[0];
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    normalized.push({ url, thumbnailUrl: candidates[1] ?? null });
  }
  return normalized;
}