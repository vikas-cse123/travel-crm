import type { Prisma, ReminderPriority, ReminderType } from '@prisma/client';
import type { ReminderCompleteInput, ReminderInput, ReminderUpdateInput } from '@interscale/shared';
import { PERMISSIONS } from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  notificationsService,
  type RequestContext,
} from '../notifications/notifications.service.js';

const person = { id: true, fullName: true, email: true } as const;
const include = {
  assignedTo: { select: person },
  createdBy: { select: person },
  query: { select: { id: true, queryNumber: true, customerName: true } },
  customer: { select: { id: true, customerNumber: true, displayName: true } },
  quotation: { select: { id: true, quotationNumber: true, customerName: true } },
  booking: {
    select: {
      id: true,
      bookingNumber: true,
      customerName: true,
      destinationSummary: true,
      travelStartDate: true,
    },
  },
  vendor: { select: { id: true, vendorCode: true, name: true } },
  vendorPayable: { select: { id: true, payableNumber: true, description: true } },
  reminderRule: { select: { id: true, name: true } },
} as const;

function effectiveStatus(row: { status: string; scheduledAt: Date }) {
  if (row.status === 'PENDING')
    return row.scheduledAt.getTime() < Date.now() ? 'OVERDUE' : 'ACTIVE';
  return row.status;
}

function linkedEntity(row: Prisma.QueryFollowUpGetPayload<{ include: typeof include }>) {
  if (row.booking)
    return {
      type: 'Booking',
      id: row.booking.id,
      label: `${row.booking.bookingNumber} · ${row.booking.customerName}`,
      href: `/bookings/${row.booking.id}`,
    };
  if (row.quotation)
    return {
      type: 'Quotation',
      id: row.quotation.id,
      label: `${row.quotation.quotationNumber} · ${row.quotation.customerName}`,
      href: `/quotations/${row.quotation.id}`,
    };
  if (row.query)
    return {
      type: 'Lead',
      id: row.query.id,
      label: `${row.query.queryNumber} · ${row.query.customerName}`,
      href: `/queries/${row.query.id}`,
    };
  if (row.customer)
    return {
      type: 'Customer',
      id: row.customer.id,
      label: `${row.customer.customerNumber} · ${row.customer.displayName}`,
      href: `/customers/${row.customer.id}`,
    };
  if (row.vendor)
    return {
      type: 'Vendor',
      id: row.vendor.id,
      label: `${row.vendor.vendorCode} · ${row.vendor.name}`,
      href: `/vendors/${row.vendor.id}`,
    };
  if (row.vendorPayable)
    return {
      type: 'Vendor payable',
      id: row.vendorPayable.id,
      label: `${row.vendorPayable.payableNumber} · ${row.vendorPayable.description}`,
      href: row.vendorId ? `/vendors/${row.vendorId}` : '/vendors',
    };
  return null;
}

function serialize(row: Prisma.QueryFollowUpGetPayload<{ include: typeof include }>) {
  return {
    id: row.id,
    title: row.title,
    description: row.notes,
    dueAt: row.scheduledAt,
    originalDueAt: row.originalDueAt,
    snoozedUntil: row.snoozedUntil,
    status: effectiveStatus(row),
    priority: row.reminderPriority,
    reminderType: row.reminderType,
    source: row.source,
    assignedTo: row.assignedTo,
    createdBy: row.createdBy,
    linkedEntity: linkedEntity(row),
    queryId: row.queryId,
    customerId: row.customerId,
    quotationId: row.quotationId,
    bookingId: row.bookingId,
    bookingPaymentScheduleId: row.bookingPaymentScheduleId,
    bookingTravellerId: row.bookingTravellerId,
    bookingServiceId: row.bookingServiceId,
    vendorId: row.vendorId,
    vendorPayableId: row.vendorPayableId,
    reminderRule: row.reminderRule,
    completionOutcome: row.completionOutcome,
    completionNotes: row.completionNotes,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function visibility(auth: AuthContext): Promise<Prisma.QueryFollowUpWhereInput> {
  if (await permissionsService.userHasPermission(auth.userId, PERMISSIONS.REMINDERS_VIEW_ALL))
    return {};
  return {
    OR: [
      { assignedToId: auth.userId },
      { createdById: auth.userId },
      { query: { is: { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] } } },
      { customer: { is: { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] } } },
      {
        quotation: {
          is: {
            OR: [
              { createdById: auth.userId },
              { query: { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] } },
            ],
          },
        },
      },
      { booking: { is: { OR: [{ assignedToId: auth.userId }, { bookedById: auth.userId }] } } },
      { vendor: { is: { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] } } },
    ],
  };
}

async function baseWhere(auth: AuthContext, extra: Prisma.QueryFollowUpWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    ...(await visibility(auth)),
    ...extra,
  } satisfies Prisma.QueryFollowUpWhereInput;
}

async function get(auth: AuthContext, id: string) {
  const row = await prisma.queryFollowUp.findFirst({
    where: await baseWhere(auth, { id }),
    include,
  });
  if (!row) throw new NotFoundError('Reminder not found.');
  return row;
}

async function validateUser(companyId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId, deletedAt: null, status: 'ACTIVE' },
    select: person,
  });
  if (!user) throw new ValidationError('Select an active user from your company.');
  return user;
}

type LinkInput = {
  queryId?: string | null | undefined;
  customerId?: string | null | undefined;
  quotationId?: string | null | undefined;
  bookingId?: string | null | undefined;
  bookingPaymentScheduleId?: string | null | undefined;
  bookingTravellerId?: string | null | undefined;
  bookingServiceId?: string | null | undefined;
  vendorId?: string | null | undefined;
  vendorPayableId?: string | null | undefined;
};

async function validateLinks(companyId: string, input: LinkInput) {
  const checks: Array<Promise<unknown>> = [];
  const add = (model: keyof typeof prisma, id: string | null | undefined, label: string) => {
    if (!id) return;
    const delegate = prisma[model] as unknown as { findFirst(args: object): Promise<unknown> };
    checks.push(
      delegate
        .findFirst({ where: { id, companyId, deletedAt: null }, select: { id: true } })
        .then((row) => {
          if (!row) throw new ValidationError(`${label} does not exist in your company.`);
        }),
    );
  };
  add('query', input.queryId, 'Lead');
  add('customer', input.customerId, 'Customer');
  add('quotation', input.quotationId, 'Quotation');
  add('booking', input.bookingId, 'Booking');
  add('bookingPaymentSchedule', input.bookingPaymentScheduleId, 'Payment schedule');
  add('bookingTraveller', input.bookingTravellerId, 'Traveller');
  add('bookingService', input.bookingServiceId, 'Booking service');
  add('vendor', input.vendorId, 'Vendor');
  add('vendorPayable', input.vendorPayableId, 'Vendor payable');
  await Promise.all(checks);
}

function audit(
  auth: AuthContext,
  action:
    | 'REMINDER_CREATED'
    | 'REMINDER_UPDATED'
    | 'REMINDER_COMPLETED'
    | 'REMINDER_SNOOZED'
    | 'REMINDER_CANCELLED'
    | 'REMINDER_REASSIGNED'
    | 'REMINDER_DELETED',
  id: string,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'QueryFollowUp',
    entityId: id,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  };
}

async function notify(
  row: Prisma.QueryFollowUpGetPayload<{ include: typeof include }>,
  event: string,
) {
  await notificationsService.create({
    companyId: row.companyId,
    recipientUserId: row.assignedToId,
    reminderId: row.id,
    category: event === 'OVERDUE' ? 'REMINDER_OVERDUE' : 'REMINDER',
    severity:
      row.reminderPriority === 'URGENT'
        ? 'CRITICAL'
        : row.reminderPriority === 'HIGH'
          ? 'WARNING'
          : 'INFO',
    title: row.title,
    message: `${event === 'ASSIGNED' ? 'A reminder was assigned to you' : 'Reminder due'}: ${row.title}`,
    actionUrl: `/reminders/${row.id}`,
    entityType: 'QueryFollowUp',
    entityId: row.id,
    deduplicationKey: `reminder:${row.id}:${event}:${row.updatedAt.toISOString()}`,
    channels: ['IN_APP', 'EMAIL'],
  });
}

export const remindersService = {
  serialize,

  async list(auth: AuthContext, q: Record<string, unknown>) {
    const page = resolvePagination(q as { page?: number; pageSize?: number });
    const search = typeof q.search === 'string' ? q.search : undefined;
    const status = typeof q.status === 'string' ? q.status : undefined;
    const now = new Date();
    const statusWhere: Prisma.QueryFollowUpWhereInput =
      status === 'ACTIVE'
        ? { status: 'PENDING', scheduledAt: { gte: now } }
        : status === 'OVERDUE'
          ? { status: 'PENDING', scheduledAt: { lt: now } }
          : status
            ? { status: status === 'SNOOZED' ? 'SNOOZED' : (status as 'COMPLETED' | 'CANCELLED') }
            : {};
    const where = await baseWhere(auth, {
      ...statusWhere,
      ...(q.bookingOnly ? { bookingId: { not: null } } : {}),
      ...(typeof q.priority === 'string'
        ? { reminderPriority: q.priority as ReminderPriority }
        : {}),
      ...(typeof q.reminderType === 'string'
        ? { reminderType: q.reminderType as ReminderType }
        : {}),
      ...(typeof q.assignedToId === 'string' ? { assignedToId: q.assignedToId } : {}),
      ...(typeof q.source === 'string'
        ? { source: q.source as Prisma.EnumReminderSourceFilter }
        : {}),
      ...(q.dueFrom instanceof Date || q.dueTo instanceof Date
        ? {
            scheduledAt: {
              ...(q.dueFrom instanceof Date ? { gte: q.dueFrom } : {}),
              ...(q.dueTo instanceof Date ? { lte: q.dueTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              { query: { is: { customerName: { contains: search, mode: 'insensitive' } } } },
              { booking: { is: { bookingNumber: { contains: search, mode: 'insensitive' } } } },
              { customer: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    });
    const sortBy = typeof q.sortBy === 'string' ? q.sortBy : 'scheduledAt';
    const sortOrder = q.sortOrder === 'desc' ? 'desc' : 'asc';
    const [rows, total] = await prisma.$transaction([
      prisma.queryFollowUp.findMany({
        where,
        include,
        orderBy: { [sortBy]: sortOrder },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.queryFollowUp.count({ where }),
    ]);
    return {
      data: rows.map(serialize),
      pagination: { ...page, total, totalPages: total ? Math.ceil(total / page.pageSize) : 0 },
    };
  },

  async analytics(auth: AuthContext, bookingOnly = false) {
    const base = await baseWhere(auth, bookingOnly ? { bookingId: { not: null } } : {});
    const now = new Date();
    const [total, active, overdue, completed, snoozed, cancelled] = await prisma.$transaction([
      prisma.queryFollowUp.count({ where: base }),
      prisma.queryFollowUp.count({
        where: { ...base, status: 'PENDING', scheduledAt: { gte: now } },
      }),
      prisma.queryFollowUp.count({
        where: { ...base, status: 'PENDING', scheduledAt: { lt: now } },
      }),
      prisma.queryFollowUp.count({ where: { ...base, status: 'COMPLETED' } }),
      prisma.queryFollowUp.count({ where: { ...base, status: 'SNOOZED' } }),
      prisma.queryFollowUp.count({ where: { ...base, status: 'CANCELLED' } }),
    ]);
    return bookingOnly
      ? {
          total,
          pending: active + overdue + snoozed,
          sent: completed,
          completed,
          overdue,
          cancelled,
        }
      : { total, active, overdue, completed, snoozed, cancelled };
  },

  async details(auth: AuthContext, id: string) {
    return serialize(await get(auth, id));
  },

  async lookups(auth: AuthContext) {
    const owned = await visibility(auth);
    const [users, queries, customers, quotations, bookings, vendors] = await prisma.$transaction([
      prisma.user.findMany({
        where: { companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
        select: person,
        orderBy: { fullName: 'asc' },
      }),
      prisma.query.findMany({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          ...(owned.OR
            ? { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] }
            : {}),
        },
        select: { id: true, queryNumber: true, customerName: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.customer.findMany({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          ...(owned.OR
            ? { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] }
            : {}),
        },
        select: { id: true, customerNumber: true, displayName: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.quotation.findMany({
        where: { companyId: auth.companyId, deletedAt: null },
        select: { id: true, quotationNumber: true, customerName: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.booking.findMany({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          ...(owned.OR ? { OR: [{ assignedToId: auth.userId }, { bookedById: auth.userId }] } : {}),
        },
        select: { id: true, bookingNumber: true, customerName: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.vendor.findMany({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          ...(owned.OR
            ? { OR: [{ assignedToId: auth.userId }, { createdById: auth.userId }] }
            : {}),
        },
        select: { id: true, vendorCode: true, name: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { users, queries, customers, quotations, bookings, vendors };
  },

  async create(auth: AuthContext, input: ReminderInput, context: RequestContext) {
    await Promise.all([
      validateUser(auth.companyId, input.assignedToId),
      validateLinks(auth.companyId, input),
    ]);
    const id = crypto.randomUUID();
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.queryFollowUp.create({
        data: {
          id,
          companyId: auth.companyId,
          assignedToId: input.assignedToId,
          createdById: auth.userId,
          title: input.title,
          notes: input.description ?? null,
          scheduledAt: input.dueAt,
          originalDueAt: input.dueAt,
          reminderType: input.reminderType,
          reminderPriority: input.priority,
          source: 'MANUAL',
          queryId: input.queryId ?? null,
          customerId: input.customerId ?? null,
          quotationId: input.quotationId ?? null,
          bookingId: input.bookingId ?? null,
          bookingPaymentScheduleId: input.bookingPaymentScheduleId ?? null,
          bookingTravellerId: input.bookingTravellerId ?? null,
          bookingServiceId: input.bookingServiceId ?? null,
          vendorId: input.vendorId ?? null,
          vendorPayableId: input.vendorPayableId ?? null,
        },
        include,
      });
      await tx.activityLog.create({
        data: audit(auth, 'REMINDER_CREATED', id, context, {
          reminderType: input.reminderType,
          assignedToId: input.assignedToId,
        }),
      });
      return created;
    });
    await notify(row, 'ASSIGNED');
    return serialize(row);
  },

  async update(auth: AuthContext, id: string, input: ReminderUpdateInput, context: RequestContext) {
    const current = await get(auth, id);
    if (current.status === 'COMPLETED' || current.status === 'CANCELLED')
      throw new ValidationError('Closed reminders cannot be edited.');
    if (input.assignedToId) await validateUser(auth.companyId, input.assignedToId);
    await validateLinks(auth.companyId, input);
    const [row] = await prisma.$transaction([
      prisma.queryFollowUp.update({
        where: { id },
        data: Object.fromEntries(
          Object.entries({
            title: input.title,
            notes: input.description,
            scheduledAt: input.dueAt,
            reminderType: input.reminderType,
            reminderPriority: input.priority,
            assignedToId: input.assignedToId,
            queryId: input.queryId,
            customerId: input.customerId,
            quotationId: input.quotationId,
            bookingId: input.bookingId,
            bookingPaymentScheduleId: input.bookingPaymentScheduleId,
            bookingTravellerId: input.bookingTravellerId,
            bookingServiceId: input.bookingServiceId,
            vendorId: input.vendorId,
            vendorPayableId: input.vendorPayableId,
          }).filter(([, value]) => value !== undefined),
        ) as Prisma.QueryFollowUpUncheckedUpdateInput,
        include,
      }),
      prisma.activityLog.create({ data: audit(auth, 'REMINDER_UPDATED', id, context) }),
    ]);
    if (input.assignedToId && input.assignedToId !== current.assignedToId)
      await notify(row, 'ASSIGNED');
    return serialize(row);
  },

  async complete(
    auth: AuthContext,
    id: string,
    input: ReminderCompleteInput,
    context: RequestContext,
  ) {
    const current = await get(auth, id);
    if (current.status === 'COMPLETED') return serialize(current);
    if (current.status === 'CANCELLED')
      throw new ValidationError('Cancelled reminders cannot be completed.');
    const [row] = await prisma.$transaction([
      prisma.queryFollowUp.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: auth.userId,
          completionOutcome: input.outcome ?? null,
          completionNotes: input.notes ?? null,
        },
        include,
      }),
      prisma.activityLog.create({ data: audit(auth, 'REMINDER_COMPLETED', id, context) }),
    ]);
    return serialize(row);
  },

  async snooze(
    auth: AuthContext,
    id: string,
    until: Date,
    reason: string | null | undefined,
    context: RequestContext,
  ) {
    const current = await get(auth, id);
    if (current.status === 'COMPLETED' || current.status === 'CANCELLED')
      throw new ValidationError('Closed reminders cannot be snoozed.');
    if (until.getTime() <= Date.now())
      throw new ValidationError('Snooze time must be in the future.');
    const [row] = await prisma.$transaction([
      prisma.queryFollowUp.update({
        where: { id },
        data: {
          status: 'SNOOZED',
          originalDueAt: current.originalDueAt ?? current.scheduledAt,
          scheduledAt: until,
          snoozedUntil: until,
          outcome: reason ?? current.outcome,
        },
        include,
      }),
      prisma.activityLog.create({
        data: audit(auth, 'REMINDER_SNOOZED', id, context, { until: until.toISOString(), reason }),
      }),
    ]);
    return serialize(row);
  },

  async cancel(auth: AuthContext, id: string, reason: string, context: RequestContext) {
    const current = await get(auth, id);
    if (current.status === 'COMPLETED')
      throw new ValidationError('Completed reminders cannot be cancelled.');
    const [row] = await prisma.$transaction([
      prisma.queryFollowUp.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: auth.userId,
          cancellationReason: reason,
        },
        include,
      }),
      prisma.activityLog.create({
        data: audit(auth, 'REMINDER_CANCELLED', id, context, { reason }),
      }),
    ]);
    return serialize(row);
  },

  async assign(auth: AuthContext, id: string, assignedToId: string, context: RequestContext) {
    if (!(await permissionsService.userHasPermission(auth.userId, PERMISSIONS.REMINDERS_REASSIGN)))
      throw new ForbiddenError();
    await Promise.all([get(auth, id), validateUser(auth.companyId, assignedToId)]);
    const [row] = await prisma.$transaction([
      prisma.queryFollowUp.update({ where: { id }, data: { assignedToId }, include }),
      prisma.activityLog.create({
        data: audit(auth, 'REMINDER_REASSIGNED', id, context, { assignedToId }),
      }),
    ]);
    await notify(row, 'ASSIGNED');
    return serialize(row);
  },

  async delete(auth: AuthContext, id: string, context: RequestContext) {
    const current = await get(auth, id);
    if (current.source !== 'MANUAL')
      throw new ValidationError('Automated reminders must be cancelled instead of deleted.');
    await prisma.$transaction([
      prisma.queryFollowUp.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.activityLog.create({ data: audit(auth, 'REMINDER_DELETED', id, context) }),
    ]);
    return { id };
  },
};
