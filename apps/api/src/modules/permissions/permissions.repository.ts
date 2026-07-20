import type { Permission, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

/**
 * The permission catalogue is global, not tenant scoped: every company sees
 * the same keys, and only the grants differ. So no TenantContext here — that
 * would be scoping theatre.
 */

export const permissionsRepository = {
  /** Whole catalogue, including keys for modules that are not built yet. */
  async listAll(): Promise<Permission[]> {
    return prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  },

  /** Only the permissions that may currently be granted. */
  async listAvailable(): Promise<Permission[]> {
    return prisma.permission.findMany({
      where: { isAvailable: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  },

  async findByKey(key: string): Promise<Permission | null> {
    return prisma.permission.findUnique({ where: { key } });
  },

  async findManyByKeys(keys: readonly string[]): Promise<Permission[]> {
    return prisma.permission.findMany({ where: { key: { in: [...keys] } } });
  },

  /**
   * Resolve keys to ids, rejecting anything not currently grantable.
   *
   * Enforced here rather than in a service so no caller can accidentally
   * grant a planned-module permission.
   */
  async resolveAvailableIds(keys: readonly string[]): Promise<string[]> {
    const rows = await prisma.permission.findMany({
      where: { key: { in: [...keys] }, isAvailable: true },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },

  async count(where?: Prisma.PermissionWhereInput): Promise<number> {
    return prisma.permission.count(...(where ? [{ where }] : []));
  },
};
