import { prisma } from '../../config/prisma.js';
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
