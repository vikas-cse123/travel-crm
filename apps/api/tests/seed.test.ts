import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  AVAILABLE_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  PLANNED_PERMISSION_KEYS,
  ROLE_NAME,
} from '@interscale/shared';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { DEMO_COMPANY, DEV_PASSWORD, SEED_USERS } from '../prisma/seed-data.js';
import { verifyPassword } from '../src/utils/crypto.js';

/**
 * Seed behaviour, run against the test database.
 *
 * The seed module is imported dynamically so it constructs its PrismaClient
 * only after `tests/setup.ts` has redirected DATABASE_URL — otherwise it would
 * write to the development database.
 */

let db: PrismaClient;

/** Snapshot of every table the seed touches. */
async function tableCounts(client: PrismaClient) {
  const [
    companies,
    users,
    roles,
    permissions,
    rolePermissions,
    templates,
    templatePermissions,
    activityLogs,
  ] = await Promise.all([
    client.company.count(),
    client.user.count(),
    client.role.count(),
    client.permission.count(),
    client.rolePermission.count(),
    client.permissionTemplate.count(),
    client.permissionTemplatePermission.count(),
    client.activityLog.count(),
  ]);
  return {
    companies,
    users,
    roles,
    permissions,
    rolePermissions,
    templates,
    templatePermissions,
    activityLogs,
  };
}

beforeAll(async () => {
  db = createTestPrismaClient();
  await truncateAll(db);

  const { runSeed, seedPrismaClient } = await import('../prisma/seed.js');
  await runSeed();
  await seedPrismaClient.$disconnect();
}, 60_000);

afterAll(async () => {
  await db.$disconnect();
});

describe('Seeded data', () => {
  it('creates the demo company', async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: DEMO_COMPANY.slug } });
    expect(company.name).toBe(DEMO_COMPANY.name);
    expect(company.status).toBe('ACTIVE');
  });

  it('creates the whole permission catalogue with correct availability', async () => {
    expect(await db.permission.count()).toBe(PERMISSION_CATALOG.length);
    expect(await db.permission.count({ where: { isAvailable: true } })).toBe(
      AVAILABLE_PERMISSION_KEYS.length,
    );
    expect(await db.permission.count({ where: { isAvailable: false } })).toBe(
      PLANNED_PERMISSION_KEYS.length,
    );
  });

  it('creates the five default roles with the expected hierarchy', async () => {
    const roles = await db.role.findMany({ orderBy: { hierarchyLevel: 'desc' } });

    expect(roles).toHaveLength(5);
    expect(roles.map((role) => role.name)).toEqual([
      ROLE_NAME.OWNER,
      ROLE_NAME.MANAGER,
      ROLE_NAME.SALES_EXECUTIVE,
      ROLE_NAME.DATA_ENTRY,
      ROLE_NAME.VIEW_ONLY,
    ]);
    expect(roles.every((role) => role.isSystem)).toBe(true);
  });

  it('grants the Owner role every currently available permission', async () => {
    const owner = await db.role.findFirstOrThrow({
      where: { name: ROLE_NAME.OWNER },
      include: { permissions: { include: { permission: true } } },
    });

    const grantedKeys = owner.permissions.map((entry) => entry.permission.key).sort();
    expect(grantedKeys).toEqual([...AVAILABLE_PERMISSION_KEYS].sort());
  });

  it('never grants a planned (unavailable) permission to any role', async () => {
    const grantsToPlanned = await db.rolePermission.count({
      where: { permission: { isAvailable: false } },
    });
    expect(grantsToPlanned).toBe(0);
  });

  it('never grants a planned permission to any template', async () => {
    const grantsToPlanned = await db.permissionTemplatePermission.count({
      where: { permission: { isAvailable: false } },
    });
    expect(grantsToPlanned).toBe(0);
  });

  it('creates every seed user with the documented status', async () => {
    for (const definition of SEED_USERS) {
      const user = await db.user.findUniqueOrThrow({
        where: { normalizedEmail: definition.email.toLowerCase() },
      });
      expect(user.status).toBe(definition.status);
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.deletedAt).toBeNull();
    }
  });

  it('covers the ACTIVE, INACTIVE and SUSPENDED statuses', async () => {
    const statuses = new Set((await db.user.findMany()).map((user) => user.status));
    expect(statuses).toContain('ACTIVE');
    expect(statuses).toContain('INACTIVE');
    expect(statuses).toContain('SUSPENDED');
  });

  it('stores passwords as verifiable Argon2id hashes, never plaintext', async () => {
    const users = await db.user.findMany();

    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(DEV_PASSWORD);
    }

    // The hash must actually verify, or the seeded accounts are unusable.
    const owner = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@interscale.local' },
    });
    expect(await verifyPassword(owner.passwordHash, DEV_PASSWORD)).toBe(true);
    expect(await verifyPassword(owner.passwordHash, 'WrongPassword@1')).toBe(false);
  });

  it('seeds no sessions, OTPs or reset tokens', async () => {
    // Credentials are minted by the auth flow, never pre-created.
    expect(await db.session.count()).toBe(0);
    expect(await db.emailVerificationOtp.count()).toBe(0);
    expect(await db.passwordResetToken.count()).toBe(0);
  });

  it('creates sample activity logs scoped to the demo company', async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: DEMO_COMPANY.slug } });
    const logs = await db.activityLog.findMany();

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => log.companyId === company.id)).toBe(true);
  });

  it('creates the quick-setup permission templates', async () => {
    const templates = await db.permissionTemplate.findMany();
    expect(templates.map((template) => template.name).sort()).toEqual([
      'Data Entry',
      'Manager',
      'Sales Executive',
      'View Only',
    ]);
  });
});

describe('Seed idempotency', () => {
  it('produces identical row counts when run a second time', async () => {
    const before = await tableCounts(db);

    const { runSeed, seedPrismaClient } = await import('../prisma/seed.js');
    await runSeed();
    await seedPrismaClient.$disconnect();

    const after = await tableCounts(db);

    expect(after).toEqual(before);
  }, 60_000);

  it('does not duplicate the demo company or its users', async () => {
    expect(await db.company.count({ where: { slug: DEMO_COMPANY.slug } })).toBe(1);
    expect(await db.user.count()).toBe(SEED_USERS.length);
  });
});
