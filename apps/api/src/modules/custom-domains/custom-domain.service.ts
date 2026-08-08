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
 */
export async function resolveCustomDomain(
  hostname: string,
): Promise<CustomDomainContext | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isReservedHostname(normalized)) return null;

  const domain = await prisma.customDomain.findUnique({
    where: { hostname: normalized },
    select: {
      companyId: true,
      status: true,
      company: { select: { status: true } },
    },
  });
  if (!domain) return null;
  if (domain.status !== 'ACTIVE') return null;
  if (domain.company.status !== 'ACTIVE') return null;

  return { hostname: normalized, companyId: domain.companyId };
}

/** First-party platform hostnames (WEB_URL/API_URL), lower-cased. */
function platformHostnames(): string[] {
  return [env.WEB_URL, env.API_URL]
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
