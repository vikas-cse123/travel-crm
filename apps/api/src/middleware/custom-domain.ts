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
 * Attach the ACTIVE custom-domain context for the request hostname, derived
 * from Express's trust-proxy-aware `req.hostname`. The default platform
 * hostname and unknown hostnames attach no context. This is additional domain
 * context only — it never changes tenant scoping.
 */
export const resolveCustomDomainMiddleware = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    req.customDomain = (await resolveCustomDomain(req.hostname)) ?? undefined;
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

    const hostname = (req.hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
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
    if (context && context.hostname === hostname) {
      next();
      return;
    }

    // Reject unknown / PENDING / DISABLED hosts without revealing their state.
    next(new NotFoundError('The requested host is not recognised.'));
  },
);
