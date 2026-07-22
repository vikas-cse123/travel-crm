import { Prisma, type MasterStatus } from '@prisma/client';
import {
  PERMISSIONS,
  type AddOnServiceInput,
  type AddOnServiceUpdateInput,
} from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { normalizeCustomerName } from '../../utils/normalize.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../../utils/pagination.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
import type { MastersRequestContext } from './airlines.service.js';

/**
 * Add-On Services Master.
 *
 * Reusable optional extras (visa assistance, insurance, arrival cards…). The
 * reference form has exactly four fields — name, description, price and an
 * active toggle — so this module deliberately has no category, pricing basis,
 * tax, image or internal cost, and therefore no costing permissions.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;

const serviceInclude = {
  createdBy: { select: userSelect },
  updatedBy: { select: userSelect },
} as const;

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogUncheckedCreateInput['action'],
  entityId: string,
  context: MastersRequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'AddOnService',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** Drop tenant internals; convert Decimal to a plain number for JSON. */
function present<T extends Record<string, unknown>>(row: T) {
  const { companyId, normalizedName, deletedAt, ...safe } = row;
  void companyId;
  void normalizedName;
  void deletedAt;
  return { ...safe, price: Number(safe.price as Prisma.Decimal) };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('An add-on service with that name already exists.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE);
}

async function getService(auth: AuthContext, serviceId: string, forManage = false) {
  const canManageRows = forManage ? true : await canManage(auth);
  const row = await prisma.addOnService.findFirst({
    where: {
      id: serviceId,
      companyId: auth.companyId,
      ...(canManageRows ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: serviceInclude,
  });
  if (!row) throw new NotFoundError('Add-on service not found.');
  return row;
}

function writeData(input: AddOnServiceInput | AddOnServiceUpdateInput) {
  const key = <K extends keyof (AddOnServiceInput & AddOnServiceUpdateInput)>(k: K) => k in input;
  return {
    ...(key('name')
      ? { name: input.name!.trim(), normalizedName: normalizeCustomerName(input.name!) }
      : {}),
    ...(key('description') ? { description: blankToNull(input.description) } : {}),
    ...(key('price') ? { price: input.price ?? 0 } : {}),
    ...(key('currency') ? { currency: input.currency ?? 'INR' } : {}),
  };
}

export const addOnServicesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;

    const where: Prisma.AddOnServiceWhereInput = {
      companyId: auth.companyId,
      ...(canManageRows
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
    const orderBy: Prisma.AddOnServiceOrderByWithRelationInput =
      sortBy === 'price'
        ? { price: order }
        : sortBy === 'createdAt'
          ? { createdAt: order }
          : sortBy === 'updatedAt'
            ? { updatedAt: order }
            : { name: order };

    const [rows, total] = await Promise.all([
      prisma.addOnService.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: serviceInclude,
      }),
      prisma.addOnService.count({ where }),
    ]);
    return {
      data: rows.map((row) => present(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  /** Lightweight selector feed: active services only. */
  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const services = await prisma.addOnService.findMany({
      where: {
        companyId: auth.companyId,
        status: 'ACTIVE',
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, price: true, currency: true },
    });
    return {
      addOnServices: services.map((row) => ({ ...row, price: Number(row.price) })),
    };
  },

  async details(auth: AuthContext, serviceId: string) {
    return present((await getService(auth, serviceId)) as unknown as Record<string, unknown>);
  },

  async create(auth: AuthContext, input: AddOnServiceInput, context: MastersRequestContext) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.addOnService.create({
          data: {
            companyId: auth.companyId,
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            status: input.status,
            createdById: auth.userId,
            ...writeData(input),
          },
          include: serviceInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'ADD_ON_SERVICE_CREATED', created.id, context, {
            // The price is a public catalogue value, not a sensitive cost.
            price: Number(created.price),
            currency: created.currency,
          }),
        });
        return created;
      });
      return present(row as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error);
    }
  },

  async update(
    auth: AuthContext,
    serviceId: string,
    input: AddOnServiceUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getService(auth, serviceId, true);
    try {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.addOnService.update({
          where: { id: current.id },
          data: {
            ...writeData(input),
            updatedById: auth.userId,
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
          },
          include: serviceInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'ADD_ON_SERVICE_UPDATED', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return updated;
      });
      return present(row as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error);
    }
  },

  async status(
    auth: AuthContext,
    serviceId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getService(auth, serviceId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.addOnService.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: serviceInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'ADD_ON_SERVICE_RESTORED'
          : 'ADD_ON_SERVICE_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, {
          previousStatus: current.status,
          status,
        }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },

  async archive(auth: AuthContext, serviceId: string, context: MastersRequestContext) {
    const current = await getService(auth, serviceId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.addOnService.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: serviceInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'ADD_ON_SERVICE_ARCHIVED', current.id, context),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },
};
