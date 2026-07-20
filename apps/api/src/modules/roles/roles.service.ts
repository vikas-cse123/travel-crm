import type { Prisma } from '@prisma/client';
import {
  ACTIVITY_ACTION,
  ENTITY_TYPE,
  PERMISSIONS,
  ROLE_NAME,
  type RoleInput,
  type RoleUpdate,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { assertGrantable, administrationCaller } from '../permissions/grant-policy.js';

type Ctx = { ipAddress: string | null; userAgent: string | null };
async function role(auth: AuthContext, id: string) {
  const value = await prisma.role.findFirst({
    where: { id, companyId: auth.companyId },
    include: { permissions: { include: { permission: true } } },
  });
  if (!value) throw new NotFoundError('Role not found.');
  return value;
}
async function assertHierarchy(auth: AuthContext, level: number) {
  const c = await administrationCaller(auth);
  if (c.role.name !== ROLE_NAME.OWNER && level >= c.role.hierarchyLevel)
    throw new ForbiddenError('You may manage only roles strictly below your hierarchy.');
  if (level >= 100)
    throw new ForbiddenError('Only the protected Owner role may use Owner-level hierarchy.');
  return c;
}
function audit(
  auth: AuthContext,
  action: 'ROLE_CREATED' | 'ROLE_UPDATED' | 'ROLE_DELETED',
  id: string,
  context: Ctx,
  metadata?: Prisma.InputJsonValue,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: ENTITY_TYPE.ROLE,
    entityId: id,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}
async function revokeRoleUsers(roleId: string, tx: Prisma.TransactionClient) {
  await tx.session.updateMany({
    where: { revokedAt: null, user: { roleId, deletedAt: null } },
    data: { revokedAt: new Date() },
  });
}

export const rolesService = {
  async list(
    auth: AuthContext,
    q: {
      page?: number;
      pageSize?: number;
      search?: string;
      isSystem?: boolean;
      sortBy?: 'name' | 'hierarchyLevel' | 'createdAt' | 'updatedAt';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const p = resolvePagination(q);
    const where: Prisma.RoleWhereInput = {
      companyId: auth.companyId,
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      ...(q.isSystem === undefined ? {} : { isSystem: q.isSystem }),
    };
    const [data, total] = await prisma.$transaction([
      prisma.role.findMany({
        where,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { [q.sortBy ?? 'hierarchyLevel']: q.sortOrder ?? 'desc' },
        include: {
          _count: { select: { permissions: true } },
          users: { where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true } },
        },
      }),
      prisma.role.count({ where }),
    ]);
    return {
      data: data.map((r) => ({
        ...r,
        permissionCount: r._count.permissions,
        activeUserCount: r.users.length,
        _count: undefined,
        users: undefined,
      })),
      pagination: { ...p, total, totalPages: total ? Math.ceil(total / p.pageSize) : 0 },
    };
  },
  async details(auth: AuthContext, id: string) {
    const r = await role(auth, id);
    const users = await prisma.user.findMany({
      where: { companyId: auth.companyId, roleId: id, deletedAt: null },
      select: { id: true, fullName: true, username: true, status: true },
      take: 20,
      orderBy: { fullName: 'asc' },
    });
    return {
      ...r,
      permissions: r.permissions.map((x) => x.permission),
      permissionCount: r.permissions.length,
      activeUserCount: users.filter((u) => u.status === 'ACTIVE').length,
      users,
    };
  },
  async create(auth: AuthContext, input: RoleInput, context: Ctx) {
    await assertHierarchy(auth, input.hierarchyLevel);
    const keys = await assertGrantable(auth, input.permissions);
    if (
      await prisma.role.findFirst({
        where: { companyId: auth.companyId, name: { equals: input.name, mode: 'insensitive' } },
      })
    )
      throw new ConflictError('A role with this name already exists.');
    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys }, isAvailable: true },
      select: { id: true },
    });
    const id = await prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          companyId: auth.companyId,
          name: input.name.trim(),
          description: input.description ?? null,
          hierarchyLevel: input.hierarchyLevel,
          isSystem: false,
          permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
        select: { id: true },
      });
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.ROLE_CREATED, r.id, context, {
          permissionCount: keys.length,
          hierarchyLevel: input.hierarchyLevel,
        }),
      });
      return r.id;
    });
    return this.details(auth, id);
  },
  async update(auth: AuthContext, id: string, input: RoleUpdate, context: Ctx) {
    const current = await role(auth, id);
    const c = await administrationCaller(auth);
    if (c.role.name !== ROLE_NAME.OWNER && current.hierarchyLevel >= c.role.hierarchyLevel)
      throw new ForbiddenError('You may not edit this role.');
    if (current.isSystem && (input.name !== undefined || input.hierarchyLevel !== undefined))
      throw new ForbiddenError('System role name and hierarchy are protected.');
    const level = input.hierarchyLevel ?? current.hierarchyLevel;
    await assertHierarchy(auth, level);
    const keys =
      input.permissions === undefined
        ? current.permissions.map((x) => x.permission.key)
        : await assertGrantable(auth, input.permissions);
    if (current.name === ROLE_NAME.OWNER) {
      const essential = [
        PERMISSIONS.USERS_ASSIGN_ROLE,
        PERMISSIONS.ROLES_VIEW,
        PERMISSIONS.ROLES_CREATE,
        PERMISSIONS.ROLES_UPDATE,
        PERMISSIONS.ROLES_DELETE,
        PERMISSIONS.PERMISSION_TEMPLATES_VIEW,
        PERMISSIONS.ACTIVITY_LOGS_VIEW,
      ];
      if (essential.some((k) => !keys.includes(k)))
        throw new ForbiddenError(
          'The Owner role cannot lose essential administration permissions.',
        );
    }
    if (
      input.name &&
      (await prisma.role.findFirst({
        where: {
          companyId: auth.companyId,
          id: { not: id },
          name: { equals: input.name, mode: 'insensitive' },
        },
      }))
    )
      throw new ConflictError('A role with this name already exists.');
    const oldKeys = current.permissions.map((x) => x.permission.key).sort();
    const permissionChanged = JSON.stringify([...keys].sort()) !== JSON.stringify(oldKeys);
    const hierarchyChanged = level !== current.hierarchyLevel;
    const p = await prisma.permission.findMany({
      where: { key: { in: [...keys] }, isAvailable: true },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.hierarchyLevel !== undefined ? { hierarchyLevel: input.hierarchyLevel } : {}),
          ...(input.permissions !== undefined
            ? { permissions: { deleteMany: {}, create: p.map((x) => ({ permissionId: x.id })) } }
            : {}),
        },
      });
      if (permissionChanged || hierarchyChanged) await revokeRoleUsers(id, tx);
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.ROLE_UPDATED, id, context, {
          changedFields: Object.keys(input),
          previousPermissionCount: oldKeys.length,
          newPermissionCount: keys.length,
        }),
      });
    });
    return this.details(auth, id);
  },
  async remove(auth: AuthContext, id: string, context: Ctx) {
    const current = await role(auth, id);
    const c = await administrationCaller(auth);
    if (current.isSystem) throw new ForbiddenError('System roles cannot be deleted.');
    if (c.role.name !== ROLE_NAME.OWNER && current.hierarchyLevel >= c.role.hierarchyLevel)
      throw new ForbiddenError();
    const assigned = await prisma.user.count({
      where: { companyId: auth.companyId, roleId: id, deletedAt: null },
    });
    if (assigned) throw new ConflictError('Reassign users before deleting this role.');
    await prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.ROLE_DELETED, id, context, { name: current.name }),
      });
    });
    return { deleted: true, id };
  },
};
