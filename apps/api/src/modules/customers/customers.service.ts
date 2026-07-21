import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  PERMISSIONS,
  type CustomerCommunicationInput,
  type CustomerCommunicationUpdateInput,
  type CustomerAddressInput,
  type CustomerDocumentUpload,
  type CustomerDuplicateCheck,
  type CustomerInput,
  type CustomerMergeInput,
  type CustomerNoteInput,
  type CustomerTagInput,
  type CustomerUpdateInput,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import {
  customerObjectKey,
  sanitizeFileName,
  storageService,
} from '../../services/storage/storage.service.js';
import {
  normalizeCustomerName,
  normalizeCustomerPhone,
  normalizeEmail,
} from '../../utils/normalize.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };
const userSelect = { id: true, fullName: true, username: true } as const;
const customerInclude = {
  assignedTo: { select: userSelect },
  createdBy: { select: userSelect },
  addresses: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
  tagAssignments: {
    where: { tag: { deletedAt: null } },
    include: { tag: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CustomerInclude;

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogCreateInput['action'],
  entityId: string,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'Customer',
    entityId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}

async function has(auth: AuthContext, permission: string) {
  return permissionsService.userHasPermission(auth.userId, permission);
}

async function customerVisibility(auth: AuthContext): Promise<Prisma.CustomerWhereInput> {
  if (await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL)) return {};
  return {
    OR: [
      { createdById: auth.userId },
      { assignedToId: auth.userId },
      {
        queries: {
          some: {
            companyId: auth.companyId,
            deletedAt: null,
            OR: [{ createdById: auth.userId }, { assignedToId: auth.userId }],
          },
        },
      },
      {
        bookings: {
          some: {
            companyId: auth.companyId,
            deletedAt: null,
            OR: [{ bookedById: auth.userId }, { assignedToId: auth.userId }],
          },
        },
      },
    ],
  };
}

async function visibleWhere(auth: AuthContext, extra: Prisma.CustomerWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    AND: [await customerVisibility(auth), extra],
  } satisfies Prisma.CustomerWhereInput;
}

export async function getVisibleCustomer(auth: AuthContext, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: await visibleWhere(auth, { id: customerId }),
    include: customerInclude,
  });
  if (!customer) throw new NotFoundError('Customer not found.');
  return customer;
}

export async function hasExactCustomerMatch(
  auth: AuthContext,
  input: Pick<CustomerDuplicateCheck, 'phone' | 'email' | 'excludeCustomerId'>,
) {
  const phone = normalizeCustomerPhone(input.phone, env.DEFAULT_PHONE_COUNTRY);
  const email = input.email ? normalizeEmail(input.email) : null;
  if (!phone && !email) return false;
  return Boolean(
    await prisma.customer.findFirst({
      where: {
        companyId: auth.companyId,
        deletedAt: null,
        status: { not: 'MERGED' },
        ...(input.excludeCustomerId ? { id: { not: input.excludeCustomerId } } : {}),
        OR: [
          ...(phone ? [{ normalizedPhone: phone }] : []),
          ...(email ? [{ normalizedEmail: email }] : []),
        ],
      },
      select: { id: true },
    }),
  );
}

async function assertAssignable(auth: AuthContext, userId: string | null | undefined) {
  if (!userId) return;
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new ValidationError('The assignee must be an active user in this company.');
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function scalarData(input: CustomerInput | CustomerUpdateInput) {
  const data = compact({
    type: input.type,
    status: input.status,
    lifecycleStage: input.lifecycleStage,
    isVip: input.lifecycleStage === undefined ? undefined : input.lifecycleStage === 'VIP',
    displayName: input.displayName,
    normalizedName: input.displayName ? normalizeCustomerName(input.displayName) : undefined,
    primaryPhone: input.primaryPhone === '' ? null : input.primaryPhone,
    normalizedPhone:
      input.primaryPhone === undefined
        ? undefined
        : normalizeCustomerPhone(input.primaryPhone, env.DEFAULT_PHONE_COUNTRY),
    alternatePhone: input.alternatePhone === '' ? null : input.alternatePhone,
    email: input.email === '' ? null : input.email,
    normalizedEmail:
      input.email === undefined ? undefined : input.email ? normalizeEmail(input.email) : null,
    dateOfBirth: input.dateOfBirth,
    anniversaryDate: input.anniversaryDate,
    companyName: input.companyName === '' ? null : input.companyName,
    taxIdentification: input.taxIdentification === '' ? null : input.taxIdentification,
    preferredContactMethod: input.preferredContactMethod,
    preferredCurrency: input.preferredCurrency,
    preferredLanguage: input.preferredLanguage === '' ? null : input.preferredLanguage,
    travelPreferences: input.travelPreferences === '' ? null : input.travelPreferences,
    dietaryRequirements: input.dietaryRequirements === '' ? null : input.dietaryRequirements,
    specialRequirements: input.specialRequirements === '' ? null : input.specialRequirements,
    source: input.source === '' ? null : input.source,
    assignedToId: input.assignedToId,
  });
  return data;
}

function nameSimilarity(left: string, right: string) {
  const a = normalizeCustomerName(left);
  const b = normalizeCustomerName(right);
  if (a === b) return 1;
  if (!a || !b) return 0;
  const pairs = (value: string) => {
    const result: string[] = [];
    for (let i = 0; i < value.length - 1; i += 1) result.push(value.slice(i, i + 2));
    return result;
  };
  const first = pairs(a);
  const second = pairs(b);
  let overlap = 0;
  const remaining = [...second];
  for (const pair of first) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  }
  return first.length + second.length ? (2 * overlap) / (first.length + second.length) : 0;
}

export async function findDuplicates(auth: AuthContext, input: CustomerDuplicateCheck) {
  const phone = normalizeCustomerPhone(input.phone, env.DEFAULT_PHONE_COUNTRY);
  const email = input.email ? normalizeEmail(input.email) : null;
  if (!phone && !email && !input.displayName) return [];
  const candidates = await prisma.customer.findMany({
    where: await visibleWhere(auth, {
      status: { not: 'MERGED' },
      ...(input.excludeCustomerId ? { id: { not: input.excludeCustomerId } } : {}),
      OR: [
        ...(phone ? [{ normalizedPhone: phone }] : []),
        ...(email ? [{ normalizedEmail: email }] : []),
        ...(input.displayName
          ? [
              {
                normalizedName: {
                  contains: normalizeCustomerName(input.displayName).split(' ')[0] ?? '',
                },
              },
            ]
          : []),
      ],
    }),
    select: {
      id: true,
      customerNumber: true,
      displayName: true,
      primaryPhone: true,
      normalizedPhone: true,
      email: true,
      normalizedEmail: true,
      status: true,
      lifecycleStage: true,
    },
    take: 50,
  });
  return candidates
    .map((customer) => {
      const reasons: string[] = [];
      if (phone && customer.normalizedPhone === phone) reasons.push('PHONE_EXACT');
      if (email && customer.normalizedEmail === email) reasons.push('EMAIL_EXACT');
      const similarity = input.displayName
        ? nameSimilarity(input.displayName, customer.displayName)
        : 0;
      if (similarity >= env.CUSTOMER_DUPLICATE_NAME_THRESHOLD) reasons.push('NAME_SIMILAR');
      return {
        id: customer.id,
        customerNumber: customer.customerNumber,
        displayName: customer.displayName,
        primaryPhone: customer.primaryPhone,
        email: customer.email,
        status: customer.status,
        lifecycleStage: customer.lifecycleStage,
        reasons,
        score: Math.max(
          reasons.includes('PHONE_EXACT') ? 1 : 0,
          reasons.includes('EMAIL_EXACT') ? 1 : 0,
          similarity,
        ),
        strongMatch: reasons.includes('PHONE_EXACT') || reasons.includes('EMAIL_EXACT'),
      };
    })
    .filter((value) => value.reasons.length > 0)
    .sort((a, b) => b.score - a.score);
}

async function nextCustomerNumber(tx: Prisma.TransactionClient, companyId: string) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.customerCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create: { companyId, year, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return `CUS-${year}-${String(counter.value).padStart(6, '0')}`;
}

function present(
  customer: Awaited<ReturnType<typeof getVisibleCustomer>>,
  canViewFinancials: boolean,
) {
  const {
    companyId,
    normalizedName,
    normalizedPhone,
    normalizedEmail,
    deletedAt,
    totalBookedValue,
    totalPaid,
    totalOutstanding,
    lifetimeGrossProfit,
    tagAssignments,
    ...safe
  } = customer;
  void companyId;
  void normalizedName;
  void normalizedPhone;
  void normalizedEmail;
  void deletedAt;
  return {
    ...safe,
    tags: tagAssignments.map((row) => row.tag),
    ...(canViewFinancials
      ? {
          totalBookedValue: totalBookedValue.toFixed(2),
          totalPaid: totalPaid.toFixed(2),
          totalOutstanding: totalOutstanding.toFixed(2),
          lifetimeGrossProfit: lifetimeGrossProfit.toFixed(2),
        }
      : {}),
  };
}

export async function recalculateCustomerMetrics(
  tx: Prisma.TransactionClient,
  companyId: string,
  customerId: string,
) {
  const [queries, quotationCount, bookings, lastCommunication, nextCommunication] =
    await Promise.all([
      tx.query.findMany({
        where: { companyId, customerId, deletedAt: null },
        select: { createdAt: true, nextFollowUpAt: true, leadStage: true },
        orderBy: { createdAt: 'desc' },
      }),
      tx.quotation.count({ where: { companyId, customerId, deletedAt: null } }),
      tx.booking.findMany({
        where: {
          companyId,
          customerId,
          deletedAt: null,
          bookingStatus: { notIn: ['ARCHIVED', 'CANCELLED'] },
        },
        select: {
          bookingStatus: true,
          totalSellingAmount: true,
          totalCustomerPaid: true,
          totalCustomerOutstanding: true,
          grossProfit: true,
          createdAt: true,
        },
      }),
      tx.customerCommunication.findFirst({
        where: { companyId, customerId, deletedAt: null },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
      tx.customerCommunication.findFirst({
        where: { companyId, customerId, deletedAt: null, nextActionAt: { gte: new Date() } },
        orderBy: { nextActionAt: 'asc' },
        select: { nextActionAt: true },
      }),
    ]);
  const total = (
    key: 'totalSellingAmount' | 'totalCustomerPaid' | 'totalCustomerOutstanding' | 'grossProfit',
  ) => bookings.reduce((sum, booking) => sum.add(booking[key]), new Prisma.Decimal(0));
  const completedBookingCount = bookings.filter(
    (booking) => booking.bookingStatus === 'COMPLETED',
  ).length;
  const confirmedBookingCount = bookings.filter((booking) =>
    ['CONFIRMED', 'PARTIALLY_CONFIRMED', 'TRAVEL_IN_PROGRESS', 'COMPLETED'].includes(
      booking.bookingStatus,
    ),
  ).length;
  const current = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { isVip: true, status: true },
  });
  const isRepeatCustomer = confirmedBookingCount >= 2;
  const lifecycleStage =
    current.status === 'INACTIVE'
      ? 'INACTIVE'
      : current.isVip
        ? 'VIP'
        : isRepeatCustomer
          ? 'REPEAT_CUSTOMER'
          : confirmedBookingCount > 0
            ? 'ACTIVE_CUSTOMER'
            : quotationCount > 0
              ? 'QUOTED'
              : queries.some((query) =>
                    [
                      'QUALIFIED',
                      'QUOTATION_REQUIRED',
                      'QUOTATION_SENT',
                      'IN_NEGOTIATION',
                      'READY_TO_BOOK',
                    ].includes(query.leadStage),
                  )
                ? 'QUALIFIED'
                : queries.length > 0
                  ? 'PROSPECT'
                  : 'NEW';
  const queryNextFollowUp = queries
    .flatMap((query) => (query.nextFollowUpAt ? [query.nextFollowUpAt] : []))
    .filter((date) => date >= new Date())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  await tx.customer.update({
    where: { id: customerId },
    data: {
      queryCount: queries.length,
      quotationCount,
      bookingCount: bookings.length,
      completedBookingCount,
      totalBookedValue: total('totalSellingAmount'),
      totalPaid: total('totalCustomerPaid'),
      totalOutstanding: total('totalCustomerOutstanding'),
      lifetimeGrossProfit: total('grossProfit'),
      isRepeatCustomer,
      lifecycleStage,
      lastEnquiryAt: queries[0]?.createdAt ?? null,
      lastContactedAt: lastCommunication?.occurredAt ?? null,
      lastBookingAt:
        bookings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ??
        null,
      lastInteractionAt: lastCommunication?.occurredAt ?? null,
      nextFollowUpAt: nextCommunication?.nextActionAt ?? queryNextFollowUp ?? null,
    },
  });
}

export const customersService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canViewFinancials = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
    if (
      (query.minBookedValue ||
        query.maxBookedValue ||
        query.totalBookingValueMin ||
        query.totalBookingValueMax ||
        query.hasOutstandingBalance !== undefined) &&
      !canViewFinancials
    )
      throw new ForbiddenError('Financial customer filters require financial access.');
    const search = typeof query.search === 'string' ? query.search : undefined;
    const tagIds = Array.isArray(query.tagIds)
      ? query.tagIds.map(String)
      : query.tagIds
        ? String(query.tagIds).split(',')
        : query.tagId
          ? [String(query.tagId)]
          : [];
    const where = await visibleWhere(auth, {
      status: query.status ? (query.status as Prisma.EnumCustomerStatusFilter) : { not: 'MERGED' },
      ...(query.customerType ? { type: String(query.customerType) as 'INDIVIDUAL' } : {}),
      ...(query.lifecycleStage
        ? { lifecycleStage: query.lifecycleStage as Prisma.EnumCustomerLifecycleStageFilter }
        : {}),
      ...(query.assignedToId ? { assignedToId: String(query.assignedToId) } : {}),
      ...(query.createdById ? { createdById: String(query.createdById) } : {}),
      ...(tagIds.length ? { tagAssignments: { some: { tagId: { in: tagIds } } } } : {}),
      ...(query.isRepeatCustomer !== undefined
        ? { isRepeatCustomer: Boolean(query.isRepeatCustomer) }
        : {}),
      ...(query.isVip !== undefined ? { isVip: Boolean(query.isVip) } : {}),
      ...(canViewFinancials && query.hasOutstandingBalance !== undefined
        ? { totalOutstanding: query.hasOutstandingBalance ? { gt: 0 } : { equals: 0 } }
        : {}),
      ...(query.lastBookingFrom || query.lastBookingTo
        ? {
            lastBookingAt: {
              ...(query.lastBookingFrom ? { gte: new Date(String(query.lastBookingFrom)) } : {}),
              ...(query.lastBookingTo ? { lte: new Date(String(query.lastBookingTo)) } : {}),
            },
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(String(query.createdFrom)) } : {}),
              ...(query.createdTo ? { lte: new Date(String(query.createdTo)) } : {}),
            },
          }
        : {}),
      ...(canViewFinancials &&
      (query.minBookedValue ||
        query.maxBookedValue ||
        query.totalBookingValueMin ||
        query.totalBookingValueMax)
        ? {
            totalBookedValue: {
              ...(query.minBookedValue || query.totalBookingValueMin
                ? { gte: String(query.minBookedValue ?? query.totalBookingValueMin) }
                : {}),
              ...(query.maxBookedValue || query.totalBookingValueMax
                ? { lte: String(query.maxBookedValue ?? query.totalBookingValueMax) }
                : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { customerNumber: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
              { primaryPhone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { bookings: { some: { bookingNumber: { contains: search, mode: 'insensitive' } } } },
              {
                bookings: {
                  some: { destinationSummary: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    });
    const sortBy = [
      'displayName',
      'customerNumber',
      'createdAt',
      'updatedAt',
      'lastContactedAt',
      'lastEnquiryAt',
      'lastBookingAt',
      'queryCount',
      'quotationCount',
      'bookingCount',
      'totalBookedValue',
      'totalOutstanding',
    ].includes(String(query.sortBy))
      ? String(query.sortBy)
      : 'updatedAt';
    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: customerInclude,
        orderBy: { [sortBy]: query.sortOrder === 'asc' ? 'asc' : 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.customer.count({ where }),
    ]);
    return {
      data: rows.map((row) => present(row, canViewFinancials)),
      pagination: { ...page, total, totalPages: total ? Math.ceil(total / page.pageSize) : 0 },
    };
  },

  async analytics(auth: AuthContext) {
    const where = await visibleWhere(auth, { status: { not: 'MERGED' } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const staleBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const canViewFinancials = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
    const [
      total,
      active,
      newThisMonth,
      prospects,
      repeat,
      vip,
      openLeads,
      acceptedQuotations,
      upcomingBookings,
      inactive,
      notContactedIn30Days,
      withoutTags,
      duplicatePhones,
      duplicateEmails,
      financial,
    ] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.customer.count({ where: { ...where, createdAt: { gte: monthStart } } }),
      prisma.customer.count({ where: { ...where, lifecycleStage: 'PROSPECT' } }),
      prisma.customer.count({ where: { ...where, isRepeatCustomer: true } }),
      prisma.customer.count({ where: { ...where, isVip: true } }),
      prisma.customer.count({
        where: {
          ...where,
          queries: {
            some: { deletedAt: null, leadStage: { notIn: ['LOST', 'CANCELLED', 'INVALID'] } },
          },
        },
      }),
      prisma.customer.count({
        where: { ...where, quotations: { some: { deletedAt: null, status: 'ACCEPTED' } } },
      }),
      prisma.customer.count({
        where: {
          ...where,
          bookings: {
            some: {
              deletedAt: null,
              travelStartDate: { gte: now },
              bookingStatus: { notIn: ['CANCELLED', 'ARCHIVED'] },
            },
          },
        },
      }),
      prisma.customer.count({ where: { ...where, status: 'INACTIVE' } }),
      prisma.customer.count({
        where: {
          ...where,
          OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: staleBefore } }],
        },
      }),
      prisma.customer.count({ where: { ...where, tagAssignments: { none: {} } } }),
      prisma.customer.groupBy({
        by: ['normalizedPhone'],
        where: { ...where, normalizedPhone: { not: null } },
        _count: { _all: true },
        having: { normalizedPhone: { _count: { gt: 1 } } },
      }),
      prisma.customer.groupBy({
        by: ['normalizedEmail'],
        where: { ...where, normalizedEmail: { not: null } },
        _count: { _all: true },
        having: { normalizedEmail: { _count: { gt: 1 } } },
      }),
      canViewFinancials
        ? prisma.customer.aggregate({
            where,
            _sum: {
              totalOutstanding: true,
              totalBookedValue: true,
              totalPaid: true,
              bookingCount: true,
            },
          })
        : null,
    ]);
    return {
      total,
      active,
      newThisMonth,
      prospects,
      repeat,
      vip,
      openLeads,
      acceptedQuotations,
      upcomingBookings,
      inactive,
      notContactedIn30Days,
      withoutTags,
      possibleDuplicateGroups: duplicatePhones.length + duplicateEmails.length,
      ...(financial
        ? {
            customersWithOutstanding: await prisma.customer.count({
              where: { ...where, totalOutstanding: { gt: 0 } },
            }),
            totalOutstanding: financial._sum.totalOutstanding?.toFixed(2) ?? '0.00',
            totalBookedValue: financial._sum.totalBookedValue?.toFixed(2) ?? '0.00',
            totalPaid: financial._sum.totalPaid?.toFixed(2) ?? '0.00',
            averageBookingValue:
              financial._sum.bookingCount && financial._sum.totalBookedValue
                ? financial._sum.totalBookedValue
                    .div(financial._sum.bookingCount)
                    .toDecimalPlaces(2)
                    .toFixed(2)
                : '0.00',
          }
        : {}),
      repeatPercentage: total ? Number(((repeat / total) * 100).toFixed(2)) : 0,
    };
  },

  async lookups(auth: AuthContext) {
    const [tags, users] = await Promise.all([
      prisma.customerTag.findMany({
        where: { companyId: auth.companyId },
        orderBy: { name: 'asc' },
      }),
      prisma.user.findMany({
        where: { companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
        select: userSelect,
        orderBy: { fullName: 'asc' },
      }),
    ]);
    return { tags, users };
  },

  async export(auth: AuthContext) {
    const financials = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
    const rows = await prisma.customer.findMany({
      where: await visibleWhere(auth, { status: { not: 'MERGED' } }),
      include: {
        assignedTo: { select: { fullName: true } },
        tagAssignments: { include: { tag: { select: { name: true } } } },
      },
      orderBy: { customerNumber: 'asc' },
    });
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const headers = [
      'Customer Number',
      'Name',
      'Type',
      'Status',
      'Lifecycle',
      'Phone',
      'Email',
      'Assigned To',
      'Tags',
      'Leads',
      'Quotations',
      'Bookings',
      ...(financials ? ['Booked Value', 'Paid', 'Outstanding'] : []),
    ];
    const lines = rows.map((row) =>
      [
        row.customerNumber,
        row.displayName,
        row.type,
        row.status,
        row.lifecycleStage,
        row.primaryPhone,
        row.email,
        row.assignedTo?.fullName,
        row.tagAssignments.map((item) => item.tag.name).join('; '),
        row.queryCount,
        row.quotationCount,
        row.bookingCount,
        ...(financials
          ? [
              row.totalBookedValue.toFixed(2),
              row.totalPaid.toFixed(2),
              row.totalOutstanding.toFixed(2),
            ]
          : []),
      ]
        .map(quote)
        .join(','),
    );
    return {
      fileName: `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      mimeType: 'text/csv',
      content: [headers.map(quote).join(','), ...lines].join('\n'),
    };
  },

  duplicates: findDuplicates,

  async create(auth: AuthContext, input: CustomerInput, context: RequestContext) {
    await assertAssignable(auth, input.assignedToId);
    const exactMatchExists = await hasExactCustomerMatch(auth, {
      ...(input.primaryPhone ? { phone: input.primaryPhone } : {}),
      ...(input.email ? { email: input.email } : {}),
    });
    const duplicates = await findDuplicates(auth, {
      displayName: input.displayName,
      ...(input.primaryPhone ? { phone: input.primaryPhone } : {}),
      ...(input.email ? { email: input.email } : {}),
    });
    if ((exactMatchExists || duplicates.some((value) => value.strongMatch)) && !input.createAnyway)
      throw new ConflictError(
        'A customer with this phone or email already exists. Review duplicate matches or choose create anyway.',
      );
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          ...(scalarData(input) as Prisma.CustomerUncheckedCreateInput),
          companyId: auth.companyId,
          customerNumber: await nextCustomerNumber(tx, auth.companyId),
          createdById: auth.userId,
          addresses: {
            create: input.addresses.map(
              (address) =>
                compact({
                  ...address,
                  companyId: auth.companyId,
                }) as Prisma.CustomerAddressUncheckedCreateWithoutCustomerInput,
            ),
          },
          tagAssignments: {
            create: input.tagIds.map((tagId) => ({
              companyId: auth.companyId,
              tagId,
              assignedById: auth.userId,
            })),
          },
        },
        include: customerInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_CREATED', created.id, context, {
          customerNumber: created.customerNumber,
        }),
      });
      return created;
    });
    return present(customer, await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS));
  },

  async details(auth: AuthContext, customerId: string) {
    const customer = await getVisibleCustomer(auth, customerId);
    const canViewFinancials = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
    const canViewDocuments = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS);
    const [
      latestLead,
      latestQuotation,
      latestBooking,
      upcomingTravel,
      recentNotes,
      recentCommunications,
      duplicateWarnings,
    ] = await Promise.all([
      prisma.query.findFirst({
        where: { companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true, queryNumber: true, leadStage: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.quotation.findFirst({
        where: { companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true, quotationNumber: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.findFirst({
        where: { companyId: auth.companyId, customerId, deletedAt: null },
        select: {
          id: true,
          bookingNumber: true,
          bookingStatus: true,
          travelStartDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.findFirst({
        where: {
          companyId: auth.companyId,
          customerId,
          deletedAt: null,
          travelStartDate: { gte: new Date() },
          bookingStatus: { notIn: ['CANCELLED', 'ARCHIVED'] },
        },
        select: { id: true, bookingNumber: true, destinationSummary: true, travelStartDate: true },
        orderBy: { travelStartDate: 'asc' },
      }),
      prisma.customerNote.findMany({
        where: {
          companyId: auth.companyId,
          customerId,
          deletedAt: null,
          ...(canViewFinancials ? {} : { type: { not: 'FINANCIAL' as const } }),
        },
        select: { id: true, type: true, content: true, isPinned: true, createdAt: true },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      prisma.customerCommunication.findMany({
        where: { companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true, type: true, direction: true, summary: true, occurredAt: true },
        orderBy: { occurredAt: 'desc' },
        take: 5,
      }),
      findDuplicates(auth, {
        displayName: customer.displayName,
        ...(customer.primaryPhone ? { phone: customer.primaryPhone } : {}),
        ...(customer.email ? { email: customer.email } : {}),
        excludeCustomerId: customer.id,
      }),
    ]);
    return {
      ...present(customer, canViewFinancials),
      relationshipSummary: {
        leads: customer.queryCount,
        quotations: customer.quotationCount,
        bookings: customer.bookingCount,
        completedBookings: customer.completedBookingCount,
      },
      latestLead,
      latestQuotation,
      latestBooking,
      upcomingTravel,
      recentNotes,
      recentCommunications,
      duplicateWarnings,
      permissions: { canViewFinancials, canViewDocuments },
    };
  },

  async update(
    auth: AuthContext,
    customerId: string,
    input: CustomerUpdateInput,
    context: RequestContext,
  ) {
    const current = await getVisibleCustomer(auth, customerId);
    if (current.status === 'MERGED') throw new ConflictError('Merged customers cannot be edited.');
    await assertAssignable(auth, input.assignedToId);
    if (input.primaryPhone || input.email) {
      const exactMatchExists = await hasExactCustomerMatch(auth, {
        ...(input.primaryPhone ? { phone: input.primaryPhone } : {}),
        ...(input.email ? { email: input.email } : {}),
        excludeCustomerId: customerId,
      });
      const duplicates = await findDuplicates(auth, {
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.primaryPhone ? { phone: input.primaryPhone } : {}),
        ...(input.email ? { email: input.email } : {}),
        excludeCustomerId: customerId,
      });
      if (exactMatchExists || duplicates.some((value) => value.strongMatch))
        throw new ConflictError('This change would duplicate another customer phone or email.');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.customer.update({
        where: { id: customerId },
        data: scalarData(input),
        include: customerInclude,
      });
      await tx.activityLog.create({ data: audit(auth, 'CUSTOMER_UPDATED', customerId, context) });
      return row;
    });
    return present(updated, await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS));
  },

  async archive(auth: AuthContext, customerId: string, context: RequestContext) {
    const customer = await getVisibleCustomer(auth, customerId);
    if (customer.bookingCount > 0)
      throw new ConflictError(
        'Customers with booking history cannot be archived; mark them inactive instead.',
      );
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customerId },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
      }),
      prisma.activityLog.create({ data: audit(auth, 'CUSTOMER_ARCHIVED', customerId, context) }),
    ]);
    return { id: customerId, archived: true };
  },

  async status(
    auth: AuthContext,
    customerId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'ARCHIVED',
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    if (status === 'ARCHIVED') return this.archive(auth, customerId, context);
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data: { status } });
      await recalculateCustomerMetrics(tx, auth.companyId, customerId);
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_STATUS_CHANGED', customerId, context, { status }),
      });
    });
    return this.details(auth, customerId);
  },

  async assignment(
    auth: AuthContext,
    customerId: string,
    assignedToId: string | null,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    await assertAssignable(auth, assignedToId);
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customerId }, data: { assignedToId } }),
      prisma.activityLog.create({
        data: audit(auth, 'CUSTOMER_ASSIGNED', customerId, context, { assignedToId }),
      }),
    ]);
    return this.details(auth, customerId);
  },

  async addresses(auth: AuthContext, customerId: string) {
    await getVisibleCustomer(auth, customerId);
    return prisma.customerAddress.findMany({
      where: { companyId: auth.companyId, customerId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  },

  async createAddress(auth: AuthContext, customerId: string, input: CustomerAddressInput) {
    await getVisibleCustomer(auth, customerId);
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.customerAddress.updateMany({
          where: { companyId: auth.companyId, customerId, deletedAt: null },
          data: { isPrimary: false },
        });
      return tx.customerAddress.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          customerId,
        }) as Prisma.CustomerAddressUncheckedCreateInput,
      });
    });
  },

  async updateAddress(
    auth: AuthContext,
    customerId: string,
    addressId: string,
    input: Partial<CustomerAddressInput>,
  ) {
    await getVisibleCustomer(auth, customerId);
    const row = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerId, companyId: auth.companyId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Customer address not found.');
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary === true)
        await tx.customerAddress.updateMany({
          where: { companyId: auth.companyId, customerId, deletedAt: null, id: { not: addressId } },
          data: { isPrimary: false },
        });
      return tx.customerAddress.update({
        where: { id: addressId },
        data: compact(input) as Prisma.CustomerAddressUncheckedUpdateInput,
      });
    });
  },

  async deleteAddress(auth: AuthContext, customerId: string, addressId: string) {
    await getVisibleCustomer(auth, customerId);
    const result = await prisma.customerAddress.updateMany({
      where: { id: addressId, customerId, companyId: auth.companyId, deletedAt: null },
      data: { deletedAt: new Date(), isPrimary: false },
    });
    if (!result.count) throw new NotFoundError('Customer address not found.');
    return { id: addressId, deleted: true };
  },

  async tags(auth: AuthContext) {
    return prisma.customerTag.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      include: { _count: { select: { assignments: true } } },
      orderBy: { name: 'asc' },
    });
  },
  async createTag(auth: AuthContext, input: CustomerTagInput) {
    const normalizedName = normalizeCustomerName(input.name);
    const duplicate = await prisma.customerTag.findFirst({
      where: { companyId: auth.companyId, normalizedName, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new ConflictError('A customer tag with this name already exists.');
    return prisma.customerTag.create({
      data: compact({
        ...input,
        normalizedName,
        createdById: auth.userId,
        companyId: auth.companyId,
      }) as Prisma.CustomerTagUncheckedCreateInput,
    });
  },
  async updateTag(auth: AuthContext, tagId: string, input: Partial<CustomerTagInput>) {
    const normalizedName = input.name ? normalizeCustomerName(input.name) : undefined;
    if (normalizedName) {
      const duplicate = await prisma.customerTag.findFirst({
        where: { companyId: auth.companyId, normalizedName, deletedAt: null, id: { not: tagId } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictError('A customer tag with this name already exists.');
    }
    const result = await prisma.customerTag.updateMany({
      where: { id: tagId, companyId: auth.companyId, deletedAt: null },
      data: compact({ ...input, normalizedName }) as Prisma.CustomerTagUncheckedUpdateManyInput,
    });
    if (!result.count) throw new NotFoundError('Customer tag not found.');
    return prisma.customerTag.findUniqueOrThrow({ where: { id: tagId } });
  },
  async deleteTag(auth: AuthContext, tagId: string) {
    const result = await prisma.customerTag.updateMany({
      where: { id: tagId, companyId: auth.companyId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) throw new NotFoundError('Customer tag not found.');
    return { id: tagId, deleted: true };
  },
  async attachTag(auth: AuthContext, customerId: string, tagId: string, context: RequestContext) {
    await getVisibleCustomer(auth, customerId);
    const tag = await prisma.customerTag.findFirst({
      where: { id: tagId, companyId: auth.companyId, deletedAt: null },
    });
    if (!tag) throw new NotFoundError('Customer tag not found.');
    await prisma.$transaction([
      prisma.customerTagAssignment.upsert({
        where: { customerId_tagId: { customerId, tagId } },
        create: { companyId: auth.companyId, customerId, tagId, assignedById: auth.userId },
        update: {},
      }),
      prisma.activityLog.create({
        data: audit(auth, 'CUSTOMER_TAG_ADDED', customerId, context, { tagId }),
      }),
    ]);
    return { customerId, tagId, attached: true };
  },
  async detachTag(auth: AuthContext, customerId: string, tagId: string, context: RequestContext) {
    await getVisibleCustomer(auth, customerId);
    await prisma.$transaction([
      prisma.customerTagAssignment.deleteMany({
        where: { companyId: auth.companyId, customerId, tagId },
      }),
      prisma.activityLog.create({
        data: audit(auth, 'CUSTOMER_TAG_REMOVED', customerId, context, { tagId }),
      }),
    ]);
    return { customerId, tagId, attached: false };
  },

  async notes(auth: AuthContext, customerId: string) {
    await getVisibleCustomer(auth, customerId);
    const financials = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
    return prisma.customerNote.findMany({
      where: {
        companyId: auth.companyId,
        customerId,
        deletedAt: null,
        ...(financials ? {} : { type: { not: 'FINANCIAL' as const } }),
      },
      include: { authorUser: { select: userSelect } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  },
  async createNote(
    auth: AuthContext,
    customerId: string,
    input: CustomerNoteInput,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    if (input.type === 'FINANCIAL' && !(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS)))
      throw new ForbiddenError('Financial customer notes require financial access.');
    return prisma.$transaction(async (tx) => {
      const note = await tx.customerNote.create({
        data: { ...input, companyId: auth.companyId, customerId, authorUserId: auth.userId },
        include: { authorUser: { select: userSelect } },
      });
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_NOTE_CREATED', customerId, context, {
          noteId: note.id,
          type: note.type,
        }),
      });
      return note;
    });
  },
  async updateNote(
    auth: AuthContext,
    customerId: string,
    noteId: string,
    input: Partial<CustomerNoteInput>,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    const note = await prisma.customerNote.findFirst({
      where: { id: noteId, companyId: auth.companyId, customerId, deletedAt: null },
    });
    if (!note) throw new NotFoundError('Customer note not found.');
    if (note.authorUserId !== auth.userId && !(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL)))
      throw new ForbiddenError('You can edit only your own customer notes.');
    if (input.type === 'FINANCIAL' && !(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS)))
      throw new ForbiddenError('Financial customer notes require financial access.');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.customerNote.update({
        where: { id: noteId },
        data: input,
        include: { authorUser: { select: userSelect } },
      });
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_NOTE_UPDATED', customerId, context, { noteId }),
      });
      return updated;
    });
  },
  async deleteNote(auth: AuthContext, customerId: string, noteId: string, context: RequestContext) {
    await getVisibleCustomer(auth, customerId);
    const note = await prisma.customerNote.findFirst({
      where: { id: noteId, companyId: auth.companyId, customerId, deletedAt: null },
      select: { authorUserId: true },
    });
    if (!note) throw new NotFoundError('Customer note not found.');
    if (note.authorUserId !== auth.userId && !(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL)))
      throw new ForbiddenError('You can delete only your own customer notes.');
    const result = await prisma.customerNote.updateMany({
      where: { id: noteId, companyId: auth.companyId, customerId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) throw new NotFoundError('Customer note not found.');
    await prisma.activityLog.create({
      data: audit(auth, 'CUSTOMER_NOTE_DELETED', customerId, context, { noteId }),
    });
    return { id: noteId, deleted: true };
  },

  async communications(auth: AuthContext, customerId: string) {
    await getVisibleCustomer(auth, customerId);
    return prisma.customerCommunication.findMany({
      where: { companyId: auth.companyId, customerId, deletedAt: null },
      include: { performedBy: { select: userSelect } },
      orderBy: { occurredAt: 'desc' },
    });
  },
  async createCommunication(
    auth: AuthContext,
    customerId: string,
    input: CustomerCommunicationInput,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    if (input.leadId) {
      const lead = await prisma.query.findFirst({
        where: { id: input.leadId, companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw new ValidationError('The linked lead must belong to this customer.');
    }
    if (input.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: input.bookingId, companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!booking) throw new ValidationError('The linked booking must belong to this customer.');
    }
    return prisma.$transaction(async (tx) => {
      const communication = await tx.customerCommunication.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          customerId,
          performedById: auth.userId,
        }) as Prisma.CustomerCommunicationUncheckedCreateInput,
        include: { performedBy: { select: userSelect } },
      });
      await recalculateCustomerMetrics(tx, auth.companyId, customerId);
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_COMMUNICATION_RECORDED', customerId, context, {
          communicationId: communication.id,
          type: communication.type,
          direction: communication.direction,
        }),
      });
      return communication;
    });
  },

  async updateCommunication(
    auth: AuthContext,
    customerId: string,
    communicationId: string,
    input: CustomerCommunicationUpdateInput,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    const communication = await prisma.customerCommunication.findFirst({
      where: { id: communicationId, companyId: auth.companyId, customerId, deletedAt: null },
    });
    if (!communication) throw new NotFoundError('Customer communication not found.');
    if (
      communication.performedById !== auth.userId &&
      !(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL))
    )
      throw new ForbiddenError('You can edit only communications you recorded.');
    if (input.leadId) {
      const lead = await prisma.query.findFirst({
        where: { id: input.leadId, companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!lead) throw new ValidationError('The linked lead must belong to this customer.');
    }
    if (input.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: input.bookingId, companyId: auth.companyId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!booking) throw new ValidationError('The linked booking must belong to this customer.');
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.customerCommunication.update({
        where: { id: communicationId },
        data: compact(input) as Prisma.CustomerCommunicationUncheckedUpdateInput,
        include: { performedBy: { select: userSelect } },
      });
      await recalculateCustomerMetrics(tx, auth.companyId, customerId);
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_COMMUNICATION_UPDATED', customerId, context, {
          communicationId,
        }),
      });
      return updated;
    });
  },

  async deleteCommunication(
    auth: AuthContext,
    customerId: string,
    communicationId: string,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    const communication = await prisma.customerCommunication.findFirst({
      where: { id: communicationId, companyId: auth.companyId, customerId, deletedAt: null },
    });
    if (!communication) throw new NotFoundError('Customer communication not found.');
    if (
      communication.performedById !== auth.userId &&
      !(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL))
    )
      throw new ForbiddenError('You can delete only communications you recorded.');
    await prisma.$transaction(async (tx) => {
      await tx.customerCommunication.update({
        where: { id: communicationId },
        data: { deletedAt: new Date() },
      });
      await recalculateCustomerMetrics(tx, auth.companyId, customerId);
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_COMMUNICATION_DELETED', customerId, context, {
          communicationId,
          deleted: true,
        }),
      });
    });
    return { id: communicationId, deleted: true };
  },

  async relationships(
    auth: AuthContext,
    customerId: string,
    type: 'leads' | 'quotations' | 'bookings' | 'travellers' | 'payments',
  ) {
    await getVisibleCustomer(auth, customerId);
    const viewAll = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL);
    const ownLead = { OR: [{ createdById: auth.userId }, { assignedToId: auth.userId }] };
    if (type === 'leads')
      return prisma.query.findMany({
        where: {
          companyId: auth.companyId,
          customerId,
          deletedAt: null,
          ...(viewAll ? {} : ownLead),
        },
        select: {
          id: true,
          queryNumber: true,
          customerName: true,
          leadStage: true,
          travelStartDate: true,
          expectedAmount: true,
          assignedTo: { select: userSelect },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    if (type === 'quotations')
      return prisma.quotation.findMany({
        where: {
          companyId: auth.companyId,
          customerId,
          deletedAt: null,
          ...(viewAll
            ? {}
            : { query: { is: { companyId: auth.companyId, deletedAt: null, ...ownLead } } }),
        },
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          destinationSummary: true,
          travelStartDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    const bookingWhere = {
      companyId: auth.companyId,
      customerId,
      deletedAt: null,
      ...(viewAll
        ? {}
        : {
            OR: [
              { bookedById: auth.userId },
              { assignedToId: auth.userId },
              { query: { is: { ...ownLead } } },
            ],
          }),
    } satisfies Prisma.BookingWhereInput;
    if (type === 'travellers')
      return prisma.bookingTraveller.findMany({
        where: { companyId: auth.companyId, deletedAt: null, booking: { is: bookingWhere } },
        select: {
          id: true,
          travellerType: true,
          title: true,
          firstName: true,
          middleName: true,
          lastName: true,
          gender: true,
          dateOfBirth: true,
          nationality: true,
          email: true,
          phone: true,
          visaStatus: true,
          isPrimaryTraveller: true,
          sequence: true,
          booking: { select: { id: true, bookingNumber: true, travelStartDate: true } },
          createdAt: true,
        },
        orderBy: [{ booking: { travelStartDate: 'desc' } }, { sequence: 'asc' }],
      });
    if (type === 'payments') {
      if (!(await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS)))
        throw new ForbiddenError('Customer payment history requires financial access.');
      const payments = await prisma.bookingPayment.findMany({
        where: { companyId: auth.companyId, booking: { is: bookingWhere } },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          currency: true,
          paymentMethod: true,
          paymentStatus: true,
          receivedAt: true,
          reversedAt: true,
          booking: { select: { id: true, bookingNumber: true } },
          createdAt: true,
        },
        orderBy: { receivedAt: 'desc' },
      });
      return payments.map(({ amount, ...payment }) => ({ ...payment, amount: amount.toFixed(2) }));
    }
    const canViewFinancials = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
    const rows = await prisma.booking.findMany({
      where: bookingWhere,
      select: {
        id: true,
        bookingNumber: true,
        bookingStatus: true,
        operationalStatus: true,
        paymentStatus: true,
        destinationSummary: true,
        travelStartDate: true,
        totalSellingAmount: true,
        totalCustomerPaid: true,
        totalCustomerOutstanding: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(
      ({ totalSellingAmount, totalCustomerPaid, totalCustomerOutstanding, ...row }) => ({
        ...row,
        ...(canViewFinancials
          ? {
              totalSellingAmount: totalSellingAmount.toFixed(2),
              totalCustomerPaid: totalCustomerPaid.toFixed(2),
              totalCustomerOutstanding: totalCustomerOutstanding.toFixed(2),
            }
          : {}),
      }),
    );
  },

  async documents(auth: AuthContext, customerId: string) {
    await getVisibleCustomer(auth, customerId);
    const viewAll = await has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL);
    const ownLead = { OR: [{ createdById: auth.userId }, { assignedToId: auth.userId }] };
    const [customerDocuments, bookingDocuments] = await Promise.all([
      prisma.customerDocument.findMany({
        where: { companyId: auth.companyId, customerId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bookingDocument.findMany({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          booking: {
            is: {
              companyId: auth.companyId,
              customerId,
              deletedAt: null,
              ...(viewAll
                ? {}
                : {
                    OR: [
                      { bookedById: auth.userId },
                      { assignedToId: auth.userId },
                      { query: { is: { ...ownLead } } },
                    ],
                  }),
            },
          },
        },
        select: {
          id: true,
          documentType: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
          uploadStatus: true,
          visibility: true,
          createdAt: true,
          booking: { select: { id: true, bookingNumber: true } },
          traveller: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return [
      ...customerDocuments.map(({ objectKey, companyId, ...row }) => {
        void objectKey;
        void companyId;
        return { ...row, source: 'CUSTOMER' as const };
      }),
      ...bookingDocuments.map((row) => ({
        id: row.id,
        type: row.documentType,
        name: row.originalFileName,
        mimeType: row.mimeType,
        sizeBytes: row.fileSize,
        status: row.uploadStatus,
        visibility: row.visibility,
        createdAt: row.createdAt,
        booking: row.booking,
        traveller: row.traveller,
        source: 'BOOKING' as const,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
  async requestDocumentUpload(
    auth: AuthContext,
    customerId: string,
    input: CustomerDocumentUpload,
  ) {
    await getVisibleCustomer(auth, customerId);
    if (input.sizeBytes > env.CUSTOMER_DOCUMENT_MAX_UPLOAD_SIZE_MB * 1024 * 1024)
      throw new ValidationError(
        `Files may not exceed ${env.CUSTOMER_DOCUMENT_MAX_UPLOAD_SIZE_MB} MB.`,
      );
    const id = randomUUID();
    const name = sanitizeFileName(input.name);
    const objectKey = customerObjectKey({
      companyId: auth.companyId,
      customerId,
      documentId: id,
      fileName: name,
    });
    const document = await prisma.customerDocument.create({
      data: compact({
        id,
        companyId: auth.companyId,
        customerId,
        uploadedById: auth.userId,
        type: input.type,
        name,
        description: input.description,
        objectKey,
        storageProvider: storageService.provider,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        expiresAt: input.expiresAt,
      }) as Prisma.CustomerDocumentUncheckedCreateInput,
    });
    return {
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        status: document.status,
      },
      uploadUrl: await storageService.createUploadUrl(
        objectKey,
        input.mimeType,
        input.sizeBytes,
        env.CUSTOMER_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.CUSTOMER_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },
  async confirmDocumentUpload(
    auth: AuthContext,
    customerId: string,
    documentId: string,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    const document = await prisma.customerDocument.findFirst({
      where: { id: documentId, companyId: auth.companyId, customerId, deletedAt: null },
    });
    if (!document) throw new NotFoundError('Customer document not found.');
    const metadata = await storageService.headObject(document.objectKey);
    if (
      !metadata ||
      metadata.size !== document.sizeBytes ||
      metadata.contentType !== document.mimeType
    ) {
      await prisma.customerDocument.update({
        where: { id: documentId },
        data: { status: 'FAILED' },
      });
      throw new ValidationError('The uploaded object metadata does not match the approved file.');
    }
    return prisma.$transaction(async (tx) => {
      const row = await tx.customerDocument.update({
        where: { id: documentId },
        data: { status: 'AVAILABLE' },
      });
      await tx.activityLog.create({
        data: audit(auth, 'CUSTOMER_DOCUMENT_UPLOADED', customerId, context, {
          documentId,
          type: document.type,
        }),
      });
      const { objectKey, companyId, ...safe } = row;
      void objectKey;
      void companyId;
      return safe;
    });
  },
  async documentUrl(auth: AuthContext, customerId: string, documentId: string) {
    await getVisibleCustomer(auth, customerId);
    const document = await prisma.customerDocument.findFirst({
      where: {
        id: documentId,
        companyId: auth.companyId,
        customerId,
        status: 'AVAILABLE',
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundError('Customer document not found.');
    return {
      url: await storageService.createDownloadUrl(
        document.objectKey,
        document.name,
        env.CUSTOMER_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.CUSTOMER_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },
  async deleteDocument(
    auth: AuthContext,
    customerId: string,
    documentId: string,
    context: RequestContext,
  ) {
    await getVisibleCustomer(auth, customerId);
    const document = await prisma.customerDocument.findFirst({
      where: { id: documentId, companyId: auth.companyId, customerId, deletedAt: null },
    });
    if (!document) throw new NotFoundError('Customer document not found.');
    await storageService.deleteObject(document.objectKey);
    await prisma.$transaction([
      prisma.customerDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date(), status: 'FAILED' },
      }),
      prisma.activityLog.create({
        data: audit(auth, 'CUSTOMER_DOCUMENT_DELETED', customerId, context, { documentId }),
      }),
    ]);
    return { id: documentId, deleted: true };
  },

  async timeline(auth: AuthContext, customerId: string, query: Record<string, unknown>) {
    await getVisibleCustomer(auth, customerId);
    const [viewAll, canViewFinancials, canViewDocuments] = await Promise.all([
      has(auth, PERMISSIONS.CUSTOMERS_VIEW_ALL),
      has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS),
      has(auth, PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
    ]);
    const ownLead = { OR: [{ createdById: auth.userId }, { assignedToId: auth.userId }] };
    const bookingWhere = {
      companyId: auth.companyId,
      customerId,
      deletedAt: null,
      ...(viewAll
        ? {}
        : {
            OR: [
              { bookedById: auth.userId },
              { assignedToId: auth.userId },
              { query: { is: { ...ownLead } } },
            ],
          }),
    } satisfies Prisma.BookingWhereInput;
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const [notes, communications, leads, quotations, bookings, travellers, payments, documents] =
      await Promise.all([
        prisma.customerNote.findMany({
          where: {
            companyId: auth.companyId,
            customerId,
            deletedAt: null,
            ...(canViewFinancials ? {} : { type: { not: 'FINANCIAL' as const } }),
          },
          include: { authorUser: { select: userSelect } },
        }),
        prisma.customerCommunication.findMany({
          where: { companyId: auth.companyId, customerId, deletedAt: null },
          include: { performedBy: { select: userSelect } },
        }),
        prisma.query.findMany({
          where: {
            companyId: auth.companyId,
            customerId,
            deletedAt: null,
            ...(viewAll ? {} : ownLead),
          },
          select: { id: true, queryNumber: true, leadStage: true, createdAt: true },
        }),
        prisma.quotation.findMany({
          where: {
            companyId: auth.companyId,
            customerId,
            deletedAt: null,
            ...(viewAll
              ? {}
              : { query: { is: { companyId: auth.companyId, deletedAt: null, ...ownLead } } }),
          },
          select: { id: true, quotationNumber: true, status: true, createdAt: true },
        }),
        prisma.booking.findMany({
          where: bookingWhere,
          select: { id: true, bookingNumber: true, bookingStatus: true, createdAt: true },
        }),
        prisma.bookingTraveller.findMany({
          where: { companyId: auth.companyId, deletedAt: null, booking: { is: bookingWhere } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            travellerType: true,
            bookingId: true,
            createdAt: true,
          },
        }),
        canViewFinancials
          ? prisma.bookingPayment.findMany({
              where: { companyId: auth.companyId, booking: { is: bookingWhere } },
              select: {
                id: true,
                paymentNumber: true,
                amount: true,
                paymentStatus: true,
                bookingId: true,
                receivedAt: true,
              },
            })
          : Promise.resolve([]),
        canViewDocuments
          ? prisma.customerDocument.findMany({
              where: { companyId: auth.companyId, customerId, deletedAt: null },
              select: { id: true, type: true, name: true, status: true, createdAt: true },
            })
          : Promise.resolve([]),
      ]);
    const items = [
      ...notes.map((value) => ({ type: 'NOTE', occurredAt: value.createdAt, value })),
      ...communications.map((value) => ({
        type: 'COMMUNICATION',
        occurredAt: value.occurredAt,
        value,
      })),
      ...leads.map((value) => ({ type: 'LEAD', occurredAt: value.createdAt, value })),
      ...quotations.map((value) => ({ type: 'QUOTATION', occurredAt: value.createdAt, value })),
      ...bookings.map((value) => ({ type: 'BOOKING', occurredAt: value.createdAt, value })),
      ...travellers.map((value) => ({ type: 'TRAVELLER', occurredAt: value.createdAt, value })),
      ...payments.map((value) => ({
        type: 'PAYMENT',
        occurredAt: value.receivedAt,
        value: { ...value, amount: value.amount.toFixed(2) },
      })),
      ...documents.map((value) => ({ type: 'DOCUMENT', occurredAt: value.createdAt, value })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return {
      data: items.slice((page.page - 1) * page.pageSize, page.page * page.pageSize),
      pagination: {
        ...page,
        total: items.length,
        totalPages: items.length ? Math.ceil(items.length / page.pageSize) : 0,
      },
    };
  },

  async mergePreview(auth: AuthContext, input: CustomerMergeInput) {
    if (input.sourceCustomerId === input.targetCustomerId)
      throw new ValidationError('Choose two different customers.');
    const [source, target] = await Promise.all([
      getVisibleCustomer(auth, input.sourceCustomerId),
      getVisibleCustomer(auth, input.targetCustomerId),
    ]);
    const counts = await prisma.$transaction(async (tx) => ({
      leads: await tx.query.count({
        where: { companyId: auth.companyId, customerId: source.id, deletedAt: null },
      }),
      quotations: await tx.quotation.count({
        where: { companyId: auth.companyId, customerId: source.id, deletedAt: null },
      }),
      bookings: await tx.booking.count({
        where: { companyId: auth.companyId, customerId: source.id, deletedAt: null },
      }),
      notes: await tx.customerNote.count({
        where: { companyId: auth.companyId, customerId: source.id, deletedAt: null },
      }),
      communications: await tx.customerCommunication.count({
        where: { companyId: auth.companyId, customerId: source.id },
      }),
      documents: await tx.customerDocument.count({
        where: { companyId: auth.companyId, customerId: source.id, deletedAt: null },
      }),
    }));
    return {
      source: present(source, await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS)),
      target: present(target, await has(auth, PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS)),
      relationshipMoves: counts,
      conflicts: ['displayName', 'primaryPhone', 'email', 'dateOfBirth', 'assignedToId'].filter(
        (key) =>
          String(source[key as keyof typeof source] ?? '') !==
          String(target[key as keyof typeof target] ?? ''),
      ),
    };
  },

  async merge(auth: AuthContext, input: CustomerMergeInput, context: RequestContext) {
    const preview = await this.mergePreview(auth, input);
    return prisma.$transaction(
      async (tx) => {
        const source = await tx.customer.findFirst({
          where: {
            id: input.sourceCustomerId,
            companyId: auth.companyId,
            deletedAt: null,
            status: { not: 'MERGED' },
          },
        });
        const target = await tx.customer.findFirst({
          where: {
            id: input.targetCustomerId,
            companyId: auth.companyId,
            deletedAt: null,
            status: { not: 'MERGED' },
          },
        });
        if (!source || !target)
          throw new ConflictError('One of the customer records changed before the merge.');
        const choices = input.fieldChoices;
        const fields = [
          'displayName',
          'normalizedName',
          'primaryPhone',
          'normalizedPhone',
          'alternatePhone',
          'email',
          'normalizedEmail',
          'dateOfBirth',
          'anniversaryDate',
          'companyName',
          'taxIdentification',
          'preferredContactMethod',
          'preferredCurrency',
          'preferredLanguage',
          'travelPreferences',
          'dietaryRequirements',
          'specialRequirements',
          'assignedToId',
        ] as const;
        const chosen: Record<string, unknown> = {};
        for (const field of fields)
          if (choices[field] === 'source' || (target[field] === null && source[field] !== null))
            chosen[field] = source[field];
        const sourceTags = await tx.customerTagAssignment.findMany({
          where: { companyId: auth.companyId, customerId: source.id },
          select: { tagId: true },
        });
        if (sourceTags.length)
          await tx.customerTagAssignment.createMany({
            data: sourceTags.map(({ tagId }) => ({
              companyId: auth.companyId,
              customerId: target.id,
              tagId,
            })),
            skipDuplicates: true,
          });
        await Promise.all([
          tx.query.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
          tx.quotation.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
          tx.booking.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
          tx.customerAddress.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
          tx.customerNote.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
          tx.customerCommunication.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
          tx.customerDocument.updateMany({
            where: { companyId: auth.companyId, customerId: source.id },
            data: { customerId: target.id },
          }),
        ]);
        await tx.customerTagAssignment.deleteMany({
          where: { companyId: auth.companyId, customerId: source.id },
        });
        await tx.customer.update({ where: { id: target.id }, data: chosen });
        await tx.customer.update({
          where: { id: source.id },
          data: { status: 'MERGED', mergedIntoId: target.id, deletedAt: new Date() },
        });
        await recalculateCustomerMetrics(tx, auth.companyId, target.id);
        const history = await tx.customerMergeHistory.create({
          data: compact({
            companyId: auth.companyId,
            sourceCustomerId: source.id,
            targetCustomerId: target.id,
            performedById: auth.userId,
            reason: input.reason,
            sourceSnapshot: JSON.parse(JSON.stringify(source)),
            targetSnapshot: JSON.parse(JSON.stringify(target)),
            relationshipMoves: preview.relationshipMoves,
          }) as Prisma.CustomerMergeHistoryUncheckedCreateInput,
        });
        await tx.activityLog.create({
          data: audit(auth, 'CUSTOMER_MERGED', target.id, context, {
            sourceCustomerId: source.id,
            targetCustomerId: target.id,
            historyId: history.id,
            relationshipMoves: preview.relationshipMoves,
          }),
        });
        return {
          targetCustomerId: target.id,
          sourceCustomerId: source.id,
          mergeHistoryId: history.id,
          relationshipMoves: preview.relationshipMoves,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  },

  async mergeHistory(auth: AuthContext, customerId: string) {
    await getVisibleCustomer(auth, customerId);
    return prisma.customerMergeHistory.findMany({
      where: {
        companyId: auth.companyId,
        OR: [{ sourceCustomerId: customerId }, { targetCustomerId: customerId }],
      },
      include: {
        performedBy: { select: userSelect },
        sourceCustomer: { select: { id: true, customerNumber: true, displayName: true } },
        targetCustomer: { select: { id: true, customerNumber: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
