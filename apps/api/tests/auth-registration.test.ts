import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { AVAILABLE_PERMISSION_KEYS, ROLE_NAME } from '@interscale/shared';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import type { MemoryEmailProvider } from '../src/services/email/memory-email.provider.js';

/**
 * Registration and email-OTP verification, end to end through the real app.
 *
 * The in-memory email provider is the only way these tests learn an OTP — it
 * never appears in a response body, which is asserted directly.
 */

let app: Express;
let db: PrismaClient;
let mail: MemoryEmailProvider;

beforeAll(async () => {
  db = createTestPrismaClient();
  // Imported dynamically so the Prisma singleton and env are configured by
  // tests/setup.ts before app.ts constructs anything.
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

describe('POST /api/auth/register', () => {
  it('creates a company, roles, templates and a pending Owner', async () => {
    const client = createAuthClient(app);
    const response = await client.post('/api/auth/register', registrationPayload());

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.requiresEmailVerification).toBe(true);
    expect(response.body.data.maskedEmail).toContain('@');

    // Company + full default structure.
    const company = await db.company.findFirstOrThrow({ where: { slug: 'blue-sky-travels' } });
    expect(company.status).toBe('ACTIVE');
    expect(await db.role.count({ where: { companyId: company.id } })).toBe(5);
    expect(await db.permissionTemplate.count({ where: { companyId: company.id } })).toBe(4);

    // Owner is pending and unverified.
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
      include: { role: true },
    });
    expect(owner.status).toBe('PENDING_VERIFICATION');
    expect(owner.emailVerifiedAt).toBeNull();
    expect(owner.role.name).toBe(ROLE_NAME.OWNER);
  });

  it('grants the registered Owner every available permission (same as the seed)', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload());

    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const keys = owner.role.permissions.map((p) => p.permission.key).sort();
    expect(keys).toEqual([...AVAILABLE_PERMISSION_KEYS].sort());
  });

  it('stores the password as an Argon2id hash, never plaintext', async () => {
    const client = createAuthClient(app);
    const response = await client.post('/api/auth/register', registrationPayload());

    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
    });
    expect(owner.passwordHash).toMatch(/^\$argon2id\$/);
    expect(owner.passwordHash).not.toContain('Interscale@2026');

    // The response BODY never carries the password or the hash back.
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('Interscale@2026');
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toMatch(/\$argon2/);
  });

  it('sends a verification OTP that never appears in the response', async () => {
    const client = createAuthClient(app);
    const response = await client.post('/api/auth/register', registrationPayload());

    const otp = mail.lastOtp('priya@bluesky.test');
    expect(otp).toMatch(/^\d{6}$/);

    // The OTP must not leak through the API.
    expect(JSON.stringify(response.body)).not.toContain(otp);
  });

  it('creates a restricted pre-verification session', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload());

    // A session cookie is present...
    expect(client.cookies.session).toBeTruthy();

    // ...but the protected (verified-only) endpoint is refused.
    const ping = await client.get('/api/auth/protected-ping');
    expect(ping.status).toBe(403);
    expect(ping.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('records COMPANY_REGISTERED and EMAIL_OTP_SENT activity', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload());

    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toContain('COMPANY_REGISTERED');
    expect(actions).toContain('EMAIL_OTP_SENT');
  });

  it('rejects a duplicate email with a 409', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload());

    const second = createAuthClient(app);
    const response = await second.post(
      '/api/auth/register',
      registrationPayload({ companyName: 'Another Agency' }),
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('generates a distinct slug when company names collide', async () => {
    const a = createAuthClient(app);
    await a.post('/api/auth/register', registrationPayload());
    const b = createAuthClient(app);
    await b.post('/api/auth/register', registrationPayload({ email: 'second@bluesky.test' }));

    const slugs = (await db.company.findMany({ select: { slug: true } })).map((c) => c.slug).sort();
    expect(slugs).toEqual(['blue-sky-travels', 'blue-sky-travels-2']);
  });

  it('rejects a weak password before creating anything', async () => {
    const client = createAuthClient(app);
    const response = await client.post(
      '/api/auth/register',
      registrationPayload({ password: 'weak', confirmPassword: 'weak' }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await db.company.count()).toBe(0);
  });
});

describe('POST /api/auth/verify-email', () => {
  async function registerAndGetClient(email = 'priya@bluesky.test') {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload({ email }));
    return client;
  }

  it('verifies with the correct OTP and activates the account', async () => {
    const client = await registerAndGetClient();
    const otp = mail.lastOtp('priya@bluesky.test');

    const response = await client.post('/api/auth/verify-email', { otp });

    expect(response.status).toBe(200);
    expect(response.body.data.user.emailVerified).toBe(true);
    expect(response.body.data.user.status).toBe('ACTIVE');

    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
    });
    expect(owner.status).toBe('ACTIVE');
    expect(owner.emailVerifiedAt).not.toBeNull();
  });

  it('rotates the session on success (old cookie differs from new)', async () => {
    const client = await registerAndGetClient();
    const preVerify = client.cookies.session;
    const otp = mail.lastOtp('priya@bluesky.test');

    await client.post('/api/auth/verify-email', { otp });

    expect(client.cookies.session).toBeTruthy();
    expect(client.cookies.session).not.toBe(preVerify);

    // The new session reaches the protected endpoint.
    const ping = await client.get('/api/auth/protected-ping');
    expect(ping.status).toBe(200);
  });

  it('rejects an incorrect OTP and counts the attempt', async () => {
    const client = await registerAndGetClient();

    const response = await client.post('/api/auth/verify-email', { otp: '000000' });
    expect(response.status).toBe(400);

    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
    });
    const otpRow = await db.emailVerificationOtp.findFirstOrThrow({ where: { userId: owner.id } });
    expect(otpRow.attempts).toBe(1);
    expect(otpRow.usedAt).toBeNull();
  });

  it('rejects an expired OTP', async () => {
    const client = await registerAndGetClient();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
    });
    const otp = mail.lastOtp('priya@bluesky.test') ?? '';

    await db.emailVerificationOtp.updateMany({
      where: { userId: owner.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await client.post('/api/auth/verify-email', { otp });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/expired/i);
  });

  it('rejects a used OTP (single use)', async () => {
    const client = await registerAndGetClient();
    const otp = mail.lastOtp('priya@bluesky.test') ?? '';

    await client.post('/api/auth/verify-email', { otp });
    // Second submission of the same code fails; the account is already active.
    const response = await client.post('/api/auth/verify-email', { otp });
    expect(response.status).toBe(400);
  });

  it('locks out on the final attempt and invalidates the code', async () => {
    const client = await registerAndGetClient();

    // OTP_MAX_ATTEMPTS defaults to 5. The first four report remaining attempts.
    let response = await client.post('/api/auth/verify-email', { otp: '000000' });
    for (let i = 1; i < 4; i += 1) {
      response = await client.post('/api/auth/verify-email', { otp: '000000' });
    }
    expect(response.body.error.message).toMatch(/attempts? remaining/i);

    // The fifth wrong attempt trips the limit and discards the OTP.
    const fifth = await client.post('/api/auth/verify-email', { otp: '000000' });
    expect(fifth.status).toBe(400);
    expect(fifth.body.error.message).toMatch(/too many/i);

    // The code is now gone, so even a later guess just says "request a new one".
    const afterwards = await client.post('/api/auth/verify-email', { otp: '000000' });
    expect(afterwards.body.error.message).toMatch(/no longer valid|request a new/i);

    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
    });
    expect(owner.status).toBe('PENDING_VERIFICATION');
  });

  it('cannot be verified by a different session/user', async () => {
    // Company A registers and receives an OTP.
    await registerAndGetClient('a@bluesky.test');
    const otpA = mail.lastOtp('a@bluesky.test') ?? '';

    // Company B registers separately.
    const clientB = await registerAndGetClient('b@bluesky.test');

    // B submitting A's code verifies nothing of A's — the user is taken from
    // B's session, and A's code does not match B's OTP.
    const response = await clientB.post('/api/auth/verify-email', { otp: otpA });
    expect(response.status).toBe(400);

    const userA = await db.user.findFirstOrThrow({ where: { normalizedEmail: 'a@bluesky.test' } });
    expect(userA.status).toBe('PENDING_VERIFICATION');
  });
});

describe('POST /api/auth/resend-verification-otp', () => {
  it('enforces the resend cooldown', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload());

    // A code was just sent during registration, so an immediate resend is
    // inside the cooldown window.
    const response = await client.post('/api/auth/resend-verification-otp');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/wait/i);
  });

  it('invalidates the previous OTP when a new one is issued', async () => {
    const client = createAuthClient(app);
    await client.post('/api/auth/register', registrationPayload());
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'priya@bluesky.test' },
    });
    const firstOtp = mail.lastOtp('priya@bluesky.test') ?? '';

    // Move the last send outside the cooldown so a resend is allowed.
    await db.emailVerificationOtp.updateMany({
      where: { userId: owner.id },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });

    const resend = await client.post('/api/auth/resend-verification-otp');
    expect(resend.status).toBe(200);

    const newOtp = mail.lastOtp('priya@bluesky.test') ?? '';
    // Exactly one pending OTP exists, and the old code no longer verifies.
    expect(await db.emailVerificationOtp.count({ where: { userId: owner.id, usedAt: null } })).toBe(
      1,
    );

    if (firstOtp !== newOtp) {
      const response = await client.post('/api/auth/verify-email', { otp: firstOtp });
      expect(response.status).toBe(400);
    }
  });
});
