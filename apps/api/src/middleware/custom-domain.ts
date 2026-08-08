import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { ForbiddenError } from '../utils/errors.js';
import {
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
