import { Prisma, type MasterStatus } from '@prisma/client';
import { PERMISSIONS, type VisaTypeInput, type VisaTypeUpdateInput } from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { normalizeCustomerName } from '../../utils/normalize.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../../utils/pagination.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
import type { MastersRequestContext } from './airlines.service.js';
import { sanitizeRichText } from './masters.service.js';

/**
 * Visa Types Master.
 *
 * A visa type belongs to one destination and carries an arbitrary number of
 * ordered rich-text sections (Overview, Visa Fees, Documents Required…), exactly
 * as the reference form allows. Not linked to leads/quotations/bookings.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

const visaTypeInclude = {
  createdBy: { select: userSelect },
  updatedBy: { select: userSelect },
  destination: { select: { id: true, name: true, countryCode: true, countryName: true } },
  sections: { orderBy: { sequence: 'asc' as const } },
  _count: { select: { sections: true } },
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
    entityType: 'VisaType',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function present<T extends Record<string, unknown>>(row: T) {
  const { companyId, normalizedName, deletedAt, ...safe } = row;
  void companyId;
  void normalizedName;
  void deletedAt;
  const sections = Array.isArray(safe.sections)
    ? safe.sections.map((section) => {
        const value = section as Record<string, unknown>;
        const { companyId: _c, visaTypeId, ...rest } = value;
        void _c;
        return { ...rest, visaTypeId };
      })
    : [];
  return { ...safe, sections };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A visa type with that name already exists for this destination.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_VISA_TYPES_UPDATE);
}

async function getVisaType(auth: AuthContext, visaTypeId: string, forManage = false) {
  const canManageRows = forManage ? true : await canManage(auth);
  const row = await prisma.visaType.findFirst({
    where: {
      id: visaTypeId,
      companyId: auth.companyId,
      ...(canManageRows ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: visaTypeInclude,
  });
  if (!row) throw new NotFoundError('Visa type not found.');
  return row;
}

/** The destination must exist for this tenant and be active. */
async function validateDestination(companyId: string, destinationId: string) {
  const destination = await prisma.destination.findFirst({
    where: { id: destinationId, companyId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (!destination) throw new ValidationError('Select an active destination.');
}

function sectionRows(companyId: string, sections: VisaTypeInput['sections']) {
  return (sections ?? []).map((section, index) => ({
    companyId,
    title: section.title.trim(),
    content: sanitizeRichText(section.content) ?? '',
    sequence: index,
  }));
}

export const visaTypesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;

    const where: Prisma.VisaTypeWhereInput = {
      companyId: auth.companyId,
      ...(canManageRows
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.destinationId ? { destinationId: String(query.destinationId) } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { destination: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
    const orderBy: Prisma.VisaTypeOrderByWithRelationInput =
      sortBy === 'createdAt'
        ? { createdAt: order }
        : sortBy === 'updatedAt'
          ? { updatedAt: order }
          : { name: order };

    const [rows, total] = await Promise.all([
      prisma.visaType.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: visaTypeInclude,
      }),
      prisma.visaType.count({ where }),
    ]);
    return {
      data: rows.map((row) => present(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async details(auth: AuthContext, visaTypeId: string) {
    return present((await getVisaType(auth, visaTypeId)) as unknown as Record<string, unknown>);
  },

  async create(auth: AuthContext, input: VisaTypeInput, context: MastersRequestContext) {
    await validateDestination(auth.companyId, input.destinationId);
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.visaType.create({
          data: {
            companyId: auth.companyId,
            destinationId: input.destinationId,
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            status: input.status,
            createdById: auth.userId,
            sections: { create: sectionRows(auth.companyId, input.sections) },
          },
          include: visaTypeInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'VISA_TYPE_CREATED', created.id, context, {
            destinationId: created.destinationId,
            sectionCount: input.sections?.length ?? 0,
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
    visaTypeId: string,
    input: VisaTypeUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getVisaType(auth, visaTypeId, true);
    if (input.destinationId && input.destinationId !== current.destinationId)
      await validateDestination(auth.companyId, input.destinationId);
    try {
      const row = await prisma.$transaction(async (tx) => {
        if (input.sections) {
          await tx.visaTypeSection.deleteMany({ where: { visaTypeId: current.id } });
          await tx.visaTypeSection.createMany({
            data: sectionRows(auth.companyId, input.sections).map((section) => ({
              ...section,
              visaTypeId: current.id,
            })),
          });
        }
        await tx.visaType.update({
          where: { id: current.id },
          data: {
            ...(input.destinationId ? { destinationId: input.destinationId } : {}),
            ...(input.name
              ? { name: input.name.trim(), normalizedName: normalizeCustomerName(input.name) }
              : {}),
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
            updatedById: auth.userId,
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'VISA_TYPE_UPDATED', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return tx.visaType.findUniqueOrThrow({
          where: { id: current.id },
          include: visaTypeInclude,
        });
      });
      return present(row as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error);
    }
  },

  async status(
    auth: AuthContext,
    visaTypeId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getVisaType(auth, visaTypeId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.visaType.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: visaTypeInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'VISA_TYPE_RESTORED'
          : 'VISA_TYPE_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, { previousStatus: current.status, status }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },

  async archive(auth: AuthContext, visaTypeId: string, context: MastersRequestContext) {
    const current = await getVisaType(auth, visaTypeId, true);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.visaType.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: visaTypeInclude,
      });
      await tx.activityLog.create({ data: audit(auth, 'VISA_TYPE_ARCHIVED', current.id, context) });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>);
  },
};
