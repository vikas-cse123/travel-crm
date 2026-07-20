import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createCompanyFixture, seedPermissionCatalog } from './helpers/fixtures.js';
import { hashPassword } from '../src/utils/crypto.js';
import { normalizeEmail } from '../src/utils/normalize.js';

/**
 * These assert that the DATABASE refuses invalid data, not that application
 * code happens to check first. Application validation can be bypassed by a
 * bug, a migration script or a future endpoint; a constraint cannot.
 */

let db: PrismaClient;

beforeAll(() => {
  db = createTestPrismaClient();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
});

/** Postgres unique-violation code, surfaced by Prisma as P2002. */
const UNIQUE_VIOLATION = 'P2002';

describe('Company constraints', () => {
  it('creates a company', async () => {
    const company = await db.company.create({
      data: { name: 'Blue Sky Travels', slug: 'blue-sky-travels', email: 'hi@bluesky.local' },
    });

    expect(company.id).toBeTruthy();
    expect(company.status).toBe('ACTIVE');
    expect(company.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate slug', async () => {
    await db.company.create({
      data: { name: 'Alpha', slug: 'duplicate-slug', email: 'a@alpha.local' },
    });

    await expect(
      db.company.create({ data: { name: 'Beta', slug: 'duplicate-slug', email: 'b@beta.local' } }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});

describe('User constraints', () => {
  it('enforces globally unique normalized email across different companies', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    const beta = await createCompanyFixture(db, 'beta');
    const passwordHash = await hashPassword('Shared@2026');

    await db.user.create({
      data: {
        companyId: alpha.companyId,
        roleId: alpha.managerRoleId,
        username: 'shared',
        fullName: 'Shared Person',
        email: 'shared@example.com',
        normalizedEmail: normalizeEmail('shared@example.com'),
        passwordHash,
      },
    });

    // Same address, different company: still refused, because login has no
    // tenant selector and must resolve an address to one account.
    await expect(
      db.user.create({
        data: {
          companyId: beta.companyId,
          roleId: beta.managerRoleId,
          username: 'shared',
          fullName: 'Shared Person',
          email: 'Shared@Example.com',
          normalizedEmail: normalizeEmail('Shared@Example.com'),
          passwordHash,
        },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('scopes username uniqueness to the company', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    const beta = await createCompanyFixture(db, 'beta');
    const passwordHash = await hashPassword('Shared@2026');

    // Both companies already have an "owner" username from the fixture, which
    // is itself proof that the constraint is per-company rather than global.
    const alphaOwner = await db.user.findFirst({
      where: { companyId: alpha.companyId, username: 'owner' },
    });
    const betaOwner = await db.user.findFirst({
      where: { companyId: beta.companyId, username: 'owner' },
    });

    expect(alphaOwner).not.toBeNull();
    expect(betaOwner).not.toBeNull();
    expect(alphaOwner?.id).not.toBe(betaOwner?.id);

    // A repeat within one company is refused.
    await expect(
      db.user.create({
        data: {
          companyId: alpha.companyId,
          roleId: alpha.managerRoleId,
          username: 'owner',
          fullName: 'Second Owner',
          email: 'second@alpha.local',
          normalizedEmail: normalizeEmail('second@alpha.local'),
          passwordHash,
        },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('defaults a new user to PENDING_VERIFICATION and unverified', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');

    const user = await db.user.create({
      data: {
        companyId: alpha.companyId,
        roleId: alpha.managerRoleId,
        username: 'fresh',
        fullName: 'Fresh User',
        email: 'fresh@alpha.local',
        normalizedEmail: normalizeEmail('fresh@alpha.local'),
        passwordHash: await hashPassword('Fresh@2026'),
      },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.mustChangePassword).toBe(false);
    expect(user.deletedAt).toBeNull();
  });

  it('refuses to delete a role that still has users (Restrict)', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');

    await expect(db.role.delete({ where: { id: alpha.ownerRoleId } })).rejects.toBeTruthy();
  });
});

describe('Role constraints', () => {
  it('scopes role-name uniqueness to the company', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    const beta = await createCompanyFixture(db, 'beta');

    // "Owner" exists in both companies independently.
    const owners = await db.role.findMany({ where: { name: 'Owner' } });
    expect(owners).toHaveLength(2);
    expect(new Set(owners.map((role) => role.companyId))).toEqual(
      new Set([alpha.companyId, beta.companyId]),
    );

    await expect(
      db.role.create({ data: { companyId: alpha.companyId, name: 'Owner', hierarchyLevel: 90 } }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});

describe('Permission constraints', () => {
  it('enforces a globally unique permission key', async () => {
    await db.permission.create({
      data: { key: 'users.view', module: 'users', action: 'view', description: 'View users' },
    });

    await expect(
      db.permission.create({
        data: { key: 'users.view', module: 'users', action: 'view', description: 'Duplicate' },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('enforces unique role-permission pairs', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    await seedPermissionCatalog(db);

    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'dashboard.view' } });

    await db.rolePermission.create({
      data: { roleId: alpha.managerRoleId, permissionId: permission.id },
    });

    await expect(
      db.rolePermission.create({
        data: { roleId: alpha.managerRoleId, permissionId: permission.id },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('enforces unique template-permission pairs', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    await seedPermissionCatalog(db);

    const template = await db.permissionTemplate.create({
      data: { companyId: alpha.companyId, name: 'Ops', status: 'ACTIVE' },
    });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'dashboard.view' } });

    await db.permissionTemplatePermission.create({
      data: { templateId: template.id, permissionId: permission.id },
    });

    await expect(
      db.permissionTemplatePermission.create({
        data: { templateId: template.id, permissionId: permission.id },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});

describe('PermissionTemplate constraints', () => {
  it('scopes template-name uniqueness to the company', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    const beta = await createCompanyFixture(db, 'beta');

    await db.permissionTemplate.create({ data: { companyId: alpha.companyId, name: 'Sales' } });
    // The same name in another company is fine.
    await expect(
      db.permissionTemplate.create({ data: { companyId: beta.companyId, name: 'Sales' } }),
    ).resolves.toBeTruthy();

    await expect(
      db.permissionTemplate.create({ data: { companyId: alpha.companyId, name: 'Sales' } }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});

describe('Credential tables', () => {
  it('enforces a unique session token hash', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    const expiresAt = new Date(Date.now() + 3_600_000);

    await db.session.create({
      data: { userId: alpha.ownerUserId, tokenHash: 'a'.repeat(64), expiresAt },
    });

    await expect(
      db.session.create({
        data: { userId: alpha.ownerUserId, tokenHash: 'a'.repeat(64), expiresAt },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('cascades sessions, OTPs and reset tokens when a user is hard deleted', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');
    const expiresAt = new Date(Date.now() + 3_600_000);

    await db.session.create({
      data: { userId: alpha.ownerUserId, tokenHash: 'b'.repeat(64), expiresAt },
    });
    await db.emailVerificationOtp.create({
      data: { userId: alpha.ownerUserId, otpHash: 'c'.repeat(64), expiresAt },
    });
    await db.passwordResetToken.create({
      data: { userId: alpha.ownerUserId, tokenHash: 'd'.repeat(64), expiresAt },
    });

    await db.user.delete({ where: { id: alpha.ownerUserId } });

    expect(await db.session.count()).toBe(0);
    expect(await db.emailVerificationOtp.count()).toBe(0);
    expect(await db.passwordResetToken.count()).toBe(0);
  });
});

describe('ActivityLog retention', () => {
  it('preserves the audit row and nulls the actor when a user is deleted', async () => {
    const alpha = await createCompanyFixture(db, 'alpha');

    await db.activityLog.create({
      data: {
        companyId: alpha.companyId,
        actorUserId: alpha.ownerUserId,
        targetUserId: alpha.ownerUserId,
        action: 'LOGIN_SUCCESS',
        entityType: 'Session',
      },
    });

    await db.user.delete({ where: { id: alpha.ownerUserId } });

    // The record of what happened must outlive the account that did it.
    const logs = await db.activityLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorUserId).toBeNull();
    expect(logs[0]?.targetUserId).toBeNull();
    expect(logs[0]?.action).toBe('LOGIN_SUCCESS');
  });
});
