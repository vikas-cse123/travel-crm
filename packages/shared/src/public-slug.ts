import { z } from 'zod';

/**
 * Friendly public quotation weblink slugs, e.g. `travelagencycrm.in/mohan`.
 *
 * A slug is a customer-facing alias for the existing (unguessable) public
 * token. It is always generated from a single canonical normalizer so the CRM
 * form, the API and the public resolver can never drift apart.
 */

/** Maximum stored slug length (matches the DB column width). */
export const PUBLIC_SLUG_MAX_LENGTH = 60;

/** A normalized slug: lowercase letters/digits, single hyphens as separators. */
export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Top-level paths that can never be claimed as a quotation slug. These are the
 * marketing website's real routes/pages, its static assets, the CRM SPA's own
 * top-level routes and system/protocol paths — everything that must keep
 * working when a request for `travelagencycrm.in/<path>` is served.
 *
 * Slugs are normalized (dots become hyphens, lower-cased), so a value such as
 * `favicon.ico` can never collide with the real `/favicon.ico` file; the base
 * names are still reserved here as a safety net.
 */
export const PUBLIC_SLUG_RESERVED: ReadonlySet<string> = new Set([
  // Marketing website routes/pages.
  'privacy',
  'terms',
  'index',
  '404',
  'healthz',
  // Marketing static assets (base names; dots cannot appear in a slug anyway).
  'favicon',
  'robots',
  'sitemap',
  'logo',
  'og-image',
  // CRM SPA top-level routes.
  'signup',
  'login',
  'forgot-password',
  'reset-password',
  'verify-email',
  'dashboard',
  'settings',
  'reports',
  'system-status',
  'travel-search',
  'queries',
  'notes',
  'follow-ups',
  'reminders',
  'quotation-templates',
  'quotations',
  'bookings',
  'customers',
  'vendors',
  'users',
  'roles',
  'permission-templates',
  'activity-logs',
  'masters',
  // System / protocol / future-marketing paths.
  'q',
  'api',
  'app',
  'admin',
  'public',
  'assets',
  'about',
  'contact',
  'pricing',
  'blog',
  'support',
  'help',
  'docs',
  'status',
  'account',
  'auth',
  'logout',
  'webhooks',
  'graphql',
]);

/**
 * Canonical slug normalization: lower-case, trim, spaces (and any run of
 * unsupported characters) become a single hyphen, repeated hyphens collapse,
 * leading/trailing hyphens are removed and the result is capped to the
 * supported length. May return an empty string for a value with no usable
 * characters — callers must reject that.
 */
export function normalizePublicSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PUBLIC_SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/** Whether a normalized slug is a reserved top-level path. */
export function isReservedPublicSlug(slug: string): boolean {
  return PUBLIC_SLUG_RESERVED.has(slug.toLowerCase());
}

/** Normalize a user-entered weblink name and reject empty/reserved results. */
export function toPublicSlug(value: string): string | null {
  const slug = normalizePublicSlug(value);
  if (!slug || slug.length === 0) return null;
  if (isReservedPublicSlug(slug)) return null;
  return slug;
}

/**
 * Weblink-name input for the CRM form. Only the raw bound is enforced here; the
 * canonical normalization, reserved-path and global-uniqueness checks run in
 * the quotations service so the precise "already in use" / "reserved" messages
 * are returned directly. `publicSlug: null` (or blank) clears the friendly name.
 */
export const quotationWeblinkNameSchema = z.object({
  publicSlug: z.string().trim().max(100).nullable().optional(),
});
export type QuotationWeblinkName = z.infer<typeof quotationWeblinkNameSchema>;
