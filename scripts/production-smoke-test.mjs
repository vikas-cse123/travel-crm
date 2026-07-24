#!/usr/bin/env node
/**
 * Production smoke test — a fast, read-only, post-deploy sanity check.
 *
 * It NEVER creates, mutates or deletes business data (no leads, quotations or
 * bookings). It only probes health, optionally performs a login → /me → logout
 * round-trip, and optionally checks the web page responds.
 *
 * Configure with environment variables:
 *   API_BASE_URL           (required)  e.g. https://api.example.com
 *   WEB_BASE_URL           (optional)  e.g. https://app.example.com
 *   SMOKE_EMAIL            (optional)  a low-privilege test account
 *   SMOKE_PASSWORD         (optional)  its password (never hard-code / commit)
 *   SMOKE_TIMEOUT_MS       (optional)  per-request timeout, default 10000
 *   SESSION_COOKIE_NAME    (optional)  default interscale_sid
 *   CSRF_COOKIE_NAME       (optional)  default interscale_csrf
 *   CSRF_HEADER_NAME       (optional)  default x-csrf-token
 *
 * Exit code is non-zero if any check fails.
 *
 * Optional, deliberately NOT automated here (documented for manual runs):
 *   - Presigned upload probe: authenticate, request an upload URL, PUT a tiny
 *     object, then DELETE it. Left manual so a smoke test never writes to S3.
 *   - Test email: trigger a resend-verification to a dedicated inbox and check
 *     delivery. Left manual so a smoke test never sends mail unprompted.
 */

const API_BASE_URL = (process.env.API_BASE_URL || '').replace(/\/+$/, '');
const WEB_BASE_URL = (process.env.WEB_BASE_URL || '').replace(/\/+$/, '');
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || '';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 10_000);
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'interscale_sid';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'interscale_csrf';
const CSRF_HEADER_NAME = process.env.CSRF_HEADER_NAME || 'x-csrf-token';

if (!API_BASE_URL) {
  console.error('✖ API_BASE_URL is required.');
  process.exit(2);
}

let failures = 0;
const pass = (name, detail = '') => console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail = '') => {
  failures += 1;
  console.error(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
};

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

/** Extract `name=value` pairs from a response's Set-Cookie headers. */
function parseSetCookies(response) {
  const jar = {};
  const raw =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  for (const line of raw) {
    const first = String(line).split(';', 1)[0];
    const eq = first.indexOf('=');
    if (eq > 0) jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
  return jar;
}

async function checkLiveness() {
  try {
    const res = await request(`${API_BASE_URL}/api/health`);
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.data?.status === 'ok') pass('API liveness', `/api/health ${res.status}`);
    else fail('API liveness', `status ${res.status}`);
  } catch (error) {
    fail('API liveness', String(error));
  }
}

async function checkReadiness() {
  try {
    const res = await request(`${API_BASE_URL}/api/health/db`);
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.data?.database === 'up') {
      pass('API database readiness', `latency ${body.data.latencyMs}ms`);
    } else {
      fail('API database readiness', `status ${res.status}`);
    }
  } catch (error) {
    fail('API database readiness', String(error));
  }
}

async function checkWeb() {
  if (!WEB_BASE_URL) {
    console.log('  · Web check skipped (WEB_BASE_URL not set)');
    return;
  }
  try {
    const res = await request(`${WEB_BASE_URL}/`);
    const text = await res.text().catch(() => '');
    if (res.ok && /<div id="root"|<!doctype html/i.test(text)) pass('Web page responds');
    else fail('Web page responds', `status ${res.status}`);
  } catch (error) {
    fail('Web page responds', String(error));
  }
}

async function checkAuthRoundTrip() {
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
    console.log('  · Auth round-trip skipped (SMOKE_EMAIL / SMOKE_PASSWORD not set)');
    return;
  }
  const origin = API_BASE_URL;
  try {
    const loginRes = await request(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD, rememberMe: false }),
    });
    if (!loginRes.ok) return fail('Login', `status ${loginRes.status}`);
    const jar = parseSetCookies(loginRes);
    const session = jar[SESSION_COOKIE_NAME];
    const csrf = jar[CSRF_COOKIE_NAME];
    if (!session) return fail('Login', 'no session cookie returned');
    pass('Login + CSRF issued');

    const cookieHeader = [
      `${SESSION_COOKIE_NAME}=${session}`,
      csrf ? `${CSRF_COOKIE_NAME}=${csrf}` : '',
    ]
      .filter(Boolean)
      .join('; ');

    const meRes = await request(`${API_BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    const me = await meRes.json().catch(() => ({}));
    if (meRes.ok && me?.data) pass('Authenticated /me');
    else fail('Authenticated /me', `status ${meRes.status}`);

    const logoutRes = await request(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookieHeader,
        ...(csrf ? { [CSRF_HEADER_NAME]: csrf } : {}),
      },
    });
    if (logoutRes.ok) pass('Logout');
    else fail('Logout', `status ${logoutRes.status}`);
  } catch (error) {
    fail('Auth round-trip', String(error));
  }
}

async function main() {
  console.log(`\nProduction smoke test → ${API_BASE_URL}\n`);
  await checkLiveness();
  await checkReadiness();
  await checkWeb();
  await checkAuthRoundTrip();
  console.log('');
  if (failures > 0) {
    console.error(`✖ Smoke test FAILED (${failures} check${failures === 1 ? '' : 's'}).\n`);
    process.exit(1);
  }
  console.log('✓ Smoke test passed.\n');
}

await main();
