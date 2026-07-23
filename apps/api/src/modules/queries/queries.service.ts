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
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import {
  normalizeCustomerName,
  normalizeCustomerPhone,
  normalizeEmail,
  normalizePhone,
} from '../../utils/normalize.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { localDayBounds } from '../../utils/timezone.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  findDuplicates,
  getVisibleCustomer,
  hasExactCustomerMatch,
  recalculateCustomerMetrics,
} from '../customers/customers.service.js';
import { reminderProcessor } from '../reminders/reminder-processor.service.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };
export const userSelect = { id: true, fullName: true, username: true } as const;
const include = {
  assignedTo: { select: userSelect },
  createdBy: { select: userSelect },
  services: { select: { serviceType: true } },
  itinerary: { orderBy: { sequence: 'asc' as const } },
  customer: {
    select: { id: true, customerNumber: true, displayName: true, primaryPhone: true, email: true },
  },
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

/**
 * List include adding the single latest linked quotation and booking so each
 * lead row can show quotation/booking state without any per-row query. Both are
 * bounded (`take: 1`); the presenter redacts them by the caller's permissions.
 */
const leadListInclude = {
  ...include,
  quotations: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      acceptedVersionId: true,
      lastSentAt: true,
      acceptedAt: true,
      createdAt: true,
      booking: { select: { id: true, bookingNumber: true } },
      versions: {
        orderBy: { versionNumber: 'desc' as const },
        take: 1,
        select: { finalAmount: true, currency: true },
      },
    },
  },
  bookings: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      bookingNumber: true,
      bookingStatus: true,
      operationalStatus: true,
      paymentStatus: true,
      travelStartDate: true,
      travelEndDate: true,
    },
  },
} as const;
type LeadListRow = Prisma.QueryGetPayload<{ include: typeof leadListInclude }>;

/** Capabilities that shape which linked data and row actions a lead row exposes. */
export interface LeadRowCaps {
  canViewQuotations: boolean;
  canCreateQuotation: boolean;
  canViewBookings: boolean;
  canViewBookingFinancials: boolean;
  canConvertBooking: boolean;
  canScheduleFollowUp: boolean;
}

/** A quotation is convertible to a booking only when accepted and not yet booked. */
export function conversionEligible(quotation: {
  status: string;
  acceptedVersionId: string | null;
  booking: { id: string } | null;
}) {
  return (
    quotation.status === 'ACCEPTED' && Boolean(quotation.acceptedVersionId) && !quotation.booking
  );
}

/**
 * Enrich a lead row with a redacted quotation/booking summary and context-aware
 * action flags. Quotation and booking blocks are omitted (not nulled) when the
 * caller lacks the relevant module permission; booking `paymentStatus` is only
 * present with booking financial permission.
 */
export function presentLeadRow(value: LeadListRow, caps: LeadRowCaps) {
  const { quotations, bookings, ...rest } = value;
  const base = presentQuery(rest as IncludedQuery);
  const terminal = terminalStages.includes(value.leadStage);
  const latestQuotation = quotations[0] ?? null;
  const latestBooking = bookings[0] ?? null;
  const eligible = latestQuotation ? conversionEligible(latestQuotation) : false;

  const quotationSummary =
    caps.canViewQuotations && latestQuotation
      ? {
          quotationId: latestQuotation.id,
          quotationNumber: latestQuotation.quotationNumber,
          quotationStatus: latestQuotation.status,
          acceptedVersionId: latestQuotation.acceptedVersionId,
          latestVersionAmount: latestQuotation.versions[0]?.finalAmount?.toFixed(2) ?? null,
          currency: latestQuotation.versions[0]?.currency ?? null,
          bookingId: latestQuotation.booking?.id ?? null,
          lastSentAt: latestQuotation.lastSentAt,
          acceptedAt: latestQuotation.acceptedAt,
        }
      : null;

  const bookingSummary =
    caps.canViewBookings && latestBooking
      ? {
          bookingId: latestBooking.id,
          bookingNumber: latestBooking.bookingNumber,
          bookingStatus: latestBooking.bookingStatus,
          operationalStatus: latestBooking.operationalStatus,
          travelStartDate: latestBooking.travelStartDate,
          travelEndDate: latestBooking.travelEndDate,
          ...(caps.canViewBookingFinancials ? { paymentStatus: latestBooking.paymentStatus } : {}),
        }
      : null;

  return {
    ...base,
    hasQuotations: caps.canViewQuotations ? quotations.length > 0 : undefined,
    quotationSummary,
    bookingSummary,
    actions: {
      canCreateQuotation: caps.canCreateQuotation && !terminal,
      canOpenQuotation: caps.canViewQuotations && Boolean(latestQuotation),
      canConvertToBooking: caps.canConvertBooking && eligible && !latestBooking,
      canViewBooking: caps.canViewBookings && Boolean(latestBooking),
      canAddFollowUp: caps.canScheduleFollowUp && !terminal,
    },
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

/** Resolve the caller's lead-row capabilities in one permission lookup. */
export async function leadRowCaps(auth: AuthContext): Promise<LeadRowCaps> {
  const permissions = await permissionsService.resolveForUser(auth.userId);
  return {
    canViewQuotations: permissions.includes(PERMISSIONS.QUOTATIONS_VIEW),
    canCreateQuotation: permissions.includes(PERMISSIONS.QUOTATIONS_CREATE),
    canViewBookings: permissions.includes(PERMISSIONS.BOOKINGS_VIEW),
    canViewBookingFinancials: permissions.includes(PERMISSIONS.BOOKINGS_VIEW_FINANCIALS),
    canConvertBooking: permissions.includes(PERMISSIONS.BOOKINGS_CONVERT_FROM_QUOTATION),
    canScheduleFollowUp: permissions.includes(PERMISSIONS.FOLLOWUPS_CREATE),
  };
}

/**
 * Build the visibility-scoped lead-list where clause from query parameters.
 * Shared by `list` and `export` so both honour identical filters, search and
 * tenant/visibility rules.
 */
export async function buildLeadListWhere(auth: AuthContext, q: Record<string, unknown>) {
  const str = (key: string) => (typeof q[key] === 'string' ? (q[key] as string) : undefined);
  const date = (key: string) =>
    q[key] instanceof Date
      ? (q[key] as Date)
      : typeof q[key] === 'string'
        ? new Date(q[key] as string)
        : undefined;
  const dateRange = (from: string, to: string) => {
    const start = date(from);
    const rawEnd = date(to);
    const end = rawEnd ? new Date(rawEnd) : undefined;
    if (end) end.setUTCHours(23, 59, 59, 999);
    return start || end
      ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) }
      : undefined;
  };
  const search = str('search');
  return visibleWhere(auth, {
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
    ...(str('leadSource') ? { leadSource: str('leadSource') as Prisma.EnumLeadSourceFilter } : {}),
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
      ? { services: { some: { serviceType: str('serviceType') as Prisma.EnumServiceTypeFilter } } }
      : {}),
    ...(typeof q.quotationRequired === 'boolean' ? { quotationRequired: q.quotationRequired } : {}),
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
    const where = await buildLeadListWhere(auth, q);
    const sortBy = typeof q.sortBy === 'string' ? q.sortBy : 'createdAt';
    const sortOrder = (typeof q.sortOrder === 'string' ? q.sortOrder : 'desc') as Prisma.SortOrder;
    // Resolve the caller's permissions once so the enriched rows can be redacted
    // without any per-row work.
    const caps = await leadRowCaps(auth);
    const [data, total] = await prisma.$transaction([
      prisma.query.findMany({
        where,
        include: leadListInclude,
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.query.count({ where }),
    ]);
    return {
      data: data.map((row) => presentLeadRow(row, caps)),
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
            booking: { select: { id: true, bookingNumber: true, bookingStatus: true } },
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
    const bookings = permissions.includes(PERMISSIONS.BOOKINGS_VIEW)
      ? await prisma.booking.findMany({
          where: { companyId: auth.companyId, queryId: id, deletedAt: null },
          select: {
            id: true,
            bookingNumber: true,
            bookingStatus: true,
            operationalStatus: true,
            paymentStatus: true,
            destinationSummary: true,
            travelStartDate: true,
            travelEndDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
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
      bookings: { count: bookings.length, latest: bookings[0] ?? null, items: bookings },
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
        canViewBookings: permissions.includes(PERMISSIONS.BOOKINGS_VIEW),
        canConvertBooking: permissions.includes(PERMISSIONS.BOOKINGS_CONVERT_FROM_QUOTATION),
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
    let linkedCustomerId = input.customerId ?? null;
    if (linkedCustomerId) {
      const customer = await getVisibleCustomer(auth, linkedCustomerId);
      if (!['ACTIVE', 'INACTIVE'].includes(customer.status))
        throw new ValidationError('The selected customer is not available in this company.');
    } else {
      const exactMatchExists = await hasExactCustomerMatch(auth, {
        phone: input.phone,
        ...(input.email ? { email: input.email } : {}),
      });
      const duplicates = await findDuplicates(auth, {
        displayName: input.customerName,
        phone: input.phone,
        ...(input.email ? { email: input.email } : {}),
      });
      const strong = duplicates.filter((value) => value.strongMatch);
      if (!strong.length && exactMatchExists && !input.createAnyway)
        throw new ConflictError(
          'A matching customer exists outside your visibility. Ask a manager to link it or explicitly create a separate profile.',
        );
      if (strong.length > 1)
        throw new ConflictError(
          'Multiple customer profiles match this lead. Select the correct customer before creating it.',
        );
      if (strong.length === 1 && input.createNewCustomer && !input.createAnyway)
        throw new ConflictError(
          'A matching customer already exists. Link it or choose create anyway.',
        );
      if (strong.length === 1 && !input.createNewCustomer) linkedCustomerId = strong[0]!.id;
    }
    const year = new Date().getUTCFullYear();
    const id = await prisma.$transaction(async (tx) => {
      if (!linkedCustomerId) {
        const customerCounter = await tx.customerCounter.upsert({
          where: { companyId_year: { companyId: auth.companyId, year } },
          create: { companyId: auth.companyId, year, value: 1 },
          update: { value: { increment: 1 } },
          select: { value: true },
        });
        const customer = await tx.customer.create({
          data: {
            companyId: auth.companyId,
            customerNumber: `CUS-${year}-${String(customerCounter.value).padStart(6, '0')}`,
            displayName: input.customerName,
            normalizedName: normalizeCustomerName(input.customerName),
            primaryPhone: input.phone,
            normalizedPhone: normalizeCustomerPhone(input.phone, env.DEFAULT_PHONE_COUNTRY),
            alternatePhone: input.alternatePhone || null,
            email: input.email || null,
            normalizedEmail: input.email ? normalizeEmail(input.email) : null,
            dateOfBirth: input.dateOfBirth ?? null,
            source: input.leadSource,
            assignedToId,
            createdById: auth.userId,
          },
        });
        linkedCustomerId = customer.id;
        await tx.activityLog.create({
          data: {
            companyId: auth.companyId,
            actorUserId: auth.userId,
            action: 'CUSTOMER_CREATED',
            entityType: 'Customer',
            entityId: customer.id,
            metadata: { source: 'LEAD_CREATION', customerNumber: customer.customerNumber },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }
      const counter = await tx.queryCounter.upsert({
        where: { companyId_year: { companyId: auth.companyId, year } },
        create: { companyId: auth.companyId, year, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
      });
      const createData = {
        companyId: auth.companyId,
        customerId: linkedCustomerId,
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
      if (linkedCustomerId) await recalculateCustomerMetrics(tx, auth.companyId, linkedCustomerId);
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
    const query = await getVisible(auth, id);
    await prisma.$transaction(async (tx) => {
      await tx.query.update({ where: { id }, data: { deletedAt: new Date() } });
      if (query.customerId) await recalculateCustomerMetrics(tx, auth.companyId, query.customerId);
      await tx.activityLog.create({ data: audit(auth, 'QUERY_ARCHIVED', id, context) });
    });
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
    reminderProcessor.scheduleEvent(auth.companyId, ['LEAD_STAGE']);
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

  /**
   * Bulk-assign visible leads to one active user. All-or-nothing: if any id is
   * not visible or the assignee is invalid the whole batch is rejected, so a
   * caller never learns whether an unauthorized id exists. Pending follow-ups
   * always move to the new assignee, exactly as single assignment can, and each
   * changed lead gets an assignment-history row.
   */
  async bulkAssign(
    auth: AuthContext,
    input: { queryIds: string[]; assignedToId: string },
    context: RequestContext,
  ) {
    await assertAssignable(auth, input.assignedToId);
    // Validate every id is visible before mutating anything.
    const visible = await prisma.query.findMany({
      where: await visibleWhere(auth, { id: { in: input.queryIds } }),
      select: { id: true, assignedToId: true },
    });
    if (visible.length !== input.queryIds.length)
      throw new ValidationError('One or more selected leads are not available.');
    const toChange = visible.filter((row) => row.assignedToId !== input.assignedToId);
    await prisma.$transaction(async (tx) => {
      for (const row of toChange) {
        await tx.query.update({
          where: { id: row.id },
          data: { assignedToId: input.assignedToId },
        });
        await tx.queryAssignmentHistory.create({
          data: {
            companyId: auth.companyId,
            queryId: row.id,
            previousAssigneeId: row.assignedToId,
            newAssigneeId: input.assignedToId,
            assignedById: auth.userId,
          },
        });
        await tx.queryFollowUp.updateMany({
          where: {
            companyId: auth.companyId,
            queryId: row.id,
            status: 'PENDING',
            deletedAt: null,
          },
          data: { assignedToId: input.assignedToId },
        });
        await tx.activityLog.create({
          data: audit(auth, 'QUERY_ASSIGNED', row.id, context, {
            previousAssigneeId: row.assignedToId,
            newAssigneeId: input.assignedToId,
            bulk: true,
          }),
        });
      }
    });
    reminderProcessor.scheduleEvent(auth.companyId, ['LEAD_STAGE']);
    return {
      updatedCount: toChange.length,
      unchangedCount: visible.length - toChange.length,
      results: visible.map((row) => ({
        queryId: row.id,
        changed: row.assignedToId !== input.assignedToId,
      })),
    };
  },

  /**
   * Bulk stage change. Every lead must satisfy the same transition rules as a
   * single change (visibility, transitionMap, terminal protection, required
   * reason); if any is ineligible the batch is rejected atomically without
   * forcing an invalid transition or bypassing the accepted-quotation booking
   * rule (BOOKING_CONFIRMED is not a bulk-selectable transition here).
   */
  async bulkChangeStage(
    auth: AuthContext,
    input: { queryIds: string[]; leadStage: LeadStage; reason?: string | null },
    context: RequestContext,
  ) {
    const { role } = await caller(auth);
    const isPrivileged = role.name === ROLE_NAME.OWNER || role.name === ROLE_NAME.MANAGER;
    const visible = await prisma.query.findMany({
      where: await visibleWhere(auth, { id: { in: input.queryIds } }),
      select: { id: true, leadStage: true },
    });
    if (visible.length !== input.queryIds.length)
      throw new ValidationError('One or more selected leads are not available.');
    if (input.leadStage === 'LOST' && !input.reason)
      throw new ValidationError('A reason is required to mark leads lost.');
    if ((input.leadStage === 'CANCELLED' || input.leadStage === 'INVALID') && !input.reason)
      throw new ValidationError('A reason is required for this stage.');
    // Validate every transition up front so the batch is all-or-nothing.
    for (const row of visible) {
      if (row.leadStage === input.leadStage) continue;
      if (terminalStages.includes(row.leadStage) && !isPrivileged)
        throw new ForbiddenError('Only an Owner or Manager can reopen a terminal lead.');
      if (
        !terminalStages.includes(row.leadStage) &&
        !transitionMap[row.leadStage].includes(input.leadStage)
      )
        throw new ValidationError(
          `One or more leads cannot move to ${input.leadStage} from their current stage.`,
        );
    }
    const toChange = visible.filter((row) => row.leadStage !== input.leadStage);
    await prisma.$transaction(async (tx) => {
      for (const row of toChange) {
        await tx.query.update({
          where: { id: row.id },
          data: {
            leadStage: input.leadStage,
            lostReason: input.leadStage === 'LOST' ? (input.reason ?? null) : null,
            convertedAt: input.leadStage === 'BOOKING_CONFIRMED' ? new Date() : null,
          },
        });
        await tx.queryStageHistory.create({
          data: {
            companyId: auth.companyId,
            queryId: row.id,
            previousStage: row.leadStage,
            newStage: input.leadStage,
            changedById: auth.userId,
            reason: input.reason ?? null,
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'QUERY_STAGE_CHANGED', row.id, context, {
            previousStage: row.leadStage,
            newStage: input.leadStage,
            reason: input.reason,
            bulk: true,
          }),
        });
      }
    });
    reminderProcessor.scheduleEvent(auth.companyId, ['LEAD_STAGE']);
    return {
      updatedCount: toChange.length,
      unchangedCount: visible.length - toChange.length,
      results: visible.map((row) => ({
        queryId: row.id,
        changed: row.leadStage !== input.leadStage,
      })),
    };
  },

  /**
   * CSV export of the filtered, visibility-scoped lead list. Reuses the same
   * where-builder as `list`; internal supplier costing notes are never exported
   * and booking payment status is omitted without booking financial permission.
   */
  async export(auth: AuthContext, q: Record<string, unknown>) {
    const caps = await leadRowCaps(auth);
    const where = await buildLeadListWhere(auth, q);
    const rows = await prisma.query.findMany({
      where,
      include: leadListInclude,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const day = (value: Date | null | undefined) =>
      value ? new Date(value).toISOString().slice(0, 10) : '';
    const headers = [
      'Lead Number',
      'Customer Name',
      'Phone',
      'Alternate Phone',
      'Email',
      'Lead Source',
      'Lead Type',
      'Lead Stage',
      'Priority',
      'Destination',
      'Travel Start',
      'Travel End',
      'Adults',
      'Children With Bed',
      'Children Without Bed',
      'Infants',
      'Assigned To',
      'Created By',
      'Next Follow-up',
      'Latest Quotation Status',
      'Booking Number',
      'Booking Status',
      'Created At',
    ];
    const lines = rows.map((row) => {
      const quotation = caps.canViewQuotations ? (row.quotations[0] ?? null) : null;
      const booking = caps.canViewBookings ? (row.bookings[0] ?? null) : null;
      return [
        row.queryNumber,
        row.customerName,
        row.phone,
        row.alternatePhone,
        row.email,
        row.leadSource,
        row.leadType,
        row.leadStage,
        row.priority,
        row.itinerary.map((entry) => entry.destination).join(' > '),
        day(row.travelStartDate),
        day(row.travelEndDate),
        row.adults,
        row.childrenWithBed,
        row.childrenWithoutBed,
        row.infants,
        row.assignedTo?.fullName,
        row.createdBy?.fullName,
        row.nextFollowUpAt ? new Date(row.nextFollowUpAt).toISOString() : '',
        quotation?.status ?? '',
        booking?.bookingNumber ?? '',
        booking?.bookingStatus ?? '',
        new Date(row.createdAt).toISOString(),
      ]
        .map(quote)
        .join(',');
    });
    return {
      fileName: `leads-${new Date().toISOString().slice(0, 10)}.csv`,
      mimeType: 'text/csv',
      content: [headers.map(quote).join(','), ...lines].join('\n'),
    };
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
