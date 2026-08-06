import {
  ACTIVITY_ACTION,
  ENTITY_TYPE,
  SYSTEM_ADMIN_PERMISSION_KEYS,
  SYSTEM_ADMIN_ROLE_NAME,
  SYSTEM_GLOBAL_MASTERS_COMPANY_NAME,
  SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { hashPassword } from '../../utils/crypto.js';
import { normalizeEmail } from '../../utils/normalize.js';
import { ensurePermissionCatalog } from '../companies/company-provisioning.service.js';
import { resetSystemCompanyIdCache } from '../masters/master-visibility.js';

/**
 * Idempotent bootstrap for the System Global Masters company and System Admin.
 *
 * Safe to run any number of times. It never changes the System Admin password
 * unless the explicit reset flag is set, never moves a normal tenant user into
 * the system company, and never prints or stores the plaintext password.
 */

export interface SystemMastersBootstrapResult {
  systemCompany: 'created' | 'existing';
  systemAdmin: 'created' | 'existing';
  passwordUpdated: boolean;
  permissionsSynchronized: true;
}

/** Optional explicit overrides, for tests; production reads the environment. */
export interface SystemMastersBootstrapOptions {
  email?: string;
  password?: string;
  resetPassword?: boolean;
}

/** Throw a safe bootstrap error without leaking the secret or its length. */
function fail(message: string): never {
  throw new Error(message);
}

export async function runSystemMastersBootstrap(
  options: SystemMastersBootstrapOptions = {},
): Promise<SystemMastersBootstrapResult> {
  await ensurePermissionCatalog();

  const systemAdminEmail = options.email ?? env.SYSTEM_ADMIN_EMAIL;
  const systemAdminPassword = options.password ?? env.SYSTEM_ADMIN_PASSWORD;
  if (!systemAdminEmail) {
    fail('System Masters bootstrap requires SYSTEM_ADMIN_EMAIL to be set.');
  }
  if (!systemAdminPassword) {
    fail('System Masters bootstrap requires SYSTEM_ADMIN_PASSWORD to be set.');
  }
  const resetPassword = options.resetPassword ?? env.SYSTEM_ADMIN_RESET_PASSWORD;

  const normalizedEmail = normalizeEmail(systemAdminEmail);

  const result = await prisma.$transaction(
    async (tx) => {
      // --- System company -------------------------------------------------
      const existingBySlug = await tx.company.findUnique({
        where: { slug: SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG },
        select: { id: true, isSystem: true, isHidden: true, name: true },
      });

      let systemCompanyId: string;
      let companyCreated = false;

      if (existingBySlug) {
        if (!existingBySlug.isSystem) {
          fail(
            `The slug "${SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG}" is already used by a real tenant. Refusing to convert it into the system company.`,
          );
        }
        systemCompanyId = existingBySlug.id;
      } else {
        const flagged = await tx.company.findMany({
          where: { isSystem: true },
          select: { id: true },
          take: 2,
        });
        if (flagged.length > 1) {
          fail('Multiple system companies exist. The database integrity issue must be resolved first.');
        }
        if (flagged.length === 1) {
          systemCompanyId = flagged[0]!.id;
        } else {
          const created = await tx.company.create({
            data: {
              name: SYSTEM_GLOBAL_MASTERS_COMPANY_NAME,
              slug: SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG,
              email: systemAdminEmail,
              status: 'ACTIVE',
              isSystem: true,
              isHidden: true,
            },
            select: { id: true },
          });
          systemCompanyId = created.id;
          companyCreated = true;
          await tx.activityLog.create({
            data: {
              companyId: systemCompanyId,
              action: ACTIVITY_ACTION.SYSTEM_COMPANY_BOOTSTRAPPED,
              entityType: ENTITY_TYPE.COMPANY,
              entityId: systemCompanyId,
              metadata: { slug: SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG },
            },
          });
        }
      }

      // The system company must always be hidden from tenant-facing surfaces.
      const current = await tx.company.findUnique({
        where: { id: systemCompanyId },
        select: { isHidden: true },
      });
      if (current && !current.isHidden) {
        await tx.company.update({ where: { id: systemCompanyId }, data: { isHidden: true } });
      }

      // --- System Admin role ----------------------------------------------
      const role = await tx.role.upsert({
        where: { companyId_name: { companyId: systemCompanyId, name: SYSTEM_ADMIN_ROLE_NAME } },
        update: {
          description: 'Manages global Master records owned by the System Global Masters company.',
          hierarchyLevel: 100,
          isSystem: true,
        },
        create: {
          companyId: systemCompanyId,
          name: SYSTEM_ADMIN_ROLE_NAME,
          description: 'Manages global Master records owned by the System Global Masters company.',
          hierarchyLevel: 100,
          isSystem: true,
        },
        select: { id: true },
      });

      const permissions = await tx.permission.findMany({
        where: { key: { in: [...SYSTEM_ADMIN_PERMISSION_KEYS] } },
        select: { id: true, key: true, isAvailable: true },
      });
      for (const permission of permissions) {
        if (!permission.isAvailable) continue;
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: permission.id },
          },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }

      // --- System Admin user ----------------------------------------------
      const existingUser = await tx.user.findUnique({
        where: { normalizedEmail },
        select: { id: true, companyId: true, roleId: true },
      });

      let systemAdminUserId: string;
      let userCreated = false;
      let passwordUpdated = false;

      if (existingUser) {
        if (existingUser.companyId !== systemCompanyId) {
          fail(
            `The configured System Admin email already belongs to a normal tenant account. Refusing to move it into the System Global Masters company.`,
          );
        }
        systemAdminUserId = existingUser.id;

        const passwordHash = resetPassword ? await hashPassword(systemAdminPassword) : undefined;
        if (passwordHash) {
          passwordUpdated = true;
          await tx.user.update({
            where: { id: systemAdminUserId },
            data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
          });
        }
        await tx.user.update({
          where: { id: systemAdminUserId },
          data: {
            roleId: role.id,
            status: 'ACTIVE',
            deletedAt: null,
            emailVerifiedAt: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
      } else {
        const passwordHash = await hashPassword(systemAdminPassword);
        const username =
          normalizedEmail.split('@')[0]?.replace(/[^a-z0-9._-]/g, '').slice(0, 40) ||
          'system-admin';
        const createdUser = await tx.user.create({
          data: {
            companyId: systemCompanyId,
            roleId: role.id,
            username,
            fullName: 'System Admin',
            email: systemAdminEmail,
            normalizedEmail,
            passwordHash,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            mustChangePassword: false,
          },
          select: { id: true },
        });
        systemAdminUserId = createdUser.id;
        userCreated = true;
        await tx.activityLog.create({
          data: {
            companyId: systemCompanyId,
            actorUserId: systemAdminUserId,
            targetUserId: systemAdminUserId,
            action: ACTIVITY_ACTION.SYSTEM_ADMIN_CREATED,
            entityType: ENTITY_TYPE.USER,
            entityId: systemAdminUserId,
            metadata: { role: SYSTEM_ADMIN_ROLE_NAME },
          },
        });
      }

      return {
        systemCompany: (companyCreated ? 'created' : 'existing') as 'created' | 'existing',
        systemAdmin: (userCreated ? 'created' : 'existing') as 'created' | 'existing',
        passwordUpdated,
      };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  resetSystemCompanyIdCache();

  return {
    ...result,
    permissionsSynchronized: true,
  };
}
