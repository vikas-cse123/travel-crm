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

/**
 * CSRF protection.
 *
 * Layer 1 (Origin) guards requests with no session; Layer 2 (double-submit
 * token) guards requests that carry one.
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

async function createVerifiedClient(email = 'owner@bluesky.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  const otp = mail.lastOtp(email) ?? '';
  await client.post('/api/auth/verify-email', { otp });
  return client;
}

describe('Layer 1 — Origin validation (no session)', () => {
  it('rejects a state-changing request with no Origin header', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'someone@bluesky.test',
      password: PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects a request from a foreign Origin', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'someone@bluesky.test', password: PASSWORD });

    expect(response.status).toBe(403);
  });

  it('accepts a request from the allowed Origin', async () => {
    // Wrong credentials, but it gets PAST csrf to a 401 rather than a 403.
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'someone@bluesky.test', password: PASSWORD });

    expect(response.status).toBe(401);
  });

  it('never blocks safe GET requests', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });
});

describe('Layer 2 — double-submit token (session present)', () => {
  it('rejects a state-changing request that omits the CSRF header', async () => {
    const client = await createVerifiedClient();

    // Send the session cookie but deliberately drop the CSRF header.
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', `interscale_sid=${client.cookies.session ?? ''}`)
      .send();

    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/csrf/i);
  });

  it('rejects a request whose CSRF token does not match the session', async () => {
    const client = await createVerifiedClient();

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookieHeader(client.cookies))
      .set('X-CSRF-Token', 'a'.repeat(64))
      .send();

    expect(response.status).toBe(403);
  });

  it('accepts a request with the matching session-bound CSRF token', async () => {
    const client = await createVerifiedClient();

    // The auth client automatically echoes the CSRF cookie in the header.
    const response = await client.post('/api/auth/logout');
    expect(response.status).toBe(200);
  });
});
