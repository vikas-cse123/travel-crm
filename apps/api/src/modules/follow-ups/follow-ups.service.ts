import { Prisma, type FollowUpOutcome, type FollowUpStatus, type LeadStage } from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_NAME,
  type FollowUpCompleteInput,
  type FollowUpInput,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { localDayBounds, localWeekStart } from '../../utils/timezone.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  caller,
  effectiveFollowUpStatus,
  queriesService,
  userSelect,
  visibleWhere,
  type RequestContext,
} from '../queries/queries.service.js';

const querySelect = {
  id: true,
  queryNumber: true,
  customerName: true,
  phone: true,
  leadStage: true,
  leadType: true,
  priority: true,
  lastContactedAt: true,
  assignedToId: true,
  createdById: true,
  itinerary: { select: { destination: true }, orderBy: { sequence: 'asc' as const } },
} as const;

const followUpInclude = {
  assignedTo: { select: userSelect },
  createdBy: { select: userSelect },
  query: { select: querySelect },
} as const;

async function privileged(auth: AuthContext) {
  const { role } = await caller(auth);
  return role.name === ROLE_NAME.OWNER || role.name === ROLE_NAME.MANAGER;
}

async function visibility(auth: AuthContext): Promise<Prisma.QueryFollowUpWhereInput> {
  if (await privileged(auth)) return {};
  return {
    OR: [
      { assignedToId: auth.userId },
      { query: { is: { OR: [{ createdById: auth.userId }, { assignedToId: auth.userId }] } } },
    ],
  };
}

async function where(auth: AuthContext, extra: Prisma.QueryFollowUpWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    ...(await visibility(auth)),
    ...extra,
  } satisfies Prisma.QueryFollowUpWhereInput;
}

async function get(auth: AuthContext, followUpId: string) {
  const row = await prisma.queryFollowUp.findFirst({
    where: await where(auth, { id: followUpId, query: { is: { deletedAt: null } } }),
    include: followUpInclude,
  });
  if (!row) throw new NotFoundError('Follow-up not found.');
  return row;
}

function string(q: Record<string, unknown>, key: string) {
  return typeof q[key] === 'string' && q[key] ? String(q[key]) : undefined;
}

function date(q: Record<string, unknown>, key: string) {
  const value = q[key];
  if (value instanceof Date) return value;
  return typeof value === 'string' && value ? new Date(value) : undefined;
}

function range(q: Record<string, unknown>, from: string, to: string) {
  const start = date(q, from);
  const end = date(q, to);
  return start || end
    ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) }
    : undefined;
}

export const followUpsService = {
  async list(auth: AuthContext, q: Record<string, unknown>) {
    const page = resolvePagination(q as { page?: number; pageSize?: number });
    const now = new Date();
    const timezone = (
      await prisma.company.findUniqueOrThrow({
        where: { id: auth.companyId },
        select: { timezone: true },
      })
    ).timezone;
    const day = localDayBounds(timezone, now);
    const quick = string(q, 'quick');
    const status = string(q, 'status');
    const search = string(q, 'search');
    const effectiveStatusWhere: Prisma.QueryFollowUpWhereInput =
      status === 'MISSED'
        ? { status: 'PENDING', scheduledAt: { lt: now } }
        : status
          ? { status: status as FollowUpStatus }
          : {};
    const quickWhere: Prisma.QueryFollowUpWhereInput =
      quick === 'due_today'
        ? { status: 'PENDING', scheduledAt: { gte: day.start, lt: day.end } }
        : quick === 'overdue'
          ? { status: 'PENDING', scheduledAt: { lt: day.start } }
          : quick === 'upcoming'
            ? { status: 'PENDING', scheduledAt: { gte: day.end } }
            : quick === 'completed'
              ? { status: 'COMPLETED' }
              : quick === 'cancelled'
                ? { status: 'CANCELLED' }
                : {};
    const destination = string(q, 'destination');
    const queryFilters: Prisma.QueryWhereInput = {
      deletedAt: null,
      ...(string(q, 'leadStage') ? { leadStage: string(q, 'leadStage') as LeadStage } : {}),
      ...(string(q, 'leadType')
        ? { leadType: string(q, 'leadType') as Prisma.EnumLeadTypeFilter }
        : {}),
      ...(string(q, 'priority')
        ? { priority: string(q, 'priority') as Prisma.EnumQueryPriorityFilter }
        : {}),
      ...(destination
        ? {
            itinerary: {
              some: { destination: { contains: destination, mode: 'insensitive' } },
            },
          }
        : {}),
    };
    const outcome = string(q, 'outcome');
    const assignedToId = string(q, 'assignedToId');
    const scheduledAt = range(q, 'scheduledFrom', 'scheduledTo');
    const completedAt = range(q, 'completedFrom', 'completedTo');
    const createdAt = range(q, 'createdFrom', 'createdTo');
    const filters: Prisma.QueryFollowUpWhereInput[] = [effectiveStatusWhere, quickWhere];
    if (outcome) filters.push({ outcomeType: outcome as FollowUpOutcome });
    if (assignedToId) filters.push({ assignedToId });
    if (scheduledAt) filters.push({ scheduledAt });
    if (completedAt) filters.push({ completedAt });
    if (createdAt) filters.push({ createdAt });
    filters.push({
      query: { is: queryFilters },
    });
    if (search)
      filters.push({
        OR: [
          { notes: { contains: search, mode: 'insensitive' } },
          { assignedTo: { is: { fullName: { contains: search, mode: 'insensitive' } } } },
          { query: { is: { queryNumber: { contains: search, mode: 'insensitive' } } } },
          { query: { is: { customerName: { contains: search, mode: 'insensitive' } } } },
          { query: { is: { phone: { contains: search } } } },
          {
            query: {
              is: {
                itinerary: {
                  some: { destination: { contains: search, mode: 'insensitive' } },
                },
              },
            },
          },
        ],
      });
    const base = await where(auth, { AND: filters });
    const sortBy = string(q, 'sortBy') ?? 'scheduledAt';
    const sortOrder = (string(q, 'sortOrder') ?? 'asc') as Prisma.SortOrder;
    const orderBy: Prisma.QueryFollowUpOrderByWithRelationInput =
      sortBy === 'customerName'
        ? { query: { customerName: sortOrder } }
        : sortBy === 'priority'
          ? { query: { priority: sortOrder } }
          : { [sortBy]: sortOrder };
    const [rows, total] = await prisma.$transaction([
      prisma.queryFollowUp.findMany({
        where: base,
        include: followUpInclude,
        orderBy,
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.queryFollowUp.count({ where: base }),
    ]);
    return {
      data: rows.map(effectiveFollowUpStatus),
      timezone,
      pagination: {
        ...page,
        total,
        totalPages: total ? Math.ceil(total / page.pageSize) : 0,
      },
    };
  },

  async details(auth: AuthContext, followUpId: string) {
    return effectiveFollowUpStatus(await get(auth, followUpId));
  },

  async update(
    auth: AuthContext,
    followUpId: string,
    input: Partial<FollowUpInput>,
    context: RequestContext,
  ) {
    const row = await get(auth, followUpId);
    return queriesService.updateFollowUp(auth, row.queryId, followUpId, input, context);
  },

  async complete(
    auth: AuthContext,
    followUpId: string,
    input: FollowUpCompleteInput,
    context: RequestContext,
  ) {
    const row = await get(auth, followUpId);
    return queriesService.closeFollowUp(auth, row.queryId, followUpId, 'COMPLETED', input, context);
  },

  async cancel(auth: AuthContext, followUpId: string, reason: string, context: RequestContext) {
    const row = await get(auth, followUpId);
    return queriesService.closeFollowUp(
      auth,
      row.queryId,
      followUpId,
      'CANCELLED',
      { reason },
      context,
    );
  },

  async delete(auth: AuthContext, followUpId: string, context: RequestContext) {
    const row = await get(auth, followUpId);
    return queriesService.deleteFollowUp(auth, row.queryId, followUpId, context);
  },

  async analytics(auth: AuthContext) {
    const now = new Date();
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { timezone: true },
    });
    const day = localDayBounds(company.timezone, now);
    const weekStart = localWeekStart(company.timezone, now);
    const base = await where(auth, { query: { is: { deletedAt: null } } });
    const leadWhere = await visibleWhere(auth);
    const [
      dueToday,
      overdue,
      upcoming,
      completedToday,
      completedThisWeek,
      cancelled,
      completed,
      byOutcome,
      byAssignee,
      teamDue,
      teamOverdue,
      teamCompleted,
      noUpcoming,
      hotOverdue,
    ] = await prisma.$transaction([
      prisma.queryFollowUp.count({
        where: { ...base, status: 'PENDING', scheduledAt: { gte: day.start, lt: day.end } },
      }),
      prisma.queryFollowUp.count({
        where: { ...base, status: 'PENDING', scheduledAt: { lt: day.start } },
      }),
      prisma.queryFollowUp.count({
        where: { ...base, status: 'PENDING', scheduledAt: { gte: day.end } },
      }),
      prisma.queryFollowUp.count({
        where: { ...base, status: 'COMPLETED', completedAt: { gte: day.start, lt: day.end } },
      }),
      prisma.queryFollowUp.count({
        where: { ...base, status: 'COMPLETED', completedAt: { gte: weekStart } },
      }),
      prisma.queryFollowUp.count({ where: { ...base, status: 'CANCELLED' } }),
      prisma.queryFollowUp.count({ where: { ...base, status: 'COMPLETED' } }),
      prisma.queryFollowUp.groupBy({
        by: ['outcomeType'],
        where: { ...base, status: 'COMPLETED', outcomeType: { not: null } },
        orderBy: { outcomeType: 'asc' },
        _count: { _all: true },
      }),
      prisma.queryFollowUp.groupBy({
        by: ['assignedToId'],
        where: base,
        orderBy: { assignedToId: 'asc' },
        _count: { _all: true },
      }),
      prisma.queryFollowUp.groupBy({
        by: ['assignedToId'],
        where: { ...base, status: 'PENDING', scheduledAt: { gte: day.start, lt: day.end } },
        orderBy: { assignedToId: 'asc' },
        _count: { _all: true },
      }),
      prisma.queryFollowUp.groupBy({
        by: ['assignedToId'],
        where: { ...base, status: 'PENDING', scheduledAt: { lt: day.start } },
        orderBy: { assignedToId: 'asc' },
        _count: { _all: true },
      }),
      prisma.queryFollowUp.groupBy({
        by: ['assignedToId'],
        where: { ...base, status: 'COMPLETED', completedAt: { gte: day.start, lt: day.end } },
        orderBy: { assignedToId: 'asc' },
        _count: { _all: true },
      }),
      prisma.query.count({
        where: {
          ...leadWhere,
          leadStage: { notIn: ['BOOKING_CONFIRMED', 'LOST', 'CANCELLED', 'INVALID'] },
          followUps: { none: { status: 'PENDING', deletedAt: null, scheduledAt: { gte: now } } },
        },
      }),
      prisma.query.count({
        where: {
          ...leadWhere,
          leadType: 'HOT',
          followUps: { some: { status: 'PENDING', deletedAt: null, scheduledAt: { lt: now } } },
        },
      }),
    ]);
    const missed = await prisma.queryFollowUp.count({
      where: { ...base, status: 'PENDING', scheduledAt: { lt: now } },
    });
    const isManager = await privileged(auth);
    const delay = await prisma.$queryRaw<Array<{ average: number | null }>>(Prisma.sql`
      SELECT AVG(GREATEST(EXTRACT(EPOCH FROM (f."completedAt" - f."scheduledAt")) / 60, 0))::float AS average
      FROM "query_follow_ups" f
      JOIN "queries" q ON q."id" = f."queryId"
      WHERE f."companyId" = ${auth.companyId}::uuid
        AND f."deletedAt" IS NULL
        AND q."deletedAt" IS NULL
        AND f."status" = 'COMPLETED'
        AND (${isManager} OR f."assignedToId" = ${auth.userId}::uuid OR q."assignedToId" = ${auth.userId}::uuid OR q."createdById" = ${auth.userId}::uuid)
    `);
    const userIds = byAssignee.map((item) => item.assignedToId);
    const users = await prisma.user.findMany({
      where: { companyId: auth.companyId, id: { in: userIds } },
      select: userSelect,
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const countOf = (row: unknown) => {
      if (!row || typeof row !== 'object' || !('_count' in row)) return 0;
      const count = row._count;
      if (!count || typeof count !== 'object' || !('_all' in count)) return 0;
      return typeof count._all === 'number' ? count._all : 0;
    };
    const metricMap = (rows: typeof byAssignee) =>
      new Map(rows.map((row) => [row.assignedToId, countOf(row)]));
    const dueMap = metricMap(teamDue);
    const overdueMap = metricMap(teamOverdue);
    const completeMap = metricMap(teamCompleted);
    return {
      timezone: company.timezone,
      definitions: {
        dueToday: 'Pending follow-ups within the current company-local calendar day.',
        overdue: 'Pending follow-ups scheduled before the current company-local day.',
        upcoming: 'Pending follow-ups scheduled after the current company-local day.',
        missed: 'Pending follow-ups whose scheduled instant has passed; calculated dynamically.',
        completionRate: 'Completed divided by completed plus dynamically missed follow-ups.',
        averageCompletionDelayMinutes:
          'Average non-negative minutes from scheduled time to completion.',
      },
      dueToday,
      overdue,
      upcoming,
      completedToday,
      completedThisWeek,
      cancelled,
      missed,
      averageCompletionDelayMinutes: Number((delay[0]?.average ?? 0).toFixed(1)),
      completionRate:
        completed + missed ? Number(((completed / (completed + missed)) * 100).toFixed(1)) : 0,
      byOutcome: Object.fromEntries(byOutcome.map((item) => [item.outcomeType!, countOf(item)])),
      bySalesperson: byAssignee.map((item) => {
        const person = userMap.get(item.assignedToId);
        const completedForDay = completeMap.get(item.assignedToId) ?? 0;
        const overdueForDay = overdueMap.get(item.assignedToId) ?? 0;
        return {
          user: person,
          total: countOf(item),
          dueToday: dueMap.get(item.assignedToId) ?? 0,
          overdue: overdueForDay,
          completedToday: completedForDay,
          completionRate:
            completedForDay + overdueForDay
              ? Number(((completedForDay / (completedForDay + overdueForDay)) * 100).toFixed(1))
              : 0,
        };
      }),
      leadsWithNoUpcomingFollowUp: noUpcoming,
      hotLeadsWithOverdueFollowUps: hotOverdue,
    };
  },

  async canCreateFor(auth: AuthContext, queryId: string) {
    if (!(await permissionsService.userHasPermission(auth.userId, PERMISSIONS.FOLLOWUPS_CREATE)))
      throw new ForbiddenError();
    return queriesService.details(auth, queryId);
  },
};
