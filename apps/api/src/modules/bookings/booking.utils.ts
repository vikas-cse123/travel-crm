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
  kind: 'booking' | 'payment',
) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.bookingCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create: {
      companyId,
      year,
      bookingValue: kind === 'booking' ? 1 : 0,
      paymentValue: kind === 'payment' ? 1 : 0,
    },
    update:
      kind === 'booking' ? { bookingValue: { increment: 1 } } : { paymentValue: { increment: 1 } },
    select: { bookingValue: true, paymentValue: true },
  });
  const value = kind === 'booking' ? counter.bookingValue : counter.paymentValue;
  return `${kind === 'booking' ? 'BK' : 'PAY'}-${year}-${String(value).padStart(6, '0')}`;
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
 * Financial source of truth:
 * - customer paid = non-reversed RECEIVED/CLEARED payment rows;
 * - total cost = active, non-CANCELLED BookingCost rows;
 * - service snapshot costs are historical context and never double-counted.
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
      costs: {
        where: { deletedAt: null, costStatus: { not: 'CANCELLED' } },
        select: { amount: true },
      },
    },
  });
  const paid = money(booking.payments.reduce((sum, row) => sum.plus(row.amount), money(0)));
  const totalCost = money(booking.costs.reduce((sum, row) => sum.plus(row.amount), money(0)));
  const outstanding = Prisma.Decimal.max(money(0), money(booking.totalSellingAmount.minus(paid)));
  const grossProfit = money(booking.totalSellingAmount.minus(totalCost));
  const margin = booking.totalSellingAmount.isZero()
    ? money(0)
    : grossProfit
        .dividedBy(booking.totalSellingAmount)
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

  const paymentStatus = paid.greaterThanOrEqualTo(booking.totalSellingAmount)
    ? 'PAID'
    : hasOverdue && outstanding.greaterThan(0)
      ? 'OVERDUE'
      : paid.greaterThan(0)
        ? 'PARTIALLY_PAID'
        : 'UNPAID';
  const updated = await tx.booking.update({
    where: { id: bookingId },
    data: {
      totalCustomerPaid: paid,
      totalCustomerOutstanding: outstanding,
      paymentStatus,
      totalCost,
      grossProfit,
      profitMarginPercentage: margin,
    },
  });
  if (booking.customerId) {
    await recalculateCustomerMetrics(tx, companyId, booking.customerId);
  }
  return updated;
}
