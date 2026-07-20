import type { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG, ROLE_NAME } from '@interscale/shared';
import { hashPassword } from '../../src/utils/crypto.js';
import { normalizeEmail } from '../../src/utils/normalize.js';
import { createTenantContext, type TenantContext } from '../../src/db/tenant.js';

/**
 * Builders for test data. Each returns the ids a test needs, so tests read as
 * assertions rather than as setup.
 */

export interface SeededCompany {
  companyId: string;
  tenant: TenantContext;
  ownerRoleId: string;
  managerRoleId: string;
  ownerUserId: string;
}

/** Insert the shared permission catalogue. Safe to call more than once. */
export async function seedPermissionCatalog(client: PrismaClient): Promise<void> {
  for (const definition of PERMISSION_CATALOG) {
    await client.permission.upsert({
      where: { key: definition.key },
      update: {},
      create: {
        key: definition.key,
        module: definition.module,
        action: definition.action,
        description: definition.description,
        isAvailable: definition.isAvailable,
      },
    });
  }
}

/**
 * Create an independent company with two roles and one owner user.
 *
 * `slug` keys everything, so two calls with different slugs produce two fully
 * separate tenants — which is what the isolation tests need.
 */
export async function createCompanyFixture(
  client: PrismaClient,
  slug: string,
): Promise<SeededCompany> {
  const company = await client.company.create({
    data: {
      name: `Company ${slug}`,
      slug,
      email: `contact@${slug}.local`,
      status: 'ACTIVE',
    },
  });

  const ownerRole = await client.role.create({
    data: {
      companyId: company.id,
      name: ROLE_NAME.OWNER,
      description: 'Owner',
      hierarchyLevel: 100,
      isSystem: true,
    },
  });

  const managerRole = await client.role.create({
    data: {
      companyId: company.id,
      name: ROLE_NAME.MANAGER,
      description: 'Manager',
      hierarchyLevel: 80,
      isSystem: true,
    },
  });

  const passwordHash = await hashPassword('Fixture@2026');

  const owner = await client.user.create({
    data: {
      companyId: company.id,
      roleId: ownerRole.id,
      username: 'owner',
      fullName: `Owner of ${slug}`,
      email: `owner@${slug}.local`,
      normalizedEmail: normalizeEmail(`owner@${slug}.local`),
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  return {
    companyId: company.id,
    tenant: createTenantContext(company.id),
    ownerRoleId: ownerRole.id,
    managerRoleId: managerRole.id,
    ownerUserId: owner.id,
  };
}

/** Add an extra user to an existing company fixture. */
export async function createUserFixture(
  client: PrismaClient,
  company: SeededCompany,
  overrides: {
    username: string;
    email: string;
    fullName?: string;
    status?: 'PENDING_VERIFICATION' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    roleId?: string;
  },
): Promise<string> {
  const user = await client.user.create({
    data: {
      companyId: company.companyId,
      roleId: overrides.roleId ?? company.managerRoleId,
      username: overrides.username,
      fullName: overrides.fullName ?? overrides.username,
      email: overrides.email,
      normalizedEmail: normalizeEmail(overrides.email),
      passwordHash: await hashPassword('Fixture@2026'),
      status: overrides.status ?? 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  return user.id;
}
