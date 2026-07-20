import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import type { MemoryEmailProvider } from '../src/services/email/memory-email.provider.js';

/**
 * Forgot-password and reset-password flows.
 */

let app: Express;
let db: PrismaClient;
let mail: MemoryEmailProvider;

const PASSWORD = 'Interscale@2026';
const NEW_PASSWORD = 'BrandNew@2027';

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

async function createVerifiedUser(email = 'owner@bluesky.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  const otp = mail.lastOtp(email) ?? '';
  await client.post('/api/auth/verify-email', { otp });
  mail.clear();
  return client;
}

/** Extract the raw token from a reset URL in the delivered email. */
function tokenFromResetUrl(url: string | undefined): string {
  if (!url) throw new Error('No reset URL was delivered.');
  return url.split('/reset-password/')[1] ?? '';
}

describe('POST /api/auth/forgot-password', () => {
  it('returns the same generic response whether or not the account exists', async () => {
    await createVerifiedUser('real@bluesky.test');

    const known = await createAuthClient(app).post('/api/auth/forgot-password', {
      email: 'real@bluesky.test',
    });
    const unknown = await createAuthClient(app).post('/api/auth/forgot-password', {
      email: 'ghost@nowhere.test',
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(known.body.message).toMatch(/if an account exists/i);
  });

  it('stores the reset token only as a hash and never returns it', async () => {
    await createVerifiedUser('real@bluesky.test');

    const response = await createAuthClient(app).post('/api/auth/forgot-password', {
      email: 'real@bluesky.test',
    });

    const token = tokenFromResetUrl(mail.lastResetUrl('real@bluesky.test'));
    expect(token.length).toBeGreaterThan(20);

    const stored = await db.passwordResetToken.findMany();
    expect(stored).toHaveLength(1);
    // The stored value is a hash, not the raw token.
    expect(stored[0]?.tokenHash).not.toBe(token);
    expect(stored[0]?.tokenHash).toHaveLength(64);

    // And the raw token never rode back in the response.
    expect(JSON.stringify(response.body)).not.toContain(token);
  });

  it('does not send a reset email to a suspended account', async () => {
    await createVerifiedUser('suspended@bluesky.test');
    const user = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'suspended@bluesky.test' },
    });
    await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    mail.clear();

    const response = await createAuthClient(app).post('/api/auth/forgot-password', {
      email: 'suspended@bluesky.test',
    });

    // Same public response, but no token and no email.
    expect(response.status).toBe(200);
    expect(await db.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
    expect(mail.lastResetUrl('suspended@bluesky.test')).toBeUndefined();
  });

  it('invalidates a previous unused token when a new one is requested', async () => {
    await createVerifiedUser('real@bluesky.test');

    await createAuthClient(app).post('/api/auth/forgot-password', { email: 'real@bluesky.test' });
    const firstToken = tokenFromResetUrl(mail.lastResetUrl('real@bluesky.test'));

    await createAuthClient(app).post('/api/auth/forgot-password', { email: 'real@bluesky.test' });

    // Only the newest token remains valid.
    expect(await db.passwordResetToken.count()).toBe(1);
    const check = await createAuthClient(app).get(
      `/api/auth/reset-password/${encodeURIComponent(firstToken)}/validate`,
    );
    expect(check.body.data.valid).toBe(false);
  });
});

describe('GET /api/auth/reset-password/:token/validate', () => {
  it('reports a valid token as valid', async () => {
    await createVerifiedUser('real@bluesky.test');
    await createAuthClient(app).post('/api/auth/forgot-password', { email: 'real@bluesky.test' });
    const token = tokenFromResetUrl(mail.lastResetUrl('real@bluesky.test'));

    const response = await createAuthClient(app).get(
      `/api/auth/reset-password/${encodeURIComponent(token)}/validate`,
    );
    expect(response.body.data.valid).toBe(true);
  });

  it('reports an unknown token as invalid', async () => {
    const response = await createAuthClient(app).get(
      '/api/auth/reset-password/definitely-not-real/validate',
    );
    expect(response.body.data.valid).toBe(false);
  });
});

describe('POST /api/auth/reset-password', () => {
  async function requestReset(email = 'owner@bluesky.test') {
    await createAuthClient(app).post('/api/auth/forgot-password', { email });
    return tokenFromResetUrl(mail.lastResetUrl(email));
  }

  it('resets the password and lets the user sign in with the new one', async () => {
    await createVerifiedUser();
    const token = await requestReset();

    const reset = await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);

    // Old password no longer works; new one does.
    const oldLogin = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: PASSWORD,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await createAuthClient(app).post('/api/auth/login', {
      email: 'owner@bluesky.test',
      password: NEW_PASSWORD,
    });
    expect(newLogin.status).toBe(200);
  });

  it('revokes all existing sessions after a reset', async () => {
    const client = await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });
    expect(
      await db.session.count({ where: { userId: owner.id, revokedAt: null } }),
    ).toBeGreaterThan(0);

    const token = await requestReset();
    await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    // Every prior session is dead, so the still-open client is signed out.
    expect(await db.session.count({ where: { userId: owner.id, revokedAt: null } })).toBe(0);
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const response = await createAuthClient(app).post('/api/auth/reset-password', {
      token: 'not-a-real-token',
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(response.status).toBe(404);
  });

  it('rejects an expired token', async () => {
    await createVerifiedUser();
    const token = await requestReset();
    await db.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(response.status).toBe(404);
  });

  it('rejects a token that was already used', async () => {
    await createVerifiedUser();
    const token = await requestReset();

    await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    // Second use of the same link fails.
    const second = await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: 'Another@2028',
      confirmPassword: 'Another@2028',
    });
    expect(second.status).toBe(404);
  });

  it('rejects a weak new password', async () => {
    await createVerifiedUser();
    const token = await requestReset();

    const response = await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: 'weak',
      confirmPassword: 'weak',
    });
    expect(response.status).toBe(400);
  });

  it('clears lockout and failure state on reset', async () => {
    await createVerifiedUser();
    const owner = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@bluesky.test' },
    });
    await db.user.update({
      where: { id: owner.id },
      data: { failedLoginAttempts: 4, lockedUntil: new Date(Date.now() + 900_000) },
    });

    const token = await requestReset();
    await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.failedLoginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.passwordChangedAt).not.toBeNull();
  });

  it('records PASSWORD_RESET_REQUESTED and PASSWORD_RESET_COMPLETED', async () => {
    await createVerifiedUser();
    const token = await requestReset();
    await createAuthClient(app).post('/api/auth/reset-password', {
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    const actions = (await db.activityLog.findMany()).map((l) => l.action);
    expect(actions).toContain('PASSWORD_RESET_REQUESTED');
    expect(actions).toContain('PASSWORD_RESET_COMPLETED');
  });
});
