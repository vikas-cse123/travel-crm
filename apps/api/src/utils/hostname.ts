import { env } from '../config/env.js';

const HOST_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Reserved first-party platform hostnames that a custom domain can never
 * claim. Derived from the configured WEB_URL/API_URL hosts plus the project's
 * own production platform hostname as a safety net.
 */
const RESERVED_PLATFORM_HOSTS = new Set<string>();

function reservedPlatformHosts(): Set<string> {
  if (RESERVED_PLATFORM_HOSTS.size === 0) {
    for (const url of [env.WEB_URL, env.API_URL, env.PUBLIC_SLUG_BASE_URL]) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        if (host) RESERVED_PLATFORM_HOSTS.add(host);
      } catch {
        // Malformed config is ignored; the explicit platform host below still
        // protects the production hostname.
      }
    }
    // The project's own production platform domain (app.travelagencycrm.in).
    RESERVED_PLATFORM_HOSTS.add('app.travelagencycrm.in');
  }
  return RESERVED_PLATFORM_HOSTS;
}

/** True when the hostname is one of the platform's own reserved hosts. */
export function isReservedHostname(hostname: string): boolean {
  return reservedPlatformHosts().has(hostname.toLowerCase());
}

/**
 * Normalize a user-supplied hostname to its canonical stored form: lower-cased
 * and free of protocol/path/port, e.g. `https://CRM.EASYTOUR.COM/` →
 * `crm.easytour.com`. Returns null for anything that must be rejected:
 * empty values, localhost, IP addresses, ports, paths, wildcards and malformed
 * domains.
 */
export function normalizeHostname(input: string | null | undefined): string | null {
  let value = String(input ?? '').trim();
  if (!value) return null;

  // Strip the scheme (https://, http://, ...).
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

  // Reject userinfo and whitespace.
  if (/[\s@]/.test(value)) return null;

  // A non-empty path (or query/fragment) is invalid; a bare trailing slash is
  // allowed so `https://crm.easytour.com/` normalizes to `crm.easytour.com`.
  const [hostPart, ...rest] = value.split('/');
  if (rest.length && rest.some((segment) => segment.trim() !== '')) return null;
  if (!hostPart) return null;

  value = hostPart.toLowerCase();

  // Reject ports and IPv6 — a colon after the host is never valid here.
  if (value.includes(':')) return null;
  // Reject wildcards, queries and fragments.
  if (value.includes('*') || value.includes('?') || value.includes('#')) return null;
  // Reject localhost.
  if (value === 'localhost' || value.endsWith('.localhost')) return null;
  // Reject IPv4 dotted quads.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;

  const labels = value.split('.');
  if (labels.length < 2) return null;
  if (labels.some((label) => !HOST_LABEL_RE.test(label))) return null;
  // The TLD must be alphabetic (rejects numeric-only/IP-style trailing labels).
  const tld = labels[labels.length - 1];
  if (!tld || !/^[a-z]{2,}$/.test(tld)) return null;

  return value;
}
