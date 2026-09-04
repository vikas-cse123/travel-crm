import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { isProduction } from '../config/env.js';
import {
  isPlatformHostname,
  resolveCustomDomain,
  type CustomDomainContext,
} from '../modules/custom-domains/custom-domain.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** ACTIVE custom-domain context for the request hostname, when present. */
      customDomain?: CustomDomainContext;
    }
  }
}

/**
 * Reject an authenticated request whose session company does not match the
 * ACTIVE custom-domain tenant. This is the only place a domain context is
 * compared against the authenticated tenant; the user is never switched into
 * the hostname's Company.
 */
export function assertCustomDomainTenant(req: Request, authenticatedCompanyId: string): void {
  const context = req.customDomain;
  if (context && context.companyId !== authenticatedCompanyId) {
    throw new ForbiddenError('This account is not authorized for this domain.');
  }
}

/**
 * Extract the canonical hostname for this request, robust to proxy forwarding.
 * ALB sets X-Forwarded-Host to the original Host; Express's trust-proxy-aware
 * `req.hostname` is preferred, but we fall back to the raw Host / X-Forwarded-Host
 * headers (first value, port and trailing dot stripped) so a mis-configured
 * proxy never causes a false negative for a valid ACTIVE custom domain.
 */
function extractRequestHostname(req: Request): string {
  const candidates: Array<string | undefined> = [
    (req.hostname as string | undefined),
    req.get('x-forwarded-host')?.split(',')[0]?.trim(),
    req.get('host')?.split(',')[0]?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    // Strip port if present (Host: example.com:443) and trailing dot.
    const withoutPort = candidate.split(':')[0]?.trim().toLowerCase().replace(/\.$/, '') ?? '';
    if (withoutPort) return withoutPort;
  }
  return '';
}

/**
 * Attach the ACTIVE custom-domain context for the request hostname, derived
 * from Express's trust-proxy-aware `req.hostname` with fallbacks to
 * X-Forwarded-Host / Host. The default platform hostname and unknown hostnames
 * attach no context. This is additional domain context only — it never changes
 * tenant scoping.
 */
export const resolveCustomDomainMiddleware = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const hostname = extractRequestHostname(req);
    const context = await resolveCustomDomain(hostname);
    if (context) req.customDomain = context;
    else delete req.customDomain;
    next();
  },
);

/** Internal/health-check paths probed by ALB/ECS with an internal Host. */
const INTERNAL_HEALTH_PATHS = new Set(['/api/health', '/api/health/db', '/healthz']);

/**
 * Application-level host validation. With Phase 3's dynamic ALB routing, any
 * hostname pointed at the ALB reaches the app; only the platform's own hosts
 * and ACTIVE custom domains are allowed. Unknown, PENDING and DISABLED hosts
 * are rejected before any route/application handling. Health-check paths are
 * allowed regardless of host so ALB/ECS probes keep working.
 */
export const validateRequestHost = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (INTERNAL_HEALTH_PATHS.has(req.path)) {
      next();
      return;
    }

    const hostname = extractRequestHostname(req);
    // Loopback traffic (localhost, 127.0.0.1) is only accepted outside
    // production — local dev/test clients talk to the API directly. The
    // production ALB never forwards a loopback Host for public traffic.
    if (
      !hostname ||
      isPlatformHostname(hostname) ||
      (!isProduction && (hostname === '127.0.0.1' || hostname === '::1'))
    ) {
      next();
      return;
    }

    const context = req.customDomain;
    if (
      context &&
      (context.hostname === hostname ||
        (hostname.startsWith('www.') && context.hostname === hostname.slice(4)))
    ) {
      next();
      return;
    }

    // Reject unknown / PENDING / DISABLED hosts without revealing their state.
    next(new NotFoundError('The requested host is not recognised.'));
  },
);
