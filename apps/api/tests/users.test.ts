import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';

let app: Express;
let db: PrismaClient;
beforeAll(async () => {
  db = createTestPrismaClient();
  app = (await import('../src/app.js')).createApp();
});
afterAll(async () => db.$disconnect());
beforeEach(async () => {
  await truncateAll(db);
  getMemoryEmailProvider()?.clear();
});
async function owner(email: string, companyName: string) {
  const c = createAuthClient(app);
  await c.post('/api/auth/register', registrationPayload({ email, companyName }));
  await c.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return c;
}
async function setup() {
  const c = await owner('owner@alpha.test', 'Alpha Travel');
  const roles = await c.get('/api/users/lookups');
  const manager = roles.body.data.roles.find((r: { name: string }) => r.name === 'Manager');
  return { c, manager };
}
const payload = (roleId: string, overrides: Record<string, unknown> = {}) => ({
  fullName: 'Asha Agent',
  username: 'asha',
  email: 'asha@alpha.test',
  phone: '+919999999999',
  roleId,
  permissionTemplateId: null,
  status: 'ACTIVE',
  temporaryPassword: 'Temporary@2026',
  confirmTemporaryPassword: 'Temporary@2026',
  mustChangePassword: true,
  ...overrides,
});

describe('Phase 4 user management', () => {
  it('creates, safely lists, searches, filters, sorts and paginates users', async () => {
    const { c, manager } = await setup();
    const created = await c.post('/api/users', payload(manager.id));
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|Temporary@2026/);
    const list = await c.get(
      '/api/users?search=asha%40alpha.test&status=ACTIVE&sortBy=fullName&sortOrder=asc&page=1&pageSize=1',
    );
    expect(list.status).toBe(200);
    expect(list.body.data.data).toHaveLength(1);
    expect(list.body.data.pagination.pageSize).toBe(1);
    expect(await db.activityLog.count({ where: { action: 'USER_CREATED' } })).toBe(1);
  });
  it('enforces tenant isolation for every single-user operation', async () => {
    const a = await owner('owner@alpha.test', 'Alpha');
    const b = await owner('owner@beta.test', 'Beta');
    const foreign = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@beta.test' },
    });
    expect((await a.get(`/api/users/${foreign.id}`)).status).toBe(404);
    expect((await a.patch(`/api/users/${foreign.id}`, { fullName: 'Intrusion' })).status).toBe(404);
    expect((await a.patch(`/api/users/${foreign.id}/status`, { status: 'SUSPENDED' })).status).toBe(
      404,
    );
    expect((await a.delete(`/api/users/${foreign.id}`)).status).toBe(404);
    expect((await a.post(`/api/users/${foreign.id}/send-password-reset`)).status).toBe(404);
    expect((await a.get(`/api/users/${foreign.id}/activity`)).status).toBe(404);
    const list = await a.get('/api/users');
    expect(
      list.body.data.data.every((u: { email: string }) => !u.email.endsWith('@beta.test')),
    ).toBe(true);
    expect(b).toBeTruthy();
  });
  it('protects self and the final active Owner', async () => {
    const c = await owner('owner@alpha.test', 'Alpha');
    const me = (await c.get('/api/auth/me')).body.data.user;
    expect((await c.patch(`/api/users/${me.id}/status`, { status: 'INACTIVE' })).status).toBe(403);
    expect((await c.delete(`/api/users/${me.id}`)).status).toBe(403);
    const roles = await c.get('/api/users/lookups');
    const manager = roles.body.data.roles.find((r: { name: string }) => r.name === 'Manager');
    expect((await c.patch(`/api/users/${me.id}`, { roleId: manager.id })).status).toBe(403);
  });
  it('revokes sessions, archives softly, restores, and records lifecycle activity', async () => {
    const { c, manager } = await setup();
    const created = await c.post('/api/users', payload(manager.id));
    const id = created.body.data.id;
    await db.session.create({
      data: { userId: id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(
      (await c.patch(`/api/users/${id}/status`, { status: 'SUSPENDED', reason: 'review' })).status,
    ).toBe(200);
    expect(await db.session.count({ where: { userId: id, revokedAt: null } })).toBe(0);
    expect((await c.delete(`/api/users/${id}`)).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect((await c.patch(`/api/users/${id}/status`, { status: 'ACTIVE' })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
  });
  it('creates only hashed reset tokens and invalidates older ones', async () => {
    const { c, manager } = await setup();
    const id = (await c.post('/api/users', payload(manager.id))).body.data.id;
    await c.post(`/api/users/${id}/send-password-reset`);
    const first = await db.passwordResetToken.findFirstOrThrow({ where: { userId: id } });
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    await c.post(`/api/users/${id}/send-password-reset`);
    expect(
      (await db.passwordResetToken.findUniqueOrThrow({ where: { id: first.id } })).usedAt,
    ).not.toBeNull();
    expect(getMemoryEmailProvider()?.lastResetUrl('asha@alpha.test')).toMatch(/reset-password/);
  });
});
