import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { hashPassword, verifyPassword } from '../src/utils/crypto.js';
import { runSystemMastersBootstrap } from '../src/modules/system-masters/system-masters-bootstrap.service.js';
import { resetSystemCompanyIdCache } from '../src/modules/masters/master-visibility.js';
import { companiesRepository } from '../src/modules/companies/companies.repository.js';

let app: Express;
let db: PrismaClient;

const SYSTEM_EMAIL = process.env.SYSTEM_ADMIN_EMAIL ?? 'system.admin@interscale.test';
const SYSTEM_PASSWORD = process.env.SYSTEM_ADMIN_PASSWORD ?? 'System@2026Bootstrap';

beforeAll(async () => {
  db = createTestPrismaClient();
  app = (await import('../src/app.js')).createApp();
});
afterAll(async () => db.$disconnect());
beforeEach(async () => {
  await truncateAll(db);
  getMemoryEmailProvider()?.clear();
  resetSystemCompanyIdCache();
});

async function bootstrap(opts?: { email?: string; password?: string; resetPassword?: boolean }) {
  return runSystemMastersBootstrap(opts);
}

/** Register a brand-new tenant company and return an authed client. */
async function tenant(email = 'owner@tenant.test', companyName = 'Tenant Travel') {
  const client = createAuthClient(app);
  const reg = await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  expect(reg.status).toBe(201);
  const verify = await client.post('/api/auth/verify-email', {
    otp: getMemoryEmailProvider()?.lastOtp(email),
  });
  expect(verify.status).toBe(200);
  return client;
}

async function systemAdminClient() {
  const client = createAuthClient(app);
  const login = await client.post('/api/auth/login', {
    email: SYSTEM_EMAIL,
    password: SYSTEM_PASSWORD,
    rememberMe: false,
    loginMode: 'COMPANY_ADMIN',
  });
  expect(login.status).toBe(200);
  return client;
}

/** Add an active user to an existing company and return their authed client. */
async function extraUser(email: string, companyId: string, password = 'Extra@2026') {
  const role = await db.role.findFirstOrThrow({ where: { companyId, name: 'Manager' } });
  await db.user.create({
    data: {
      companyId,
      roleId: role.id,
      username: email.split('@')[0]!,
      fullName: `Extra ${email}`,
      email,
      normalizedEmail: email,
      passwordHash: await hashPassword(password),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const client = createAuthClient(app);
  expect(
    (await client.post('/api/auth/login', { email, password, rememberMe: false })).status,
  ).toBe(200);
  return client;
}

async function createGlobalCity(client: ReturnType<typeof createAuthClient>, name = 'Dubai') {
  const res = await client.post('/api/masters/cities', {
    countryCode: 'AE',
    name,
    airportCode: 'DXB',
    status: 'ACTIVE',
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; isGlobal: boolean };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

describe('System Global Masters bootstrap', () => {
  it('creates the hidden system company with the correct identity', async () => {
    const result = await bootstrap();
    expect(result.systemCompany).toBe('created');

    const company = await db.company.findFirstOrThrow({
      where: { slug: 'system-global-masters' },
    });
    expect(company.isSystem).toBe(true);
    expect(company.isHidden).toBe(true);
    expect(company.status).toBe('ACTIVE');
    expect(company.name).toBe('System Global Masters');
  });

  it('re-running the bootstrap does not duplicate the company', async () => {
    await bootstrap();
    await bootstrap();
    await bootstrap();
    const count = await db.company.count({ where: { slug: 'system-global-masters' } });
    expect(count).toBe(1);
  });

  it('creates the System Admin with a hashed password (never plaintext)', async () => {
    await bootstrap();
    const user = await db.user.findUniqueOrThrow({ where: { normalizedEmail: SYSTEM_EMAIL } });
    expect(user.passwordHash).not.toBe(SYSTEM_PASSWORD);
    expect(user.passwordHash).not.toBe('');
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.deletedAt).toBeNull();
    const matches = await verifyPassword(user.passwordHash, SYSTEM_PASSWORD);
    expect(matches).toBe(true);
  });

  it('does not duplicate the user or reset the password on re-run', async () => {
    await bootstrap();
    await bootstrap();
    const users = await db.user.findMany({ where: { normalizedEmail: SYSTEM_EMAIL } });
    expect(users).toHaveLength(1);

    const before = users[0]!.passwordHash;
    const matches = await verifyPassword(before, SYSTEM_PASSWORD);
    expect(matches).toBe(true);
  });

  it('updates the password only when the reset flag is set', async () => {
    await bootstrap();
    const newPassword = 'Another@2026Pass';
    const result = await bootstrap({ password: newPassword, resetPassword: true });
    expect(result.passwordUpdated).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { normalizedEmail: SYSTEM_EMAIL } });
    const newMatches = await verifyPassword(user.passwordHash, newPassword);
    expect(newMatches).toBe(true);
    const oldMatches = await verifyPassword(user.passwordHash, SYSTEM_PASSWORD);
    expect(oldMatches).toBe(false);
  });

  it('keeps the password when the reset flag is absent', async () => {
    await bootstrap();
    const result = await bootstrap({ password: 'Ignored@2026Pass' });
    expect(result.passwordUpdated).toBe(false);

    const user = await db.user.findUniqueOrThrow({ where: { normalizedEmail: SYSTEM_EMAIL } });
    const matches = await verifyPassword(user.passwordHash, SYSTEM_PASSWORD);
    expect(matches).toBe(true);
  });

  it('fails safely when the email belongs to a normal tenant', async () => {
    await tenant(SYSTEM_EMAIL, 'Conflict Travel');
    await expect(bootstrap()).rejects.toThrow(/normal tenant/i);
  });

  it('lets the System Admin sign in through the normal login endpoint', async () => {
    await bootstrap();
    const client = createAuthClient(app);
    const login = await client.post('/api/auth/login', {
      email: SYSTEM_EMAIL,
      password: SYSTEM_PASSWORD,
      rememberMe: false,
      loginMode: 'COMPANY_ADMIN',
    });
    expect(login.status).toBe(200);
    expect(login.body.data.requiresEmailVerification).toBe(false);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.isSystemAdmin).toBe(true);
    expect(me.body.data.user.emailVerified).toBe(true);
    expect(me.body.data.session.expiresAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Global visibility
// ---------------------------------------------------------------------------

describe('Global Master visibility', () => {
  it('makes a system-created City visible to every tenant', async () => {
    await bootstrap();
    const sys = await systemAdminClient();
    const city = await createGlobalCity(sys);

    const clientA = await tenant('a@visible.test');
    const clientB = await tenant('b@visible.test');

    for (const client of [clientA, clientB]) {
      const res = await client.get('/api/masters/cities');
      expect(res.status).toBe(200);
      const ids = res.body.data.data.map((row: { id: string }) => row.id);
      expect(ids).toContain(city.id);
    }
  });

  it('keeps a tenant-created City private to its owner', async () => {
    await bootstrap();
    const clientA = await tenant('a@private.test');
    const clientB = await tenant('b@private.test');

    const created = await clientA.post('/api/masters/cities', {
      countryCode: 'IN',
      name: 'Mumbai',
      status: 'ACTIVE',
    });
    expect(created.status).toBe(201);
    const cityId = created.body.data.id;

    const listA = await clientA.get('/api/masters/cities');
    expect(listA.body.data.data.map((r: { id: string }) => r.id)).toContain(cityId);

    const listB = await clientB.get('/api/masters/cities');
    expect(listB.body.data.data.map((r: { id: string }) => r.id)).not.toContain(cityId);
  });

  it('lets the System Admin see global records but not tenant private records', async () => {
    await bootstrap();
    const clientA = await tenant('a@sysview.test');
    const privateCity = await clientA.post('/api/masters/cities', {
      countryCode: 'IN',
      name: 'Chennai',
      status: 'ACTIVE',
    });

    const sys = await systemAdminClient();
    const sysList = await sys.get('/api/masters/cities');
    const sysIds = sysList.body.data.data.map((r: { id: string }) => r.id);
    expect(sysIds).not.toContain(privateCity.body.data.id);
  });

  it('does not let a client-supplied companyId spoof global ownership', async () => {
    await bootstrap();
    const clientA = await tenant('a@spoof.test');
    const company = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'a@spoof.test' } });

    const created = await clientA.post('/api/masters/cities', {
      countryCode: 'IN',
      name: 'Delhi',
      status: 'ACTIVE',
      // The schema drops unknown fields; ownership must come from the session.
      companyId: (await db.company.findFirstOrThrow({ where: { isSystem: true } })).id,
    });
    expect(created.status).toBe(201);

    const stored = await db.city.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.companyId).toBe(company.companyId);
    expect(stored.companyId).not.toBe(
      (await db.company.findFirstOrThrow({ where: { isSystem: true } })).id,
    );
  });

  it('forces System Admin creations to the System Company', async () => {
    await bootstrap();
    const sys = await systemAdminClient();
    const city = await createGlobalCity(sys);
    const stored = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    const systemCompany = await db.company.findFirstOrThrow({ where: { isSystem: true } });
    expect(stored.companyId).toBe(systemCompany.id);
  });
});

// ---------------------------------------------------------------------------
// Edit protection
// ---------------------------------------------------------------------------

describe('Global Master edit protection', () => {
  it('returns 403 when a tenant owner edits a global City', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('owner@edit.test');

    const res = await clientA.patch(`/api/masters/cities/${city.id}`, { name: 'Hacked' });
    expect(res.status).toBe(403);

    const stored = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    expect(stored.name).toBe('Dubai');
  });

  it('returns 403 when a tenant archives a global City', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('owner@archive.test');

    const res = await clientA.delete(`/api/masters/cities/${city.id}`);
    expect(res.status).toBe(403);
    const stored = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    expect(stored.status).toBe('ACTIVE');
  });

  it('lets the System Admin edit a global City', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const sys = await systemAdminClient();

    const res = await sys.patch(`/api/masters/cities/${city.id}`, { name: 'Dubai City' });
    expect(res.status).toBe(200);
    const stored = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    expect(stored.name).toBe('Dubai City');
  });

  it('does not let the System Admin edit a tenant City', async () => {
    await bootstrap();
    const clientA = await tenant('owner@sysedit.test');
    const privateCity = await clientA.post('/api/masters/cities', {
      countryCode: 'IN',
      name: 'Pune',
      status: 'ACTIVE',
    });

    const sys = await systemAdminClient();
    const res = await sys.patch(`/api/masters/cities/${privateCity.body.data.id}`, { name: 'Xyz' });
    expect([404, 403]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Hide / restore
// ---------------------------------------------------------------------------

describe('Hide and restore global records', () => {
  it('hides a global City for one tenant only', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@hide.test');
    const clientB = await tenant('b@hide.test');

    const hide = await clientA.post(`/api/masters/CITY/${city.id}/hide`);
    expect(hide.status).toBe(200);

    const original = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    expect(original.status).toBe('ACTIVE');

    const hideRows = await db.companyHiddenMaster.findMany({
      where: { masterId: city.id },
    });
    expect(hideRows).toHaveLength(1);
    expect(hideRows[0]!.masterType).toBe('CITY');
    expect(hideRows[0]!.restoredAt).toBeNull();

    const listA = await clientA.get('/api/masters/cities');
    expect(listA.body.data.data.map((r: { id: string }) => r.id)).not.toContain(city.id);

    const listB = await clientB.get('/api/masters/cities');
    expect(listB.body.data.data.map((r: { id: string }) => r.id)).toContain(city.id);
  });

  it('keeps the hide idempotent', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@hide2.test');

    await clientA.post(`/api/masters/CITY/${city.id}/hide`);
    const again = await clientA.post(`/api/masters/CITY/${city.id}/hide`);
    expect(again.status).toBe(200);

    const rows = await db.companyHiddenMaster.findMany({ where: { masterId: city.id } });
    expect(rows).toHaveLength(1);
  });

  it('shares the hidden state across all users of one company', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@share.test');
    const companyId = (
      await db.user.findUniqueOrThrow({
        where: { normalizedEmail: 'a@share.test' },
      })
    ).companyId;
    const extra = await extraUser('a2@share.test', companyId);

    await clientA.post(`/api/masters/CITY/${city.id}/hide`);

    const res = await extra.get('/api/masters/cities');
    expect(res.body.data.data.map((r: { id: string }) => r.id)).not.toContain(city.id);
  });

  it('does not let another tenant restore a hide row', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@restoreb.test');
    const clientB = await tenant('b@restoreb.test');

    await clientA.post(`/api/masters/CITY/${city.id}/hide`);

    const res = await clientB.delete(`/api/masters/CITY/${city.id}/hide`);
    expect(res.status).toBe(404);

    const listB = await clientB.get('/api/masters/cities');
    expect(listB.body.data.data.map((r: { id: string }) => r.id)).toContain(city.id);
  });

  it('restores a hidden City without duplicating it', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@restore.test');

    await clientA.post(`/api/masters/CITY/${city.id}/hide`);

    const restore = await clientA.delete(`/api/masters/CITY/${city.id}/hide`);
    expect(restore.status).toBe(200);

    const listA = await clientA.get('/api/masters/cities');
    const matching = listA.body.data.data.filter((r: { id: string }) => r.id === city.id);
    expect(matching).toHaveLength(1);

    const rows = await db.companyHiddenMaster.findMany({ where: { masterId: city.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.restoredAt).not.toBeNull();
  });

  it('re-hides a restored record cleanly', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@rehide.test');

    await clientA.post(`/api/masters/CITY/${city.id}/hide`);
    await clientA.delete(`/api/masters/CITY/${city.id}/hide`);
    const rehide = await clientA.post(`/api/masters/CITY/${city.id}/hide`);
    expect(rehide.status).toBe(200);

    const listA = await clientA.get('/api/masters/cities');
    expect(listA.body.data.data.map((r: { id: string }) => r.id)).not.toContain(city.id);
  });
});

// ---------------------------------------------------------------------------
// Global archive
// ---------------------------------------------------------------------------

describe('Global archive', () => {
  it('removes an archived global City from every tenant list', async () => {
    await bootstrap();
    const sys = await systemAdminClient();
    const city = await createGlobalCity(sys);
    const clientA = await tenant('a@archive.test');
    const clientB = await tenant('b@archive.test');

    const archive = await sys.delete(`/api/masters/cities/${city.id}`);
    expect(archive.status).toBe(200);

    const stored = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    expect(stored.status).toBe('ARCHIVED');
    expect(stored.deletedAt).not.toBeNull();

    for (const client of [clientA, clientB]) {
      const res = await client.get('/api/masters/cities');
      expect(res.body.data.data.map((r: { id: string }) => r.id)).not.toContain(city.id);
    }
  });
});

// ---------------------------------------------------------------------------
// API / security
// ---------------------------------------------------------------------------

describe('System Masters API and security', () => {
  it('excludes the System Company from tenant company counts', async () => {
    await bootstrap();
    await tenant('a@count.test');
    const count = await companiesRepository.count();
    expect(count).toBe(1);
  });

  it('excludes the System Admin from tenant user lists', async () => {
    await bootstrap();
    const clientA = await tenant('a@users.test');
    const res = await clientA.get('/api/users');
    expect(res.status).toBe(200);
    const emails = res.body.data.data.map((u: { email: string }) => u.email);
    expect(emails).not.toContain(SYSTEM_EMAIL);
  });

  it('rejects an arbitrary masterType', async () => {
    await bootstrap();
    const clientA = await tenant('a@type.test');
    const city = await createGlobalCity(await systemAdminClient());
    const res = await clientA.post(`/api/masters/ROOMS/${city.id}/hide`);
    expect([400, 403]).toContain(res.status);
  });

  it('excludes a hidden global City from autocomplete lookups', async () => {
    await bootstrap();
    const city = await createGlobalCity(await systemAdminClient());
    const clientA = await tenant('a@lookup.test');

    const before = await clientA.get('/api/masters/cities/lookups?country=AE');
    expect(before.body.data.cities.map((c: { id: string }) => c.id)).toContain(city.id);

    await clientA.post(`/api/masters/CITY/${city.id}/hide`);

    const after = await clientA.get('/api/masters/cities/lookups?country=AE');
    expect(after.body.data.cities.map((c: { id: string }) => c.id)).not.toContain(city.id);
  });

  it('does not expose the System Admin or hidden state to tenant dropdowns', async () => {
    await bootstrap();
    const clientA = await tenant('a@lead.test');
    const lookups = await clientA.get('/api/queries/lookups');
    expect(lookups.status).toBe(200);
    const assignable = (lookups.body.data.assignableUsers ?? []) as Array<{
      email?: string;
      username?: string;
    }>;
    const identities = assignable.flatMap((u) => [u.email, u.username]).filter(Boolean);
    expect(identities).not.toContain(SYSTEM_EMAIL);
  });

  it('keeps tenant isolation intact for private master detail URLs', async () => {
    await bootstrap();
    const clientA = await tenant('a@detail.test');
    const clientB = await tenant('b@detail.test');
    const privateCity = await clientA.post('/api/masters/cities', {
      countryCode: 'IN',
      name: 'Kolkata',
      status: 'ACTIVE',
    });

    const res = await clientB.get(`/api/masters/cities/${privateCity.body.data.id}`);
    expect(res.status).toBe(404);
  });
});
