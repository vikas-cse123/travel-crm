import { Prisma, type ActivityAction } from '@prisma/client';
import type { AuthContext } from '../../middleware/authenticate.js';
import { localDayBounds } from '../../utils/timezone.js';
import { recalculateCustomerMetrics } from '../customers/customers.service.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

const money = (value: Prisma.Decimal.Value) =>
  new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export async function nextBookingNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  kind: 'booking' | 'payment' | 'refund',
) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.bookingCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create: {
      companyId,
      year,
      bookingValue: kind === 'booking' ? 1 : 0,
      paymentValue: kind === 'payment' ? 1 : 0,
      refundValue: kind === 'refund' ? 1 : 0,
    },
    update:
      kind === 'booking'
        ? { bookingValue: { increment: 1 } }
        : kind === 'payment'
          ? { paymentValue: { increment: 1 } }
          : { refundValue: { increment: 1 } },
    select: { bookingValue: true, paymentValue: true, refundValue: true },
  });
  const value =
    kind === 'booking'
      ? counter.bookingValue
      : kind === 'payment'
        ? counter.paymentValue
        : counter.refundValue;
  const prefix = kind === 'booking' ? 'BK' : kind === 'payment' ? 'PAY' : 'REF';
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
}

export function bookingAudit(
  auth: AuthContext,
  action: ActivityAction,
  entityType: string,
  entityId: string,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType,
    entityId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}

/**
 * Financial source of truth (Phase 15):
 * - customer paid   = non-reversed RECEIVED/CLEARED payment rows (gross receipts);
 * - total refunded  = non-reversed PROCESSED BookingRefund rows;
 * - net revenue     = max(0, paid − refunded);
 * - total payable   = totalSellingAmount + GST + TCS (customer amount + taxes);
 * - outstanding     = max(0, totalPayable − netRevenue);
 * - total cost      = active, non-CANCELLED BookingCost rows (service snapshot
 *                     costs are historical context and never double-counted);
 * - gross profit    = totalPayable − totalCost (revenue commitment view, retained
 *                     from before but now taxed-inclusive);
 * - net profit      = netRevenue − totalCost (realised view after refunds);
 * - margin          = grossProfit / totalPayable × 100 (denominator is the full
 *                     customer payable so tax-inclusive bookings stay comparable).
 * - vendor payable / outstanding roll up non-deleted VendorPayable rows linked to
 *   this booking; they are a supplier-liability view, never added to totalCost.
 */
export async function recalculateBookingFinancials(
  tx: Prisma.TransactionClient,
  companyId: string,
  bookingId: string,
  reference = new Date(),
) {
  const booking = await tx.booking.findFirstOrThrow({
    where: { id: bookingId, companyId },
    select: {
      totalSellingAmount: true,
      gstAmount: true,
      tcsAmount: true,
      customerId: true,
      company: { select: { timezone: true } },
      paymentSchedules: {
        where: { deletedAt: null },
        select: { id: true, amount: true, dueDate: true, status: true },
      },
      payments: {
        where: {
          reversedAt: null,
          paymentStatus: { in: ['RECEIVED', 'CLEARED'] },
        },
        select: { amount: true, paymentScheduleId: true },
      },
      refunds: {
        where: { reversedAt: null },
        select: { amount: true, status: true },
      },
      costs: {
        where: { deletedAt: null, costStatus: { not: 'CANCELLED' } },
        select: { amount: true },
      },
    },
  });
  const [vendorRollup] = await Promise.all([
    tx.vendorPayable.aggregate({
      where: { companyId, bookingId, deletedAt: null },
      _sum: { originalAmount: true, outstandingAmount: true },
    }),
  ]);

  const paid = money(booking.payments.reduce((sum, row) => sum.plus(row.amount), money(0)));
  const totalRefunded = money(
    booking.refunds
      .filter((row) => row.status === 'PROCESSED')
      .reduce((sum, row) => sum.plus(row.amount), money(0)),
  );
  const hasPendingRefund = booking.refunds.some((row) => row.status === 'PENDING');
  const netRevenue = Prisma.Decimal.max(money(0), money(paid.minus(totalRefunded)));
  const totalPayable = money(
    booking.totalSellingAmount.plus(booking.gstAmount).plus(booking.tcsAmount),
  );
  const totalCost = money(booking.costs.reduce((sum, row) => sum.plus(row.amount), money(0)));
  const outstanding = Prisma.Decimal.max(money(0), money(totalPayable.minus(netRevenue)));
  const grossProfit = money(totalPayable.minus(totalCost));
  const netProfit = money(netRevenue.minus(totalCost));
  const totalVendorPayable = money(vendorRollup._sum.originalAmount ?? 0);
  const totalVendorOutstanding = money(vendorRollup._sum.outstandingAmount ?? 0);
  const margin = totalPayable.isZero()
    ? money(0)
    : grossProfit
        .dividedBy(totalPayable)
        .times(100)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  const { start } = localDayBounds(booking.company.timezone, reference);
  let hasOverdue = false;

  for (const schedule of booking.paymentSchedules) {
    if (schedule.status === 'CANCELLED') continue;
    const allocated = booking.payments
      .filter((payment) => payment.paymentScheduleId === schedule.id)
      .reduce((sum, payment) => sum.plus(payment.amount), money(0));
    const status = allocated.greaterThanOrEqualTo(schedule.amount)
      ? 'PAID'
      : allocated.greaterThan(0)
        ? 'PARTIALLY_PAID'
        : schedule.dueDate < start
          ? 'OVERDUE'
          : 'PENDING';
    if (status === 'OVERDUE' || (status === 'PARTIALLY_PAID' && schedule.dueDate < start))
      hasOverdue = true;
    await tx.bookingPaymentSchedule.update({ where: { id: schedule.id }, data: { status } });
  }

  // Base collection status uses net revenue against the full payable; refund
  // states then take precedence so a refunded booking is never shown as merely
  // "paid". Schedule tracking above is untouched by refunds.
  const baseStatus = netRevenue.greaterThanOrEqualTo(totalPayable)
    ? 'PAID'
    : hasOverdue && outstanding.greaterThan(0)
      ? 'OVERDUE'
      : netRevenue.greaterThan(0)
        ? 'PARTIALLY_PAID'
        : 'UNPAID';
  const paymentStatus = hasPendingRefund
    ? 'REFUND_PENDING'
    : totalRefunded.greaterThan(0)
      ? totalRefunded.greaterThanOrEqualTo(paid)
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED'
      : baseStatus;

  const updated = await tx.booking.update({
    where: { id: bookingId },
    data: {
      totalPayable,
      totalCustomerPaid: paid,
      totalRefunded,
      netRevenue,
      totalCustomerOutstanding: outstanding,
      paymentStatus,
      totalCost,
      totalVendorPayable,
      totalVendorOutstanding,
      grossProfit,
      netProfit,
      profitMarginPercentage: margin,
    },
  });
  if (booking.customerId) {
    await recalculateCustomerMetrics(tx, companyId, booking.customerId);
  }
  return updated;
}
