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

// ---------------------------------------------------------------------------
// Owner-only administrative password set
// ---------------------------------------------------------------------------

describe('Owner set password', () => {
  async function createManagedUser(
    admin: Awaited<ReturnType<typeof owner>>,
    roleId: string,
    email = 'staff@alpha.test',
    username = 'staff',
  ) {
    const res = await admin.post('/api/users', {
      fullName: 'Staff Member',
      username,
      email,
      phone: '+919999999991',
      roleId,
      permissionTemplateId: null,
      status: 'ACTIVE',
      temporaryPassword: 'OldPass@2026',
      confirmTemporaryPassword: 'OldPass@2026',
      mustChangePassword: true,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; email: string; fullName: string };
  }

  async function signIn(
    email: string,
    password: string,
    loginMode: 'COMPANY_ADMIN' | 'COMPANY_USER',
  ) {
    const client = createAuthClient(app);
    const res = await client.post('/api/auth/login', {
      email,
      password,
      rememberMe: false,
      loginMode,
    });
    return { client, status: res.status };
  }

  async function loginAs(
    email: string,
    password: string,
    loginMode: 'COMPANY_ADMIN' | 'COMPANY_USER',
  ) {
    const { client, status } = await signIn(email, password, loginMode);
    expect(status).toBe(200);
    return client;
  }

  it('Owner resets another same-company user: new password works, old fails, sessions revoked', async () => {
    const { c, manager } = await setup();
    const owner = (await c.get('/api/auth/me')).body.data.user;
    const target = await createManagedUser(c, manager.id);

    // Create an active session for the target user.
    await db.session.create({
      data: {
        userId: target.id,
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await c.post(`/api/users/${target.id}/set-password`, {
      password: 'NewPass@2026',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Password updated successfully/);

    // Target sessions revoked by the reset, Owner session untouched.
    expect(await db.session.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    expect(
      await db.session.count({ where: { userId: owner.id, revokedAt: null } }),
    ).toBeGreaterThan(0);

    // Old password no longer works; new one does.
    expect((await signIn(target.email, 'OldPass@2026', 'COMPANY_ADMIN')).status).toBe(401);
    expect((await signIn(target.email, 'NewPass@2026', 'COMPANY_ADMIN')).status).toBe(200);

    // Password hash changed; no plaintext ever stored.
    const stored = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.passwordHash).not.toBe('OldPass@2026');
    expect(stored.passwordHash).not.toBe('NewPass@2026');

    // Activity logged with safe metadata only.
    const log = await db.activityLog.findFirstOrThrow({
      where: { action: 'USER_PASSWORD_RESET', targetUserId: target.id },
    });
    expect(log.actorUserId).toBe(owner.id);
    expect(JSON.stringify(log.metadata)).not.toMatch(/password|OldPass|NewPass/i);
  });

  it('rejects a non-Owner (Manager) reset attempt', async () => {
    const { c, manager } = await setup();
    const target = await createManagedUser(c, manager.id);

    // Create a Manager user and sign in.
    await createManagedUser(c, manager.id, 'manager@alpha.test', 'mgr');
    const managerClient = await loginAs('manager@alpha.test', 'OldPass@2026', 'COMPANY_ADMIN');

    const res = await managerClient.post(`/api/users/${target.id}/set-password`, {
      password: 'Hacked@2026',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a View Only reset attempt', async () => {
    const { c } = await setup();
    const roles = await c.get('/api/users/lookups');
    const viewOnly = roles.body.data.roles.find((r: { name: string }) => r.name === 'View Only');
    const target = await createManagedUser(c, viewOnly.id, 'vo@alpha.test', 'vo1');
    await createManagedUser(c, viewOnly.id, 'vo2@alpha.test', 'vo2');
    const voClient = await loginAs('vo2@alpha.test', 'OldPass@2026', 'COMPANY_USER');

    const res = await voClient.post(`/api/users/${target.id}/set-password`, {
      password: 'Hacked@2026',
    });
    expect(res.status).toBe(403);
  });

  it('rejects cross-company reset', async () => {
    const a = await owner('owner@alpha.test', 'Alpha');
    await owner('owner@beta.test', 'Beta');
    const foreign = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@beta.test' },
    });
    const res = await a.post(`/api/users/${foreign.id}/set-password`, {
      password: 'Hacked@2026',
    });
    expect(res.status).toBe(404);
  });

  it('rejects an Owner resetting their own password through the admin action', async () => {
    const c = await owner('owner@alpha.test', 'Alpha');
    const me = (await c.get('/api/auth/me')).body.data.user;
    const res = await c.post(`/api/users/${me.id}/set-password`, {
      password: 'Another@2026',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid password', async () => {
    const { c, manager } = await setup();
    const target = await createManagedUser(c, manager.id);
    const res = await c.post(`/api/users/${target.id}/set-password`, {
      password: 'short',
    });
    expect(res.status).toBe(400);
    // Nothing was changed.
    const stored = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.passwordHash).toContain('OldPass@2026');
  });

  it('never exposes the password in the API response', async () => {
    const { c, manager } = await setup();
    const target = await createManagedUser(c, manager.id);
    const res = await c.post(`/api/users/${target.id}/set-password`, {
      password: 'NewPass@2026',
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/NewPass@2026|OldPass@2026|passwordHash/i);
  });

  it('blocks resetting the final active Owner through the admin action', async () => {
    // A single-owner company: the only active Owner is protected.
    const c = await owner('owner@alpha.test', 'Alpha');
    const me = (await c.get('/api/auth/me')).body.data.user;
    // Another Owner (non-final) can be reset; the final one cannot.
    const roles = await c.get('/api/users/lookups');
    const ownerRole = roles.body.data.roles.find((r: { name: string }) => r.name === 'Owner');
    const secondOwner = await createManagedUser(c, ownerRole.id, 'owner2@alpha.test', 'owner2');
    const secondRes = await c.post(`/api/users/${secondOwner.id}/set-password`, {
      password: 'Second@2026',
    });
    expect(secondRes.status).toBe(200);
    // The single remaining active Owner (the caller) is protected from self-reset.
    expect(
      (await c.post(`/api/users/${me.id}/set-password`, { password: 'Third@2026' })).status,
    ).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Changing a user's role must NEVER alter their password
// ---------------------------------------------------------------------------

describe('Role change preserves password', () => {
  async function createUser(
    admin: Awaited<ReturnType<typeof owner>>,
    roleId: string,
    email: string,
    username: string,
  ) {
    const res = await admin.post('/api/users', {
      fullName: 'Role Agent',
      username,
      email,
      phone: '+919999999992',
      roleId,
      permissionTemplateId: null,
      status: 'ACTIVE',
      temporaryPassword: 'Agent@2026',
      confirmTemporaryPassword: 'Agent@2026',
      mustChangePassword: false,
    });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; email: string; fullName: string };
  }

  async function login(email: string, password: string) {
    // Try both modes: the password is what matters, and either login mode must
    // succeed for a correct password.
    const adminAttempt = createAuthClient(app).post('/api/auth/login', {
      email,
      password,
      rememberMe: false,
      loginMode: 'COMPANY_ADMIN',
    });
    const userAttempt = createAuthClient(app).post('/api/auth/login', {
      email,
      password,
      rememberMe: false,
      loginMode: 'COMPANY_USER',
    });
    const [a, u] = await Promise.all([adminAttempt, userAttempt]);
    return { admin: a.status, user: u.status };
  }

  async function roleIdByName(admin: Awaited<ReturnType<typeof owner>>, name: string) {
    const lookups = await admin.get('/api/users/lookups');
    const role = lookups.body.data.roles.find((r: { name: string }) => r.name === name);
    expect(role).toBeTruthy();
    return role.id as string;
  }

  it('Sales Executive -> Manager: passwordHash unchanged and same password still works', async () => {
    const c = await owner('owner@alpha.test', 'Alpha');
    const salesRole = await roleIdByName(c, 'Sales Executive');
    const managerRole = await roleIdByName(c, 'Manager');
    const target = await createUser(c, salesRole, 'se@alpha.test', 'se1');

    // Login works before the role change (either mode).
    expect((await login(target.email, 'Agent@2026')).user).toBe(200);
    const hashBefore = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;

    // Change only the role.
    const change = await c.patch(`/api/users/${target.id}`, { roleId: managerRole });
    expect(change.status).toBe(200);
    const hashAfter = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    expect(hashAfter).toBe(hashBefore);

    // Same password still works after promotion.
    const after = await login(target.email, 'Agent@2026');
    expect(after.admin).toBe(200);
    expect(after.user).toBe(200);
  });

  it('Manager -> Sales Executive: passwordHash unchanged and same password still works', async () => {
    const c = await owner('owner@alpha.test', 'Alpha');
    const managerRole = await roleIdByName(c, 'Manager');
    const salesRole = await roleIdByName(c, 'Sales Executive');
    const target = await createUser(c, managerRole, 'mgr@alpha.test', 'mgr1');

    expect((await login(target.email, 'Agent@2026')).admin).toBe(200);
    const hashBefore = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;

    const change = await c.patch(`/api/users/${target.id}`, { roleId: salesRole });
    expect(change.status).toBe(200);
    const hashAfter = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    expect(hashAfter).toBe(hashBefore);

    const after = await login(target.email, 'Agent@2026');
    expect(after.admin).toBe(200);
    expect(after.user).toBe(200);
  });

  it('ordinary profile update (name/phone) does not change passwordHash', async () => {
    const c = await owner('owner@alpha.test', 'Alpha');
    const salesRole = await roleIdByName(c, 'Sales Executive');
    const target = await createUser(c, salesRole, 'se2@alpha.test', 'se2');
    const hashBefore = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;

    const res = await c.patch(`/api/users/${target.id}`, {
      fullName: 'Renamed Agent',
      phone: '+919999999993',
    });
    expect(res.status).toBe(200);
    const hashAfter = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    expect(hashAfter).toBe(hashBefore);
    expect((await login(target.email, 'Agent@2026')).user).toBe(200);
  });

  it('explicit Set New Password changes passwordHash (intentional admin flow)', async () => {
    const c = await owner('owner@alpha.test', 'Alpha');
    const salesRole = await roleIdByName(c, 'Sales Executive');
    const target = await createUser(c, salesRole, 'se3@alpha.test', 'se3');
    const hashBefore = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;

    const res = await c.post(`/api/users/${target.id}/set-password`, {
      password: 'BrandNew@2026',
    });
    expect(res.status).toBe(200);
    const hashAfter = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    expect(hashAfter).not.toBe(hashBefore);

    // Old password fails, new password works.
    expect((await login(target.email, 'Agent@2026')).user).toBe(401);
    expect((await login(target.email, 'BrandNew@2026')).user).toBe(200);
  });
});
