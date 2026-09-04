import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { isReservedHostname, normalizeHostname } from '../../utils/hostname.js';

/**
 * Additional per-request domain context attached when the request hostname
 * maps to an ACTIVE custom domain. This never replaces the authenticated
 * user's companyId; tenant scoping stays session-driven.
 */
export interface CustomDomainContext {
  hostname: string;
  companyId: string;
}

/**
 * Resolve a hostname to its ACTIVE custom-domain tenant.
 *
 * Only status ACTIVE (on both the domain and its Company) resolves. PENDING and
 * DISABLED domains, unknown hostnames, and reserved platform hostnames never
 * resolve to a Company — there is no fallback to any default/first tenant.
 *
 * A leading `www.` is treated as an alias for the apex custom domain when the
 * Apex is the configured hostname, so `www.quotation.travelenfield.in` resolves
 * to `quotation.travelenfield.in` without requiring a separate record. The
 * returned context always carries the canonical (stored) hostname, but the
 * validation layer compares against the normalized request hostname and also
 * accepts the www alias.
 */
export async function resolveCustomDomain(hostname: string): Promise<CustomDomainContext | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isReservedHostname(normalized)) return null;

  const tryLookup = async (candidate: string) => {
    const domain = await prisma.customDomain.findUnique({
      where: { hostname: candidate },
      select: {
        companyId: true,
        status: true,
        company: { select: { status: true } },
      },
    });
    if (!domain) return null;
    if (domain.status !== 'ACTIVE') return null;
    if (domain.company.status !== 'ACTIVE') return null;
    return { hostname: candidate, companyId: domain.companyId } as CustomDomainContext;
  };

  const direct = await tryLookup(normalized);
  if (direct) return direct;

  // Support www alias for an already-configured apex custom domain.
  // Only one label stripped, so `www.example.com` -> `example.com`, but not
  // arbitrary subdomains. This keeps the security property that unknown hosts
  // never resolve, while allowing the common www variation.
  if (normalized.startsWith('www.')) {
    const withoutWww = normalized.slice(4);
    if (withoutWww && normalizeHostname(withoutWww) === withoutWww) {
      const alias = await tryLookup(withoutWww);
      if (alias) return alias;
    }
  }

  return null;
}

/** First-party platform hostnames (WEB_URL/API_URL/PUBLIC_SLUG_BASE_URL), lower-cased. */
function platformHostnames(): string[] {
  return [env.WEB_URL, env.API_URL, env.PUBLIC_SLUG_BASE_URL]
    .map((url) => {
      try {
        return new URL(url).hostname.toLowerCase();
      } catch {
        return null;
      }
    })
    .filter((host): host is string => Boolean(host));
}

/** Whether a hostname is one of the platform's own hosts (incl. dev localhost
 * and the reserved production platform domain). */
export function isPlatformHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return platformHostnames().includes(normalized) || isReservedHostname(normalized);
}

/** ACTIVE custom-domain hostname for a company, or null when none exists. */
async function activeCustomDomainHostname(companyId: string): Promise<string | null> {
  const active = await prisma.customDomain.findFirst({
    where: { companyId, status: 'ACTIVE' },
    select: { hostname: true },
  });
  return active?.hostname ?? null;
}

/**
 * Preferred customer-facing app base URL for a company: the ACTIVE custom
 * domain hostname when one exists, else the platform WEB_URL. This is the
 * single source of truth for generating new public quotation links.
 */
export async function preferredPublicAppBaseUrl(companyId: string): Promise<string> {
  const hostname = await activeCustomDomainHostname(companyId);
  if (hostname) return `https://${hostname}`;
  return env.WEB_URL.replace(/\/$/, '');
}

/**
 * Public base URL for friendly quotation slugs (`/<publicSlug>`) for a company.
 * An ACTIVE custom domain wins; otherwise the apex marketing domain
 * (PUBLIC_SLUG_BASE_URL). This is deliberately NOT the app-domain fallback that
 * `preferredPublicAppBaseUrl` uses — slug fallback must stay on the apex.
 */
export async function friendlyPublicSlugBaseUrl(companyId: string): Promise<string> {
  const hostname = await activeCustomDomainHostname(companyId);
  if (hostname) return `https://${hostname}`;
  return env.PUBLIC_SLUG_BASE_URL.replace(/\/$/, '');
}

/**
 * Whether an origin hostname may be trusted by origin/CORS validation. The
 * platform's own hosts (including dev localhost) and ACTIVE custom domains are
 * trusted — never wildcards, PENDING/DISABLED domains, or unknown hostnames.
 * The hostname is parsed and normalized (scheme/path/case) so substring or
 * path tricks cannot pass.
 */
export async function isTrustedOriginHostname(hostname: string): Promise<boolean> {
  const parsed = hostname.trim().toLowerCase();
  if (!parsed) return false;
  if (platformHostnames().includes(parsed)) return true;
  return (await resolveCustomDomain(parsed)) !== null;
}
