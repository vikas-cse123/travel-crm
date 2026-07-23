import { Prisma } from '@prisma/client';
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TYPES,
  PERMISSIONS,
  REPORT_EXPORT_ROW_LIMIT,
  labelForLookup,
  type ReportBookingsQuery,
  type ReportClientPaymentsQuery,
  type ReportLeadsQuery,
  type ReportPeriodQuery,
  type ReportQuotationsQuery,
  type ReportStaffQuery,
  type ReportVendorPayablesQuery,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ForbiddenError } from '../../utils/errors.js';
import { localDayBounds } from '../../utils/timezone.js';
import { buildCsv, csvDate, csvDateTime, csvFileName } from '../../utils/csv.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  visibility as queryVisibility,
  visibleWhere as queryVisibleWhere,
} from '../queries/queries.service.js';
import { bookingVisibleWhere } from '../bookings/bookings.service.js';
import { dashboardService } from '../dashboard/dashboard.service.js';
import {
  createdAtFilter,
  resolvePeriod,
  type ResolvedPeriod,
} from '../dashboard/dashboard.period.js';

/**
 * Reports service (Phase 19).
 *
 * Every report reuses the Dashboard period resolver, the module visibility
 * helpers (`queryVisibleWhere` / `bookingVisibleWhere`) and — where the metric
 * already exists — the Dashboard aggregate methods themselves, so Reports and
 * Dashboard can never drift apart. Nothing here recalculates booking financials;
 * the stored rollups are read as-is.
 *
 * Period semantics:
 *   - Creation-based reports (leads, quotations, bookings, staff, sources,
 *     destinations) apply the period to `createdAt`.
 *   - Due-date reports (client payments, vendor payables) apply the period to
 *     `dueDate`, because the meaningful question there is what falls due in the
 *     window rather than what was created in it.
 */

const money = (value: Prisma.Decimal | null | undefined) => value?.toFixed(2) ?? '0.00';
const percent = (numerator: number, denominator: number) =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
const countAll = (value: unknown): number =>
  value && typeof value === 'object' && '_all' in value
    ? Number((value as { _all: number })._all)
    : 0;

const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

async function companyTimezone(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { timezone: true },
  });
  return company.timezone;
}

/** Which report sections the caller may see. Sections are omitted, never zero-filled. */
async function resolveCapabilities(auth: AuthContext) {
  const [leads, quotations, bookings, financials, vendors, vendorFinancials, customers] =
    await Promise.all([
      has(auth, PERMISSIONS.QUERIES_VIEW),
      has(auth, PERMISSIONS.QUOTATIONS_VIEW),
      has(auth, PERMISSIONS.BOOKINGS_VIEW),
      has(auth, PERMISSIONS.BOOKINGS_VIEW_FINANCIALS),
      has(auth, PERMISSIONS.VENDORS_VIEW),
      has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS),
      has(auth, PERMISSIONS.CUSTOMERS_VIEW),
    ]);
  return {
    canViewLeads: leads,
    canViewQuotations: quotations,
    canViewBookings: bookings,
    canViewFinancials: bookings && financials,
    canViewVendors: vendors,
    canViewVendorFinancials: vendors && vendorFinancials,
    canViewCustomers: customers,
    // Receivables are booking money: both booking view and booking financials.
    canViewClientPayments: bookings && financials,
    canViewVendorPayables: vendors && vendorFinancials,
  };
}

async function resolveContext(auth: AuthContext, input: ReportPeriodQuery) {
  const timezone = await companyTimezone(auth.companyId);
  const period = resolvePeriod(input.period, timezone, input.from, input.to);
  return { timezone, period, caps: await resolveCapabilities(auth) };
}

const periodPayload = (period: ResolvedPeriod) => ({
  key: period.key,
  from: period.from?.toISOString() ?? null,
  to: period.to?.toISOString() ?? null,
  timezone: period.timezone,
});

/** Due-date window for the resolved period; `{}` for ALL_TIME. */
function dueDateFilter(period: ResolvedPeriod): { dueDate?: { gte: Date; lt: Date } } {
  if (!period.from || !period.to) return {};
  return { dueDate: { gte: period.from, lt: period.to } };
}

const pageMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total ? Math.ceil(total / pageSize) : 0,
});

/** One lookup for display names — never a per-row query. */
async function nameMap(companyId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, companyId },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((user) => [user.id, user.fullName]));
}

/** Quotation scope: company + soft-delete + the caller's lead visibility. */
async function quotationWhere(auth: AuthContext, extra: Prisma.QuotationWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    query: {
      is: { companyId: auth.companyId, deletedAt: null, ...(await queryVisibility(auth)) },
    },
    ...extra,
  } satisfies Prisma.QuotationWhereInput;
}

// ---------------------------------------------------------------------------
// Receivables / payables shared aggregates
// ---------------------------------------------------------------------------

/**
 * Scheduled vs allocated totals for a set of payment schedules. Uses two
 * relation-filtered SQL aggregates rather than walking payment history.
 */
async function scheduleTotals(auth: AuthContext, where: Prisma.BookingPaymentScheduleWhereInput) {
  const [scheduled, paid] = await Promise.all([
    prisma.bookingPaymentSchedule.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.bookingPayment.aggregate({
      where: {
        companyId: auth.companyId,
        paymentStatus: 'RECEIVED',
        reversedAt: null,
        paymentSchedule: { is: where },
      },
      _sum: { amount: true },
    }),
  ]);
  const scheduledAmount = scheduled._sum.amount ?? new Prisma.Decimal(0);
  const paidAmount = paid._sum.amount ?? new Prisma.Decimal(0);
  const outstanding = scheduledAmount.minus(paidAmount);
  return {
    count: countAll(scheduled._count),
    scheduled: scheduledAmount,
    paid: paidAmount,
    outstanding: outstanding.isNegative() ? new Prisma.Decimal(0) : outstanding,
  };
}

/** Payments allocated per schedule id, for the current page only. */
async function paidBySchedule(auth: AuthContext, scheduleIds: string[]) {
  if (!scheduleIds.length) return new Map<string, Prisma.Decimal>();
  const grouped = await prisma.bookingPayment.groupBy({
    by: ['paymentScheduleId'],
    where: {
      companyId: auth.companyId,
      paymentStatus: 'RECEIVED',
      reversedAt: null,
      paymentScheduleId: { in: scheduleIds },
    },
    _sum: { amount: true },
  });
  return new Map(
    grouped
      .filter((row): row is typeof row & { paymentScheduleId: string } =>
        Boolean(row.paymentScheduleId),
      )
      .map((row) => [row.paymentScheduleId, row._sum.amount ?? new Prisma.Decimal(0)]),
  );
}

/** Build the client payment-schedule filter shared by the report and its CSV. */
async function clientPaymentWhere(
  auth: AuthContext,
  period: ResolvedPeriod,
  input: ReportClientPaymentsQuery,
  dayStart: Date,
): Promise<Prisma.BookingPaymentScheduleWhereInput> {
  const bookingExtra: Prisma.BookingWhereInput = {
    ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
    ...(input.search
      ? {
          OR: [
            { bookingNumber: { contains: input.search, mode: 'insensitive' as const } },
            { customerName: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const amountFilter =
    input.minAmount !== undefined || input.maxAmount !== undefined
      ? {
          amount: {
            ...(input.minAmount !== undefined ? { gte: input.minAmount } : {}),
            ...(input.maxAmount !== undefined ? { lte: input.maxAmount } : {}),
          },
        }
      : {};
  return {
    companyId: auth.companyId,
    deletedAt: null,
    status: { in: input.status ? [input.status] : ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
    booking: { is: await bookingVisibleWhere(auth, bookingExtra) },
    ...dueDateFilter(period),
    ...(input.overdueOnly ? { dueDate: { lt: dayStart } } : {}),
    ...amountFilter,
  };
}

/** Build the vendor-payable filter shared by the report and its CSV. */
async function vendorPayableWhere(
  auth: AuthContext,
  period: ResolvedPeriod,
  input: ReportVendorPayablesQuery,
  dayStart: Date,
): Promise<Prisma.VendorPayableWhereInput> {
  const outstandingFilter =
    input.minOutstanding !== undefined || input.maxOutstanding !== undefined
      ? {
          outstandingAmount: {
            ...(input.minOutstanding !== undefined ? { gte: input.minOutstanding } : {}),
            ...(input.maxOutstanding !== undefined ? { lte: input.maxOutstanding } : {}),
          },
        }
      : {};
  return {
    companyId: auth.companyId,
    deletedAt: null,
    paymentStatus: { in: input.status ? [input.status] : ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] },
    // A payable always belongs to a booking, so booking visibility applies.
    booking: { is: await bookingVisibleWhere(auth) },
    ...(input.vendorId ? { vendorId: input.vendorId } : {}),
    ...dueDateFilter(period),
    ...(input.overdueOnly ? { dueDate: { lt: dayStart } } : {}),
    ...(input.search
      ? {
          OR: [
            { payableNumber: { contains: input.search, mode: 'insensitive' as const } },
            { supplierInvoiceNumber: { contains: input.search, mode: 'insensitive' as const } },
            { vendor: { is: { name: { contains: input.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
    ...outstandingFilter,
  };
}

// ---------------------------------------------------------------------------
// Row selects
// ---------------------------------------------------------------------------

const clientPaymentSelect = {
  id: true,
  installmentNumber: true,
  label: true,
  amount: true,
  dueDate: true,
  status: true,
  booking: {
    select: {
      id: true,
      bookingNumber: true,
      customerName: true,
      assignedTo: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.BookingPaymentScheduleSelect;

const vendorPayableSelect = {
  id: true,
  payableNumber: true,
  supplierInvoiceNumber: true,
  originalAmount: true,
  paidAmount: true,
  outstandingAmount: true,
  dueDate: true,
  paymentStatus: true,
  createdAt: true,
  vendor: { select: { id: true, name: true } },
  booking: { select: { id: true, bookingNumber: true } },
} satisfies Prisma.VendorPayableSelect;

const bookingRowSelect = {
  id: true,
  bookingNumber: true,
  customerName: true,
  destinationSummary: true,
  travelStartDate: true,
  travelEndDate: true,
  bookingStatus: true,
  operationalStatus: true,
  paymentStatus: true,
  totalSellingAmount: true,
  gstAmount: true,
  tcsAmount: true,
  totalPayable: true,
  totalCustomerPaid: true,
  totalCustomerOutstanding: true,
  totalRefunded: true,
  netRevenue: true,
  totalCost: true,
  totalVendorOutstanding: true,
  grossProfit: true,
  netProfit: true,
  createdAt: true,
  bookedBy: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
} satisfies Prisma.BookingSelect;

const quotationRowSelect = {
  id: true,
  quotationNumber: true,
  status: true,
  customerName: true,
  destinationSummary: true,
  currency: true,
  firstSentAt: true,
  acceptedAt: true,
  createdAt: true,
  currentVersionId: true,
  query: { select: { id: true, queryNumber: true } },
  createdBy: { select: { id: true, fullName: true } },
  booking: { select: { id: true, bookingNumber: true } },
} satisfies Prisma.QuotationSelect;

/** Current-version amounts for a page of quotations, in one query. */
async function versionAmounts(ids: string[]) {
  const clean = ids.filter(Boolean);
  if (!clean.length)
    return new Map<string, { versionNumber: number; finalAmount: Prisma.Decimal }>();
  const versions = await prisma.quotationVersion.findMany({
    where: { id: { in: clean } },
    select: { id: true, versionNumber: true, finalAmount: true },
  });
  return new Map(
    versions.map((v) => [v.id, { versionNumber: v.versionNumber, finalAmount: v.finalAmount }]),
  );
}

const presentQuotationRow = (
  row: Prisma.QuotationGetPayload<{ select: typeof quotationRowSelect }>,
  amounts: Map<string, { versionNumber: number; finalAmount: Prisma.Decimal }>,
) => {
  const version = row.currentVersionId ? amounts.get(row.currentVersionId) : undefined;
  return {
    quotationId: row.id,
    quotationNumber: row.quotationNumber,
    leadNumber: row.query?.queryNumber ?? null,
    customerName: row.customerName,
    destination: row.destinationSummary,
    status: row.status,
    currentVersion: version?.versionNumber ?? null,
    currency: row.currency,
    currentAmount: version ? money(version.finalAmount) : null,
    sentAt: row.firstSentAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdBy: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    bookingNumber: row.booking?.bookingNumber ?? null,
  };
};

const presentBookingRow = (
  row: Prisma.BookingGetPayload<{ select: typeof bookingRowSelect }>,
  withFinancials: boolean,
) => {
  const operational = {
    bookingId: row.id,
    bookingNumber: row.bookingNumber,
    customerName: row.customerName,
    destination: row.destinationSummary,
    travelStartDate: row.travelStartDate?.toISOString() ?? null,
    travelEndDate: row.travelEndDate?.toISOString() ?? null,
    bookingStatus: row.bookingStatus,
    operationalStatus: row.operationalStatus,
    paymentStatus: row.paymentStatus,
    bookedBy: row.bookedBy?.fullName ?? null,
    assignedTo: row.assignedTo?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
  if (!withFinancials) return operational;
  const payable = row.totalPayable ?? new Prisma.Decimal(0);
  const gross = row.grossProfit ?? new Prisma.Decimal(0);
  return {
    ...operational,
    customerAmount: money(row.totalSellingAmount),
    gstAmount: money(row.gstAmount),
    tcsAmount: money(row.tcsAmount),
    totalPayable: money(row.totalPayable),
    paidAmount: money(row.totalCustomerPaid),
    outstandingAmount: money(row.totalCustomerOutstanding),
    refundedAmount: money(row.totalRefunded),
    netRevenue: money(row.netRevenue),
    totalCost: money(row.totalCost),
    vendorOutstanding: money(row.totalVendorOutstanding),
    grossProfit: money(row.grossProfit),
    netProfit: money(row.netProfit),
    marginPercentage: payable.isZero() ? '0.0000' : gross.dividedBy(payable).times(100).toFixed(4),
  };
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const reportsService = {
  /** Compact period totals for the Overview tab. Unauthorised blocks are omitted. */
  async summary(auth: AuthContext, input: ReportPeriodQuery) {
    const { period, caps, timezone } = await resolveContext(auth, input);
    const dateFilter = createdAtFilter(period);
    const { start: dayStart } = localDayBounds(timezone);
    const result: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };

    if (caps.canViewLeads) {
      const leads = await dashboardService.leadMetrics(auth, dateFilter);
      result.leads = {
        total: leads.totalLeads,
        converted: leads.convertedLeads,
        lost: leads.lostLeads,
        hot: leads.hotLeads,
        conversionRate: leads.conversionRate,
        winRate: leads.winRate,
      };
    }
    if (caps.canViewQuotations) {
      const quotations = await dashboardService.quotationMetrics(auth, dateFilter);
      result.quotations = {
        total: quotations.totalQuotations,
        accepted: quotations.acceptedQuotations,
        rejected: quotations.rejectedQuotations,
        totalQuotedValue: quotations.totalQuotedValue,
        acceptanceRate: quotations.quotationAcceptanceRate,
      };
    }
    if (caps.canViewBookings) {
      const bookings = await dashboardService.bookingMetrics(
        auth,
        dateFilter,
        caps.canViewFinancials,
      );
      result.bookings = {
        total: bookings.operational.totalBookings,
        confirmed: bookings.operational.confirmedBookings,
        completed: bookings.operational.completed,
        cancelled: bookings.operational.cancelled,
      };
      if (bookings.financial)
        result.financials = {
          customerAmount: bookings.financial.totalCustomerAmount,
          totalPayable: bookings.financial.totalPayable,
          paymentsReceived: bookings.financial.customerPaymentsReceived,
          customerOutstanding: bookings.financial.customerOutstanding,
          refunds: bookings.financial.totalRefunded,
          netRevenue: bookings.financial.netRevenue,
          totalCost: bookings.financial.totalCost,
          grossProfit: bookings.financial.grossProfit,
          netProfit: bookings.financial.netProfit,
          margin: bookings.financial.profitMarginPercentage,
        };
    }
    if (caps.canViewClientPayments) {
      const bookingWhere = await bookingVisibleWhere(auth);
      const base: Prisma.BookingPaymentScheduleWhereInput = {
        companyId: auth.companyId,
        deletedAt: null,
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        booking: { is: bookingWhere },
      };
      const [overdue, dueInPeriod] = await Promise.all([
        scheduleTotals(auth, { ...base, dueDate: { lt: dayStart } }),
        scheduleTotals(auth, { ...base, ...dueDateFilter(period) }),
      ]);
      result.receivables = {
        overdueCount: overdue.count,
        overdueAmount: money(overdue.outstanding),
        dueInPeriodCount: dueInPeriod.count,
        dueInPeriodAmount: money(dueInPeriod.outstanding),
      };
    }
    if (caps.canViewVendorPayables) {
      const base: Prisma.VendorPayableWhereInput = {
        companyId: auth.companyId,
        deletedAt: null,
        paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] },
        booking: { is: await bookingVisibleWhere(auth) },
      };
      const [overdue, dueInPeriod] = await Promise.all([
        prisma.vendorPayable.aggregate({
          where: { ...base, dueDate: { lt: dayStart } },
          _sum: { outstandingAmount: true },
          _count: { _all: true },
        }),
        prisma.vendorPayable.aggregate({
          where: { ...base, ...dueDateFilter(period) },
          _sum: { outstandingAmount: true },
          _count: { _all: true },
        }),
      ]);
      result.vendorPayables = {
        overdueCount: countAll(overdue._count),
        overdueAmount: money(overdue._sum.outstandingAmount),
        dueInPeriodCount: countAll(dueInPeriod._count),
        dueInPeriodAmount: money(dueInPeriod._sum.outstandingAmount),
      };
    }
    return result;
  },

  /**
   * Lead performance. Deliberately has no CSV of its own — the existing filtered
   * `/queries/export` remains the single lead export.
   */
  async leads(auth: AuthContext, input: ReportLeadsQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewLeads) return base;
    const dateFilter = createdAtFilter(period);
    const where = await queryVisibleWhere(auth, dateFilter);

    const [summary, byStageRows, byTypeRows, bySource, byDestination, assigneeRows] =
      await Promise.all([
        dashboardService.leadMetrics(auth, dateFilter),
        prisma.query.groupBy({ by: ['leadStage'], where, _count: { _all: true } }),
        prisma.query.groupBy({ by: ['leadType'], where, _count: { _all: true } }),
        leadSourceRows(auth, period),
        destinationRows(auth, period),
        prisma.query.groupBy({
          by: ['assignedToId'],
          where: { ...where, assignedToId: { not: null } },
          _count: { _all: true },
        }),
      ]);

    const stageCounts = new Map(byStageRows.map((r) => [r.leadStage, countAll(r._count)]));
    const typeCounts = new Map(byTypeRows.map((r) => [r.leadType, countAll(r._count)]));
    const names = await nameMap(
      auth.companyId,
      assigneeRows.map((r) => r.assignedToId).filter((id): id is string => Boolean(id)),
    );

    return {
      ...base,
      summary: {
        totalLeads: summary.totalLeads,
        convertedLeads: summary.convertedLeads,
        lostLeads: summary.lostLeads,
        hotLeads: summary.hotLeads,
        qualifiedLeads: summary.qualifiedLeads,
        quotationRequired: summary.quotationRequired,
        readyToBook: summary.readyToBook,
        conversionRate: summary.conversionRate,
        winRate: summary.winRate,
      },
      byStage: LEAD_STAGES.map((stage) => ({
        stage,
        label: labelForLookup(stage),
        count: stageCounts.get(stage) ?? 0,
      })).filter((row) => row.count > 0),
      byType: LEAD_TYPES.map((type) => ({
        type,
        label: labelForLookup(type),
        count: typeCounts.get(type) ?? 0,
      })).filter((row) => row.count > 0),
      bySource: bySource.rows,
      byDestination: byDestination.rows,
      byAssignee: assigneeRows
        .map((row) => ({
          userId: row.assignedToId!,
          displayName: names.get(row.assignedToId!) ?? 'Unknown',
          totalLeads: countAll(row._count),
        }))
        .sort((a, b) => b.totalLeads - a.totalLeads),
    };
  },

  async quotations(auth: AuthContext, input: ReportQuotationsQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewQuotations) return base;
    const where = await quotationWhere(auth, {
      ...createdAtFilter(period),
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { quotationNumber: { contains: input.search, mode: 'insensitive' as const } },
              { customerName: { contains: input.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    });

    const [grouped, total, rows, acceptedValue] = await Promise.all([
      prisma.quotation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        select: quotationRowSelect,
        orderBy: { [input.sortBy]: input.sortDir },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.quotedValue(where, 'ACCEPTED'),
    ]);
    const totalQuoted = await this.quotedValue(where);
    const byStatus = Object.fromEntries(grouped.map((r) => [r.status, countAll(r._count)]));
    const accepted = byStatus.ACCEPTED ?? 0;
    const rejected = byStatus.REJECTED ?? 0;
    const amounts = await versionAmounts(rows.map((r) => r.currentVersionId ?? ''));

    return {
      ...base,
      summary: {
        totalQuotations: total,
        draft: byStatus.DRAFT ?? 0,
        sent: (byStatus.SENT ?? 0) + (byStatus.VIEWED ?? 0),
        accepted,
        rejected,
        expired: byStatus.EXPIRED ?? 0,
        totalQuotedValue: money(totalQuoted),
        acceptedValue: money(acceptedValue),
        acceptanceRate: percent(accepted, accepted + rejected),
      },
      rows: rows.map((row) => presentQuotationRow(row, amounts)),
      pagination: pageMeta(input.page, input.pageSize, total),
    };
  },

  /** Sum of current-version final amounts for a quotation scope. */
  async quotedValue(where: Prisma.QuotationWhereInput, status?: 'ACCEPTED') {
    const scoped = status ? { ...where, status } : where;
    const versions = await prisma.quotation.findMany({
      where: { ...scoped, currentVersionId: { not: null } },
      select: { currentVersionId: true },
    });
    const ids = versions.map((v) => v.currentVersionId).filter((id): id is string => Boolean(id));
    if (!ids.length) return new Prisma.Decimal(0);
    const agg = await prisma.quotationVersion.aggregate({
      where: { id: { in: ids } },
      _sum: { finalAmount: true },
    });
    return agg._sum.finalAmount ?? new Prisma.Decimal(0);
  },

  async bookings(auth: AuthContext, input: ReportBookingsQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewBookings) return base;
    const where = await bookingVisibleWhere(auth, {
      ...createdAtFilter(period),
      ...(input.bookingStatus ? { bookingStatus: input.bookingStatus } : {}),
      ...(input.search
        ? {
            OR: [
              { bookingNumber: { contains: input.search, mode: 'insensitive' as const } },
              { customerName: { contains: input.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    });
    const [metrics, total, rows] = await Promise.all([
      dashboardService.bookingMetrics(auth, createdAtFilter(period), caps.canViewFinancials),
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        select: bookingRowSelect,
        orderBy: { [input.sortBy]: input.sortDir },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return {
      ...base,
      summary: metrics.operational,
      ...(metrics.financial ? { financialSummary: metrics.financial } : {}),
      includesFinancials: caps.canViewFinancials,
      rows: rows.map((row) => presentBookingRow(row, caps.canViewFinancials)),
      pagination: pageMeta(input.page, input.pageSize, total),
    };
  },

  async clientPayments(auth: AuthContext, input: ReportClientPaymentsQuery) {
    const { period, caps, timezone } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewClientPayments) return base;
    const { start: dayStart } = localDayBounds(timezone);
    const where = await clientPaymentWhere(auth, period, input, dayStart);
    const [totals, overdue, total, rows] = await Promise.all([
      scheduleTotals(auth, where),
      scheduleTotals(auth, { ...where, dueDate: { lt: dayStart } }),
      prisma.bookingPaymentSchedule.count({ where }),
      prisma.bookingPaymentSchedule.findMany({
        where,
        select: clientPaymentSelect,
        orderBy: { [input.sortBy]: input.sortDir },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    const paid = await paidBySchedule(
      auth,
      rows.map((r) => r.id),
    );
    return {
      ...base,
      summary: {
        totalSchedules: total,
        totalScheduledAmount: money(totals.scheduled),
        totalPaidAmount: money(totals.paid),
        totalOutstandingAmount: money(totals.outstanding),
        overdueCount: overdue.count,
        overdueAmount: money(overdue.outstanding),
      },
      rows: rows.map((row) => {
        const allocated = paid.get(row.id) ?? new Prisma.Decimal(0);
        const outstanding = row.amount.minus(allocated);
        return {
          scheduleId: row.id,
          bookingId: row.booking.id,
          bookingNumber: row.booking.bookingNumber,
          customerName: row.booking.customerName,
          installmentNumber: row.installmentNumber,
          label: row.label,
          dueDate: row.dueDate.toISOString(),
          amount: money(row.amount),
          paidAmount: money(allocated),
          outstandingAmount: money(outstanding.isNegative() ? new Prisma.Decimal(0) : outstanding),
          status: row.status,
          overdue: row.dueDate < dayStart,
          assignedTo: row.booking.assignedTo?.fullName ?? null,
        };
      }),
      pagination: pageMeta(input.page, input.pageSize, total),
    };
  },

  async vendorPayables(auth: AuthContext, input: ReportVendorPayablesQuery) {
    const { period, caps, timezone } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewVendorPayables) return base;
    const { start: dayStart } = localDayBounds(timezone);
    const where = await vendorPayableWhere(auth, period, input, dayStart);
    const [totals, overdue, total, rows] = await Promise.all([
      prisma.vendorPayable.aggregate({
        where,
        _sum: { originalAmount: true, paidAmount: true, outstandingAmount: true },
        _count: { _all: true },
      }),
      prisma.vendorPayable.aggregate({
        where: { ...where, dueDate: { lt: dayStart } },
        _sum: { outstandingAmount: true },
        _count: { _all: true },
      }),
      prisma.vendorPayable.count({ where }),
      prisma.vendorPayable.findMany({
        where,
        select: vendorPayableSelect,
        orderBy: { [input.sortBy]: input.sortDir },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return {
      ...base,
      summary: {
        totalPayables: total,
        originalAmount: money(totals._sum.originalAmount),
        paidAmount: money(totals._sum.paidAmount),
        outstandingAmount: money(totals._sum.outstandingAmount),
        overdueCount: countAll(overdue._count),
        overdueAmount: money(overdue._sum.outstandingAmount),
      },
      rows: rows.map((row) => ({
        payableId: row.id,
        payableNumber: row.payableNumber,
        vendorId: row.vendor.id,
        vendorName: row.vendor.name,
        bookingId: row.booking.id,
        bookingNumber: row.booking.bookingNumber,
        supplierInvoiceNumber: row.supplierInvoiceNumber,
        dueDate: row.dueDate?.toISOString() ?? null,
        originalAmount: money(row.originalAmount),
        paidAmount: money(row.paidAmount),
        outstandingAmount: money(row.outstandingAmount),
        paymentStatus: row.paymentStatus,
        overdue: row.dueDate ? row.dueDate < dayStart : false,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: pageMeta(input.page, input.pageSize, total),
    };
  },

  /** Lead conversion league — attribution stays on Query.assignedToId. */
  async staffConversions(auth: AuthContext, input: ReportStaffQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewLeads) return base;
    const rows = await dashboardService.staffConversions(
      auth,
      createdAtFilter(period),
      input.limit ?? 10,
    );
    return {
      ...base,
      rows: rows.map((row) => ({
        ...row,
        winRate: percent(row.convertedLeads, row.convertedLeads + row.lostLeads),
      })),
    };
  },

  /** Revenue/profit league — attribution stays on Booking.bookedById. */
  async staffFinancials(auth: AuthContext, input: ReportStaffQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewFinancials) return base;
    return {
      ...base,
      rows: await dashboardService.staffFinancials(
        auth,
        createdAtFilter(period),
        input.limit ?? 10,
      ),
    };
  },

  async leadSources(auth: AuthContext, input: ReportPeriodQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewLeads) return { ...base, totalLeads: 0, rows: [] };
    return { ...base, ...(await leadSourceRows(auth, period)) };
  },

  async destinations(auth: AuthContext, input: ReportPeriodQuery) {
    const { period, caps } = await resolveContext(auth, input);
    const base: Record<string, unknown> = { period: periodPayload(period), capabilities: caps };
    if (!caps.canViewLeads) return { ...base, totalEnquiries: 0, rows: [] };
    return { ...base, ...(await destinationRows(auth, period)) };
  },

  // -------------------------------------------------------------------------
  // CSV exports
  // -------------------------------------------------------------------------

  async quotationsCsv(auth: AuthContext, input: ReportQuotationsQuery) {
    const { period, caps } = await resolveContext(auth, input);
    if (!caps.canViewQuotations) throw new ForbiddenError('Quotation access is required.');
    const where = await quotationWhere(auth, {
      ...createdAtFilter(period),
      ...(input.status ? { status: input.status } : {}),
    });
    const rows = await prisma.quotation.findMany({
      where,
      select: quotationRowSelect,
      orderBy: { createdAt: 'desc' },
      take: REPORT_EXPORT_ROW_LIMIT + 1,
    });
    const amounts = await versionAmounts(rows.map((r) => r.currentVersionId ?? ''));
    const csv = buildCsv(
      [
        'Quotation Number',
        'Lead Number',
        'Customer',
        'Destination',
        'Status',
        'Current Version',
        'Currency',
        'Current Amount',
        'Sent At',
        'Accepted At',
        'Created By',
        'Created At',
        'Linked Booking Number',
      ],
      rows.map((row) => {
        const presented = presentQuotationRow(row, amounts);
        return [
          presented.quotationNumber,
          presented.leadNumber ?? '',
          presented.customerName,
          presented.destination,
          presented.status,
          presented.currentVersion ?? '',
          presented.currency,
          presented.currentAmount ?? '',
          csvDateTime(presented.sentAt),
          csvDateTime(presented.acceptedAt),
          presented.createdBy ?? '',
          csvDateTime(presented.createdAt),
          presented.bookingNumber ?? '',
        ];
      }),
      { rowLimit: REPORT_EXPORT_ROW_LIMIT },
    );
    return { fileName: csvFileName('quotations-report'), mimeType: 'text/csv' as const, ...csv };
  },

  async bookingsCsv(auth: AuthContext, input: ReportBookingsQuery) {
    const { period, caps } = await resolveContext(auth, input);
    if (!caps.canViewBookings) throw new ForbiddenError('Booking access is required.');
    const where = await bookingVisibleWhere(auth, {
      ...createdAtFilter(period),
      ...(input.bookingStatus ? { bookingStatus: input.bookingStatus } : {}),
    });
    const rows = await prisma.booking.findMany({
      where,
      select: bookingRowSelect,
      orderBy: { createdAt: 'desc' },
      take: REPORT_EXPORT_ROW_LIMIT + 1,
    });
    // Header and cells are built together so a redacted export never emits
    // blank financial columns — the columns simply do not exist.
    const operationalHeaders = [
      'Booking Number',
      'Customer',
      'Destination',
      'Travel Start',
      'Travel End',
      'Booking Status',
      'Operational Status',
      'Payment Status',
    ];
    const financialHeaders = [
      'Customer Amount',
      'GST',
      'TCS',
      'Total Payable',
      'Paid',
      'Outstanding',
      'Refunded',
      'Net Revenue',
      'Total Cost',
      'Vendor Outstanding',
      'Gross Profit',
      'Net Profit',
      'Margin',
    ];
    const tailHeaders = ['Booked By', 'Assigned To', 'Created At'];
    const headers = caps.canViewFinancials
      ? [...operationalHeaders, ...financialHeaders, ...tailHeaders]
      : [...operationalHeaders, ...tailHeaders];
    const csv = buildCsv(
      headers,
      rows.map((row) => {
        const presented = presentBookingRow(row, caps.canViewFinancials);
        const operational = [
          presented.bookingNumber,
          presented.customerName,
          presented.destination,
          csvDate(presented.travelStartDate),
          csvDate(presented.travelEndDate),
          presented.bookingStatus,
          presented.operationalStatus,
          presented.paymentStatus,
        ];
        const tail = [
          presented.bookedBy ?? '',
          presented.assignedTo ?? '',
          csvDateTime(presented.createdAt),
        ];
        if (!('customerAmount' in presented)) return [...operational, ...tail];
        return [
          ...operational,
          presented.customerAmount,
          presented.gstAmount,
          presented.tcsAmount,
          presented.totalPayable,
          presented.paidAmount,
          presented.outstandingAmount,
          presented.refundedAmount,
          presented.netRevenue,
          presented.totalCost,
          presented.vendorOutstanding,
          presented.grossProfit,
          presented.netProfit,
          presented.marginPercentage,
          ...tail,
        ];
      }),
      { rowLimit: REPORT_EXPORT_ROW_LIMIT },
    );
    return { fileName: csvFileName('bookings-report'), mimeType: 'text/csv' as const, ...csv };
  },

  async clientPaymentsCsv(auth: AuthContext, input: ReportClientPaymentsQuery) {
    const { period, caps, timezone } = await resolveContext(auth, input);
    if (!caps.canViewClientPayments)
      throw new ForbiddenError('Booking financial access is required.');
    const { start: dayStart } = localDayBounds(timezone);
    const where = await clientPaymentWhere(auth, period, input, dayStart);
    const rows = await prisma.bookingPaymentSchedule.findMany({
      where,
      select: clientPaymentSelect,
      orderBy: { dueDate: 'asc' },
      take: REPORT_EXPORT_ROW_LIMIT + 1,
    });
    const paid = await paidBySchedule(
      auth,
      rows.map((r) => r.id),
    );
    const csv = buildCsv(
      [
        'Booking Number',
        'Customer',
        'Installment Number',
        'Label',
        'Due Date',
        'Amount',
        'Paid',
        'Outstanding',
        'Status',
        'Assigned User',
      ],
      rows.map((row) => {
        const allocated = paid.get(row.id) ?? new Prisma.Decimal(0);
        const outstanding = row.amount.minus(allocated);
        return [
          row.booking.bookingNumber,
          row.booking.customerName,
          row.installmentNumber,
          row.label,
          csvDate(row.dueDate),
          money(row.amount),
          money(allocated),
          money(outstanding.isNegative() ? new Prisma.Decimal(0) : outstanding),
          row.status,
          row.booking.assignedTo?.fullName ?? '',
        ];
      }),
      { rowLimit: REPORT_EXPORT_ROW_LIMIT },
    );
    return {
      fileName: csvFileName('client-payments-report'),
      mimeType: 'text/csv' as const,
      ...csv,
    };
  },

  async vendorPayablesCsv(auth: AuthContext, input: ReportVendorPayablesQuery) {
    const { period, caps, timezone } = await resolveContext(auth, input);
    if (!caps.canViewVendorPayables)
      throw new ForbiddenError('Vendor financial access is required.');
    const { start: dayStart } = localDayBounds(timezone);
    const where = await vendorPayableWhere(auth, period, input, dayStart);
    const rows = await prisma.vendorPayable.findMany({
      where,
      select: vendorPayableSelect,
      orderBy: { dueDate: 'asc' },
      take: REPORT_EXPORT_ROW_LIMIT + 1,
    });
    // Vendor bank details are never selected, so they can never be exported.
    const csv = buildCsv(
      [
        'Payable Number',
        'Vendor',
        'Booking Number',
        'Supplier Invoice Number',
        'Due Date',
        'Original Amount',
        'Paid',
        'Outstanding',
        'Payment Status',
        'Created At',
      ],
      rows.map((row) => [
        row.payableNumber,
        row.vendor.name,
        row.booking.bookingNumber,
        row.supplierInvoiceNumber ?? '',
        csvDate(row.dueDate),
        money(row.originalAmount),
        money(row.paidAmount),
        money(row.outstandingAmount),
        row.paymentStatus,
        csvDateTime(row.createdAt),
      ]),
      { rowLimit: REPORT_EXPORT_ROW_LIMIT },
    );
    return {
      fileName: csvFileName('vendor-payables-report'),
      mimeType: 'text/csv' as const,
      ...csv,
    };
  },
};

/** Lead-source aggregation shared by the sources report and the leads report. */
async function leadSourceRows(auth: AuthContext, period: ResolvedPeriod) {
  const where = await queryVisibleWhere(auth, createdAtFilter(period));
  const [totals, converted] = await Promise.all([
    prisma.query.groupBy({ by: ['leadSource'], where, _count: { _all: true } }),
    prisma.query.groupBy({
      by: ['leadSource'],
      where: { ...where, leadStage: 'BOOKING_CONFIRMED' },
      _count: { _all: true },
    }),
  ]);
  const convertedBy = new Map(converted.map((r) => [r.leadSource, countAll(r._count)]));
  const total = totals.reduce((sum, r) => sum + countAll(r._count), 0);
  const rows = LEAD_SOURCES.map((source) => {
    const count = countAll(totals.find((r) => r.leadSource === source)?._count);
    const convertedCount = convertedBy.get(source) ?? 0;
    return {
      source,
      label: labelForLookup(source),
      leadCount: count,
      convertedCount,
      conversionRate: percent(convertedCount, count),
      percentage: percent(count, total),
    };
  })
    .filter((row) => row.leadCount > 0)
    .sort((a, b) => b.leadCount - a.leadCount);
  return { totalLeads: total, rows };
}

/**
 * Destination enquiries from free-text itinerary rows. Values are trimmed,
 * blanks dropped and merged case-insensitively, keeping the first readable
 * spelling as the display value. No destination master id is required.
 */
async function destinationRows(auth: AuthContext, period: ResolvedPeriod) {
  const queryWhere = await queryVisibleWhere(auth, createdAtFilter(period));
  const [all, converted] = await Promise.all([
    prisma.queryItinerary.groupBy({
      by: ['destination'],
      where: { companyId: auth.companyId, query: { is: queryWhere } },
      _count: { _all: true },
    }),
    prisma.queryItinerary.groupBy({
      by: ['destination'],
      where: {
        companyId: auth.companyId,
        query: { is: { ...queryWhere, leadStage: 'BOOKING_CONFIRMED' } },
      },
      _count: { _all: true },
    }),
  ]);
  const merge = (rows: typeof all) => {
    const map = new Map<string, { destination: string; count: number }>();
    for (const row of rows) {
      const trimmed = row.destination.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.count += countAll(row._count);
      else map.set(key, { destination: trimmed, count: countAll(row._count) });
    }
    return map;
  };
  const totals = merge(all);
  const convertedMap = merge(converted);
  const grandTotal = [...totals.values()].reduce((sum, row) => sum + row.count, 0);
  const rows = [...totals.entries()]
    .map(([key, row]) => ({
      destination: row.destination,
      enquiryCount: row.count,
      convertedCount: convertedMap.get(key)?.count ?? 0,
      percentage: percent(row.count, grandTotal),
    }))
    .sort((a, b) => b.enquiryCount - a.enquiryCount)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return { totalEnquiries: grandTotal, rows };
}
