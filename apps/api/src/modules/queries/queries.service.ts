import type { ContactMethod, LeadStage, Prisma } from '@prisma/client';
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TYPES,
  QUERY_PRIORITIES,
  SERVICE_TYPES,
  ROLE_NAME,
  PERMISSIONS,
  labelForLookup,
  type QueryInput,
  type QueryUpdateInput,
  type FollowUpInput,
  type FollowUpCompleteInput,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { normalizeEmail, normalizePhone } from '../../utils/normalize.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { localDayBounds } from '../../utils/timezone.js';
import { permissionsService } from '../auth/permissions.service.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };
export const userSelect = { id: true, fullName: true, username: true } as const;
const include = {
  assignedTo: { select: userSelect },
  createdBy: { select: userSelect },
  services: { select: { serviceType: true } },
  itinerary: { orderBy: { sequence: 'asc' as const } },
} as const;
type IncludedQuery = Prisma.QueryGetPayload<{ include: typeof include }>;
export function presentQuery(value: IncludedQuery) {
  const { companyId, normalizedPhone, deletedAt, itinerary, ...query } = value;
  void companyId;
  void normalizedPhone;
  void deletedAt;
  return {
    ...query,
    itinerary: itinerary.map((value) => {
      const { companyId, queryId, ...row } = value;
      void companyId;
      void queryId;
      return row;
    }),
  };
}
const noteSelect = {
  id: true,
  content: true,
  isCustomerContact: true,
  contactMethod: true,
  contactedAt: true,
  createdAt: true,
  updatedAt: true,
  authorUser: { select: userSelect },
} as const;
const followUpSelect = {
  id: true,
  scheduledAt: true,
  status: true,
  outcomeType: true,
  outcome: true,
  notes: true,
  completionNotes: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: userSelect },
  createdBy: { select: userSelect },
} as const;

export function effectiveFollowUpStatus<T extends { status: string; scheduledAt: Date }>(value: T) {
  return value.status === 'PENDING' && value.scheduledAt < new Date()
    ? { ...value, effectiveStatus: 'MISSED' as const }
    : { ...value, effectiveStatus: value.status };
}

const transitionMap: Record<LeadStage, readonly LeadStage[]> = {
  NEW_LEAD: ['CONTACTED', 'QUALIFIED', 'ON_HOLD', 'LOST', 'INVALID'],
  CONTACTED: ['QUALIFIED', 'FOLLOW_UP', 'ON_HOLD', 'LOST', 'INVALID'],
  QUALIFIED: ['QUOTATION_REQUIRED', 'FOLLOW_UP', 'ON_HOLD', 'LOST'],
  QUOTATION_REQUIRED: ['QUOTATION_SENT', 'FOLLOW_UP', 'LOST'],
  QUOTATION_SENT: ['IN_NEGOTIATION', 'FOLLOW_UP', 'READY_TO_BOOK', 'LOST'],
  IN_NEGOTIATION: ['READY_TO_BOOK', 'FOLLOW_UP', 'LOST', 'ON_HOLD'],
  READY_TO_BOOK: ['BOOKING_CONFIRMED', 'FOLLOW_UP', 'LOST'],
  FOLLOW_UP: [
    'CONTACTED',
    'QUALIFIED',
    'QUOTATION_REQUIRED',
    'QUOTATION_SENT',
    'IN_NEGOTIATION',
    'READY_TO_BOOK',
    'LOST',
    'ON_HOLD',
  ],
  ON_HOLD: ['CONTACTED', 'QUALIFIED', 'FOLLOW_UP', 'LOST', 'CANCELLED'],
  AMENDMENT: ['QUOTATION_SENT', 'IN_NEGOTIATION', 'READY_TO_BOOK', 'BOOKING_CONFIRMED', 'LOST'],
  BOOKING_CONFIRMED: [],
  LOST: [],
  CANCELLED: [],
  INVALID: [],
};
const terminalStages: readonly LeadStage[] = ['BOOKING_CONFIRMED', 'LOST', 'CANCELLED', 'INVALID'];

export async function caller(auth: AuthContext) {
  const value = await prisma.user.findFirst({
    where: { id: auth.userId, companyId: auth.companyId, deletedAt: null },
    select: { role: { select: { name: true } } },
  });
  if (!value) throw new ForbiddenError();
  return value;
}
export async function visibility(auth: AuthContext): Promise<Prisma.QueryWhereInput> {
  const { role } = await caller(auth);
  return role.name === ROLE_NAME.OWNER || role.name === ROLE_NAME.MANAGER
    ? {}
    : { OR: [{ createdById: auth.userId }, { assignedToId: auth.userId }] };
}
export async function visibleWhere(auth: AuthContext, extra: Prisma.QueryWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    ...(await visibility(auth)),
    ...extra,
  } satisfies Prisma.QueryWhereInput;
}
export async function getVisible(auth: AuthContext, id: string) {
  const query = await prisma.query.findFirst({ where: await visibleWhere(auth, { id }), include });
  if (!query) throw new NotFoundError('Lead not found.');
  return query;
}
export async function assertAssignable(auth: AuthContext, assignedToId: string | null | undefined) {
  if (!assignedToId) return;
  const user = await prisma.user.findFirst({
    where: { id: assignedToId, companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new ValidationError('The assignee must be an active user in this company.');
}
export async function assertCanAssignOther(
  auth: AuthContext,
  assignedToId: string | null | undefined,
) {
  if (
    assignedToId &&
    assignedToId !== auth.userId &&
    !(await permissionsService.userHasPermission(auth.userId, PERMISSIONS.QUERIES_ASSIGN))
  )
    throw new ForbiddenError('You cannot assign a lead to another user.');
}
function travellerSummary(
  v: Pick<
    QueryInput,
    'rooms' | 'adults' | 'childrenWithBed' | 'childrenWithoutBed' | 'infants' | 'extraBeds'
  >,
) {
  const values = [
    [v.rooms, 'Room'],
    [v.adults, 'Adult'],
    [v.childrenWithBed, 'Child With Bed'],
    [v.childrenWithoutBed, 'Child Without Bed'],
    [v.infants, 'Infant'],
    [v.extraBeds, 'Extra Bed'],
  ] as const;
  return values
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 ? '' : 's'}`)
    .join(', ');
}
export function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogCreateInput['action'],
  queryId: string,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'Query',
    entityId: queryId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}
function scalarData(input: QueryInput | QueryUpdateInput) {
  const keys = [
    'customerName',
    'phone',
    'alternatePhone',
    'dateOfBirth',
    'leadSource',
    'leadType',
    'leadStage',
    'priority',
    'departureCountry',
    'departureCity',
    'travelStartDate',
    'travelEndDate',
    'flexibleDates',
    'rooms',
    'adults',
    'childrenWithBed',
    'childrenWithoutBed',
    'infants',
    'extraBeds',
    'expectedAmount',
    'budgetMin',
    'budgetMax',
    'expectedMargin',
    'currency',
    'tripType',
    'quotationRequired',
    'bookingStatusPlaceholder',
    'webLinkPlaceholder',
    'supplierCostingNotes',
    'assignedToId',
    'internalRemarks',
  ] as const;
  const data: Record<string, unknown> = {};
  const source = input as Partial<Record<(typeof keys)[number], unknown>>;
  for (const key of keys)
    if (source[key] !== undefined) data[key] = source[key] === '' ? null : source[key];
  if (input.phone !== undefined) data.normalizedPhone = normalizePhone(input.phone);
  if (input.email !== undefined) {
    data.email = input.email ? input.email.trim() : null;
  }
  if ('email' in input && input.email) data.email = normalizeEmail(input.email);
  if (
    input.rooms !== undefined ||
    input.adults !== undefined ||
    input.childrenWithBed !== undefined ||
    input.childrenWithoutBed !== undefined ||
    input.infants !== undefined ||
    input.extraBeds !== undefined
  )
    data.travellerSummary = travellerSummary({
      rooms: input.rooms ?? 1,
      adults: input.adults ?? 1,
      childrenWithBed: input.childrenWithBed ?? 0,
      childrenWithoutBed: input.childrenWithoutBed ?? 0,
      infants: input.infants ?? 0,
      extraBeds: input.extraBeds ?? 0,
    });
  return data;
}
export async function recalculateNextFollowUp(
  tx: Prisma.TransactionClient,
  companyId: string,
  queryId: string,
) {
  const next = await tx.queryFollowUp.findFirst({
    where: { companyId, queryId, status: 'PENDING', deletedAt: null },
    orderBy: { scheduledAt: 'asc' },
    select: { scheduledAt: true },
  });
  await tx.query.update({
    where: { id: queryId },
    data: { nextFollowUpAt: next?.scheduledAt ?? null },
  });
}

export function validateScheduledAt(scheduledAt: Date) {
  if (Number.isNaN(scheduledAt.getTime()))
    throw new ValidationError('A valid follow-up time is required.');
  const now = Date.now();
  if (scheduledAt.getTime() < now - 5 * 60_000)
    throw new ValidationError('A new follow-up cannot be scheduled in the past.');
  if (scheduledAt.getTime() > now + 5 * 365 * 86_400_000)
    throw new ValidationError('A follow-up cannot be scheduled more than five years ahead.');
}

export async function assertCanManageFollowUp(auth: AuthContext, assignedToId: string) {
  const { role } = await caller(auth);
  if (
    assignedToId !== auth.userId &&
    role.name !== ROLE_NAME.OWNER &&
    role.name !== ROLE_NAME.MANAGER
  )
    throw new ForbiddenError('You may only update follow-ups assigned to you.');
}

export const queriesService = {
  async list(auth: AuthContext, q: Record<string, unknown>) {
    const p = resolvePagination(q as { page?: number; pageSize?: number });
    const str = (key: string) => (typeof q[key] === 'string' ? (q[key] as string) : undefined);
    const date = (key: string) =>
      q[key] instanceof Date ? q[key] : typeof q[key] === 'string' ? new Date(q[key]) : undefined;
    const dateRange = (from: string, to: string) => {
      const start = date(from);
      const rawEnd = date(to);
      const end = rawEnd ? new Date(rawEnd) : undefined;
      if (end) end.setUTCHours(23, 59, 59, 999);
      return start || end
        ? {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          }
        : undefined;
    };
    const search = str('search');
    const where = await visibleWhere(auth, {
      ...(search
        ? {
            OR: [
              { queryNumber: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { alternatePhone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
              { departureCity: { contains: search, mode: 'insensitive' } },
              { itinerary: { some: { destination: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(str('leadStage') ? { leadStage: str('leadStage') as LeadStage } : {}),
      ...(str('leadType') ? { leadType: str('leadType') as Prisma.EnumLeadTypeFilter } : {}),
      ...(str('leadSource')
        ? { leadSource: str('leadSource') as Prisma.EnumLeadSourceFilter }
        : {}),
      ...(str('priority') ? { priority: str('priority') as Prisma.EnumQueryPriorityFilter } : {}),
      ...(str('assignedToId') ? { assignedToId: str('assignedToId') } : {}),
      ...(str('createdById') ? { createdById: str('createdById') } : {}),
      ...(str('destination')
        ? {
            itinerary: {
              some: { destination: { contains: str('destination'), mode: 'insensitive' } },
            },
          }
        : {}),
      ...(str('serviceType')
        ? {
            services: { some: { serviceType: str('serviceType') as Prisma.EnumServiceTypeFilter } },
          }
        : {}),
      ...(typeof q.quotationRequired === 'boolean'
        ? { quotationRequired: q.quotationRequired }
        : {}),
      ...(dateRange('travelFrom', 'travelTo')
        ? { travelStartDate: dateRange('travelFrom', 'travelTo') }
        : {}),
      ...(dateRange('followUpFrom', 'followUpTo')
        ? { nextFollowUpAt: dateRange('followUpFrom', 'followUpTo') }
        : {}),
      ...(dateRange('createdFrom', 'createdTo')
        ? { createdAt: dateRange('createdFrom', 'createdTo') }
        : {}),
    } as Prisma.QueryWhereInput);
    const sortBy = str('sortBy') ?? 'createdAt';
    const sortOrder = (str('sortOrder') ?? 'desc') as Prisma.SortOrder;
    const [data, total] = await prisma.$transaction([
      prisma.query.findMany({
        where,
        include,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.query.count({ where }),
    ]);
    return {
      data: data.map(presentQuery),
      pagination: { ...p, total, totalPages: total ? Math.ceil(total / p.pageSize) : 0 },
    };
  },
  async details(auth: AuthContext, id: string) {
    return presentQuery(await getVisible(auth, id));
  },
  async workspace(auth: AuthContext, id: string) {
    const query = await getVisible(auth, id);
    const now = new Date();
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { timezone: true },
    });
    const { start, end } = localDayBounds(company.timezone, now);
    const followUpWhere = { companyId: auth.companyId, queryId: id, deletedAt: null } as const;
    const [pending, overdue, completed, notesCount, recentNotes, upcomingFollowUps, permissions] =
      await Promise.all([
        prisma.queryFollowUp.count({ where: { ...followUpWhere, status: 'PENDING' } }),
        prisma.queryFollowUp.count({
          where: { ...followUpWhere, status: 'PENDING', scheduledAt: { lt: now } },
        }),
        prisma.queryFollowUp.count({ where: { ...followUpWhere, status: 'COMPLETED' } }),
        prisma.queryNote.count({ where: followUpWhere }),
        prisma.queryNote.findMany({
          where: followUpWhere,
          select: noteSelect,
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.queryFollowUp.findMany({
          where: { ...followUpWhere, status: 'PENDING' },
          select: followUpSelect,
          orderBy: { scheduledAt: 'asc' },
          take: 5,
        }),
        permissionsService.resolveForUser(auth.userId),
      ]);
    const nextFuture = upcomingFollowUps.some((item) => item.scheduledAt >= now);
    const terminal = terminalStages.includes(query.leadStage);
    const daysSinceLastContact = query.lastContactedAt
      ? Math.floor((now.getTime() - query.lastContactedAt.getTime()) / 86_400_000)
      : null;
    const indicators: string[] = [];
    if (overdue) indicators.push('OVERDUE_FOLLOW_UP');
    if (upcomingFollowUps.some((item) => item.scheduledAt >= start && item.scheduledAt < end))
      indicators.push('FOLLOW_UP_DUE_TODAY');
    if (!terminal && pending === 0) indicators.push('NO_FUTURE_FOLLOW_UP');
    if (!terminal && (daysSinceLastContact === null || daysSinceLastContact >= 7))
      indicators.push('NOT_CONTACTED_RECENTLY');
    if (query.leadType === 'HOT' && overdue) indicators.push('HOT_LEAD_OVERDUE');
    if (query.leadStage === 'READY_TO_BOOK' && pending === 0)
      indicators.push('READY_TO_BOOK_NO_FOLLOW_UP');
    const timeline = await queriesService.timeline(auth, id, { page: 1, pageSize: 8 });
    const quotations = permissions.includes(PERMISSIONS.QUOTATIONS_VIEW)
      ? await prisma.quotation.findMany({
          where: { companyId: auth.companyId, queryId: id, deletedAt: null },
          select: {
            id: true,
            quotationNumber: true,
            status: true,
            currentVersionId: true,
            lastSentAt: true,
            lastViewedAt: true,
            createdAt: true,
            versions: {
              select: {
                id: true,
                versionNumber: true,
                finalAmount: true,
                currency: true,
                status: true,
              },
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    return {
      lead: presentQuery(query),
      operationalSummary: {
        pendingFollowUpCount: pending,
        overdueFollowUpCount: overdue,
        completedFollowUpCount: completed,
        notesCount,
        daysSinceLastContact,
        noFutureFollowUp: !terminal && !nextFuture,
        requiresAttention: indicators.length > 0,
      },
      recent: {
        notes: recentNotes,
        followUps: upcomingFollowUps.map(effectiveFollowUpStatus),
        timeline: timeline.data,
      },
      quotations: {
        count: quotations.length,
        latest: quotations[0] ?? null,
        items: quotations,
      },
      indicators,
      timezone: company.timezone,
      permissions: {
        canEdit: permissions.includes(PERMISSIONS.QUERIES_UPDATE),
        canAssign: permissions.includes(PERMISSIONS.QUERIES_ASSIGN),
        canChangeStage: permissions.includes(PERMISSIONS.QUERIES_UPDATE),
        canAddNote: permissions.includes(PERMISSIONS.QUERIES_UPDATE),
        canScheduleFollowUp: permissions.includes(PERMISSIONS.FOLLOWUPS_CREATE),
        canCompleteFollowUp: permissions.includes(PERMISSIONS.FOLLOWUPS_UPDATE),
        canArchive: permissions.includes(PERMISSIONS.QUERIES_DELETE),
        canViewQuotations: permissions.includes(PERMISSIONS.QUOTATIONS_VIEW),
        canCreateQuotation: permissions.includes(PERMISSIONS.QUOTATIONS_CREATE),
        canSendQuotation: permissions.includes(PERMISSIONS.QUOTATIONS_SEND),
        canGenerateQuotationPdf: permissions.includes(PERMISSIONS.QUOTATIONS_GENERATE_PDF),
      },
    };
  },
  async searchByPhone(auth: AuthContext, phone: string) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 5) throw new ValidationError('Enter at least five phone digits.');
    return prisma.query.findMany({
      where: await visibleWhere(auth, { normalizedPhone: { contains: normalized } }),
      select: {
        id: true,
        queryNumber: true,
        customerName: true,
        phone: true,
        alternatePhone: true,
        email: true,
        dateOfBirth: true,
        departureCity: true,
        createdAt: true,
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  },
  async lookups(auth: AuthContext) {
    const users = await prisma.user.findMany({
      where: { companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
      select: userSelect,
      orderBy: { fullName: 'asc' },
    });
    const options = (values: readonly string[]) =>
      values.map((value) => ({ value, label: labelForLookup(value) }));
    return {
      countries: [
        'India',
        'United Arab Emirates',
        'Thailand',
        'Singapore',
        'Indonesia',
        'Malaysia',
        'Maldives',
        'United Kingdom',
        'France',
        'United States',
      ],
      cities: [
        'Delhi',
        'Mumbai',
        'Bengaluru',
        'Dubai',
        'Bangkok',
        'Singapore',
        'Bali',
        'Malé',
        'London',
        'Paris',
      ],
      leadSources: options(LEAD_SOURCES),
      leadTypes: options(LEAD_TYPES),
      leadStages: options(LEAD_STAGES),
      priorities: options(QUERY_PRIORITIES),
      serviceTypes: options(SERVICE_TYPES),
      tripTypes: ['Leisure', 'Business', 'Honeymoon', 'Family', 'Group', 'MICE'],
      currencies: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'],
      assignableUsers: users,
    };
  },
  async create(auth: AuthContext, input: QueryInput, context: RequestContext) {
    const assignedToId = input.assignedToId ?? auth.userId;
    await assertAssignable(auth, assignedToId);
    await assertCanAssignOther(auth, assignedToId);
    if (input.initialFollowUp?.assignedToId)
      await assertAssignable(auth, input.initialFollowUp.assignedToId);
    const year = new Date().getUTCFullYear();
    const id = await prisma.$transaction(async (tx) => {
      const counter = await tx.queryCounter.upsert({
        where: { companyId_year: { companyId: auth.companyId, year } },
        create: { companyId: auth.companyId, year, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });
      const createData = {
        companyId: auth.companyId,
        queryNumber: `QRY-${year}-${String(counter.value).padStart(6, '0')}`,
        createdById: auth.userId,
        ...scalarData(input),
        assignedToId,
        travellerSummary: travellerSummary(input),
        services: {
          create: [...new Set(input.services)].map((serviceType) => ({
            companyId: auth.companyId,
            serviceType,
          })),
        },
        itinerary: {
          create: input.itinerary.map((row) => ({ companyId: auth.companyId, ...row })),
        },
        notes: input.initialNote
          ? {
              create: {
                companyId: auth.companyId,
                authorUserId: auth.userId,
                content: input.initialNote,
              },
            }
          : undefined,
        ...(input.initialFollowUp
          ? {
              followUps: {
                create: {
                  companyId: auth.companyId,
                  createdById: auth.userId,
                  ...input.initialFollowUp,
                  assignedToId: input.initialFollowUp.assignedToId ?? assignedToId,
                },
              },
            }
          : {}),
        stageHistory: {
          create: {
            companyId: auth.companyId,
            newStage: input.leadStage,
            changedById: auth.userId,
          },
        },
        assignmentHistory: {
          create: {
            companyId: auth.companyId,
            newAssigneeId: assignedToId,
            assignedById: auth.userId,
          },
        },
      } as Prisma.QueryUncheckedCreateInput;
      const query = await tx.query.create({ data: createData, select: { id: true } });
      if (input.initialFollowUp) await recalculateNextFollowUp(tx, auth.companyId, query.id);
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_CREATED', query.id, context, {
          leadStage: input.leadStage,
          assignedToId,
        }),
      });
      return query.id;
    });
    return presentQuery(await getVisible(auth, id));
  },
  async update(auth: AuthContext, id: string, input: QueryUpdateInput, context: RequestContext) {
    const current = await getVisible(auth, id);
    await prisma.$transaction(async (tx) => {
      const data = {
        ...scalarData(input),
        ...(input.services
          ? {
              services: {
                deleteMany: {},
                create: [...new Set(input.services)].map((serviceType) => ({
                  companyId: auth.companyId,
                  serviceType,
                })),
              },
            }
          : {}),
        ...(input.itinerary
          ? {
              itinerary: {
                deleteMany: {},
                create: input.itinerary.map((row) => ({ companyId: auth.companyId, ...row })),
              },
            }
          : {}),
      } as Prisma.QueryUncheckedUpdateInput;
      if (
        input.rooms !== undefined ||
        input.adults !== undefined ||
        input.childrenWithBed !== undefined ||
        input.childrenWithoutBed !== undefined ||
        input.infants !== undefined ||
        input.extraBeds !== undefined
      ) {
        data.travellerSummary = travellerSummary({
          rooms: input.rooms ?? current.rooms,
          adults: input.adults ?? current.adults,
          childrenWithBed: input.childrenWithBed ?? current.childrenWithBed,
          childrenWithoutBed: input.childrenWithoutBed ?? current.childrenWithoutBed,
          infants: input.infants ?? current.infants,
          extraBeds: input.extraBeds ?? current.extraBeds,
        });
      }
      await tx.query.update({ where: { id }, data });
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_UPDATED', id, context, {
          changedFields: Object.keys(input).filter(
            (k) => !['supplierCostingNotes', 'internalRemarks'].includes(k),
          ),
        }),
      });
    });
    return presentQuery(await getVisible(auth, id));
  },
  async archive(auth: AuthContext, id: string, context: RequestContext) {
    await getVisible(auth, id);
    await prisma.$transaction([
      prisma.query.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.activityLog.create({ data: audit(auth, 'QUERY_ARCHIVED', id, context) }),
    ]);
    return { archived: true, id };
  },
  async changeStage(
    auth: AuthContext,
    id: string,
    input: { stage: LeadStage; reason?: string | null; lostReason?: string | null },
    context: RequestContext,
  ) {
    const current = await getVisible(auth, id);
    const { role } = await caller(auth);
    const isPrivileged = role.name === ROLE_NAME.OWNER || role.name === ROLE_NAME.MANAGER;
    if (terminalStages.includes(current.leadStage) && !isPrivileged)
      throw new ForbiddenError('Only an Owner or Manager can reopen a terminal lead.');
    if (
      !terminalStages.includes(current.leadStage) &&
      !transitionMap[current.leadStage].includes(input.stage)
    )
      throw new ValidationError(`Stage cannot move from ${current.leadStage} to ${input.stage}.`);
    if (input.stage === 'LOST' && !input.lostReason)
      throw new ValidationError('A lost reason is required.');
    if ((input.stage === 'CANCELLED' || input.stage === 'INVALID') && !input.reason)
      throw new ValidationError('A reason is required.');
    await prisma.$transaction(async (tx) => {
      await tx.query.update({
        where: { id },
        data: {
          leadStage: input.stage,
          lostReason: input.stage === 'LOST' ? (input.lostReason ?? null) : null,
          convertedAt: input.stage === 'BOOKING_CONFIRMED' ? new Date() : null,
        },
      });
      await tx.queryStageHistory.create({
        data: {
          companyId: auth.companyId,
          queryId: id,
          previousStage: current.leadStage,
          newStage: input.stage,
          changedById: auth.userId,
          reason: input.lostReason ?? input.reason ?? null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_STAGE_CHANGED', id, context, {
          previousStage: current.leadStage,
          newStage: input.stage,
          reason: input.lostReason ?? input.reason,
        }),
      });
    });
    return presentQuery(await getVisible(auth, id));
  },
  async assign(
    auth: AuthContext,
    id: string,
    input: { assignedToId: string | null; movePendingFollowUps: boolean },
    context: RequestContext,
  ) {
    const current = await getVisible(auth, id);
    await assertAssignable(auth, input.assignedToId);
    await prisma.$transaction(async (tx) => {
      await tx.query.update({ where: { id }, data: { assignedToId: input.assignedToId } });
      await tx.queryAssignmentHistory.create({
        data: {
          companyId: auth.companyId,
          queryId: id,
          previousAssigneeId: current.assignedToId,
          newAssigneeId: input.assignedToId,
          assignedById: auth.userId,
        },
      });
      if (input.movePendingFollowUps && input.assignedToId)
        await tx.queryFollowUp.updateMany({
          where: { companyId: auth.companyId, queryId: id, status: 'PENDING', deletedAt: null },
          data: { assignedToId: input.assignedToId },
        });
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_ASSIGNED', id, context, {
          previousAssigneeId: current.assignedToId,
          newAssigneeId: input.assignedToId,
          pendingFollowUpsMoved: input.movePendingFollowUps,
        }),
      });
    });
    return presentQuery(await getVisible(auth, id));
  },
  async analytics(auth: AuthContext) {
    const where = await visibleWhere(auth);
    const now = new Date();
    const [total, newLeads, qualified, due, quotationRequired, ready, won, lost, byType, byStage] =
      await prisma.$transaction([
        prisma.query.count({ where }),
        prisma.query.count({ where: { ...where, leadStage: 'NEW_LEAD' } }),
        prisma.query.count({ where: { ...where, leadStage: 'QUALIFIED' } }),
        prisma.query.count({ where: { ...where, nextFollowUpAt: { lte: now } } }),
        prisma.query.count({ where: { ...where, quotationRequired: true } }),
        prisma.query.count({ where: { ...where, leadStage: 'READY_TO_BOOK' } }),
        prisma.query.count({ where: { ...where, leadStage: 'BOOKING_CONFIRMED' } }),
        prisma.query.count({ where: { ...where, leadStage: 'LOST' } }),
        prisma.query.groupBy({
          by: ['leadType'],
          where,
          orderBy: { leadType: 'asc' },
          _count: { leadType: true },
        }),
        prisma.query.groupBy({
          by: ['leadStage'],
          where,
          orderBy: { leadStage: 'asc' },
          _count: { leadStage: true },
        }),
      ]);
    return {
      totalLeads: total,
      newLeads,
      qualifiedLeads: qualified,
      followUpsDue: due,
      quotationRequired,
      readyToBook: ready,
      bookingConfirmed: won,
      lostLeads: lost,
      conversionRate: total ? Number(((won / total) * 100).toFixed(1)) : 0,
      winRate: won + lost ? Number(((won / (won + lost)) * 100).toFixed(1)) : 0,
      byLeadType: Object.fromEntries(
        byType.map((v) => [
          v.leadType,
          v._count && typeof v._count !== 'boolean' ? (v._count.leadType ?? 0) : 0,
        ]),
      ),
      byLeadStage: Object.fromEntries(
        byStage.map((v) => [
          v.leadStage,
          v._count && typeof v._count !== 'boolean' ? (v._count.leadStage ?? 0) : 0,
        ]),
      ),
    };
  },
  async notes(auth: AuthContext, id: string) {
    await getVisible(auth, id);
    return prisma.queryNote.findMany({
      where: { companyId: auth.companyId, queryId: id, deletedAt: null },
      select: noteSelect,
      orderBy: { createdAt: 'desc' },
    });
  },
  async addNote(
    auth: AuthContext,
    id: string,
    input: { content: string; isCustomerContact?: boolean; contactMethod?: ContactMethod | null },
    context: RequestContext,
  ) {
    await getVisible(auth, id);
    return prisma.$transaction(async (tx) => {
      const contactedAt = input.isCustomerContact ? new Date() : null;
      const note = await tx.queryNote.create({
        data: {
          companyId: auth.companyId,
          queryId: id,
          authorUserId: auth.userId,
          content: input.content,
          isCustomerContact: input.isCustomerContact ?? false,
          contactMethod: input.isCustomerContact ? (input.contactMethod ?? 'OTHER') : null,
          contactedAt,
        },
        select: noteSelect,
      });
      if (contactedAt)
        await tx.query.update({ where: { id }, data: { lastContactedAt: contactedAt } });
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_NOTE_ADDED', id, context, { noteId: note.id }),
      });
      if (contactedAt)
        await tx.activityLog.create({
          data: audit(auth, 'QUERY_CONTACT_RECORDED', id, context, {
            noteId: note.id,
            contactMethod: note.contactMethod,
          }),
        });
      return note;
    });
  },
  async updateNote(
    auth: AuthContext,
    id: string,
    noteId: string,
    input: { content: string; isCustomerContact?: boolean; contactMethod?: ContactMethod | null },
    context: RequestContext,
  ) {
    await getVisible(auth, id);
    const note = await prisma.queryNote.findFirst({
      where: { id: noteId, queryId: id, companyId: auth.companyId, deletedAt: null },
    });
    if (!note) throw new NotFoundError('Note not found.');
    const { role } = await caller(auth);
    if (
      note.authorUserId !== auth.userId &&
      role.name !== ROLE_NAME.OWNER &&
      role.name !== ROLE_NAME.MANAGER
    )
      throw new ForbiddenError('Only the author, Owner or Manager can edit this note.');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.queryNote.update({
        where: { id: noteId },
        data: {
          content: input.content,
          isCustomerContact: input.isCustomerContact ?? false,
          contactMethod: input.isCustomerContact ? (input.contactMethod ?? 'OTHER') : null,
          contactedAt:
            input.isCustomerContact && !note.isCustomerContact ? new Date() : note.contactedAt,
        },
        select: noteSelect,
      });
      if (updated.isCustomerContact && updated.contactedAt)
        await tx.query.update({ where: { id }, data: { lastContactedAt: updated.contactedAt } });
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_NOTE_UPDATED', id, context, { noteId }),
      });
      return updated;
    });
  },
  async deleteNote(auth: AuthContext, id: string, noteId: string, context: RequestContext) {
    await getVisible(auth, id);
    const note = await prisma.queryNote.findFirst({
      where: { id: noteId, queryId: id, companyId: auth.companyId, deletedAt: null },
    });
    if (!note) throw new NotFoundError('Note not found.');
    const { role } = await caller(auth);
    if (
      note.authorUserId !== auth.userId &&
      role.name !== ROLE_NAME.OWNER &&
      role.name !== ROLE_NAME.MANAGER
    )
      throw new ForbiddenError('Only the author, Owner or Manager can delete this note.');
    await prisma.$transaction([
      prisma.queryNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } }),
      prisma.activityLog.create({
        data: audit(auth, 'QUERY_NOTE_DELETED', id, context, { noteId }),
      }),
    ]);
    return { deleted: true, id: noteId };
  },
  async followUps(auth: AuthContext, id: string) {
    await getVisible(auth, id);
    const rows = await prisma.queryFollowUp.findMany({
      where: { companyId: auth.companyId, queryId: id, deletedAt: null },
      select: followUpSelect,
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(effectiveFollowUpStatus);
  },
  async addFollowUp(auth: AuthContext, id: string, input: FollowUpInput, context: RequestContext) {
    const query = await getVisible(auth, id);
    const assignedToId = input.assignedToId ?? query.assignedToId ?? auth.userId;
    validateScheduledAt(input.scheduledAt);
    await assertAssignable(auth, assignedToId);
    await assertCanAssignOther(auth, assignedToId);
    return prisma.$transaction(async (tx) => {
      const data = {
        companyId: auth.companyId,
        queryId: id,
        createdById: auth.userId,
        ...input,
        assignedToId,
      } as Prisma.QueryFollowUpUncheckedCreateInput;
      const row = await tx.queryFollowUp.create({
        data,
        select: followUpSelect,
      });
      await recalculateNextFollowUp(tx, auth.companyId, id);
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_FOLLOW_UP_CREATED', id, context, {
          followUpId: row.id,
          scheduledAt: row.scheduledAt.toISOString(),
        }),
      });
      return effectiveFollowUpStatus(row);
    });
  },
  async updateFollowUp(
    auth: AuthContext,
    id: string,
    followUpId: string,
    input: Partial<FollowUpInput>,
    context: RequestContext,
  ) {
    await getVisible(auth, id);
    const row = await prisma.queryFollowUp.findFirst({
      where: { id: followUpId, queryId: id, companyId: auth.companyId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Follow-up not found.');
    if (row.status !== 'PENDING')
      throw new ValidationError('Only pending follow-ups can be edited.');
    await assertCanManageFollowUp(auth, row.assignedToId);
    if (input.scheduledAt) validateScheduledAt(input.scheduledAt);
    if (input.assignedToId) await assertAssignable(auth, input.assignedToId);
    if (input.assignedToId) await assertCanAssignOther(auth, input.assignedToId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.queryFollowUp.update({
        where: { id: followUpId },
        data: input as Prisma.QueryFollowUpUncheckedUpdateInput,
        select: followUpSelect,
      });
      await recalculateNextFollowUp(tx, auth.companyId, id);
      await tx.activityLog.create({
        data: audit(
          auth,
          input.scheduledAt && input.scheduledAt.getTime() !== row.scheduledAt.getTime()
            ? 'QUERY_FOLLOW_UP_RESCHEDULED'
            : 'QUERY_FOLLOW_UP_UPDATED',
          id,
          context,
          { followUpId },
        ),
      });
      return effectiveFollowUpStatus(updated);
    });
  },
  async closeFollowUp(
    auth: AuthContext,
    id: string,
    followUpId: string,
    status: 'COMPLETED' | 'CANCELLED',
    body: FollowUpCompleteInput | { reason: string },
    context: RequestContext,
  ) {
    await getVisible(auth, id);
    const row = await prisma.queryFollowUp.findFirst({
      where: { id: followUpId, companyId: auth.companyId, queryId: id, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Follow-up not found.');
    if (row.status !== 'PENDING')
      throw new ValidationError('Only pending follow-ups can be completed or cancelled.');
    await assertCanManageFollowUp(auth, row.assignedToId);
    if (status === 'COMPLETED') {
      const completion = body as FollowUpCompleteInput;
      if (completion.nextFollowUp) {
        validateScheduledAt(completion.nextFollowUp.scheduledAt);
        await assertAssignable(auth, completion.nextFollowUp.assignedToId ?? row.assignedToId);
        await assertCanAssignOther(auth, completion.nextFollowUp.assignedToId ?? row.assignedToId);
      }
      if (
        completion.nextLeadStage &&
        !(await permissionsService.userHasPermission(auth.userId, PERMISSIONS.QUERIES_UPDATE))
      )
        throw new ForbiddenError('You cannot change the lead stage.');
    }
    return prisma.$transaction(async (tx) => {
      const completedAt = new Date();
      const completion = status === 'COMPLETED' ? (body as FollowUpCompleteInput) : null;
      const cancellation = status === 'CANCELLED' ? (body as { reason: string }) : null;
      const data = {
        status,
        outcomeType: completion?.outcome ?? null,
        completionNotes: completion?.notes ?? null,
        completedAt: completion ? completedAt : null,
        cancelledAt: cancellation ? completedAt : null,
        cancellationReason: cancellation?.reason ?? null,
      } as Prisma.QueryFollowUpUncheckedUpdateInput;
      const updated = await tx.queryFollowUp.update({
        where: { id: followUpId },
        data,
        select: followUpSelect,
      });
      if (completion) {
        await tx.query.update({ where: { id }, data: { lastContactedAt: completedAt } });
        if (completion.nextFollowUp) {
          const nextAssignee = completion.nextFollowUp.assignedToId ?? row.assignedToId;
          await tx.queryFollowUp.create({
            data: {
              companyId: auth.companyId,
              queryId: id,
              createdById: auth.userId,
              assignedToId: nextAssignee,
              scheduledAt: completion.nextFollowUp.scheduledAt,
              ...(completion.nextFollowUp.notes !== undefined
                ? { notes: completion.nextFollowUp.notes }
                : {}),
            },
          });
          await tx.activityLog.create({
            data: audit(auth, 'QUERY_FOLLOW_UP_CREATED', id, context, {
              sourceFollowUpId: followUpId,
              scheduledAt: completion.nextFollowUp.scheduledAt.toISOString(),
            }),
          });
        }
        if (completion.nextLeadStage) {
          const query = await tx.query.findUniqueOrThrow({
            where: { id },
            select: { leadStage: true },
          });
          if (!transitionMap[query.leadStage].includes(completion.nextLeadStage))
            throw new ValidationError(
              `Stage cannot move from ${query.leadStage} to ${completion.nextLeadStage}.`,
            );
          await tx.query.update({
            where: { id },
            data: {
              leadStage: completion.nextLeadStage,
              convertedAt: completion.nextLeadStage === 'BOOKING_CONFIRMED' ? completedAt : null,
            },
          });
          await tx.queryStageHistory.create({
            data: {
              companyId: auth.companyId,
              queryId: id,
              previousStage: query.leadStage,
              newStage: completion.nextLeadStage,
              changedById: auth.userId,
              reason: 'Changed while completing a follow-up',
            },
          });
          await tx.activityLog.create({
            data: audit(auth, 'QUERY_STAGE_CHANGED', id, context, {
              previousStage: query.leadStage,
              newStage: completion.nextLeadStage,
              sourceFollowUpId: followUpId,
            }),
          });
        }
      }
      await recalculateNextFollowUp(tx, auth.companyId, id);
      await tx.activityLog.create({
        data: audit(
          auth,
          status === 'COMPLETED' ? 'QUERY_FOLLOW_UP_COMPLETED' : 'QUERY_FOLLOW_UP_CANCELLED',
          id,
          context,
          { followUpId },
        ),
      });
      const lead = await tx.query.findUniqueOrThrow({
        where: { id },
        select: { id: true, leadStage: true, lastContactedAt: true, nextFollowUpAt: true },
      });
      return { followUp: effectiveFollowUpStatus(updated), lead };
    });
  },
  async deleteFollowUp(auth: AuthContext, id: string, followUpId: string, context: RequestContext) {
    await getVisible(auth, id);
    const row = await prisma.queryFollowUp.findFirst({
      where: { id: followUpId, companyId: auth.companyId, queryId: id, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Follow-up not found.');
    if (row.status !== 'PENDING')
      throw new ValidationError('Only pending follow-ups can be deleted; cancel instead.');
    await assertCanManageFollowUp(auth, row.assignedToId);
    await prisma.$transaction(async (tx) => {
      await tx.queryFollowUp.update({ where: { id: followUpId }, data: { deletedAt: new Date() } });
      await recalculateNextFollowUp(tx, auth.companyId, id);
      await tx.activityLog.create({
        data: audit(auth, 'QUERY_FOLLOW_UP_DELETED', id, context, { followUpId }),
      });
    });
    return { deleted: true, id: followUpId };
  },
  async timeline(auth: AuthContext, id: string, q: { page?: number; pageSize?: number }) {
    const query = await getVisible(auth, id);
    const p = resolvePagination(q);
    const [stages, assignments, notes, activities] = await prisma.$transaction([
      prisma.queryStageHistory.findMany({
        where: { companyId: auth.companyId, queryId: id },
        include: { changedBy: { select: userSelect } },
      }),
      prisma.queryAssignmentHistory.findMany({
        where: { companyId: auth.companyId, queryId: id },
        include: {
          assignedBy: { select: userSelect },
          previousAssignee: { select: userSelect },
          newAssignee: { select: userSelect },
        },
      }),
      prisma.queryNote.findMany({
        where: { companyId: auth.companyId, queryId: id, deletedAt: null },
        include: { authorUser: { select: userSelect } },
      }),
      prisma.activityLog.findMany({
        where: {
          companyId: auth.companyId,
          entityType: 'Query',
          entityId: id,
          action: {
            in: [
              'QUERY_UPDATED',
              'QUERY_ARCHIVED',
              'QUERY_NOTE_UPDATED',
              'QUERY_NOTE_DELETED',
              'QUERY_FOLLOW_UP_CREATED',
              'QUERY_FOLLOW_UP_UPDATED',
              'QUERY_FOLLOW_UP_RESCHEDULED',
              'QUERY_FOLLOW_UP_COMPLETED',
              'QUERY_FOLLOW_UP_CANCELLED',
              'QUERY_FOLLOW_UP_DELETED',
            ],
          },
        },
        include: { actorUser: { select: userSelect } },
      }),
    ]);
    const entries = [
      {
        id: `created-${id}`,
        type: 'CREATED',
        actor: query.createdBy,
        title: 'Lead created',
        description: query.queryNumber,
        timestamp: query.createdAt,
        iconKey: 'lead',
        metadata: {},
      },
      ...stages.map((x) => ({
        id: x.id,
        type: 'STAGE',
        actor: x.changedBy,
        title: `Stage changed to ${labelForLookup(x.newStage)}`,
        description: x.reason,
        timestamp: x.createdAt,
        iconKey: 'stage',
        metadata: { previousStage: x.previousStage, newStage: x.newStage },
      })),
      ...assignments.map((x) => ({
        id: x.id,
        type: 'ASSIGNMENT',
        actor: x.assignedBy,
        title: 'Assignment changed',
        description: x.newAssignee?.fullName ?? 'Unassigned',
        timestamp: x.createdAt,
        iconKey: 'assignment',
        metadata: {
          previousAssignee: x.previousAssignee?.fullName ?? null,
          newAssignee: x.newAssignee?.fullName ?? null,
        },
      })),
      ...notes.map((x) => ({
        id: x.id,
        type: 'NOTE',
        actor: x.authorUser,
        title: x.isCustomerContact ? 'Customer contact recorded' : 'Note added',
        description: x.content,
        timestamp: x.createdAt,
        iconKey: x.isCustomerContact ? 'contact' : 'note',
        metadata: {
          isCustomerContact: x.isCustomerContact,
          contactMethod: x.contactMethod,
        },
      })),
      ...activities.map((x) => ({
        id: x.id,
        type: 'ACTIVITY',
        actor: x.actorUser,
        title: labelForLookup(x.action.replace(/^QUERY_/, '')),
        description: null,
        timestamp: x.createdAt,
        iconKey: x.action.includes('FOLLOW_UP') ? 'follow-up' : 'activity',
        metadata: { action: x.action },
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const total = entries.length;
    return {
      data: entries.slice((p.page - 1) * p.pageSize, p.page * p.pageSize),
      pagination: { ...p, total, totalPages: total ? Math.ceil(total / p.pageSize) : 0 },
    };
  },
};
