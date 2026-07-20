import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '@interscale/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { csrfTokenMatches, deriveCsrfToken } from '../modules/auth/session.service.js';
import { hashToken } from '../utils/crypto.js';

/**
 * CSRF protection, in two layers, because the flows differ.
 *
 * The problem: authentication rides on a cookie, so the browser attaches it to
 * cross-site requests too. Something must prove the request came from our own
 * page rather than an attacker's.
 *
 * LAYER 1 — Origin/Referer allow-list, on every state-changing request.
 *   Works even when no session exists yet, which is the case for register,
 *   login and forgot-password. Browsers set `Origin` on all cross-origin
 *   requests and on same-origin POSTs, and it cannot be forged by page script.
 *
 * LAYER 2 — Session-bound signed double-submit, whenever a session exists.
 *   `csrfToken = HMAC-SHA256(SESSION_SECRET, sessionTokenHash)` is handed to
 *   the client in a readable cookie and must come back in a header. An
 *   attacker on another origin can neither read our cookie (same-origin
 *   policy) nor set a custom header on a simple cross-site form post. Because
 *   the token is derived from the session, one stolen from elsewhere is
 *   useless, and nothing extra needs storing.
 *
 * Backed by `SameSite=Lax` on the session cookie as a third layer.
 *
 * KNOWN TRADE-OFF: requiring `Origin` rejects non-browser clients that omit
 * it (curl without the header, a future native mobile app). Acceptable while
 * the only consumer is our React app; a token-based path would be needed later.
 */

/** Methods that cannot change state and therefore need no CSRF check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

class CsrfError extends AppError {
  constructor(message: string) {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

/** Compare only scheme://host:port, ignoring any path on a Referer. */
function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(): string[] {
  // The API's own origin is allowed so tooling on the same host works.
  return [env.WEB_URL, env.API_URL].map((url) => originOf(url)).filter((o): o is string => !!o);
}

/**
 * Layer 1: verify the request originated from our frontend.
 */
export function verifyOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const headerOrigin = req.get('origin');
  const referer = req.get('referer');
  const candidate = headerOrigin ?? (referer ? originOf(referer) : null);

  if (!candidate) {
    // A browser always sends Origin on a state-changing fetch, so absence
    // means this is not the client we support.
    next(new CsrfError('This request is missing an Origin header and was rejected.'));
    return;
  }

  if (!allowedOrigins().includes(candidate)) {
    next(new CsrfError('This request came from an unrecognised origin and was rejected.'));
    return;
  }

  next();
}

/**
 * Layer 2: verify the double-submit token when the request carries a session.
 *
 * Runs before authentication, so it reads the session cookie directly rather
 * than relying on `req.auth`.
 */
export function verifyCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const sessionToken = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;

  // No session yet (register, login, forgot-password): Layer 1 is the control.
  if (!sessionToken) {
    next();
    return;
  }

  const submitted = req.get(env.CSRF_HEADER_NAME);
  if (!submitted) {
    next(new CsrfError('This request is missing a CSRF token. Refresh the page and try again.'));
    return;
  }

  const expected = deriveCsrfToken(hashToken(sessionToken));

  if (!csrfTokenMatches(submitted, expected)) {
    next(new CsrfError('This request had an invalid CSRF token. Refresh the page and try again.'));
    return;
  }

  next();
}
