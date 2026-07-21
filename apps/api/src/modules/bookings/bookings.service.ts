import { createHash, randomUUID } from 'node:crypto';
import {
  Prisma,
  type BookingCostStatus,
  type BookingStatus,
  type ServiceConfirmationStatus,
} from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_NAME,
  type BookingCostInput,
  type BookingDocumentUpload,
  type BookingEmailInput,
  type BookingItineraryInput,
  type BookingManualInput,
  type BookingNoteInput,
  type BookingPaymentInput,
  type BookingPaymentScheduleInput,
  type BookingServiceInput,
  type BookingUpdate,
  type QuotationConversionInput,
  type TravellerInput,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import {
  encryptSensitiveValue,
  decryptSensitiveValue,
  maskSensitiveIdentifier,
} from '../../utils/crypto.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  assertAssignable,
  getVisible as getVisibleLead,
  visibility as leadVisibility,
} from '../queries/queries.service.js';
import { versionInclude } from '../quotations/quotations.service.js';
import {
  bookingObjectKey,
  sanitizeFileName,
  storageService,
} from '../../services/storage/storage.service.js';
import { emailService } from '../../services/email/email.service.js';
import { renderBookingConfirmationPdf } from './booking-pdf.service.js';
import {
  bookingAudit,
  nextBookingNumber,
  recalculateBookingFinancials,
  type RequestContext,
} from './booking.utils.js';
import { localDayBounds } from '../../utils/timezone.js';

const userSelect = { id: true, fullName: true, username: true } as const;
const bookingInclude = {
  bookedBy: { select: userSelect },
  assignedTo: { select: userSelect },
  query: {
    select: { id: true, queryNumber: true, leadStage: true, assignedToId: true, createdById: true },
  },
  quotation: { select: { id: true, quotationNumber: true, status: true } },
  quotationVersion: { select: { id: true, versionNumber: true, title: true, status: true } },
  travellers: { where: { deletedAt: null }, orderBy: { sequence: 'asc' as const } },
  services: { where: { deletedAt: null }, orderBy: { sequence: 'asc' as const } },
  itinerary: { orderBy: { sequence: 'asc' as const } },
  paymentSchedules: { where: { deletedAt: null }, orderBy: { installmentNumber: 'asc' as const } },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    include: { recordedBy: { select: userSelect }, reversedBy: { select: userSelect } },
  },
  costs: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    include: { recordedBy: { select: userSelect } },
  },
  documents: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    include: { uploadedBy: { select: userSelect } },
  },
  notes: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    include: { authorUser: { select: userSelect } },
  },
  statusHistory: {
    orderBy: { createdAt: 'desc' as const },
    include: { changedBy: { select: userSelect } },
  },
  assignmentHistory: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      assignedBy: { select: userSelect },
      previousAssignee: { select: userSelect },
      newAssignee: { select: userSelect },
    },
  },
  emailLogs: {
    orderBy: { createdAt: 'desc' as const },
    include: { sentBy: { select: userSelect } },
  },
} as const;
type FullBooking = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

const decimal = (value: Prisma.Decimal | null | undefined) => value?.toFixed(2) ?? null;
const hasPermission = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

async function financialAccess(auth: AuthContext) {
  return hasPermission(auth, PERMISSIONS.BOOKINGS_VIEW_FINANCIALS);
}

async function bookingVisibility(auth: AuthContext): Promise<Prisma.BookingWhereInput> {
  if (await hasPermission(auth, PERMISSIONS.BOOKINGS_VIEW_ALL)) return {};
  const visibleLead = await leadVisibility(auth);
  return {
    OR: [
      { bookedById: auth.userId },
      { assignedToId: auth.userId },
      { query: { is: { ...visibleLead } } },
    ],
  };
}

async function visibleWhere(auth: AuthContext, extra: Prisma.BookingWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    ...(await bookingVisibility(auth)),
    ...extra,
  } satisfies Prisma.BookingWhereInput;
}

async function getBooking(auth: AuthContext, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: await visibleWhere(auth, { id: bookingId }),
    include: bookingInclude,
  });
  if (!booking) throw new NotFoundError('Booking not found.');
  return booking;
}

/** Refresh date-driven schedule and booking states at read time in the company's timezone. */
async function refreshVisibleOverdueBookings(auth: AuthContext, bookingId?: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: auth.companyId },
    select: { timezone: true },
  });
  const { start } = localDayBounds(company.timezone);
  const rows = await prisma.bookingPaymentSchedule.findMany({
    where: {
      companyId: auth.companyId,
      deletedAt: null,
      dueDate: { lt: start },
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      booking: { is: await visibleWhere(auth, bookingId ? { id: bookingId } : {}) },
    },
    distinct: ['bookingId'],
    select: { bookingId: true },
  });
  if (!rows.length) return;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) await recalculateBookingFinancials(tx, auth.companyId, row.bookingId);
  });
}

function validatePassportDates(input: {
  dateOfBirth?: Date | null | undefined;
  passportIssuedAt?: Date | null | undefined;
  passportExpiresAt?: Date | null | undefined;
}) {
  const { dateOfBirth, passportIssuedAt, passportExpiresAt } = input;
  if (passportIssuedAt && passportExpiresAt && passportIssuedAt >= passportExpiresAt)
    throw new ValidationError('Passport expiry must be after its issue date.');
  if (dateOfBirth && passportIssuedAt && passportIssuedAt < dateOfBirth)
    throw new ValidationError('Passport issue date cannot be before the traveller date of birth.');
  if (passportExpiresAt && passportExpiresAt <= new Date())
    throw new ValidationError('An expired passport cannot be recorded as a current passport.');
}

function decryptPassportForMask(encrypted: string | null) {
  if (!encrypted || !env.DATA_ENCRYPTION_KEY) return null;
  try {
    return maskSensitiveIdentifier(decryptSensitiveValue(encrypted, env.DATA_ENCRYPTION_KEY));
  } catch {
    return null;
  }
}

function attentionIndicators(booking: FullBooking) {
  const indicators = new Set<string>();
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86_400_000);
  if (booking.paymentSchedules.some((row) => row.status === 'OVERDUE'))
    indicators.add('PAYMENT_OVERDUE');
  if (booking.totalCustomerOutstanding.greaterThan(0)) indicators.add('CUSTOMER_BALANCE_DUE');
  if (
    booking.services.some((row) =>
      ['PENDING', 'REQUESTED', 'WAITLISTED'].includes(row.confirmationStatus),
    )
  )
    indicators.add('SERVICE_CONFIRMATION_PENDING');
  if (booking.costs.some((row) => row.dueDate && row.dueDate < now && row.costStatus !== 'PAID'))
    indicators.add('SUPPLIER_PAYMENT_DUE');
  if (
    booking.travelStartDate &&
    booking.travelStartDate >= now &&
    booking.travelStartDate <= sevenDays
  )
    indicators.add('DEPARTURE_WITHIN_7_DAYS');
  if (booking.bookingStatus === 'TRAVEL_IN_PROGRESS') indicators.add('TRAVEL_IN_PROGRESS');
  const requiredTravellerDocs = booking.travellers.filter((row) => row.travellerType !== 'INFANT');
  if (
    requiredTravellerDocs.some(
      (traveller) =>
        !booking.documents.some(
          (document) =>
            document.travellerId === traveller.id &&
            document.documentType === 'PASSPORT' &&
            document.uploadStatus === 'AVAILABLE',
        ),
    )
  )
    indicators.add('DOCUMENTS_MISSING');
  const warningDate = booking.travelStartDate ? new Date(booking.travelStartDate) : null;
  if (warningDate)
    warningDate.setMonth(warningDate.getMonth() + env.PASSPORT_EXPIRY_WARNING_MONTHS);
  if (
    warningDate &&
    booking.travellers.some((row) => row.passportExpiresAt && row.passportExpiresAt < warningDate)
  )
    indicators.add('PASSPORT_EXPIRING');
  if (
    booking.travellers.some((row) =>
      ['NOT_STARTED', 'DOCUMENTS_PENDING', 'APPLIED'].includes(row.visaStatus),
    )
  )
    indicators.add('VISA_PENDING');
  return [...indicators];
}

function presentBooking(booking: FullBooking, canViewFinancials: boolean) {
  const {
    companyId,
    deletedAt,
    totalSellingAmount,
    totalCustomerPaid,
    totalCustomerOutstanding,
    totalCost,
    grossProfit,
    profitMarginPercentage,
    costs,
    ...value
  } = booking;
  void companyId;
  void deletedAt;
  const travellers = booking.travellers.map(
    ({ companyId: _companyId, bookingId: _bookingId, passportNumberEncrypted, ...traveller }) => ({
      ...traveller,
      passportMasked: decryptPassportForMask(passportNumberEncrypted),
    }),
  );
  const services = booking.services.map(
    ({
      companyId: _companyId,
      bookingId: _bookingId,
      internalCostSnapshot,
      customerSellingAmount,
      ...service
    }) => ({
      ...service,
      ...(canViewFinancials
        ? {
            customerSellingAmount: decimal(customerSellingAmount),
            internalCostSnapshot: decimal(internalCostSnapshot),
          }
        : {}),
    }),
  );
  const documents = booking.documents.map(
    ({ companyId: _companyId, bookingId: _bookingId, objectKey, bucket, ...document }) => {
      void _companyId;
      void _bookingId;
      void objectKey;
      void bucket;
      return document;
    },
  );
  const safeNotes = canViewFinancials
    ? value.notes
    : value.notes.filter((note) => note.noteType !== 'FINANCIAL');
  return {
    ...value,
    travellers,
    services,
    documents,
    notes: safeNotes,
    attentionIndicators: attentionIndicators(booking),
    ...(canViewFinancials
      ? {
          totalSellingAmount: decimal(totalSellingAmount),
          totalCustomerPaid: decimal(totalCustomerPaid),
          totalCustomerOutstanding: decimal(totalCustomerOutstanding),
          totalCost: decimal(totalCost),
          grossProfit: decimal(grossProfit),
          profitMarginPercentage: profitMarginPercentage.toFixed(4),
          costs: costs.map(({ companyId: _companyId, bookingId: _bookingId, ...cost }) => ({
            ...cost,
            amount: decimal(cost.amount),
          })),
        }
      : {}),
    paymentSchedules: value.paymentSchedules.map(({ amount, ...row }) => ({
      ...row,
      ...(canViewFinancials ? { amount: decimal(amount) } : {}),
    })),
    payments: canViewFinancials
      ? value.payments.map((row) => ({ ...row, amount: decimal(row.amount) }))
      : [],
  };
}

async function assertOperationallyMutable(booking: { bookingStatus: BookingStatus }) {
  if (['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(booking.bookingStatus))
    throw new ConflictError(
      'Terminal bookings cannot be edited. Use the controlled status workflow.',
    );
}

const statusTransitions: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING_CONFIRMATION: ['PARTIALLY_CONFIRMED', 'CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  PARTIALLY_CONFIRMED: ['CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  CONFIRMED: ['TRAVEL_IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['PENDING_CONFIRMATION', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'CANCELLED'],
  TRAVEL_IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  ARCHIVED: [],
};

function currency(value: unknown) {
  return new Prisma.Decimal(String(value ?? 0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Remove undefined optionals before crossing Prisma's exact-optional boundary. */
function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export const bookingsService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    await refreshVisibleOverdueBookings(auth);
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canViewFinancials = await financialAccess(auth);
    const financialQuery =
      ['amountMin', 'amountMax'].some((key) => query[key] !== undefined) ||
      ['totalSellingAmount', 'totalCustomerOutstanding', 'grossProfit'].includes(
        String(query.sortBy ?? ''),
      );
    if (financialQuery && !canViewFinancials)
      throw new ForbiddenError('Financial booking filters require financial access.');
    const search = typeof query.search === 'string' ? query.search : undefined;
    const where = await visibleWhere(auth, {
      ...(typeof query.bookingStatus === 'string'
        ? { bookingStatus: query.bookingStatus as BookingStatus }
        : {}),
      ...(typeof query.operationalStatus === 'string'
        ? { operationalStatus: query.operationalStatus as Prisma.EnumOperationalStatusFilter }
        : {}),
      ...(typeof query.paymentStatus === 'string'
        ? { paymentStatus: query.paymentStatus as Prisma.EnumBookingPaymentStatusFilter }
        : {}),
      ...(typeof query.assignedToId === 'string' ? { assignedToId: query.assignedToId } : {}),
      ...(typeof query.bookedById === 'string' ? { bookedById: query.bookedById } : {}),
      ...(typeof query.destination === 'string'
        ? { destinationSummary: { contains: query.destination, mode: 'insensitive' } }
        : {}),
      ...(query.travelFrom || query.travelTo
        ? {
            travelStartDate: {
              ...(query.travelFrom ? { gte: new Date(String(query.travelFrom)) } : {}),
              ...(query.travelTo ? { lte: new Date(String(query.travelTo)) } : {}),
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
      ...(query.paymentDueFrom || query.paymentDueTo
        ? {
            paymentSchedules: {
              some: {
                deletedAt: null,
                dueDate: {
                  ...(query.paymentDueFrom ? { gte: new Date(String(query.paymentDueFrom)) } : {}),
                  ...(query.paymentDueTo ? { lte: new Date(String(query.paymentDueTo)) } : {}),
                },
              },
            },
          }
        : {}),
      ...(canViewFinancials && (query.amountMin || query.amountMax)
        ? {
            totalSellingAmount: {
              ...(query.amountMin ? { gte: currency(query.amountMin) } : {}),
              ...(query.amountMax ? { lte: currency(query.amountMax) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { bookingNumber: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search } },
              { customerEmail: { contains: search, mode: 'insensitive' } },
              { destinationSummary: { contains: search, mode: 'insensitive' } },
              { quotation: { is: { quotationNumber: { contains: search, mode: 'insensitive' } } } },
              { query: { is: { queryNumber: { contains: search, mode: 'insensitive' } } } },
              {
                travellers: {
                  some: {
                    deletedAt: null,
                    OR: [
                      { firstName: { contains: search, mode: 'insensitive' } },
                      { lastName: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                services: {
                  some: {
                    deletedAt: null,
                    supplierReference: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    });
    const allowedSort = new Set([
      'bookingNumber',
      'customerName',
      'travelStartDate',
      'travelEndDate',
      'bookingStatus',
      'paymentStatus',
      'totalSellingAmount',
      'totalCustomerOutstanding',
      'grossProfit',
      'createdAt',
      'updatedAt',
    ]);
    const sortBy = allowedSort.has(String(query.sortBy)) ? String(query.sortBy) : 'updatedAt';
    const orderBy = {
      [sortBy]: query.sortOrder === 'asc' ? 'asc' : 'desc',
    } as Prisma.BookingOrderByWithRelationInput;
    const [rows, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy,
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.booking.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentBooking(row, canViewFinancials)),
      pagination: { ...page, total, totalPages: total ? Math.ceil(total / page.pageSize) : 0 },
    };
  },

  async analytics(auth: AuthContext) {
    await refreshVisibleOverdueBookings(auth);
    const where = await visibleWhere(auth);
    const canViewFinancials = await financialAccess(auth);
    const now = new Date();
    const nextSevenDays = new Date(now.getTime() + 7 * 86_400_000);
    const [total, statuses, payments, upcoming, missingDocuments, servicesPending, financial] =
      await Promise.all([
        prisma.booking.count({ where }),
        prisma.booking.groupBy({ by: ['bookingStatus'], where, _count: { _all: true } }),
        prisma.booking.groupBy({ by: ['paymentStatus'], where, _count: { _all: true } }),
        prisma.booking.count({
          where: { ...where, travelStartDate: { gte: now, lte: nextSevenDays } },
        }),
        prisma.booking.count({
          where: {
            ...where,
            travellers: {
              some: {
                deletedAt: null,
                documents: {
                  none: { deletedAt: null, uploadStatus: 'AVAILABLE', documentType: 'PASSPORT' },
                },
              },
            },
          },
        }),
        prisma.bookingService.count({
          where: {
            companyId: auth.companyId,
            booking: { is: where },
            deletedAt: null,
            confirmationStatus: { in: ['PENDING', 'REQUESTED', 'WAITLISTED'] },
          },
        }),
        canViewFinancials
          ? prisma.booking.aggregate({
              where,
              _sum: {
                totalSellingAmount: true,
                totalCustomerPaid: true,
                totalCustomerOutstanding: true,
                totalCost: true,
                grossProfit: true,
              },
            })
          : Promise.resolve(null),
      ]);
    const byStatus = Object.fromEntries(
      statuses.map((row) => [row.bookingStatus, row._count._all]),
    );
    const byPayment = Object.fromEntries(
      payments.map((row) => [row.paymentStatus, row._count._all]),
    );
    const selling = financial?._sum.totalSellingAmount ?? currency(0);
    const gross = financial?._sum.grossProfit ?? currency(0);
    return {
      totalBookings: total,
      pendingConfirmation: byStatus.PENDING_CONFIRMATION ?? 0,
      confirmed: (byStatus.CONFIRMED ?? 0) + (byStatus.PARTIALLY_CONFIRMED ?? 0),
      travelUpcoming: upcoming,
      travelInProgress: byStatus.TRAVEL_IN_PROGRESS ?? 0,
      completed: byStatus.COMPLETED ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      unpaidBookings: byPayment.UNPAID ?? 0,
      partiallyPaidBookings: byPayment.PARTIALLY_PAID ?? 0,
      fullyPaidBookings: byPayment.PAID ?? 0,
      overdueCustomerPayments: byPayment.OVERDUE ?? 0,
      bookingsDepartingNext7Days: upcoming,
      bookingsWithMissingTravellerDocuments: missingDocuments,
      servicesAwaitingConfirmation: servicesPending,
      ...(financial
        ? {
            totalBookingValue: decimal(financial._sum.totalSellingAmount),
            totalCustomerPaymentsReceived: decimal(financial._sum.totalCustomerPaid),
            totalCustomerOutstanding: decimal(financial._sum.totalCustomerOutstanding),
            totalRecordedCosts: decimal(financial._sum.totalCost),
            grossProfit: decimal(financial._sum.grossProfit),
            profitMarginPercentage: selling.isZero()
              ? '0.0000'
              : gross.dividedBy(selling).times(100).toFixed(4),
          }
        : {}),
    };
  },

  async lookups(auth: AuthContext) {
    const users = await prisma.user.findMany({
      where: { companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
      select: userSelect,
      orderBy: { fullName: 'asc' },
    });
    return { users };
  },

  async details(auth: AuthContext, bookingId: string) {
    await refreshVisibleOverdueBookings(auth, bookingId);
    return presentBooking(await getBooking(auth, bookingId), await financialAccess(auth));
  },

  async convertFromQuotation(
    auth: AuthContext,
    quotationId: string,
    input: QuotationConversionInput,
    context: RequestContext,
  ) {
    const quotation = await prisma.quotation.findFirst({
      where: {
        id: quotationId,
        companyId: auth.companyId,
        deletedAt: null,
        query: {
          is: { companyId: auth.companyId, deletedAt: null, ...(await leadVisibility(auth)) },
        },
      },
      include: { query: true, versions: { include: versionInclude } },
    });
    if (!quotation) throw new NotFoundError('Quotation not found.');
    if (quotation.status !== 'ACCEPTED' || !quotation.acceptedVersionId)
      throw new ConflictError('Only an accepted quotation can be converted.');
    const selectedVersionId = input.quotationVersionId ?? quotation.acceptedVersionId;
    if (selectedVersionId !== quotation.acceptedVersionId)
      throw new ValidationError('The booking must use the exact accepted quotation version.');
    const version = quotation.versions.find((row) => row.id === selectedVersionId);
    if (!version || version.status === 'DRAFT')
      throw new ConflictError('The accepted immutable quotation version is unavailable.');
    if (await prisma.booking.findFirst({ where: { companyId: auth.companyId, quotationId } }))
      throw new ConflictError('This quotation has already been converted to a booking.');
    await assertAssignable(auth, input.assignedToId);
    const created = await prisma.$transaction(async (tx) => {
      const bookingNumber = await nextBookingNumber(tx, auth.companyId, 'booking');
      const booking = await tx.booking.create({
        data: {
          companyId: auth.companyId,
          bookingNumber,
          queryId: quotation.queryId,
          quotationId: quotation.id,
          quotationVersionId: version.id,
          customerName: quotation.customerName,
          customerEmail: quotation.customerEmail,
          customerPhone: quotation.customerPhone,
          destinationSummary: version.destinationSummary,
          travelStartDate: version.travelStartDate,
          travelEndDate: version.travelEndDate,
          rooms: quotation.rooms,
          adults: quotation.adults,
          childrenWithBed: quotation.childrenWithBed,
          childrenWithoutBed: quotation.childrenWithoutBed,
          infants: quotation.infants,
          currency: version.currency,
          totalSellingAmount: version.finalAmount,
          totalCustomerOutstanding: version.finalAmount,
          grossProfit: version.finalAmount,
          bookedById: auth.userId,
          assignedToId: input.assignedToId ?? quotation.query.assignedToId ?? auth.userId,
          sourceTitle: version.title,
          sourceTerms: version.terms.map((row) => row.content),
          acceptedAt: quotation.acceptedAt,
          internalNotes: input.initialOperationalNotes ?? null,
        },
      });
      const services: Array<Prisma.BookingServiceCreateManyInput> = [];
      let sequence = 1;
      for (const hotel of version.hotels.filter((row) => row.selected)) {
        services.push({
          companyId: auth.companyId,
          bookingId: booking.id,
          serviceType: 'HOTEL',
          name: hotel.hotelName,
          description:
            [hotel.category, hotel.roomType, hotel.mealPlan].filter(Boolean).join(' • ') || null,
          city: hotel.city,
          startDate: hotel.checkInDate,
          endDate: hotel.checkOutDate,
          customerSellingAmount: hotel.sellingPrice,
          internalCostSnapshot: hotel.internalCost,
          notes: hotel.notes,
          sequence: sequence++,
        });
      }
      for (const service of version.services) {
        services.push({
          companyId: auth.companyId,
          bookingId: booking.id,
          serviceType: service.serviceType,
          name: service.name,
          description: service.description,
          city: service.city,
          customerSellingAmount: service.totalSellingPrice,
          internalCostSnapshot: service.totalCost,
          notes: service.notes,
          sequence: sequence++,
        });
      }
      if (services.length) await tx.bookingService.createMany({ data: services });
      if (version.itinerary.length)
        await tx.bookingItineraryDay.createMany({
          data: version.itinerary.map((day) => ({
            companyId: auth.companyId,
            bookingId: booking.id,
            dayNumber: day.dayNumber,
            date: day.date,
            title: day.title,
            destination: day.destination,
            description: day.description,
            meals: day.meals,
            overnightLocation: day.overnightLocation,
            sequence: day.sequence,
          })),
        });
      if (input.paymentSchedule.length)
        await tx.bookingPaymentSchedule.createMany({
          data: input.paymentSchedule.map(
            (row) =>
              compact({
                ...row,
                companyId: auth.companyId,
                bookingId: booking.id,
                createdById: auth.userId,
              }) as Prisma.BookingPaymentScheduleCreateManyInput,
          ),
        });
      const createdServices = await tx.bookingService.findMany({
        where: { bookingId: booking.id },
      });
      const costs = createdServices.filter((row) => row.internalCostSnapshot.greaterThan(0));
      if (costs.length)
        await tx.bookingCost.createMany({
          data: costs.map((service) => ({
            companyId: auth.companyId,
            bookingId: booking.id,
            bookingServiceId: service.id,
            costCategory:
              service.serviceType === 'HOTEL'
                ? 'HOTEL'
                : service.serviceType === 'FLIGHT'
                  ? 'FLIGHT'
                  : 'OTHER',
            supplierName: 'To be confirmed',
            description: `${service.name} — quotation cost snapshot`,
            amount: service.internalCostSnapshot,
            currency: version.currency,
            costStatus: 'ESTIMATED',
            recordedById: auth.userId,
          })),
        });
      await recalculateBookingFinancials(tx, auth.companyId, booking.id);
      if (quotation.query.leadStage !== 'BOOKING_CONFIRMED') {
        await tx.query.update({
          where: { id: quotation.queryId },
          data: { leadStage: 'BOOKING_CONFIRMED', convertedAt: new Date() },
        });
        await tx.queryStageHistory.create({
          data: {
            companyId: auth.companyId,
            queryId: quotation.queryId,
            previousStage: quotation.query.leadStage,
            newStage: 'BOOKING_CONFIRMED',
            changedById: auth.userId,
            reason: `Converted accepted quotation ${quotation.quotationNumber}`,
          },
        });
      }
      await tx.bookingStatusHistory.create({
        data: {
          companyId: auth.companyId,
          bookingId: booking.id,
          newStatus: 'PENDING_CONFIRMATION',
          changedById: auth.userId,
          reason: 'Created from accepted quotation',
        },
      });
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_CONVERTED_FROM_QUOTATION',
          'Booking',
          booking.id,
          context,
          { quotationId, quotationVersionId: version.id, queryId: quotation.queryId },
        ),
      });
      return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude });
    });
    return presentBooking(created, await financialAccess(auth));
  },

  async create(auth: AuthContext, input: BookingManualInput, context: RequestContext) {
    if (input.queryId) await getVisibleLead(auth, input.queryId);
    await assertAssignable(auth, input.assignedToId);
    const canViewFinancials = await financialAccess(auth);
    const created = await prisma.$transaction(async (tx) => {
      const bookingNumber = await nextBookingNumber(tx, auth.companyId, 'booking');
      const booking = await tx.booking.create({
        data: {
          companyId: auth.companyId,
          bookingNumber,
          queryId: input.queryId ?? null,
          customerName: input.customerName,
          customerEmail: input.customerEmail || null,
          customerPhone: input.customerPhone,
          destinationSummary: input.destinationSummary,
          travelStartDate: input.travelStartDate ?? null,
          travelEndDate: input.travelEndDate ?? null,
          rooms: input.rooms,
          adults: input.adults,
          childrenWithBed: input.childrenWithBed,
          childrenWithoutBed: input.childrenWithoutBed,
          infants: input.infants,
          currency: input.currency,
          totalSellingAmount: input.totalSellingAmount,
          totalCustomerOutstanding: input.totalSellingAmount,
          grossProfit: input.totalSellingAmount,
          bookedById: auth.userId,
          assignedToId: input.assignedToId ?? auth.userId,
          manualCreationReason: input.manualCreationReason,
          internalNotes: input.internalNotes ?? null,
        },
      });
      if (input.services.length)
        await tx.bookingService.createMany({
          data: input.services.map(
            (row) =>
              compact({
                ...row,
                internalCostSnapshot: canViewFinancials ? row.internalCostSnapshot : 0,
                companyId: auth.companyId,
                bookingId: booking.id,
              }) as Prisma.BookingServiceCreateManyInput,
          ),
        });
      if (input.itinerary.length)
        await tx.bookingItineraryDay.createMany({
          data: input.itinerary.map(
            (row) =>
              compact({
                ...row,
                companyId: auth.companyId,
                bookingId: booking.id,
              }) as Prisma.BookingItineraryDayCreateManyInput,
          ),
        });
      if (input.paymentSchedule.length)
        await tx.bookingPaymentSchedule.createMany({
          data: input.paymentSchedule.map(
            (row) =>
              compact({
                ...row,
                companyId: auth.companyId,
                bookingId: booking.id,
                createdById: auth.userId,
              }) as Prisma.BookingPaymentScheduleCreateManyInput,
          ),
        });
      await recalculateBookingFinancials(tx, auth.companyId, booking.id);
      await tx.bookingStatusHistory.create({
        data: {
          companyId: auth.companyId,
          bookingId: booking.id,
          newStatus: 'PENDING_CONFIRMATION',
          changedById: auth.userId,
          reason: input.manualCreationReason,
        },
      });
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_CREATED', 'Booking', booking.id, context, {
          queryId: input.queryId ?? null,
          source: 'manual',
        }),
      });
      return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude });
    });
    const scheduled = input.paymentSchedule.reduce((sum, row) => sum.plus(row.amount), currency(0));
    return {
      ...presentBooking(created, canViewFinancials),
      scheduleWarning: scheduled.equals(created.totalSellingAmount)
        ? null
        : 'Payment schedule total does not equal the booking value.',
    };
  },

  async update(
    auth: AuthContext,
    bookingId: string,
    input: BookingUpdate,
    context: RequestContext,
  ) {
    const existing = await getBooking(auth, bookingId);
    await assertOperationallyMutable(existing);
    const counts = {
      ADULT: input.adults ?? existing.adults,
      CHILD_WITH_BED: input.childrenWithBed ?? existing.childrenWithBed,
      CHILD_WITHOUT_BED: input.childrenWithoutBed ?? existing.childrenWithoutBed,
      INFANT: input.infants ?? existing.infants,
    };
    for (const [travellerType, configured] of Object.entries(counts)) {
      const recorded = existing.travellers.filter(
        (row) => row.travellerType === travellerType,
      ).length;
      if (configured < recorded)
        throw new ValidationError(
          `The ${travellerType.toLowerCase().replaceAll('_', ' ')} count cannot be lower than the ${recorded} recorded traveller(s).`,
        );
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: compact(input) as Prisma.BookingUpdateInput,
      });
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_UPDATED', 'Booking', bookingId, context),
      });
      return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
    });
    return presentBooking(updated, await financialAccess(auth));
  },

  async archive(auth: AuthContext, bookingId: string, context: RequestContext) {
    await getBooking(auth, bookingId);
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { bookingStatus: 'ARCHIVED', deletedAt: new Date() },
      }),
      prisma.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_ARCHIVED', 'Booking', bookingId, context),
      }),
    ]);
    return { id: bookingId, archived: true };
  },

  async changeStatus(
    auth: AuthContext,
    bookingId: string,
    input: { status: BookingStatus; reason?: string | null },
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    const caller = await prisma.user.findFirstOrThrow({
      where: { id: auth.userId, companyId: auth.companyId },
      select: { role: { select: { name: true } } },
    });
    const correctionRoles = new Set<string>([ROLE_NAME.OWNER, ROLE_NAME.MANAGER]);
    const correction =
      ['COMPLETED', 'CANCELLED'].includes(booking.bookingStatus) &&
      correctionRoles.has(caller.role.name);
    if (!correction && !statusTransitions[booking.bookingStatus].includes(input.status))
      throw new ConflictError(`Cannot change ${booking.bookingStatus} to ${input.status}.`);
    if (input.status === 'CANCELLED' && !input.reason?.trim())
      throw new ValidationError('A cancellation reason is required.');
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: compact({
          bookingStatus: input.status,
          ...(input.status === 'CONFIRMED' ? { confirmedAt: now } : {}),
          ...(input.status === 'CANCELLED'
            ? { cancelledAt: now, cancellationReason: input.reason }
            : {}),
          ...(input.status === 'COMPLETED'
            ? { completedAt: now, operationalStatus: 'COMPLETED' }
            : {}),
          ...(input.status === 'TRAVEL_IN_PROGRESS'
            ? { operationalStatus: 'TRAVEL_IN_PROGRESS' }
            : {}),
        }) as Prisma.BookingUpdateInput,
      });
      await tx.bookingStatusHistory.create({
        data: {
          companyId: auth.companyId,
          bookingId,
          previousStatus: booking.bookingStatus,
          newStatus: input.status,
          changedById: auth.userId,
          reason: input.reason ?? (correction ? 'Owner/Manager correction' : null),
        },
      });
      const action =
        input.status === 'CANCELLED'
          ? 'BOOKING_CANCELLED'
          : input.status === 'COMPLETED'
            ? 'BOOKING_COMPLETED'
            : 'BOOKING_STATUS_CHANGED';
      await tx.activityLog.create({
        data: bookingAudit(auth, action, 'Booking', bookingId, context, {
          previousStatus: booking.bookingStatus,
          newStatus: input.status,
          correction,
        }),
      });
    });
    return this.details(auth, bookingId);
  },

  async assign(
    auth: AuthContext,
    bookingId: string,
    assignedToId: string | null,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertAssignable(auth, assignedToId);
    await prisma.$transaction([
      prisma.booking.update({ where: { id: bookingId }, data: { assignedToId } }),
      prisma.bookingAssignmentHistory.create({
        data: {
          companyId: auth.companyId,
          bookingId,
          previousAssigneeId: booking.assignedToId,
          newAssigneeId: assignedToId,
          assignedById: auth.userId,
        },
      }),
      prisma.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_ASSIGNED', 'Booking', bookingId, context, {
          previousAssigneeId: booking.assignedToId,
          newAssigneeId: assignedToId,
        }),
      }),
    ]);
    return this.details(auth, bookingId);
  },

  async travellers(auth: AuthContext, bookingId: string) {
    return (await this.details(auth, bookingId)).travellers;
  },

  async createTraveller(
    auth: AuthContext,
    bookingId: string,
    input: TravellerInput,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const capacity = {
      ADULT: booking.adults,
      CHILD_WITH_BED: booking.childrenWithBed,
      CHILD_WITHOUT_BED: booking.childrenWithoutBed,
      INFANT: booking.infants,
    }[input.travellerType];
    const existingCount = booking.travellers.filter(
      (row) => row.travellerType === input.travellerType,
    ).length;
    if (existingCount >= capacity)
      throw new ValidationError(
        `The configured ${input.travellerType.toLowerCase().replaceAll('_', ' ')} traveller count is already complete.`,
      );
    if (input.passportNumber && !env.DATA_ENCRYPTION_KEY)
      throw new ServiceUnavailableError('Passport-number encryption is not configured.');
    validatePassportDates(input);
    const created = await prisma.$transaction(async (tx) => {
      if (input.isPrimaryTraveller)
        await tx.bookingTraveller.updateMany({
          where: { bookingId, companyId: auth.companyId, deletedAt: null },
          data: { isPrimaryTraveller: false },
        });
      const { passportNumber, ...safeInput } = input;
      const traveller = await tx.bookingTraveller.create({
        data: compact({
          ...safeInput,
          email: safeInput.email || null,
          companyId: auth.companyId,
          bookingId,
          createdById: auth.userId,
          passportNumberEncrypted: passportNumber
            ? encryptSensitiveValue(
                passportNumber,
                env.DATA_ENCRYPTION_KEY!,
                env.DATA_ENCRYPTION_KEY_VERSION,
              )
            : null,
          passportKeyVersion: passportNumber ? env.DATA_ENCRYPTION_KEY_VERSION : null,
        }) as Prisma.BookingTravellerUncheckedCreateInput,
      });
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_TRAVELLER_CREATED',
          'BookingTraveller',
          traveller.id,
          context,
          { bookingId, travellerType: input.travellerType },
        ),
      });
      return traveller;
    });
    return (await this.details(auth, bookingId)).travellers.find((row) => row.id === created.id);
  },

  async updateTraveller(
    auth: AuthContext,
    bookingId: string,
    travellerId: string,
    input: Partial<TravellerInput>,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const traveller = booking.travellers.find((row) => row.id === travellerId);
    if (!traveller) throw new NotFoundError('Traveller not found.');
    if (input.passportNumber && !env.DATA_ENCRYPTION_KEY)
      throw new ServiceUnavailableError('Passport-number encryption is not configured.');
    validatePassportDates({
      dateOfBirth: input.dateOfBirth === undefined ? traveller.dateOfBirth : input.dateOfBirth,
      passportIssuedAt:
        input.passportIssuedAt === undefined ? traveller.passportIssuedAt : input.passportIssuedAt,
      passportExpiresAt:
        input.passportExpiresAt === undefined
          ? traveller.passportExpiresAt
          : input.passportExpiresAt,
    });
    if (input.travellerType && input.travellerType !== traveller.travellerType) {
      const capacity = {
        ADULT: booking.adults,
        CHILD_WITH_BED: booking.childrenWithBed,
        CHILD_WITHOUT_BED: booking.childrenWithoutBed,
        INFANT: booking.infants,
      }[input.travellerType];
      if (
        booking.travellers.filter((row) => row.travellerType === input.travellerType).length >=
        capacity
      )
        throw new ValidationError('The target traveller type is already at its configured count.');
    }
    await prisma.$transaction(async (tx) => {
      if (input.isPrimaryTraveller)
        await tx.bookingTraveller.updateMany({
          where: {
            bookingId,
            companyId: auth.companyId,
            deletedAt: null,
            id: { not: travellerId },
          },
          data: { isPrimaryTraveller: false },
        });
      const { passportNumber, ...safeInput } = input;
      await tx.bookingTraveller.update({
        where: { id: travellerId },
        data: compact({
          ...safeInput,
          ...(passportNumber !== undefined
            ? {
                passportNumberEncrypted: passportNumber
                  ? encryptSensitiveValue(
                      passportNumber,
                      env.DATA_ENCRYPTION_KEY!,
                      env.DATA_ENCRYPTION_KEY_VERSION,
                    )
                  : null,
                passportKeyVersion: passportNumber ? env.DATA_ENCRYPTION_KEY_VERSION : null,
              }
            : {}),
        }) as Prisma.BookingTravellerUncheckedUpdateInput,
      });
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_TRAVELLER_UPDATED',
          'BookingTraveller',
          travellerId,
          context,
          { bookingId },
        ),
      });
    });
    return (await this.details(auth, bookingId)).travellers.find((row) => row.id === travellerId);
  },

  async deleteTraveller(
    auth: AuthContext,
    bookingId: string,
    travellerId: string,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.travellers.some((row) => row.id === travellerId))
      throw new NotFoundError('Traveller not found.');
    await prisma.$transaction([
      prisma.bookingTraveller.update({
        where: { id: travellerId },
        data: { deletedAt: new Date(), isPrimaryTraveller: false },
      }),
      prisma.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_TRAVELLER_DELETED',
          'BookingTraveller',
          travellerId,
          context,
          { bookingId },
        ),
      }),
    ]);
    return { id: travellerId, deleted: true };
  },

  async services(auth: AuthContext, bookingId: string) {
    return (await this.details(auth, bookingId)).services;
  },

  async createService(
    auth: AuthContext,
    bookingId: string,
    input: BookingServiceInput,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const canManageCosts = await hasPermission(auth, PERMISSIONS.BOOKINGS_MANAGE_COSTS);
    const created = await prisma.$transaction(async (tx) => {
      const service = await tx.bookingService.create({
        data: compact({
          ...input,
          internalCostSnapshot: canManageCosts ? input.internalCostSnapshot : 0,
          companyId: auth.companyId,
          bookingId,
        }) as Prisma.BookingServiceUncheckedCreateInput,
      });
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_SERVICE_CREATED', 'BookingService', service.id, context, {
          bookingId,
          serviceType: input.serviceType,
        }),
      });
      return service;
    });
    return (await this.details(auth, bookingId)).services.find((row) => row.id === created.id);
  },

  async updateService(
    auth: AuthContext,
    bookingId: string,
    serviceId: string,
    input: Partial<BookingServiceInput>,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.services.some((row) => row.id === serviceId))
      throw new NotFoundError('Booking service not found.');
    const canManageCosts = await hasPermission(auth, PERMISSIONS.BOOKINGS_MANAGE_COSTS);
    const data = canManageCosts
      ? input
      : Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'internalCostSnapshot'));
    await prisma.$transaction([
      prisma.bookingService.update({
        where: { id: serviceId },
        data: compact(data) as Prisma.BookingServiceUncheckedUpdateInput,
      }),
      prisma.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_SERVICE_UPDATED', 'BookingService', serviceId, context, {
          bookingId,
        }),
      }),
    ]);
    return (await this.details(auth, bookingId)).services.find((row) => row.id === serviceId);
  },

  async changeServiceStatus(
    auth: AuthContext,
    bookingId: string,
    serviceId: string,
    input: {
      confirmationStatus: ServiceConfirmationStatus;
      confirmationNumber?: string | null;
      supplierReference?: string | null;
    },
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.services.some((row) => row.id === serviceId))
      throw new NotFoundError('Booking service not found.');
    await prisma.$transaction([
      prisma.bookingService.update({ where: { id: serviceId }, data: input }),
      prisma.activityLog.create({
        data: bookingAudit(
          auth,
          input.confirmationStatus === 'CONFIRMED'
            ? 'BOOKING_SERVICE_CONFIRMED'
            : 'BOOKING_SERVICE_UPDATED',
          'BookingService',
          serviceId,
          context,
          { bookingId, confirmationStatus: input.confirmationStatus },
        ),
      }),
    ]);
    return (await this.details(auth, bookingId)).services.find((row) => row.id === serviceId);
  },

  async deleteService(
    auth: AuthContext,
    bookingId: string,
    serviceId: string,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const service = booking.services.find((row) => row.id === serviceId);
    if (!service) throw new NotFoundError('Booking service not found.');
    if (booking.costs.some((row) => row.bookingServiceId === serviceId))
      throw new ConflictError(
        'A service with linked costs cannot be deleted. Archive its costs first.',
      );
    await prisma.$transaction([
      prisma.bookingService.update({ where: { id: serviceId }, data: { deletedAt: new Date() } }),
      prisma.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_SERVICE_UPDATED', 'BookingService', serviceId, context, {
          bookingId,
          deleted: true,
        }),
      }),
    ]);
    return { id: serviceId, deleted: true };
  },

  async itinerary(auth: AuthContext, bookingId: string) {
    return (await this.details(auth, bookingId)).itinerary;
  },

  async createItineraryDay(
    auth: AuthContext,
    bookingId: string,
    input: BookingItineraryInput,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const day = await prisma.$transaction(async (tx) => {
      const created = await tx.bookingItineraryDay.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          bookingId,
        }) as Prisma.BookingItineraryDayUncheckedCreateInput,
      });
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_UPDATED', 'Booking', bookingId, context, {
          itineraryDayId: created.id,
        }),
      });
      return created;
    });
    return day;
  },

  async updateItineraryDay(
    auth: AuthContext,
    bookingId: string,
    dayId: string,
    input: Partial<BookingItineraryInput>,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.itinerary.some((row) => row.id === dayId))
      throw new NotFoundError('Itinerary day not found.');
    const day = await prisma.bookingItineraryDay.update({
      where: { id: dayId },
      data: compact(input) as Prisma.BookingItineraryDayUncheckedUpdateInput,
    });
    await prisma.activityLog.create({
      data: bookingAudit(auth, 'BOOKING_UPDATED', 'Booking', bookingId, context, {
        itineraryDayId: dayId,
      }),
    });
    return day;
  },

  async deleteItineraryDay(
    auth: AuthContext,
    bookingId: string,
    dayId: string,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.itinerary.some((row) => row.id === dayId))
      throw new NotFoundError('Itinerary day not found.');
    await prisma.bookingItineraryDay.delete({ where: { id: dayId } });
    await prisma.activityLog.create({
      data: bookingAudit(auth, 'BOOKING_UPDATED', 'Booking', bookingId, context, {
        itineraryDayId: dayId,
        deleted: true,
      }),
    });
    return { id: dayId, deleted: true };
  },

  async reorderItinerary(
    auth: AuthContext,
    bookingId: string,
    orderedIds: string[],
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (
      orderedIds.length !== booking.itinerary.length ||
      orderedIds.some((id) => !booking.itinerary.some((row) => row.id === id))
    )
      throw new ValidationError('The itinerary order must contain every day exactly once.');
    await prisma.$transaction([
      ...orderedIds.map((id, index) =>
        prisma.bookingItineraryDay.update({ where: { id }, data: { sequence: index + 1001 } }),
      ),
    ]);
    await prisma.$transaction([
      ...orderedIds.map((id, index) =>
        prisma.bookingItineraryDay.update({ where: { id }, data: { sequence: index + 1 } }),
      ),
      prisma.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_UPDATED', 'Booking', bookingId, context, {
          itineraryReordered: true,
        }),
      }),
    ]);
    return this.itinerary(auth, bookingId);
  },

  async paymentSchedules(auth: AuthContext, bookingId: string) {
    return (await this.details(auth, bookingId)).paymentSchedules;
  },

  async createPaymentSchedule(
    auth: AuthContext,
    bookingId: string,
    input: BookingPaymentScheduleInput,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const created = await prisma.$transaction(async (tx) => {
      const schedule = await tx.bookingPaymentSchedule.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          bookingId,
          createdById: auth.userId,
        }) as Prisma.BookingPaymentScheduleUncheckedCreateInput,
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_PAYMENT_SCHEDULE_CREATED',
          'Booking',
          bookingId,
          context,
          { scheduleId: schedule.id, installmentNumber: input.installmentNumber },
        ),
      });
      return schedule;
    });
    return created;
  },

  async updatePaymentSchedule(
    auth: AuthContext,
    bookingId: string,
    scheduleId: string,
    input: Partial<BookingPaymentScheduleInput>,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const schedule = booking.paymentSchedules.find((row) => row.id === scheduleId);
    if (!schedule) throw new NotFoundError('Payment schedule not found.');
    if (
      booking.payments.some((row) => row.paymentScheduleId === scheduleId && !row.reversedAt) &&
      ['amount', 'dueDate', 'installmentNumber'].some((key) => key in input)
    )
      throw new ConflictError(
        'Allocated installments cannot change amount, due date or number. Reverse their payments first.',
      );
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bookingPaymentSchedule.update({
        where: { id: scheduleId },
        data: compact(input) as Prisma.BookingPaymentScheduleUncheckedUpdateInput,
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_PAYMENT_SCHEDULE_UPDATED',
          'Booking',
          bookingId,
          context,
          { scheduleId },
        ),
      });
      return row;
    });
    return updated;
  },

  async deletePaymentSchedule(
    auth: AuthContext,
    bookingId: string,
    scheduleId: string,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.paymentSchedules.some((row) => row.id === scheduleId))
      throw new NotFoundError('Payment schedule not found.');
    if (booking.payments.some((row) => row.paymentScheduleId === scheduleId))
      throw new ConflictError('A schedule with payment history cannot be deleted.');
    await prisma.$transaction(async (tx) => {
      await tx.bookingPaymentSchedule.update({
        where: { id: scheduleId },
        data: { deletedAt: new Date(), status: 'CANCELLED' },
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_PAYMENT_SCHEDULE_UPDATED',
          'Booking',
          bookingId,
          context,
          { scheduleId, deleted: true },
        ),
      });
    });
    return { id: scheduleId, deleted: true };
  },

  async payments(auth: AuthContext, bookingId: string) {
    const booking = await getBooking(auth, bookingId);
    if (!(await financialAccess(auth))) throw new ForbiddenError();
    return presentBooking(booking, true).payments;
  },

  async createPayment(
    auth: AuthContext,
    bookingId: string,
    input: BookingPaymentInput,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (input.currency !== booking.currency)
      throw new ValidationError('Payment currency must match the booking currency.');
    if (
      input.paymentScheduleId &&
      !booking.paymentSchedules.some((row) => row.id === input.paymentScheduleId)
    )
      throw new ValidationError('Payment schedule does not belong to this booking.');
    if (!input.paymentScheduleId && !input.notes?.trim())
      throw new ValidationError('Notes are required for an unallocated payment.');
    const counted = ['RECEIVED', 'CLEARED'].includes(input.paymentStatus);
    if (
      counted &&
      booking.totalCustomerPaid.plus(input.amount).greaterThan(booking.totalSellingAmount)
    )
      throw new ConflictError(
        'Overpayments are not allowed. Adjust the booking total or payment amount.',
      );
    const created = await prisma.$transaction(async (tx) => {
      const paymentNumber = await nextBookingNumber(tx, auth.companyId, 'payment');
      const payment = await tx.bookingPayment.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          bookingId,
          paymentNumber,
          recordedById: auth.userId,
        }) as Prisma.BookingPaymentUncheckedCreateInput,
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_PAYMENT_RECEIVED',
          'BookingPayment',
          payment.id,
          context,
          { bookingId, paymentNumber, scheduleId: input.paymentScheduleId ?? null },
        ),
      });
      return payment;
    });
    return { ...created, amount: decimal(created.amount) };
  },

  async updatePayment(
    auth: AuthContext,
    bookingId: string,
    paymentId: string,
    input: Record<string, unknown>,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const payment = booking.payments.find((row) => row.id === paymentId);
    if (!payment) throw new NotFoundError('Payment not found.');
    if (payment.reversedAt) throw new ConflictError('Reversed payments cannot be edited.');
    if (
      input.paymentScheduleId &&
      !booking.paymentSchedules.some((row) => row.id === input.paymentScheduleId)
    )
      throw new ValidationError('Payment schedule does not belong to this booking.');
    if (input.paymentScheduleId === null && !String(input.notes ?? payment.notes ?? '').trim())
      throw new ValidationError('Notes are required for an unallocated payment.');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bookingPayment.update({ where: { id: paymentId }, data: input });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_UPDATED', 'BookingPayment', paymentId, context, {
          bookingId,
        }),
      });
      return row;
    });
    return { ...updated, amount: decimal(updated.amount) };
  },

  async reversePayment(
    auth: AuthContext,
    bookingId: string,
    paymentId: string,
    reason: string,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    const payment = booking.payments.find((row) => row.id === paymentId);
    if (!payment) throw new NotFoundError('Payment not found.');
    if (payment.reversedAt || payment.paymentStatus === 'REVERSED')
      throw new ConflictError('Payment is already reversed.');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bookingPayment.update({
        where: { id: paymentId },
        data: {
          paymentStatus: 'REVERSED',
          reversedAt: new Date(),
          reversedById: auth.userId,
          reversalReason: reason,
        },
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_PAYMENT_REVERSED', 'BookingPayment', paymentId, context, {
          bookingId,
          paymentNumber: payment.paymentNumber,
        }),
      });
      return row;
    });
    return { ...updated, amount: decimal(updated.amount) };
  },

  async costs(auth: AuthContext, bookingId: string) {
    if (!(await financialAccess(auth))) throw new ForbiddenError();
    return (await this.details(auth, bookingId)).costs;
  },

  async createCost(
    auth: AuthContext,
    bookingId: string,
    input: BookingCostInput,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (input.currency !== booking.currency)
      throw new ValidationError('Cost currency must match the booking currency.');
    if (
      input.bookingServiceId &&
      !booking.services.some((row) => row.id === input.bookingServiceId)
    )
      throw new ValidationError('Booking service does not belong to this booking.');
    const created = await prisma.$transaction(async (tx) => {
      const cost = await tx.bookingCost.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          bookingId,
          recordedById: auth.userId,
        }) as Prisma.BookingCostUncheckedCreateInput,
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_COST_CREATED', 'BookingCost', cost.id, context, {
          bookingId,
          costCategory: input.costCategory,
        }),
      });
      return cost;
    });
    return { ...created, amount: decimal(created.amount) };
  },

  async updateCost(
    auth: AuthContext,
    bookingId: string,
    costId: string,
    input: Partial<BookingCostInput>,
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (!booking.costs.some((row) => row.id === costId))
      throw new NotFoundError('Booking cost not found.');
    if (input.currency && input.currency !== booking.currency)
      throw new ValidationError('Cost currency must match the booking currency.');
    if (
      input.bookingServiceId &&
      !booking.services.some((row) => row.id === input.bookingServiceId)
    )
      throw new ValidationError('Booking service does not belong to this booking.');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bookingCost.update({
        where: { id: costId },
        data: compact(input) as Prisma.BookingCostUncheckedUpdateInput,
      });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          input.costStatus === 'PAID' ? 'BOOKING_COST_PAID' : 'BOOKING_COST_UPDATED',
          'BookingCost',
          costId,
          context,
          { bookingId },
        ),
      });
      return row;
    });
    return { ...updated, amount: decimal(updated.amount) };
  },

  async changeCostStatus(
    auth: AuthContext,
    bookingId: string,
    costId: string,
    input: {
      costStatus: BookingCostStatus;
      paidAt?: Date | null;
      paymentReference?: string | null;
    },
    context: RequestContext,
  ) {
    return this.updateCost(auth, bookingId, costId, input, context);
  },

  async deleteCost(auth: AuthContext, bookingId: string, costId: string, context: RequestContext) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    const cost = booking.costs.find((row) => row.id === costId);
    if (!cost) throw new NotFoundError('Booking cost not found.');
    if (cost.costStatus === 'PAID')
      throw new ConflictError(
        'Paid costs cannot be deleted. Mark a controlled correction instead.',
      );
    await prisma.$transaction(async (tx) => {
      await tx.bookingCost.update({ where: { id: costId }, data: { deletedAt: new Date() } });
      await recalculateBookingFinancials(tx, auth.companyId, bookingId);
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_COST_UPDATED', 'BookingCost', costId, context, {
          bookingId,
          deleted: true,
        }),
      });
    });
    return { id: costId, deleted: true };
  },

  async documents(auth: AuthContext, bookingId: string) {
    return (await this.details(auth, bookingId)).documents;
  },

  async requestDocumentUpload(auth: AuthContext, bookingId: string, input: BookingDocumentUpload) {
    const booking = await getBooking(auth, bookingId);
    await assertOperationallyMutable(booking);
    if (input.fileSize > env.BOOKING_DOCUMENT_MAX_UPLOAD_SIZE_MB * 1024 * 1024)
      throw new ValidationError(
        `Files may not exceed ${env.BOOKING_DOCUMENT_MAX_UPLOAD_SIZE_MB} MB.`,
      );
    if (input.travellerId && !booking.travellers.some((row) => row.id === input.travellerId))
      throw new ValidationError('Traveller does not belong to this booking.');
    if (
      input.bookingServiceId &&
      !booking.services.some((row) => row.id === input.bookingServiceId)
    )
      throw new ValidationError('Service does not belong to this booking.');
    if (input.paymentId && !booking.payments.some((row) => row.id === input.paymentId))
      throw new ValidationError('Payment does not belong to this booking.');
    if (
      ['PASSPORT', 'VISA', 'IDENTITY_DOCUMENT'].includes(input.documentType) &&
      !input.travellerId
    )
      throw new ValidationError('Traveller identity documents must be linked to a traveller.');
    if (input.documentType === 'PAYMENT_RECEIPT' && !input.paymentId)
      throw new ValidationError('Payment receipts must be linked to a payment.');
    const documentId = randomUUID();
    const fileName = sanitizeFileName(input.fileName);
    const objectKey = bookingObjectKey({
      companyId: auth.companyId,
      bookingId,
      documentId,
      fileName,
      ...(input.travellerId === undefined ? {} : { travellerId: input.travellerId }),
      ...(input.bookingServiceId === undefined ? {} : { serviceId: input.bookingServiceId }),
      ...(input.paymentId === undefined ? {} : { paymentId: input.paymentId }),
    });
    const document = await prisma.bookingDocument.create({
      data: {
        id: documentId,
        companyId: auth.companyId,
        bookingId,
        travellerId: input.travellerId ?? null,
        bookingServiceId: input.bookingServiceId ?? null,
        paymentId: input.paymentId ?? null,
        documentType: input.documentType,
        storageProvider: storageService.provider,
        bucket: storageService.bucket,
        objectKey,
        fileName,
        originalFileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        visibility: input.visibility,
        uploadedById: auth.userId,
      },
    });
    return {
      document: {
        id: document.id,
        fileName,
        documentType: document.documentType,
        uploadStatus: document.uploadStatus,
      },
      uploadUrl: await storageService.createUploadUrl(
        objectKey,
        input.mimeType,
        input.fileSize,
        env.BOOKING_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.BOOKING_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },

  async confirmDocumentUpload(
    auth: AuthContext,
    bookingId: string,
    documentId: string,
    context: RequestContext,
  ) {
    await getBooking(auth, bookingId);
    const document = await prisma.bookingDocument.findFirst({
      where: { id: documentId, bookingId, companyId: auth.companyId, deletedAt: null },
    });
    if (!document) throw new NotFoundError('Booking document not found.');
    const metadata = await storageService.headObject(document.objectKey);
    if (
      !metadata ||
      metadata.size !== document.fileSize ||
      metadata.contentType !== document.mimeType
    ) {
      await prisma.bookingDocument.update({
        where: { id: documentId },
        data: { uploadStatus: 'FAILED' },
      });
      throw new ValidationError('The uploaded object metadata does not match the approved file.');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bookingDocument.update({
        where: { id: documentId },
        data: { uploadStatus: 'AVAILABLE', checksum: metadata.checksum ?? null },
      });
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_DOCUMENT_UPLOADED',
          'BookingDocument',
          documentId,
          context,
          { bookingId, documentType: document.documentType },
        ),
      });
      return row;
    });
    const { objectKey: _objectKey, bucket: _bucket, companyId: _companyId, ...safe } = updated;
    return safe;
  },

  async documentDownloadUrl(auth: AuthContext, bookingId: string, documentId: string) {
    await getBooking(auth, bookingId);
    const document = await prisma.bookingDocument.findFirst({
      where: {
        id: documentId,
        bookingId,
        companyId: auth.companyId,
        uploadStatus: 'AVAILABLE',
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundError('Booking document not found.');
    if (
      ['PASSPORT', 'VISA', 'IDENTITY_DOCUMENT'].includes(document.documentType) &&
      !(await hasPermission(auth, PERMISSIONS.BOOKINGS_VIEW_SENSITIVE_DOCUMENTS))
    )
      throw new ForbiddenError('Sensitive traveller documents require explicit access.');
    return {
      url: await storageService.createDownloadUrl(
        document.objectKey,
        document.fileName,
        env.BOOKING_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.BOOKING_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },

  async deleteDocument(
    auth: AuthContext,
    bookingId: string,
    documentId: string,
    context: RequestContext,
  ) {
    await getBooking(auth, bookingId);
    const document = await prisma.bookingDocument.findFirst({
      where: { id: documentId, bookingId, companyId: auth.companyId, deletedAt: null },
    });
    if (!document) throw new NotFoundError('Booking document not found.');
    await storageService.deleteObject(document.objectKey);
    await prisma.$transaction([
      prisma.bookingDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date(), uploadStatus: 'FAILED' },
      }),
      prisma.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_DOCUMENT_DELETED',
          'BookingDocument',
          documentId,
          context,
          { bookingId, documentType: document.documentType },
        ),
      }),
    ]);
    return { id: documentId, deleted: true };
  },

  async notes(auth: AuthContext, bookingId: string) {
    return (await this.details(auth, bookingId)).notes;
  },

  async createNote(
    auth: AuthContext,
    bookingId: string,
    input: BookingNoteInput,
    context: RequestContext,
  ) {
    await getBooking(auth, bookingId);
    if (input.noteType === 'FINANCIAL' && !(await financialAccess(auth)))
      throw new ForbiddenError();
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.bookingNote.create({
        data: { ...input, companyId: auth.companyId, bookingId, authorUserId: auth.userId },
      });
      await tx.activityLog.create({
        data: bookingAudit(auth, 'BOOKING_NOTE_CREATED', 'BookingNote', created.id, context, {
          bookingId,
          noteType: input.noteType,
        }),
      });
      return created;
    });
    return note;
  },

  async updateNote(
    auth: AuthContext,
    bookingId: string,
    noteId: string,
    input: Partial<BookingNoteInput>,
  ) {
    await getBooking(auth, bookingId);
    const note = await prisma.bookingNote.findFirst({
      where: { id: noteId, bookingId, companyId: auth.companyId, deletedAt: null },
      include: { authorUser: { select: userSelect } },
    });
    if (!note) throw new NotFoundError('Booking note not found.');
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { role: { select: { name: true } } },
    });
    if (
      note.authorUserId !== auth.userId &&
      ![ROLE_NAME.OWNER, ROLE_NAME.MANAGER].includes(user.role.name as typeof ROLE_NAME.OWNER)
    )
      throw new ForbiddenError('You may edit only your own notes.');
    if (
      (input.noteType === 'FINANCIAL' || note.noteType === 'FINANCIAL') &&
      !(await financialAccess(auth))
    )
      throw new ForbiddenError();
    return prisma.bookingNote.update({ where: { id: noteId }, data: input });
  },

  async deleteNote(auth: AuthContext, bookingId: string, noteId: string) {
    await getBooking(auth, bookingId);
    const note = await prisma.bookingNote.findFirst({
      where: { id: noteId, bookingId, companyId: auth.companyId, deletedAt: null },
    });
    if (!note) throw new NotFoundError('Booking note not found.');
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { role: { select: { name: true } } },
    });
    if (
      note.authorUserId !== auth.userId &&
      ![ROLE_NAME.OWNER, ROLE_NAME.MANAGER].includes(user.role.name as typeof ROLE_NAME.OWNER)
    )
      throw new ForbiddenError('You may delete only your own notes.');
    await prisma.bookingNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    return { id: noteId, deleted: true };
  },

  async timeline(auth: AuthContext, bookingId: string, query: Record<string, unknown>) {
    const booking = await getBooking(auth, bookingId);
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const where: Prisma.ActivityLogWhereInput = {
      companyId: auth.companyId,
      OR: [
        { entityType: 'Booking', entityId: bookingId },
        { metadata: { path: ['bookingId'], equals: bookingId } },
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { actorUser: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.activityLog.count({ where }),
    ]);
    const canViewFinancials = await financialAccess(auth);
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.action,
        actor: row.actorUser,
        title: row.action
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/^./, (value) => value.toUpperCase()),
        description: row.entityType,
        timestamp: row.createdAt,
        metadata:
          canViewFinancials ||
          ![
            'BOOKING_PAYMENT_RECEIVED',
            'BOOKING_PAYMENT_REVERSED',
            'BOOKING_COST_CREATED',
            'BOOKING_COST_UPDATED',
            'BOOKING_COST_PAID',
          ].includes(row.action)
            ? row.metadata
            : null,
      })),
      pagination: { ...page, total, totalPages: total ? Math.ceil(total / page.pageSize) : 0 },
      bookingNumber: booking.bookingNumber,
    };
  },

  async generateConfirmationPdf(
    auth: AuthContext,
    bookingId: string,
    context: RequestContext,
    force = false,
  ) {
    const booking = await getBooking(auth, bookingId);
    const existing = !force
      ? booking.documents.find(
          (row) => row.documentType === 'BOOKING_CONFIRMATION' && row.uploadStatus === 'AVAILABLE',
        )
      : undefined;
    if (existing && (await storageService.headObject(existing.objectKey))) {
      const { objectKey: _objectKey, bucket: _bucket, companyId: _companyId, ...safe } = existing;
      return { ...safe, reused: true };
    }
    if (existing)
      await prisma.bookingDocument.update({
        where: { id: existing.id },
        data: { uploadStatus: 'FAILED' },
      });
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: {
        name: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        primaryColor: true,
      },
    });
    const pdf = await renderBookingConfirmationPdf({ company, booking });
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const documentId = randomUUID();
    const fileName = sanitizeFileName(`${booking.bookingNumber}-confirmation.pdf`);
    const objectKey = bookingObjectKey({
      companyId: auth.companyId,
      bookingId,
      documentId,
      fileName,
    });
    await storageService.putObject({
      key: objectKey,
      body: pdf,
      contentType: 'application/pdf',
      checksum,
    });
    const document = await prisma.$transaction(async (tx) => {
      const row = await tx.bookingDocument.create({
        data: {
          id: documentId,
          companyId: auth.companyId,
          bookingId,
          documentType: 'BOOKING_CONFIRMATION',
          storageProvider: storageService.provider,
          bucket: storageService.bucket,
          objectKey,
          fileName,
          originalFileName: fileName,
          mimeType: 'application/pdf',
          fileSize: pdf.length,
          checksum,
          uploadStatus: 'AVAILABLE',
          visibility: 'CUSTOMER_VISIBLE',
          uploadedById: auth.userId,
        },
      });
      await tx.activityLog.create({
        data: bookingAudit(
          auth,
          'BOOKING_CONFIRMATION_GENERATED',
          'BookingDocument',
          documentId,
          context,
          { bookingId },
        ),
      });
      return row;
    });
    const { objectKey: _objectKey, bucket: _bucket, companyId: _companyId, ...safe } = document;
    return { ...safe, reused: false };
  },

  async sendEmail(
    auth: AuthContext,
    bookingId: string,
    input: BookingEmailInput,
    emailType: 'CONFIRMATION' | 'PAYMENT_REMINDER',
    context: RequestContext,
  ) {
    const booking = await getBooking(auth, bookingId);
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { name: true, email: true, phone: true },
    });
    const subject =
      input.subject ??
      (emailType === 'CONFIRMATION'
        ? `Booking confirmation ${booking.bookingNumber}`
        : `Payment reminder ${booking.bookingNumber}`);
    const body =
      input.message ??
      (emailType === 'CONFIRMATION'
        ? `Your booking ${booking.bookingNumber} for ${booking.destinationSummary} is being processed. Travel dates: ${booking.travelStartDate?.toISOString().slice(0, 10) ?? 'to be confirmed'} to ${booking.travelEndDate?.toISOString().slice(0, 10) ?? 'to be confirmed'}.`
        : `This is a reminder that ${booking.currency} ${booking.totalCustomerOutstanding.toFixed(2)} remains outstanding for booking ${booking.bookingNumber}.`);
    const log = await prisma.bookingEmailLog.create({
      data: {
        companyId: auth.companyId,
        bookingId,
        emailType,
        recipientEmail: input.recipientEmail,
        subject,
        sentById: auth.userId,
      },
    });
    try {
      await emailService.sendMessage({
        to: input.recipientEmail,
        subject,
        text: `${body}\n\n${company.name} • ${company.phone ?? company.email}`,
        html: `<p>${body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p><p>${company.name} • ${company.phone ?? company.email}</p>`,
      });
      await prisma.$transaction([
        prisma.bookingEmailLog.update({
          where: { id: log.id },
          data: { status: 'SENT', sentAt: new Date() },
        }),
        prisma.activityLog.create({
          data: bookingAudit(
            auth,
            emailType === 'CONFIRMATION'
              ? 'BOOKING_CONFIRMATION_SENT'
              : 'BOOKING_PAYMENT_REMINDER_SENT',
            'Booking',
            bookingId,
            context,
            { emailLogId: log.id, recipientEmail: input.recipientEmail },
          ),
        }),
      ]);
    } catch (error) {
      await prisma.bookingEmailLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          failureReason:
            error instanceof Error ? error.message.slice(0, 2000) : 'Email delivery failed.',
        },
      });
      throw new ServiceUnavailableError('Email delivery failed. The attempt was logged.');
    }
    return prisma.bookingEmailLog.findUniqueOrThrow({
      where: { id: log.id },
      include: { sentBy: { select: userSelect } },
    });
  },

  async emailHistory(auth: AuthContext, bookingId: string) {
    await getBooking(auth, bookingId);
    return prisma.bookingEmailLog.findMany({
      where: { companyId: auth.companyId, bookingId },
      include: { sentBy: { select: userSelect } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
