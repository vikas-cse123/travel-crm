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
import { hashPassword } from '../src/utils/crypto.js';
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

  it('never locks the account no matter how many passwords fail', async () => {
    await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });

    // Far past the old 5-failure lockout threshold and the old 10/15min
    // login limiter: every attempt must reach normal auth logic.
    for (let i = 0; i < 20; i += 1) {
      const res = await createAuthClient(app).post('/api/auth/login', {
        email: 'owner@bluesky.test',
        password: 'WrongPassword@1',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password.');
    }

    // The account is not in a locked state, and the attempt counter was
    // never incremented (the columns remain in the schema, unused).
    const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginAttempts).toBe(0);

    // Correct credentials still work after all those failures.
    const ok = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });
    expect(ok.status).toBe(200);
  });

  it('stamps lastLoginAt on success', async () => {
    await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });

    const response = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });
    expect(response.status).toBe(200);

    const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
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

  it('supports company admin and company user login modes', async () => {
    await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
      include: { role: { select: { name: true } } },
    });
    expect(owner.role.name).toBe('Owner');

    // Owner (Company Admin) logs in with COMPANY_ADMIN mode.
    const adminLogin = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
      loginMode: 'COMPANY_ADMIN',
    });
    expect(adminLogin.status).toBe(200);

    // A Manager is also a company admin.
    const managerRole = await db.role.findFirstOrThrow({
      where: { companyId: owner.companyId, name: 'Manager' },
    });
    await db.user.create({
      data: {
        companyId: owner.companyId,
        roleId: managerRole.id,
        username: 'manager1',
        fullName: 'Manager One',
        email: 'manager@bluesky.test',
        normalizedEmail: 'manager@bluesky.test',
        passwordHash: await hashPassword(PASSWORD),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const managerLogin = await createAuthClient(app).post('/api/auth/login', {
      email: 'manager@bluesky.test',
      password: PASSWORD,
      loginMode: 'COMPANY_ADMIN',
    });
    expect(managerLogin.status).toBe(200);

    // A non-admin (Sales Executive) logs in with COMPANY_USER mode.
    const salesRole = await db.role.findFirstOrThrow({
      where: { companyId: owner.companyId, name: 'Sales Executive' },
    });
    await db.user.create({
      data: {
        companyId: owner.companyId,
        roleId: salesRole.id,
        username: 'sales1',
        fullName: 'Sales One',
        email: 'sales@bluesky.test',
        normalizedEmail: 'sales@bluesky.test',
        passwordHash: await hashPassword(PASSWORD),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const salesLogin = await createAuthClient(app).post('/api/auth/login', {
      email: 'sales@bluesky.test',
      password: PASSWORD,
      loginMode: 'COMPANY_USER',
    });
    expect(salesLogin.status).toBe(200);

    // Modes are enforced: a Sales Executive must NOT use the admin login.
    const misuse = await createAuthClient(app).post('/api/auth/login', {
      email: 'sales@bluesky.test',
      password: PASSWORD,
      loginMode: 'COMPANY_ADMIN',
    });
    expect(misuse.status).toBe(401);
    expect(misuse.body.error.message).toBe('Invalid email or password.');
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

  it('does not return 429 across repeated invalid login attempts', async () => {
    await createVerifiedUser();

    // The old login limiter was 10 requests per 15 minutes in production and
    // the global baseline is 300/15min. 20+ attempts prove neither blocks.
    for (let i = 0; i < 20; i += 1) {
      const client = createAuthClient(app);
      const res = await client.post('/api/auth/login', {
        email: 'owner@bluesky.test',
        password: 'WrongPassword@1',
      });
      expect(res.status).not.toBe(429);
      // With lockout removed, every failure is the normal generic 401.
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password.');
    }
  });

  it('does not return 429 across repeated valid login attempts', async () => {
    await createVerifiedUser();

    for (let i = 0; i < 20; i += 1) {
      const client = createAuthClient(app);
      const res = await client.post('/api/auth/login', {
        email: 'owner@bluesky.test',
        password: PASSWORD,
      });
      expect(res.status).not.toBe(429);
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('owner@bluesky.test');
    }
  });

  it('correct credentials still work after many failed attempts', async () => {
    await createVerifiedUser();

    for (let i = 0; i < 20; i += 1) {
      const client = createAuthClient(app);
      const res = await client.post('/api/auth/login', {
        email: 'owner@bluesky.test',
        password: 'WrongPassword@1',
      });
      // Normal auth rejection only — never the application-level login 429,
      // and never a lockout/403 because of attempt count.
      expect(res.status).not.toBe(429);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password.');
    }
    // The same account logs in normally afterwards.
    const ok = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });
    expect(ok.status).toBe(200);
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
