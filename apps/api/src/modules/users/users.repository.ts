import type { Prisma, User, UserStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import {
  activeTenantScopedId,
  activeTenantWhere,
  tenantScopedId,
  tenantWhere,
  type TenantContext,
} from '../../db/tenant.js';
import {
  buildPaginationMeta,
  toPrismaPagination,
  type PaginationParams,
} from '../../utils/pagination.js';
import { normalizeEmail, normalizeUsername } from '../../utils/normalize.js';

/**
 * Tenant-scoped data access for users.
 *
 * Every function takes a `TenantContext` as its first argument and folds
 * `companyId` into the `where` clause. Reads and writes that target a single
 * row match on id *and* companyId, so a guessed or tampered id from another
 * company simply matches nothing rather than returning a foreign record.
 */

/** Columns safe to return. `passwordHash` is never selected. */
export const USER_SAFE_SELECT = {
  id: true,
  companyId: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, hierarchyLevel: true } },
  permissionTemplate: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof USER_SAFE_SELECT }>;

export interface UserListFilters {
  search?: string | undefined;
  status?: UserStatus | undefined;
  roleId?: string | undefined;
  createdFrom?: Date | undefined;
  createdTo?: Date | undefined;
  includeDeleted?: boolean | undefined;
}

function buildListWhere(tenant: TenantContext, filters: UserListFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = filters.includeDeleted
    ? tenantWhere(tenant)
    : activeTenantWhere(tenant);

  if (filters.status) where.status = filters.status;
  if (filters.roleId) where.roleId = filters.roleId;

  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {
      ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
      ...(filters.createdTo ? { lte: filters.createdTo } : {}),
    };
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }

  return where;
}

export const usersRepository = {
  /** Page through a company's users. Soft-deleted rows are excluded by default. */
  async list(tenant: TenantContext, filters: UserListFilters, pagination: PaginationParams) {
    const where = buildListWhere(tenant, filters);
    const { skip, take } = toPrismaPagination(pagination);

    const [data, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    return { data, pagination: buildPaginationMeta(pagination, total) };
  },

  /** One live user within the company, or null. */
  async findById(tenant: TenantContext, userId: string): Promise<SafeUser | null> {
    return prisma.user.findFirst({
      where: activeTenantScopedId(tenant, userId),
      select: USER_SAFE_SELECT,
    });
  },

  /** Includes soft-deleted rows — for restore and audit paths only. */
  async findByIdIncludingDeleted(tenant: TenantContext, userId: string): Promise<SafeUser | null> {
    return prisma.user.findFirst({
      where: tenantScopedId(tenant, userId),
      select: USER_SAFE_SELECT,
    });
  },

  /**
   * Look up by email for authentication.
   *
   * Intentionally NOT tenant scoped: at login there is no session yet, so no
   * tenant to scope by. `normalizedEmail` is globally unique, so this resolves
   * to at most one account, and the caller derives the tenant from the result.
   * Returns the full row because the auth flow needs `passwordHash`.
   */
  async findByEmailForAuth(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { normalizedEmail: normalizeEmail(email) } });
  },

  /** True if the username is already used inside this company. */
  async isUsernameTaken(
    tenant: TenantContext,
    username: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const found = await prisma.user.findFirst({
      where: {
        companyId: tenant.companyId,
        username: normalizeUsername(username),
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  },

  /** True if the email is used by any account, in any company. */
  async isEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
    const found = await prisma.user.findFirst({
      where: {
        normalizedEmail: normalizeEmail(email),
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  },

  /** Update a user, but only if it belongs to this company. */
  async update(
    tenant: TenantContext,
    userId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<SafeUser | null> {
    // updateMany applies the composite where; a cross-tenant id matches zero
    // rows instead of throwing, which is what lets us return null cleanly.
    const result = await prisma.user.updateMany({
      where: activeTenantScopedId(tenant, userId),
      data: data as Prisma.UserUpdateManyMutationInput,
    });
    if (result.count === 0) return null;
    return this.findById(tenant, userId);
  },

  /** Change status within the company. */
  async updateStatus(
    tenant: TenantContext,
    userId: string,
    status: UserStatus,
  ): Promise<SafeUser | null> {
    return this.update(tenant, userId, { status });
  },

  /** Soft delete: marks `deletedAt` and archives, keeping the row for audit. */
  async softDelete(tenant: TenantContext, userId: string): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: activeTenantScopedId(tenant, userId),
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
    return result.count > 0;
  },

  /** Reverse a soft delete. */
  async restore(tenant: TenantContext, userId: string): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: { ...tenantScopedId(tenant, userId), deletedAt: { not: null } },
      data: { deletedAt: null, status: 'INACTIVE' },
    });
    return result.count > 0;
  },

  /** Count live users in the company, optionally by status. */
  async countByStatus(tenant: TenantContext, status?: UserStatus): Promise<number> {
    return prisma.user.count({
      where: { ...activeTenantWhere(tenant), ...(status ? { status } : {}) },
    });
  },

  /**
   * Number of active Owners left.
   *
   * Phase 4 uses this to refuse the change that would remove a company's last
   * active Owner and lock everyone out.
   */
  async countActiveOwners(tenant: TenantContext, ownerRoleId: string): Promise<number> {
    return prisma.user.count({
      where: { ...activeTenantWhere(tenant), roleId: ownerRoleId, status: 'ACTIVE' },
    });
  },
};
