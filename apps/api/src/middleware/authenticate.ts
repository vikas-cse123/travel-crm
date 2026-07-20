import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '@interscale/shared';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError, ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { clearAuthCookies } from '../utils/cookies.js';
import { sessionService } from '../modules/auth/session.service.js';
import { createTenantContext, type TenantContext } from '../db/tenant.js';
import { asyncHandler } from '../utils/async-handler.js';

/**
 * Session authentication.
 *
 * The critical property: `companyId` is read from the USER ROW that the
 * session points at — never from the request body, query string or a header.
 * A request that includes `companyId` in its payload cannot influence the
 * tenant it operates in, which is asserted directly in the tests.
 */

/** What a successfully authenticated request carries. */
export interface AuthContext {
  userId: string;
  companyId: string;
  sessionId: string;
  status: string;
  emailVerified: boolean;
  /** Tenant scope for repositories. Built here, from trusted data only. */
  tenant: TenantContext;
  session: {
    expiresAt: Date;
    csrfToken: string;
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Raised when the account exists but is not permitted to hold a session. */
class AccountUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

/**
 * Resolve the session cookie into an AuthContext, or return null.
 *
 * Shared by `requireAuth` and `optionalAuth` so both apply identical rules.
 */
async function loadAuthContext(req: Request, res: Response): Promise<AuthContext | null> {
  const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  if (!rawToken) return null;

  const session = await sessionService.resolve(rawToken);
  if (!session) {
    // Unknown, revoked or expired. Clear the stale cookie so the browser stops
    // presenting it on every subsequent request.
    clearAuthCookies(res);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      companyId: true,
      status: true,
      emailVerifiedAt: true,
      deletedAt: true,
      company: { select: { status: true } },
    },
  });

  if (!user || user.deletedAt !== null) {
    await sessionService.revoke(session.id);
    clearAuthCookies(res);
    return null;
  }

  // A user archived or suspended mid-session loses it immediately rather than
  // at expiry.
  if (user.status === 'ARCHIVED' || user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
    await sessionService.revoke(session.id);
    clearAuthCookies(res);
    throw new AccountUnavailableError('This account is not currently active.');
  }

  if (user.company.status !== 'ACTIVE') {
    await sessionService.revoke(session.id);
    clearAuthCookies(res);
    throw new AccountUnavailableError('This company account is not currently active.');
  }

  void sessionService.touch(session);

  return {
    userId: user.id,
    // Derived from the persisted user row — the tenant boundary.
    companyId: user.companyId,
    sessionId: session.id,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    tenant: createTenantContext(user.companyId),
    session: { expiresAt: session.expiresAt, csrfToken: session.csrfToken },
  };
}

/** Reject the request unless it carries a valid session. */
export const requireAuth = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = await loadAuthContext(req, res);
    if (!auth) {
      throw new UnauthorizedError('You must be signed in to do that.');
    }
    req.auth = auth;
    next();
  },
);

/**
 * Attach an AuthContext when one is available, without requiring it.
 *
 * Used by logout, which must succeed whether or not the session is still
 * valid, and still record who logged out when it can.
 */
export const optionalAuth = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = await loadAuthContext(req, res);
      if (auth) req.auth = auth;
    } catch {
      // A disabled account is simply treated as unauthenticated here.
    }
    next();
  },
);

/**
 * Require a verified email on top of a valid session.
 *
 * Everything except the four verification-flow endpoints sits behind this, so
 * an unverified account cannot reach CRM data.
 */
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;

  if (!auth) {
    next(new UnauthorizedError('You must be signed in to do that.'));
    return;
  }

  if (!auth.emailVerified || auth.status === 'PENDING_VERIFICATION') {
    next(
      new AppError('Verify your email address to continue.', 403, ERROR_CODES.EMAIL_NOT_VERIFIED),
    );
    return;
  }

  if (auth.status !== 'ACTIVE') {
    next(new ForbiddenError('This account is not currently active.'));
    return;
  }

  next();
}
