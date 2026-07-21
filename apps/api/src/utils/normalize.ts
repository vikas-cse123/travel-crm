import { FIELD_LIMITS } from '@interscale/shared';

/**
 * Canonical forms for values that carry a uniqueness constraint. The database
 * enforces uniqueness on the *normalized* column, so every write path must go
 * through these helpers or the constraint can be bypassed by casing alone.
 */

/** Lowercase and trim an address for lookup and the unique index. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lowercase and trim a username for the per-company unique index. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Digits-only phone key used for tenant-scoped duplicate matching. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * E.164-like key for customer identity matching. Indian local numbers are
 * expanded with +91 by default; already international numbers retain their
 * country code. Invalid or blank values are not matchable.
 */
export function normalizeCustomerPhone(phone: string | null | undefined, defaultCountry = 'IN') {
  if (!phone?.trim()) return null;
  let digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('00')) digits = digits.slice(2);
  if (defaultCountry === 'IN') {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 10) digits = `91${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function normalizeCustomerName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Turn a company name into a URL-safe slug.
 *
 * Accents are decomposed and stripped so "Voyages Été" becomes "voyages-ete"
 * rather than losing the words entirely.
 */
export function generateSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FIELD_LIMITS.COMPANY_SLUG_MAX)
    .replace(/-+$/g, '');
}

/**
 * Append a numeric suffix until the slug is unused.
 *
 * `isTaken` is injected so this stays a pure function and can be unit tested
 * without a database.
 */
export async function generateUniqueSlug(
  input: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  const base = generateSlug(input) || 'company';

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix <= maxAttempts; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error(`Could not generate a unique slug for "${input}" after ${maxAttempts} attempts.`);
}

/** Trim an optional string, collapsing blanks to undefined. */
export function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
