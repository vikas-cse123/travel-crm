import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
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
import { normalizeEmail } from '../src/utils/normalize.js';

/**
 * Phase 2 Custom Domain: host-scoped session cookies, same-origin API, and
 * origin/CORS trust for ACTIVE custom domains, with tenant matching intact.
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

async function createVerifiedUser(email = 'owner@bluesky.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  const otp = mail.lastOtp(email) ?? '';
  await client.post('/api/auth/verify-email', { otp });
  return client;
}

async function companyIdOf(email: string): Promise<string> {
  const user = await db.user.findFirstOrThrow({
    where: { email: normalizeEmail(email) },
    select: { companyId: true },
  });
  return user.companyId;
}

/** A login POST from a given origin; a 401 means it passed origin validation. */
function loginFrom(origin: string) {
  return request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'nobody@nowhere.test', password: 'WrongPassword@1' });
}

describe('session cookies are host-scoped', () => {
  it('sets a host-only session cookie with no platform Domain attribute', async () => {
    await createVerifiedUser();

    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'owner@bluesky.test', password: PASSWORD });

    expect(response.status).toBe(200);
    const session = (response.headers['set-cookie'] as string[]).find((entry) =>
      entry.startsWith('interscale_sid='),
    );
    expect(session).toBeDefined();
    // No Domain= attribute → the browser stores a host-only cookie for whatever
    // hostname the user signed in on (platform or custom).
    expect(session).not.toMatch(/;\s*Domain=/i);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/Path=\//);
  });

  it('logout clears the host-scoped session cookie', async () => {
    const client = await createVerifiedUser();
    expect(client.cookies.session).toBeTruthy();

    const response = await client.post('/api/auth/logout');
    expect(response.status).toBe(200);
    expect(client.cookies.session).toBeUndefined();
    const cleared = (response.headers['set-cookie'] as string[]).find((entry) =>
      entry.startsWith('interscale_sid='),
    );
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});

describe('origin validation trusts ACTIVE custom domains', () => {
  async function createDomain(hostname: string, status: 'PENDING' | 'ACTIVE' | 'DISABLED') {
    const company = await db.company.create({
      data: { name: 'Easy Tour', slug: `easy-tour-${status.toLowerCase()}`, email: 'hi@easytour.test', status: 'ACTIVE' },
    });
    return db.customDomain.create({
      data: { companyId: company.id, hostname, status },
    });
  }

  it('accepts an ACTIVE custom-domain origin', async () => {
    await createDomain('crm.easytour.com', 'ACTIVE');
    const response = await loginFrom('https://crm.easytour.com');
    // Wrong credentials → 401 means it got past origin validation, not a 403.
    expect(response.status).toBe(401);
  });

  it('accepts a case-normalized ACTIVE custom-domain origin', async () => {
    await createDomain('crm.easytour.com', 'ACTIVE');
    const response = await loginFrom('https://CRM.EASYTOUR.COM');
    expect(response.status).toBe(401);
  });

  it('rejects a PENDING custom-domain origin', async () => {
    await createDomain('pending.easytour.com', 'PENDING');
    expect((await loginFrom('https://pending.easytour.com')).status).toBe(403);
  });

  it('rejects a DISABLED custom-domain origin', async () => {
    await createDomain('disabled.easytour.com', 'DISABLED');
    expect((await loginFrom('https://disabled.easytour.com')).status).toBe(403);
  });

  it('rejects an unknown origin', async () => {
    expect((await loginFrom('https://random-domain.com')).status).toBe(403);
  });

  it('rejects a substring-spoofed hostname', async () => {
    await createDomain('crm.easytour.com', 'ACTIVE');
    const response = await loginFrom('https://crm.easytour.com.attacker.com');
    expect(response.status).toBe(403);
  });

  it('does not leak a custom-domain login when credentials fail', async () => {
    await createDomain('crm.easytour.com', 'ACTIVE');
    const response = await loginFrom('https://crm.easytour.com');
    expect(response.body.error.message).toBe('Invalid email or password.');
  });
});

describe('authenticated tenant match on custom-domain hosts', () => {
  it('allows a session whose company matches the custom-domain company', async () => {
    const client = await createVerifiedUser('owner@easytour.test');
    const companyId = await companyIdOf('owner@easytour.test');
    await db.customDomain.create({
      data: { companyId, hostname: 'crm.easytour.com', status: 'ACTIVE' },
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Host', 'crm.easytour.com')
      .set('Origin', 'https://crm.easytour.com')
      .set('Cookie', cookieHeader(client.cookies));
    expect(response.status).toBe(200);
  });

  it('rejects a session whose company does not match the custom-domain company', async () => {
    const client = await createVerifiedUser('owner@easytour.test');
    const otherCompany = await db.company.create({
      data: { name: 'Masti Travels', slug: 'masti-travels', email: 'hi@masti.test', status: 'ACTIVE' },
    });
    await db.customDomain.create({
      data: { companyId: otherCompany.id, hostname: 'crm.easytour.com', status: 'ACTIVE' },
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Host', 'crm.easytour.com')
      .set('Origin', 'https://crm.easytour.com')
      .set('Cookie', cookieHeader(client.cookies));
    expect(response.status).toBe(403);
  });
});

describe('default platform behaviour is unchanged', () => {
  it('default platform host does not require custom-domain matching', async () => {
    const client = await createVerifiedUser('owner@bluesky.test');
    const response = await request(app)
      .get('/api/auth/me')
      .set('Host', 'localhost')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookieHeader(client.cookies));
    expect(response.status).toBe(200);
  });

  it('an authenticated API route still works on the default platform flow', async () => {
    const client = await createVerifiedUser('owner@bluesky.test');
    const response = await request(app)
      .get('/api/auth/me')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookieHeader(client.cookies));
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('owner@bluesky.test');
  });
});
