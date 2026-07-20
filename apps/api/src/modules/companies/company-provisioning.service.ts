import type { Prisma, PrismaClient } from '@prisma/client';
import {
  DEFAULT_PERMISSION_TEMPLATES,
  DEFAULT_ROLES,
  PERMISSION_CATALOG,
} from '@interscale/shared';
import { prisma } from '../../config/prisma.js';

/**
 * Everything a brand-new company needs: the permission catalogue, the five
 * default roles with their grants, and the quick-setup templates.
 *
 * This is the SINGLE implementation used by both `prisma/seed.ts` and the
 * registration flow. Duplicating it would let the demo tenant and a real
 * registered tenant drift apart — the seed would be testing a structure that
 * production never actually builds.
 *
 * Every operation is an upsert, so it is safe to call repeatedly and safe to
 * run inside a transaction that may be retried.
 */

/** Accepts either the base client or a transaction handle. */
type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Ensure the global permission catalogue matches the code definition.
 *
 * Call this OUTSIDE a registration transaction: it touches ~47 rows and the
 * catalogue is global, so it does not need to be atomic with one company's
 * creation.
 */
export async function ensurePermissionCatalog(client: DbClient = prisma): Promise<void> {
  // Fast path: the catalogue rarely changes, so skip ~47 upserts when the row
  // count already matches. Registration hits this on every request.
  const existing = await client.permission.count();
  if (existing === PERMISSION_CATALOG.length) return;

  for (const definition of PERMISSION_CATALOG) {
    await client.permission.upsert({
      where: { key: definition.key },
      update: {
        module: definition.module,
        action: definition.action,
        description: definition.description,
        isAvailable: definition.isAvailable,
      },
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

export interface ProvisionedDefaults {
  /** Role name → role id. */
  roleIds: Map<string, string>;
  /** Template name → template id. */
  templateIds: Map<string, string>;
  ownerRoleId: string;
}

/**
 * Create the default roles, role-permission grants and permission templates
 * for a company.
 *
 * `createdById` is null during registration because the Owner user does not
 * exist yet when templates are created; the seed passes the owner's id.
 */
export async function provisionCompanyDefaults(
  client: DbClient,
  companyId: string,
  options: { createdById?: string | null } = {},
): Promise<ProvisionedDefaults> {
  // Resolve every permission key to an id once, rather than per grant.
  const permissions = await client.permission.findMany({
    select: { id: true, key: true, isAvailable: true },
  });

  const permissionIdByKey = new Map(permissions.map((p) => [p.key, p.id]));
  const availableKeys = permissions.filter((p) => p.isAvailable).map((p) => p.key);

  if (permissionIdByKey.size === 0) {
    throw new Error(
      'Cannot provision a company: the permission catalogue is empty. Call ensurePermissionCatalog first.',
    );
  }

  const roleIds = new Map<string, string>();
  let ownerRoleId = '';

  for (const definition of DEFAULT_ROLES) {
    const role = await client.role.upsert({
      where: { companyId_name: { companyId, name: definition.name } },
      update: {
        description: definition.description,
        hierarchyLevel: definition.hierarchyLevel,
        isSystem: definition.isSystem,
      },
      create: {
        companyId,
        name: definition.name,
        description: definition.description,
        hierarchyLevel: definition.hierarchyLevel,
        isSystem: definition.isSystem,
      },
      select: { id: true },
    });

    roleIds.set(definition.name, role.id);
    if (definition.name === 'Owner') ownerRoleId = role.id;

    // `null` means "every currently available permission", so the Owner role
    // picks up new permissions automatically as modules ship.
    const keys = definition.permissionKeys === null ? availableKeys : definition.permissionKeys;

    for (const key of keys) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) {
        throw new Error(`Role "${definition.name}" references unknown permission "${key}".`);
      }
      await client.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  const templateIds = new Map<string, string>();

  for (const definition of DEFAULT_PERMISSION_TEMPLATES) {
    const template = await client.permissionTemplate.upsert({
      where: { companyId_name: { companyId, name: definition.name } },
      update: { description: definition.description },
      create: {
        companyId,
        name: definition.name,
        description: definition.description,
        status: 'ACTIVE',
        createdById: options.createdById ?? null,
      },
      select: { id: true },
    });

    templateIds.set(definition.name, template.id);

    for (const key of definition.permissionKeys) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) {
        throw new Error(`Template "${definition.name}" references unknown permission "${key}".`);
      }
      await client.permissionTemplatePermission.upsert({
        where: { templateId_permissionId: { templateId: template.id, permissionId } },
        update: {},
        create: { templateId: template.id, permissionId },
      });
    }
  }

  if (!ownerRoleId) {
    throw new Error('Provisioning did not produce an Owner role.');
  }

  return { roleIds, templateIds, ownerRoleId };
}
