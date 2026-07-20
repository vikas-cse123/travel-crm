import request from 'supertest';
import type { Express } from 'express';

/**
 * Supertest helpers that speak the app's real security requirements.
 *
 * Tests do NOT get a CSRF exemption: every state-changing request here sends
 * a real Origin header and echoes the CSRF cookie, exactly as the browser
 * does. That way the protection is exercised on every call rather than being
 * bypassed in the suite and only "working" in production.
 */

export const TEST_ORIGIN = 'http://localhost:5173';

/** Parsed `Set-Cookie` values from a response. */
export interface CookieJar {
  session?: string;
  csrf?: string;
  raw: string[];
}

const SESSION_COOKIE = 'interscale_sid';
const CSRF_COOKIE = 'interscale_csrf';

/** Collect cookies from a response, tracking clears as removals. */
export function readCookies(setCookie: string[] | undefined, previous?: CookieJar): CookieJar {
  const jar: CookieJar = { raw: [], ...(previous ?? {}) };

  for (const entry of setCookie ?? []) {
    const [pair = ''] = entry.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);

    // An expired/empty value is the server clearing the cookie.
    const cleared = value === '' || /Expires=Thu, 01 Jan 1970/i.test(entry);

    if (name === SESSION_COOKIE) {
      if (cleared) delete jar.session;
      else jar.session = value;
    }
    if (name === CSRF_COOKIE) {
      if (cleared) delete jar.csrf;
      else jar.csrf = value;
    }
  }

  jar.raw = setCookie ?? [];
  return jar;
}

/** Serialise a jar back into a Cookie request header. */
export function cookieHeader(jar: CookieJar): string {
  const parts: string[] = [];
  if (jar.session) parts.push(`${SESSION_COOKIE}=${jar.session}`);
  if (jar.csrf) parts.push(`${CSRF_COOKIE}=${jar.csrf}`);
  return parts.join('; ');
}

/**
 * A supertest agent that carries a cookie jar and satisfies CSRF.
 *
 * `post`/`get` mirror the browser: Origin on everything, plus the CSRF header
 * on state-changing requests once a session cookie exists.
 */
export function createAuthClient(app: Express, initial: CookieJar = { raw: [] }) {
  let jar: CookieJar = initial;

  return {
    get cookies(): CookieJar {
      return jar;
    },
    setCookies(next: CookieJar): void {
      jar = next;
    },

    async post(path: string, body?: unknown, options: { csrf?: string | null } = {}) {
      let req = request(app).post(path).set('Origin', TEST_ORIGIN);

      const cookies = cookieHeader(jar);
      if (cookies) req = req.set('Cookie', cookies);

      // `csrf: null` deliberately omits the header, to test rejection.
      const token = options.csrf === undefined ? jar.csrf : options.csrf;
      if (token) req = req.set('X-CSRF-Token', token);

      const response = await (body === undefined ? req.send() : req.send(body as string | object));
      jar = readCookies(response.headers['set-cookie'] as string[] | undefined, jar);
      return response;
    },

    async get(path: string) {
      let req = request(app).get(path).set('Origin', TEST_ORIGIN);

      const cookies = cookieHeader(jar);
      if (cookies) req = req.set('Cookie', cookies);

      const response = await req.send();
      jar = readCookies(response.headers['set-cookie'] as string[] | undefined, jar);
      return response;
    },

    async patch(path: string, body?: unknown) {
      let req = request(app).patch(path).set('Origin', TEST_ORIGIN);
      const cookies = cookieHeader(jar);
      if (cookies) req = req.set('Cookie', cookies);
      if (jar.csrf) req = req.set('X-CSRF-Token', jar.csrf);
      return body === undefined ? req.send() : req.send(body as string | object);
    },

    async delete(path: string) {
      let req = request(app).delete(path).set('Origin', TEST_ORIGIN);
      const cookies = cookieHeader(jar);
      if (cookies) req = req.set('Cookie', cookies);
      if (jar.csrf) req = req.set('X-CSRF-Token', jar.csrf);
      return req.send();
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;

/** A valid registration payload, overridable per test. */
export function registrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    companyName: 'Blue Sky Travels',
    fullName: 'Priya Nair',
    email: 'priya@bluesky.test',
    phone: '+919876543210',
    password: 'Interscale@2026',
    confirmPassword: 'Interscale@2026',
    acceptTerms: true,
    ...overrides,
  };
}
