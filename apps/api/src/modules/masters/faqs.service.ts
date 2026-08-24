import { type Prisma, type MasterStatus } from '@prisma/client';
import { MASTER_TYPE, PERMISSIONS, type FaqInput, type FaqUpdateInput } from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { NotFoundError } from '../../utils/errors.js';
import { buildPaginationMeta, resolvePagination, toPrismaPagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  assertCanModifyMaster,
  buildVisibleWhere,
  resolveMasterScope,
  type MasterScope,
} from './master-visibility.js';
import type { MastersRequestContext } from './airlines.service.js';

/**
 * FAQ Master — reusable question/answer pairs shown on quotations. Tenant
 * scoped and managed from Masters → FAQs, mirroring Testimonial but without
 * images or global (System) ownership.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

const faqInclude = {
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
    entityType: 'Faq',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function present<T extends Record<string, unknown>>(row: T, scope: MasterScope) {
  const { companyId, deletedAt, ...safe } = row;
  void companyId;
  void deletedAt;
  return { ...safe, canManage: scope.isSystemAdmin };
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_FAQS_UPDATE);
}

async function getFaq(auth: AuthContext, faqId: string, forManage = false) {
  const canManageRows = forManage ? true : await canManage(auth);
  const row = await prisma.faq.findFirst({
    where: {
      id: faqId,
      companyId: auth.companyId,
      deletedAt: null,
      ...(canManageRows ? {} : { status: 'ACTIVE' }),
    },
    include: faqInclude,
  });
  if (!row) throw new NotFoundError('FAQ not found.');
  return row;
}

function writeData(input: FaqInput | FaqUpdateInput) {
  const key = <K extends keyof (FaqInput & FaqUpdateInput)>(k: K) => k in input;
  return {
    ...(key('question') ? { question: input.question!.trim() } : {}),
    ...(key('answer') ? { answer: input.answer!.trim() } : {}),
    ...(key('destinations')
      ? { destinations: normalizeDestinations(input.destinations) as Prisma.InputJsonValue }
      : {}),
  };
}

/** Dedupe + trim the destination list. Empty/null → null (applies to all). */
function normalizeDestinations(destinations: string[] | null | undefined): string[] | null {
  if (!Array.isArray(destinations) || destinations.length === 0) return null;
  return [
    ...new Set(
      destinations
        .map((d) => d.trim())
        .filter((d) => d.length > 0)
        .slice(0, 50),
    ),
  ];
}

export const faqsService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.FAQ);
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || 10,
    });

    const where: Prisma.FaqWhereInput = {
      ...buildVisibleWhere(scope),
      ...(canManageRows
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(search
        ? {
            OR: [
              { question: { contains: search, mode: 'insensitive' } },
              { answer: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.destination && String(query.destination).trim()
        ? {
            destinations: {
              array_contains: [String(query.destination).trim()],
            },
          }
        : {}),
    };

    const order = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.FaqOrderByWithRelationInput =
      query.sortBy === 'updatedAt'
        ? { updatedAt: order }
        : query.sortBy === 'question'
          ? { question: order }
          : { createdAt: order };

    const [rows, total] = await Promise.all([
      prisma.faq.findMany({ where, ...toPrismaPagination(pagination), orderBy, include: faqInclude }),
      prisma.faq.count({ where }),
    ]);
    return {
      data: rows.map((row) => present(row as unknown as Record<string, unknown>, scope)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async details(auth: AuthContext, faqId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.FAQ);
    return present((await getFaq(auth, faqId)) as unknown as Record<string, unknown>, scope);
  },

  async create(auth: AuthContext, input: FaqInput, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.FAQ);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.faq.create({
        data: {
          companyId: auth.companyId,
          question: input.question.trim(),
          answer: input.answer.trim(),
          destinations: normalizeDestinations(input.destinations) as Prisma.InputJsonValue,
          status: input.status,
          createdById: auth.userId,
        },
        include: faqInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'FAQ_CREATED', created.id, context, {
          question: created.question.slice(0, 120),
        }),
      });
      return created;
    });
    return present(row as unknown as Record<string, unknown>, scope);
  },

  async update(
    auth: AuthContext,
    faqId: string,
    input: FaqUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.FAQ);
    const current = await getFaq(auth, faqId, true);
    assertCanModifyMaster(current, scope);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.faq.update({
        where: { id: current.id },
        data: {
          ...writeData(input),
          updatedById: auth.userId,
          ...(input.status
            ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
            : {}),
        },
        include: faqInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'FAQ_UPDATED', current.id, context, {
          changedFields: Object.keys(input),
        }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>, scope);
  },

  async status(
    auth: AuthContext,
    faqId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.FAQ);
    const current = await getFaq(auth, faqId, true);
    assertCanModifyMaster(current, scope);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.faq.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: faqInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'FAQ_RESTORED'
          : 'FAQ_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, { previousStatus: current.status, status }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>, scope);
  },

  async archive(auth: AuthContext, faqId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.FAQ);
    const current = await getFaq(auth, faqId, true);
    assertCanModifyMaster(current, scope);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.faq.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: faqInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'FAQ_ARCHIVED', current.id, context),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>, scope);
  },
};