import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import {
  cookieHeader,
  createAuthClient,
  registrationPayload,
  TEST_ORIGIN,
} from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import type { MemoryEmailProvider } from '../src/services/email/memory-email.provider.js';
import request from 'supertest';

/**
 * Login, current-user, logout and session lifecycle, through the real app.
 */

let app: Express;
let db: PrismaClient;
let mail: MemoryEmailProvider;

const PASSWORD = 'Interscale@2026';

beforeAll(async () => {
  db = createTestPrismaClient();
  const { createApp } = await import('../src/app.js');
  app = createApp();
  const provider = getMemoryEmailProvider();
  if (!provider) throw new Error('Expected the in-memory email provider under NODE_ENV=test.');
  mail = provider;
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
  mail.clear();
});

/** Register and fully verify an account, returning a ready-to-use client. */
async function createVerifiedUser(email = 'owner@bluesky.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  const otp = mail.lastOtp(email) ?? '';
  await client.post('/api/auth/verify-email', { otp });
  return client;
}

describe('POST /api/auth/login', () => {
  it('signs in a verified user and returns a safe user object', async () => {
    await createVerifiedUser();

    const client = createAuthClient(app);
    const response = await client.post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.requiresEmailVerification).toBe(false);
    expect(response.body.data.user.email).toBe('owner@bluesky.test');

    // No secret fields leak.
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toMatch(/argon2/);
    expect(client.cookies.session).toBeTruthy();
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    await createVerifiedUser();

    const wrongPassword = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: 'WrongPassword@1',
    });
    const unknownEmail = await createAuthClient(app).post('/api/auth/login', {
      email: 'nobody@nowhere.test',
      password: 'WrongPassword@1',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical message — no account enumeration.
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password.');
  });

  it('increments the failed-login counter and locks after the threshold', async () => {
    await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });

    // LOGIN_MAX_FAILED_ATTEMPTS defaults to 5.
    for (let i = 0; i < 4; i += 1) {
      await createAuthClient(app).post('/api/auth/login', {
        email: 'owner@bluesky.test',
        password: 'WrongPassword@1',
      });
    }
    const afterFour = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(afterFour.failedLoginAttempts).toBe(4);
    expect(afterFour.lockedUntil).toBeNull();

    // Fifth failure locks the account.
    await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: 'WrongPassword@1',
    });
    const locked = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(locked.lockedUntil).not.toBeNull();

    // Even the correct password is refused while locked.
    const response = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/locked/i);
  });

  it('resets the failure counter and stamps lastLoginAt on success', async () => {
    await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });

    await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: 'WrongPassword@1',
    });

    await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });

    const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.failedLoginAttempts).toBe(0);
    expect(after.lastLoginAt).not.toBeNull();
  });

  it('directs a pending-verification user to verification, not the CRM', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload({ email: 'pending@bluesky.test' }));
    // Do NOT verify.

    const fresh = createAuthClient(app);
    const response = await fresh.post('/api/auth/login', {
      email: 'pending@bluesky.test',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.requiresEmailVerification).toBe(true);
    // The session it hands back cannot reach verified-only routes.
    const ping = await fresh.get('/api/auth/protected-ping');
    expect(ping.status).toBe(403);
  });

  it('rejects suspended, inactive and archived users', async () => {
    await createVerifiedUser('user@bluesky.test');
    const user = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'user@bluesky.test' },
    });

    for (const status of ['SUSPENDED', 'INACTIVE', 'ARCHIVED'] as const) {
      await db.user.update({ where: { id: user.id }, data: { status } });
      const response = await createAuthClient(app).post('/api/auth/login', {
        email: 'user@bluesky.test',
        password: PASSWORD,
      });
      // 401 for archived (indistinguishable from bad creds), 403 otherwise.
      expect([401, 403]).toContain(response.status);
      expect(response.status).not.toBe(200);
    }
  });

  it('honours remember-me with a longer session lifetime', async () => {
    await createVerifiedUser();

    const normal = createAuthClient(app);
    const normalRes = await normal.post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
      rememberMe: false,
    });

    const remember = createAuthClient(app);
    const rememberRes = await remember.post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
      rememberMe: true,
    });

    const normalExpiry = new Date(normalRes.body.data.session.expiresAt).getTime();
    const rememberExpiry = new Date(rememberRes.body.data.session.expiresAt).getTime();
    expect(rememberExpiry).toBeGreaterThan(normalExpiry);
  });

  it('records LOGIN_SUCCESS and LOGIN_FAILED activity', async () => {
    await createVerifiedUser();

    await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: 'WrongPassword@1',
    });
    await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });

    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toContain('LOGIN_SUCCESS');
    expect(actions).toContain('LOGIN_FAILED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with effective permissions', async () => {
    const client = await createVerifiedUser();

    const response = await client.get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('owner@bluesky.test');
    expect(response.body.data.user.permissions.length).toBeGreaterThan(0);
    expect(response.body.data.user.permissions).toContain('dashboard.view');
  });

  it('returns 401 with no session', async () => {
    const response = await createAuthClient(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects a tampered session token', async () => {
    const client = await createVerifiedUser();
    client.setCookies({ ...client.cookies, session: 'not-a-real-token' });

    const response = await client.get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects a revoked session', async () => {
    const client = await createVerifiedUser();
    // Revoke every session for the user directly.
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });
    await db.session.updateMany({ where: { userId: owner.id }, data: { revokedAt: new Date() } });

    const response = await client.get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const client = await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });
    await db.session.updateMany({
      where: { userId: owner.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await client.get('/api/auth/me');
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const client = await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });

    const response = await client.post('/api/auth/logout');
    expect(response.status).toBe(200);

    // Cookie cleared, session revoked, subsequent /me fails.
    expect(client.cookies.session).toBeFalsy();
    const active = await db.session.count({ where: { userId: owner.id, revokedAt: null } });
    expect(active).toBe(0);
    expect((await db.activityLog.findMany()).map((l) => l.action)).toContain('LOGOUT');
  });

  it('succeeds even with no session', async () => {
    const response = await createAuthClient(app).post('/api/auth/logout');
    expect(response.status).toBe(200);
  });
});

describe('Protected endpoint (middleware proof)', () => {
  it('requires authentication', async () => {
    const response = await request(app).get('/api/auth/protected-ping').set('Origin', TEST_ORIGIN);
    expect(response.status).toBe(401);
  });

  it('requires a verified email', async () => {
    const client = createAuthClient(app);
    await client.post(
      '/api/auth/register',
      registrationPayload({ email: 'unverified@bluesky.test' }),
    );

    const response = await client.get('/api/auth/protected-ping');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('derives companyId from the session, not from request input', async () => {
    const clientA = await createVerifiedUser('a@bluesky.test');
    // Company B exists so B's companyId is a real value A could try to smuggle.
    await createVerifiedUser('b@bluesky.test');

    const userA = await db.user.findFirstOrThrow({ where: { normalizedEmail: 'a@bluesky.test' } });
    const userB = await db.user.findFirstOrThrow({ where: { normalizedEmail: 'b@bluesky.test' } });
    expect(userA.companyId).not.toBe(userB.companyId);

    // Even with company B's id supplied every way a client could, A's context
    // stays A's — the middleware reads it from the session's user row.
    const pingA = await request(app)
      .get(`/api/auth/protected-ping?companyId=${userB.companyId}`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookieHeader(clientA.cookies))
      .set('X-Company-Id', userB.companyId)
      .send();

    expect(pingA.status).toBe(200);
    expect(pingA.body.data.companyId).toBe(userA.companyId);
    expect(pingA.body.data.companyId).not.toBe(userB.companyId);
  });
});
