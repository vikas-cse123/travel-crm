import type { Prisma, TemplateStatus } from '@prisma/client';
import {
  ACTIVITY_ACTION,
  ENTITY_TYPE,
  type TemplateInput,
  type TemplateUpdate,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { assertGrantable } from '../permissions/grant-policy.js';

type Ctx = { ipAddress: string | null; userAgent: string | null };
async function template(auth: AuthContext, id: string) {
  const t = await prisma.permissionTemplate.findFirst({
    where: { id, companyId: auth.companyId, deletedAt: null },
    include: {
      permissions: { include: { permission: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
  });
  if (!t) throw new NotFoundError('Permission template not found.');
  return t;
}
function audit(
  auth: AuthContext,
  action:
    | 'PERMISSION_TEMPLATE_CREATED'
    | 'PERMISSION_TEMPLATE_UPDATED'
    | 'PERMISSION_TEMPLATE_DUPLICATED'
    | 'PERMISSION_TEMPLATE_ACTIVATED'
    | 'PERMISSION_TEMPLATE_DEACTIVATED'
    | 'PERMISSION_TEMPLATE_DELETED',
  id: string,
  context: Ctx,
  metadata?: Prisma.InputJsonValue,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: ENTITY_TYPE.PERMISSION_TEMPLATE,
    entityId: id,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}
async function revokeAssigned(id: string, tx: Prisma.TransactionClient) {
  await tx.session.updateMany({
    where: { revokedAt: null, user: { permissionTemplateId: id, deletedAt: null } },
    data: { revokedAt: new Date() },
  });
}

export const permissionTemplatesService = {
  async list(
    auth: AuthContext,
    q: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: TemplateStatus;
      createdById?: string;
      sortBy?: 'name' | 'status' | 'createdAt' | 'updatedAt';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const p = resolvePagination(q);
    const where: Prisma.PermissionTemplateWhereInput = {
      companyId: auth.companyId,
      deletedAt: null,
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.createdById ? { createdById: q.createdById } : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.permissionTemplate.findMany({
        where,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { [q.sortBy ?? 'createdAt']: q.sortOrder ?? 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { permissions: true, users: true } },
        },
      }),
      prisma.permissionTemplate.count({ where }),
    ]);
    return {
      data: data.map((t) => ({
        ...t,
        permissionCount: t._count.permissions,
        assignedUserCount: t._count.users,
        _count: undefined,
      })),
      pagination: { ...p, total, totalPages: total ? Math.ceil(total / p.pageSize) : 0 },
    };
  },
  async details(auth: AuthContext, id: string) {
    const t = await template(auth, id);
    const users = await prisma.user.findMany({
      where: { companyId: auth.companyId, permissionTemplateId: id, deletedAt: null },
      select: { id: true, fullName: true, username: true, status: true },
      take: 20,
      orderBy: { fullName: 'asc' },
    });
    return {
      ...t,
      permissions: t.permissions.map((x) => x.permission),
      permissionCount: t.permissions.length,
      assignedUserCount: users.length,
      users,
    };
  },
  async create(auth: AuthContext, input: TemplateInput, context: Ctx) {
    const keys = await assertGrantable(auth, input.permissions);
    if (
      await prisma.permissionTemplate.findFirst({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          name: { equals: input.name, mode: 'insensitive' },
        },
      })
    )
      throw new ConflictError('A permission template with this name already exists.');
    const p = await prisma.permission.findMany({
      where: { key: { in: keys }, isAvailable: true },
      select: { id: true },
    });
    const id = await prisma.$transaction(async (tx) => {
      const t = await tx.permissionTemplate.create({
        data: {
          companyId: auth.companyId,
          createdById: auth.userId,
          name: input.name.trim(),
          description: input.description ?? null,
          status: input.status,
          permissions: { create: p.map((x) => ({ permissionId: x.id })) },
        },
        select: { id: true },
      });
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.PERMISSION_TEMPLATE_CREATED, t.id, context, {
          permissionCount: keys.length,
          status: input.status,
        }),
      });
      return t.id;
    });
    return this.details(auth, id);
  },
  async update(auth: AuthContext, id: string, input: TemplateUpdate, context: Ctx) {
    const current = await template(auth, id);
    const keys =
      input.permissions === undefined
        ? current.permissions.map((x) => x.permission.key)
        : await assertGrantable(auth, input.permissions);
    if (
      input.name &&
      (await prisma.permissionTemplate.findFirst({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          id: { not: id },
          name: { equals: input.name, mode: 'insensitive' },
        },
      }))
    )
      throw new ConflictError('A permission template with this name already exists.');
    const old = current.permissions.map((x) => x.permission.key).sort();
    const changed = JSON.stringify([...keys].sort()) !== JSON.stringify(old);
    const p = await prisma.permission.findMany({
      where: { key: { in: [...keys] }, isAvailable: true },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.permissionTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.permissions !== undefined
            ? { permissions: { deleteMany: {}, create: p.map((x) => ({ permissionId: x.id })) } }
            : {}),
        },
      });
      if (changed || input.status === 'INACTIVE') await revokeAssigned(id, tx);
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.PERMISSION_TEMPLATE_UPDATED, id, context, {
          changedFields: Object.keys(input),
          previousPermissionCount: old.length,
          newPermissionCount: keys.length,
        }),
      });
    });
    return this.details(auth, id);
  },
  async duplicate(auth: AuthContext, id: string, context: Ctx) {
    const source = await template(auth, id);
    await assertGrantable(
      auth,
      source.permissions.map((x) => x.permission.key),
    );
    let name = `${source.name} Copy`;
    let n = 2;
    while (
      await prisma.permissionTemplate.findFirst({
        where: { companyId: auth.companyId, name, deletedAt: null },
        select: { id: true },
      })
    ) {
      name = `${source.name} Copy ${n++}`;
    }
    const copyId = await prisma.$transaction(async (tx) => {
      const t = await tx.permissionTemplate.create({
        data: {
          companyId: auth.companyId,
          createdById: auth.userId,
          name,
          description: source.description,
          status: 'INACTIVE',
          permissions: {
            create: source.permissions.map((x) => ({ permissionId: x.permissionId })),
          },
        },
        select: { id: true },
      });
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.PERMISSION_TEMPLATE_DUPLICATED, t.id, context, {
          sourceTemplateId: id,
        }),
      });
      return t.id;
    });
    return this.details(auth, copyId);
  },
  async status(auth: AuthContext, id: string, status: TemplateStatus, context: Ctx) {
    const current = await template(auth, id);
    if (current.status === status) return this.details(auth, id);
    await prisma.$transaction(async (tx) => {
      await tx.permissionTemplate.update({ where: { id }, data: { status } });
      if (status === 'INACTIVE') await revokeAssigned(id, tx);
      await tx.activityLog.create({
        data: audit(
          auth,
          status === 'ACTIVE'
            ? ACTIVITY_ACTION.PERMISSION_TEMPLATE_ACTIVATED
            : ACTIVITY_ACTION.PERMISSION_TEMPLATE_DEACTIVATED,
          id,
          context,
          { previousStatus: current.status, newStatus: status },
        ),
      });
    });
    return this.details(auth, id);
  },
  async remove(auth: AuthContext, id: string, context: Ctx) {
    const current = await template(auth, id);
    const assigned = await prisma.user.count({
      where: { companyId: auth.companyId, permissionTemplateId: id, deletedAt: null },
    });
    if (assigned) throw new ConflictError('Remove this template from users before deleting it.');
    await prisma.$transaction(async (tx) => {
      await tx.permissionTemplate.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      });
      await tx.activityLog.create({
        data: audit(auth, ACTIVITY_ACTION.PERMISSION_TEMPLATE_DELETED, id, context, {
          name: current.name,
        }),
      });
    });
    return { deleted: true, id };
  },
};
