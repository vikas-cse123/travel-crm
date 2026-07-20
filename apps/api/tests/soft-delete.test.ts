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
import { permissionTemplatesRepository } from '../src/modules/permission-templates/permission-templates.repository.js';
import { resolvePagination } from '../src/utils/pagination.js';

/** Soft deletion must hide rows from normal reads while preserving them. */

let db: PrismaClient;
let alpha: SeededCompany;

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
});

describe('User soft deletion', () => {
  it('hides the user from reads but keeps the row', async () => {
    const userId = await createUserFixture(db, alpha, {
      username: 'departing',
      email: 'departing@alpha.local',
    });

    expect(await usersRepository.softDelete(alpha.tenant, userId)).toBe(true);

    // Gone from the normal read paths...
    expect(await usersRepository.findById(alpha.tenant, userId)).toBeNull();
    const list = await usersRepository.list(alpha.tenant, {}, pagination);
    expect(list.data.map((u) => u.id)).not.toContain(userId);

    // ...but still present for audit, and marked ARCHIVED.
    const raw = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(raw.deletedAt).toBeInstanceOf(Date);
    expect(raw.status).toBe('ARCHIVED');
  });

  it('exposes soft-deleted users through the explicit include-deleted read', async () => {
    const userId = await createUserFixture(db, alpha, {
      username: 'archived',
      email: 'archived@alpha.local',
    });
    await usersRepository.softDelete(alpha.tenant, userId);

    const found = await usersRepository.findByIdIncludingDeleted(alpha.tenant, userId);
    expect(found?.id).toBe(userId);

    const list = await usersRepository.list(alpha.tenant, { includeDeleted: true }, pagination);
    expect(list.data.map((u) => u.id)).toContain(userId);
  });

  it('restores a soft-deleted user as INACTIVE', async () => {
    const userId = await createUserFixture(db, alpha, {
      username: 'returning',
      email: 'returning@alpha.local',
    });
    await usersRepository.softDelete(alpha.tenant, userId);

    expect(await usersRepository.restore(alpha.tenant, userId)).toBe(true);

    const restored = await usersRepository.findById(alpha.tenant, userId);
    // Deliberately not ACTIVE: reactivation is a separate, explicit decision.
    expect(restored?.status).toBe('INACTIVE');
  });

  it('keeps the email reserved while soft deleted', async () => {
    const userId = await createUserFixture(db, alpha, {
      username: 'reserved',
      email: 'reserved@alpha.local',
    });
    await usersRepository.softDelete(alpha.tenant, userId);

    // Documented trade-off: archiving does not release the address, so a
    // restore can never collide with a newer account.
    expect(await usersRepository.isEmailTaken('reserved@alpha.local')).toBe(true);
  });

  it('excludes soft-deleted users from status counts', async () => {
    const userId = await createUserFixture(db, alpha, {
      username: 'counted',
      email: 'counted@alpha.local',
      status: 'ACTIVE',
    });

    expect(await usersRepository.countByStatus(alpha.tenant, 'ACTIVE')).toBe(2);
    await usersRepository.softDelete(alpha.tenant, userId);
    expect(await usersRepository.countByStatus(alpha.tenant, 'ACTIVE')).toBe(1);
  });
});

describe('PermissionTemplate soft deletion', () => {
  it('hides the template from reads but keeps the row', async () => {
    const template = await db.permissionTemplate.create({
      data: { companyId: alpha.companyId, name: 'Retired', status: 'ACTIVE' },
    });

    expect(await permissionTemplatesRepository.softDelete(alpha.tenant, template.id)).toBe(true);

    expect(await permissionTemplatesRepository.findById(alpha.tenant, template.id)).toBeNull();
    expect(await permissionTemplatesRepository.list(alpha.tenant)).toHaveLength(0);
    expect(await permissionTemplatesRepository.count(alpha.tenant)).toBe(0);

    const raw = await db.permissionTemplate.findUniqueOrThrow({ where: { id: template.id } });
    expect(raw.deletedAt).toBeInstanceOf(Date);
    expect(raw.status).toBe('INACTIVE');
  });

  it('keeps users attached to a soft-deleted template rather than deleting them', async () => {
    const template = await db.permissionTemplate.create({
      data: { companyId: alpha.companyId, name: 'Attached', status: 'ACTIVE' },
    });
    const userId = await createUserFixture(db, alpha, {
      username: 'attached',
      email: 'attached@alpha.local',
    });
    await db.user.update({
      where: { id: userId },
      data: { permissionTemplateId: template.id },
    });

    await permissionTemplatesRepository.softDelete(alpha.tenant, template.id);

    const user = await usersRepository.findById(alpha.tenant, userId);
    expect(user).not.toBeNull();
  });

  it('nulls the user link when a template is hard deleted (SetNull)', async () => {
    const template = await db.permissionTemplate.create({
      data: { companyId: alpha.companyId, name: 'Purged', status: 'ACTIVE' },
    });
    const userId = await createUserFixture(db, alpha, {
      username: 'purged',
      email: 'purged@alpha.local',
    });
    await db.user.update({
      where: { id: userId },
      data: { permissionTemplateId: template.id },
    });

    await db.permissionTemplate.delete({ where: { id: template.id } });

    // The user survives; only the association is removed.
    const raw = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(raw.permissionTemplateId).toBeNull();
  });
});
