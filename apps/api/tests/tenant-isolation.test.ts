import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import {
  createCompanyFixture,
  createUserFixture,
  seedPermissionCatalog,
  type SeededCompany,
} from './helpers/fixtures.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { rolesRepository } from '../src/modules/roles/roles.repository.js';
import { permissionTemplatesRepository } from '../src/modules/permission-templates/permission-templates.repository.js';
import { activityLogsRepository } from '../src/modules/activity-logs/activity-logs.repository.js';
import { companiesRepository } from '../src/modules/companies/companies.repository.js';
import { resolvePagination } from '../src/utils/pagination.js';

/**
 * Cross-tenant isolation.
 *
 * The threat these cover: an authenticated user of Company A discovers or
 * guesses a record id belonging to Company B and puts it in a URL. Because
 * every repository matches on id AND companyId, the row simply does not
 * match — no data is returned and no write lands.
 */

let db: PrismaClient;
let alpha: SeededCompany;
let beta: SeededCompany;

const pagination = resolvePagination({ page: 1, pageSize: 50 });

beforeAll(() => {
  db = createTestPrismaClient();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedPermissionCatalog(db);
  alpha = await createCompanyFixture(db, 'alpha');
  beta = await createCompanyFixture(db, 'beta');
});

describe('User isolation', () => {
  it('lists only its own company users', async () => {
    await createUserFixture(db, alpha, { username: 'a-one', email: 'a-one@alpha.local' });
    await createUserFixture(db, beta, { username: 'b-one', email: 'b-one@beta.local' });

    const result = await usersRepository.list(alpha.tenant, {}, pagination);

    expect(result.pagination.total).toBe(2); // alpha owner + a-one
    for (const user of result.data) {
      expect(user.companyId).toBe(alpha.companyId);
    }
    expect(result.data.map((u) => u.username)).not.toContain('b-one');
  });

  it('cannot read a Company B user by id', async () => {
    const betaUserId = await createUserFixture(db, beta, {
      username: 'b-secret',
      email: 'b-secret@beta.local',
    });

    // Company A asking for Company B's user id.
    const result = await usersRepository.findById(alpha.tenant, betaUserId);

    expect(result).toBeNull();
  });

  it('cannot update a Company B user', async () => {
    const betaUserId = await createUserFixture(db, beta, {
      username: 'b-target',
      email: 'b-target@beta.local',
      fullName: 'Original Name',
    });

    const updated = await usersRepository.update(alpha.tenant, betaUserId, {
      fullName: 'Hijacked Name',
    });

    expect(updated).toBeNull();

    // Confirm at the database level that nothing changed.
    const untouched = await db.user.findUniqueOrThrow({ where: { id: betaUserId } });
    expect(untouched.fullName).toBe('Original Name');
  });

  it('cannot change the status of a Company B user', async () => {
    const betaUserId = await createUserFixture(db, beta, {
      username: 'b-status',
      email: 'b-status@beta.local',
      status: 'ACTIVE',
    });

    const result = await usersRepository.updateStatus(alpha.tenant, betaUserId, 'SUSPENDED');

    expect(result).toBeNull();
    const untouched = await db.user.findUniqueOrThrow({ where: { id: betaUserId } });
    expect(untouched.status).toBe('ACTIVE');
  });

  it('cannot soft delete a Company B user', async () => {
    const betaUserId = await createUserFixture(db, beta, {
      username: 'b-delete',
      email: 'b-delete@beta.local',
    });

    const deleted = await usersRepository.softDelete(alpha.tenant, betaUserId);

    expect(deleted).toBe(false);
    const untouched = await db.user.findUniqueOrThrow({ where: { id: betaUserId } });
    expect(untouched.deletedAt).toBeNull();
  });

  it('counts only its own company users', async () => {
    await createUserFixture(db, beta, { username: 'b-two', email: 'b-two@beta.local' });
    await createUserFixture(db, beta, { username: 'b-three', email: 'b-three@beta.local' });

    expect(await usersRepository.countByStatus(alpha.tenant)).toBe(1);
    expect(await usersRepository.countByStatus(beta.tenant)).toBe(3);
  });
});

describe('Role isolation', () => {
  it('lists only its own company roles', async () => {
    const roles = await rolesRepository.list(alpha.tenant);

    expect(roles).toHaveLength(2);
    for (const role of roles) {
      expect(role.companyId).toBe(alpha.companyId);
    }
  });

  it('cannot read a Company B role by id', async () => {
    const result = await rolesRepository.findById(alpha.tenant, beta.ownerRoleId);
    expect(result).toBeNull();
  });

  it('resolves same-named roles to different rows per company', async () => {
    const alphaOwner = await rolesRepository.findByName(alpha.tenant, 'Owner');
    const betaOwner = await rolesRepository.findByName(beta.tenant, 'Owner');

    expect(alphaOwner?.id).toBe(alpha.ownerRoleId);
    expect(betaOwner?.id).toBe(beta.ownerRoleId);
    expect(alphaOwner?.id).not.toBe(betaOwner?.id);
  });
});

describe('Permission template isolation', () => {
  it('cannot read a Company B template', async () => {
    const betaTemplate = await db.permissionTemplate.create({
      data: { companyId: beta.companyId, name: 'Beta Only', status: 'ACTIVE' },
    });

    expect(await permissionTemplatesRepository.findById(alpha.tenant, betaTemplate.id)).toBeNull();
    expect(await permissionTemplatesRepository.list(alpha.tenant)).toHaveLength(0);
    expect(await permissionTemplatesRepository.list(beta.tenant)).toHaveLength(1);
  });

  it('cannot deactivate or delete a Company B template', async () => {
    const betaTemplate = await db.permissionTemplate.create({
      data: { companyId: beta.companyId, name: 'Beta Ops', status: 'ACTIVE' },
    });

    expect(
      await permissionTemplatesRepository.updateStatus(alpha.tenant, betaTemplate.id, 'INACTIVE'),
    ).toBe(false);
    expect(await permissionTemplatesRepository.softDelete(alpha.tenant, betaTemplate.id)).toBe(
      false,
    );

    const untouched = await db.permissionTemplate.findUniqueOrThrow({
      where: { id: betaTemplate.id },
    });
    expect(untouched.status).toBe('ACTIVE');
    expect(untouched.deletedAt).toBeNull();
  });
});

describe('Activity log isolation', () => {
  it('returns only its own company entries', async () => {
    await activityLogsRepository.record(alpha.tenant, {
      actorUserId: alpha.ownerUserId,
      action: 'LOGIN_SUCCESS',
      entityType: 'Session',
    });
    await activityLogsRepository.record(beta.tenant, {
      actorUserId: beta.ownerUserId,
      action: 'LOGIN_FAILED',
      entityType: 'Session',
    });

    const alphaLogs = await activityLogsRepository.list(alpha.tenant, {}, pagination);

    expect(alphaLogs.pagination.total).toBe(1);
    expect(alphaLogs.data[0]?.action).toBe('LOGIN_SUCCESS');
    expect(alphaLogs.data[0]?.companyId).toBe(alpha.companyId);
  });

  it('scopes counts and recent entries per company', async () => {
    await activityLogsRepository.record(beta.tenant, {
      action: 'COMPANY_REGISTERED',
      entityType: 'Company',
    });
    await activityLogsRepository.record(beta.tenant, {
      action: 'USER_CREATED',
      entityType: 'User',
    });

    expect(await activityLogsRepository.count(alpha.tenant)).toBe(0);
    expect(await activityLogsRepository.count(beta.tenant)).toBe(2);
    expect(await activityLogsRepository.listRecent(alpha.tenant)).toHaveLength(0);
  });
});

describe('Company isolation', () => {
  it('a tenant reads only its own company record', async () => {
    const alphaCompany = await companiesRepository.findForTenant(alpha.tenant);
    const betaCompany = await companiesRepository.findForTenant(beta.tenant);

    expect(alphaCompany?.id).toBe(alpha.companyId);
    expect(betaCompany?.id).toBe(beta.companyId);
    expect(alphaCompany?.slug).toBe('alpha');
  });
});

describe('Tenant context', () => {
  it('rejects an empty company id', async () => {
    const { createTenantContext } = await import('../src/db/tenant.js');
    expect(() => createTenantContext('')).toThrow(/non-empty companyId/);
  });
});
