import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, PLANNED_PERMISSION_KEYS } from '@interscale/shared';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createCompanyFixture, seedPermissionCatalog } from './helpers/fixtures.js';
import { permissionsService } from '../src/modules/auth/permissions.service.js';

/**
 * Effective-permission resolution: (role ∪ template) ∩ available.
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
  await seedPermissionCatalog(db);
});

/** Grant one permission key to a role by key. */
async function grantToRole(roleId: string, key: string) {
  const permission = await db.permission.findUniqueOrThrow({ where: { key } });
  await db.rolePermission.create({ data: { roleId, permissionId: permission.id } });
}

describe('permissionsService.resolveForUser', () => {
  it('returns the role permissions for a user with no template', async () => {
    const company = await createCompanyFixture(db, 'alpha');
    await grantToRole(company.ownerRoleId, PERMISSIONS.DASHBOARD_VIEW);
    await grantToRole(company.ownerRoleId, PERMISSIONS.USERS_VIEW);

    const user = await db.user.create({
      data: {
        companyId: company.companyId,
        roleId: company.ownerRoleId,
        username: 'role-only',
        fullName: 'Role Only',
        email: 'role@alpha.local',
        normalizedEmail: 'role@alpha.local',
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    const keys = await permissionsService.resolveForUser(user.id);
    expect(keys).toEqual([PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.USERS_VIEW].sort());
  });

  it('unions role and active-template permissions', async () => {
    const company = await createCompanyFixture(db, 'alpha');
    await grantToRole(company.managerRoleId, PERMISSIONS.DASHBOARD_VIEW);

    const template = await db.permissionTemplate.create({
      data: { companyId: company.companyId, name: 'Extra', status: 'ACTIVE' },
    });
    const rolesView = await db.permission.findUniqueOrThrow({
      where: { key: PERMISSIONS.ROLES_VIEW },
    });
    await db.permissionTemplatePermission.create({
      data: { templateId: template.id, permissionId: rolesView.id },
    });

    const user = await db.user.create({
      data: {
        companyId: company.companyId,
        roleId: company.managerRoleId,
        permissionTemplateId: template.id,
        username: 'unioned',
        fullName: 'Unioned',
        email: 'union@alpha.local',
        normalizedEmail: 'union@alpha.local',
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    const keys = await permissionsService.resolveForUser(user.id);
    // Role's dashboard.view PLUS the template's roles.view.
    expect(keys).toContain(PERMISSIONS.DASHBOARD_VIEW);
    expect(keys).toContain(PERMISSIONS.ROLES_VIEW);
  });

  it('a template only adds — it can never remove a role permission', async () => {
    const company = await createCompanyFixture(db, 'alpha');
    await grantToRole(company.ownerRoleId, PERMISSIONS.DASHBOARD_VIEW);
    await grantToRole(company.ownerRoleId, PERMISSIONS.USERS_CREATE);

    // An empty template attached to the user.
    const template = await db.permissionTemplate.create({
      data: { companyId: company.companyId, name: 'Empty', status: 'ACTIVE' },
    });

    const user = await db.user.create({
      data: {
        companyId: company.companyId,
        roleId: company.ownerRoleId,
        permissionTemplateId: template.id,
        username: 'empty-template',
        fullName: 'Empty Template',
        email: 'empty@alpha.local',
        normalizedEmail: 'empty@alpha.local',
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    const keys = await permissionsService.resolveForUser(user.id);
    // Role permissions survive an empty template.
    expect(keys).toContain(PERMISSIONS.DASHBOARD_VIEW);
    expect(keys).toContain(PERMISSIONS.USERS_CREATE);
  });

  it('ignores an inactive template', async () => {
    const company = await createCompanyFixture(db, 'alpha');
    await grantToRole(company.managerRoleId, PERMISSIONS.DASHBOARD_VIEW);

    const template = await db.permissionTemplate.create({
      data: { companyId: company.companyId, name: 'Off', status: 'INACTIVE' },
    });
    const rolesView = await db.permission.findUniqueOrThrow({
      where: { key: PERMISSIONS.ROLES_VIEW },
    });
    await db.permissionTemplatePermission.create({
      data: { templateId: template.id, permissionId: rolesView.id },
    });

    const user = await db.user.create({
      data: {
        companyId: company.companyId,
        roleId: company.managerRoleId,
        permissionTemplateId: template.id,
        username: 'inactive-template',
        fullName: 'Inactive Template',
        email: 'inactive@alpha.local',
        normalizedEmail: 'inactive@alpha.local',
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    const keys = await permissionsService.resolveForUser(user.id);
    expect(keys).toContain(PERMISSIONS.DASHBOARD_VIEW);
    expect(keys).not.toContain(PERMISSIONS.ROLES_VIEW);
  });

  it('never surfaces a planned (unavailable) permission, even if granted', async () => {
    const company = await createCompanyFixture(db, 'alpha');

    // Force-grant a planned permission directly to the role.
    const plannedKey = PLANNED_PERMISSION_KEYS[0] as string;
    const planned = await db.permission.findUniqueOrThrow({ where: { key: plannedKey } });
    await db.rolePermission.create({
      data: { roleId: company.ownerRoleId, permissionId: planned.id },
    });

    const user = await db.user.create({
      data: {
        companyId: company.companyId,
        roleId: company.ownerRoleId,
        username: 'planned',
        fullName: 'Planned',
        email: 'planned@alpha.local',
        normalizedEmail: 'planned@alpha.local',
        passwordHash: 'x',
        status: 'ACTIVE',
      },
    });

    const keys = await permissionsService.resolveForUser(user.id);
    // The availability filter strips it, regardless of the stray grant.
    expect(keys).not.toContain(plannedKey);
  });
});
