import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../config/env.js';

/**
 * Cookie handling for the session and CSRF tokens.
 *
 * Clearing a cookie only works if the attributes match those it was set with,
 * so set and clear are defined together here rather than spelled out at each
 * call site.
 */

/** Attributes shared by set and clear. `maxAge` is added only when setting. */
function baseOptions(): CookieOptions {
  return {
    // Lax still sends the cookie on top-level navigation, which keeps
    // "click the reset link in your email" working, while blocking the
    // cross-site POSTs that CSRF relies on.
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  };
}

/**
 * Set the session cookie.
 *
 * httpOnly, so JavaScript cannot read the token — an XSS bug cannot exfiltrate
 * a session. This is why no token is ever placed in localStorage.
 */
export function setSessionCookie(res: Response, rawToken: string, expiresAt: Date): void {
  res.cookie(env.SESSION_COOKIE_NAME, rawToken, {
    ...baseOptions(),
    httpOnly: true,
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, { ...baseOptions(), httpOnly: true });
}

/**
 * Set the CSRF cookie.
 *
 * Deliberately NOT httpOnly: the double-submit pattern requires the frontend
 * to read this value and echo it in a request header. That is safe because the
 * token authorises nothing on its own — it only proves the request came from a
 * page that can read our cookies, which a cross-origin attacker cannot.
 */
export function setCsrfCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(env.CSRF_COOKIE_NAME, token, {
    ...baseOptions(),
    httpOnly: false,
    expires: expiresAt,
  });
}

export function clearCsrfCookie(res: Response): void {
  res.clearCookie(env.CSRF_COOKIE_NAME, { ...baseOptions(), httpOnly: false });
}

/** Clear both auth cookies. Used on logout and whenever a session is rejected. */
export function clearAuthCookies(res: Response): void {
  clearSessionCookie(res);
  clearCsrfCookie(res);
}
