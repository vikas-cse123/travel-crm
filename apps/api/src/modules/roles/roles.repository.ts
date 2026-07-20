import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { tenantScopedId, tenantWhere, type TenantContext } from '../../db/tenant.js';

/**
 * Tenant-scoped data access for roles.
 *
 * Roles are per-company: two agencies each have their own "Manager" row, so
 * every lookup must carry `companyId`.
 */

export const ROLE_SELECT = {
  id: true,
  companyId: true,
  name: true,
  description: true,
  hierarchyLevel: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RoleSelect;

export type RoleSummary = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

export const rolesRepository = {
  /** All roles for the company, highest privilege first. */
  async list(tenant: TenantContext): Promise<RoleSummary[]> {
    return prisma.role.findMany({
      where: tenantWhere(tenant),
      select: ROLE_SELECT,
      orderBy: { hierarchyLevel: 'desc' },
    });
  },

  async findById(tenant: TenantContext, roleId: string): Promise<RoleSummary | null> {
    return prisma.role.findFirst({
      where: tenantScopedId(tenant, roleId),
      select: ROLE_SELECT,
    });
  },

  async findByName(tenant: TenantContext, name: string): Promise<RoleSummary | null> {
    return prisma.role.findFirst({
      where: { companyId: tenant.companyId, name },
      select: ROLE_SELECT,
    });
  },

  /** Role with its granted permission keys. */
  async findByIdWithPermissions(tenant: TenantContext, roleId: string) {
    return prisma.role.findFirst({
      where: tenantScopedId(tenant, roleId),
      select: {
        ...ROLE_SELECT,
        permissions: { select: { permission: { select: { key: true, isAvailable: true } } } },
      },
    });
  },

  /**
   * Flat list of permission keys a role grants.
   *
   * Filtered to `isAvailable` so a key belonging to an unbuilt module can
   * never reach a permission check, even if one were somehow granted.
   */
  async listPermissionKeys(tenant: TenantContext, roleId: string): Promise<string[]> {
    const role = await prisma.role.findFirst({
      where: tenantScopedId(tenant, roleId),
      select: {
        permissions: {
          where: { permission: { isAvailable: true } },
          select: { permission: { select: { key: true } } },
        },
      },
    });
    if (!role) return [];
    return role.permissions.map((entry) => entry.permission.key);
  },

  async isNameTaken(tenant: TenantContext, name: string, excludeRoleId?: string): Promise<boolean> {
    const found = await prisma.role.findFirst({
      where: {
        companyId: tenant.companyId,
        name,
        ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  },

  /** How many users hold this role — a delete must be refused when non-zero. */
  async countAssignedUsers(tenant: TenantContext, roleId: string): Promise<number> {
    return prisma.user.count({
      where: { companyId: tenant.companyId, roleId, deletedAt: null },
    });
  },

  async count(tenant: TenantContext): Promise<number> {
    return prisma.role.count({ where: tenantWhere(tenant) });
  },
};
