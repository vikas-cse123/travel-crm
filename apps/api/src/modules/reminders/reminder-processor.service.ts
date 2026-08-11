import type { ReminderRule } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { notificationsService } from '../notifications/notifications.service.js';

interface Candidate {
  entityType: string;
  entityId: string;
  baseDate: Date;
  dateBased: boolean;
  assignedToId: string | null;
  createdById: string;
  queryId?: string | null;
  customerId?: string | null;
  quotationId?: string | null;
  bookingId?: string | null;
  bookingPaymentScheduleId?: string | null;
  bookingTravellerId?: string | null;
  bookingServiceId?: string | null;
  vendorId?: string | null;
  vendorPayableId?: string | null;
  values: Record<string, string>;
}

/**
 * Reminders are manual only. Automatic rule-based reminders are disabled, so no
 * reminder is ever generated from a lead stage, quotation, booking, payment,
 * vendor or other record change. `candidates` remains available to the rules
 * preview API (which never creates reminders).
 */
async function candidates(
  companyId: string,
  rule: ReminderRule,
  take: number,
): Promise<Candidate[]> {
  const lookahead = new Date(Date.now() + env.REMINDER_PROCESSING_LOOKAHEAD_DAYS * 86_400_000);
  if (rule.ruleType === 'LEAD_STAGE' && rule.leadStage) {
    const rows = await prisma.query.findMany({
      where: { companyId, deletedAt: null, leadStage: rule.leadStage },
      take,
      orderBy: { updatedAt: 'asc' },
    });
    return rows.map((row) => ({
      entityType: 'Query',
      entityId: row.id,
      baseDate: row.updatedAt,
      dateBased: false,
      assignedToId: row.assignedToId,
      createdById: row.createdById,
      queryId: row.id,
      customerId: row.customerId,
      values: { queryNumber: row.queryNumber, customerName: row.customerName },
    }));
  }
  if (rule.ruleType === 'BOOKING_TRAVEL') {
    const rows = await prisma.booking.findMany({
      where: {
        companyId,
        deletedAt: null,
        travelStartDate: { gte: new Date(), lte: lookahead },
        bookingStatus: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      take,
      orderBy: { travelStartDate: 'asc' },
    });
    return rows.flatMap((row) =>
      row.travelStartDate
        ? [
            {
              entityType: 'Booking',
              entityId: row.id,
              baseDate: row.travelStartDate,
              dateBased: true,
              assignedToId: row.assignedToId,
              createdById: row.bookedById,
              queryId: row.queryId,
              customerId: row.customerId,
              quotationId: row.quotationId,
              bookingId: row.id,
              values: {
                bookingNumber: row.bookingNumber,
                customerName: row.customerName,
                destination: row.destinationSummary,
              },
            },
          ]
        : [],
    );
  }
  if (rule.ruleType === 'CUSTOMER_PAYMENT') {
    const rows = await prisma.bookingPaymentSchedule.findMany({
      where: {
        companyId,
        deletedAt: null,
        dueDate: { lte: lookahead },
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        booking: { deletedAt: null, bookingStatus: { notIn: ['CANCELLED', 'COMPLETED'] } },
      },
      include: { booking: true },
      take,
      orderBy: { dueDate: 'asc' },
    });
    return rows.map((row) => ({
      entityType: 'BookingPaymentSchedule',
      entityId: row.id,
      baseDate: row.dueDate,
      dateBased: true,
      assignedToId: row.booking.assignedToId,
      createdById: row.booking.bookedById,
      queryId: row.booking.queryId,
      customerId: row.booking.customerId,
      quotationId: row.booking.quotationId,
      bookingId: row.bookingId,
      bookingPaymentScheduleId: row.id,
      values: {
        bookingNumber: row.booking.bookingNumber,
        customerName: row.booking.customerName,
        scheduleLabel: row.label,
      },
    }));
  }
  if (rule.ruleType === 'BOOKING_DOCUMENT' || rule.ruleType === 'VISA') {
    const rows = await prisma.bookingTraveller.findMany({
      where: {
        companyId,
        deletedAt: null,
        booking: {
          deletedAt: null,
          bookingStatus: { notIn: ['CANCELLED', 'COMPLETED'] },
          travelStartDate: { lte: lookahead },
        },
        ...(rule.ruleType === 'VISA'
          ? { visaStatus: { notIn: ['APPROVED', 'NOT_REQUIRED'] } }
          : { passportExpiresAt: { not: null } }),
      },
      include: { booking: true },
      take,
    });
    return rows.flatMap((row) => {
      const baseDate =
        rule.ruleType === 'VISA' ? row.booking.travelStartDate : row.passportExpiresAt;
      return baseDate
        ? [
            {
              entityType: 'BookingTraveller',
              entityId: row.id,
              baseDate,
              dateBased: true,
              assignedToId: row.booking.assignedToId,
              createdById: row.booking.bookedById,
              customerId: row.booking.customerId,
              bookingId: row.bookingId,
              bookingTravellerId: row.id,
              values: {
                bookingNumber: row.booking.bookingNumber,
                customerName: row.booking.customerName,
                travellerName: `${row.firstName} ${row.lastName}`,
              },
            },
          ]
        : [];
    });
  }
  if (rule.ruleType === 'SERVICE_CONFIRMATION') {
    const rows = await prisma.bookingService.findMany({
      where: {
        companyId,
        deletedAt: null,
        confirmationStatus: 'PENDING',
        booking: { deletedAt: null, bookingStatus: { notIn: ['CANCELLED', 'COMPLETED'] } },
        OR: [{ serviceDate: { lte: lookahead } }, { startDate: { lte: lookahead } }],
      },
      include: { booking: true },
      take,
    });
    return rows.map((row) => ({
      entityType: 'BookingService',
      entityId: row.id,
      baseDate: row.serviceDate ?? row.startDate ?? row.createdAt,
      dateBased: true,
      assignedToId: row.booking.assignedToId,
      createdById: row.booking.bookedById,
      customerId: row.booking.customerId,
      bookingId: row.bookingId,
      bookingServiceId: row.id,
      vendorId: row.vendorId,
      values: {
        bookingNumber: row.booking.bookingNumber,
        customerName: row.booking.customerName,
        serviceName: row.name,
      },
    }));
  }
  if (rule.ruleType === 'QUOTATION_EXPIRY') {
    const rows = await prisma.quotation.findMany({
      where: {
        companyId,
        deletedAt: null,
        validUntil: { gte: new Date(), lte: lookahead },
        status: { notIn: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'ARCHIVED'] },
      },
      include: { query: true },
      take,
      orderBy: { validUntil: 'asc' },
    });
    return rows.flatMap((row) =>
      row.validUntil
        ? [
            {
              entityType: 'Quotation',
              entityId: row.id,
              baseDate: row.validUntil,
              dateBased: true,
              assignedToId: row.query.assignedToId,
              createdById: row.createdById,
              queryId: row.queryId,
              customerId: row.customerId,
              quotationId: row.id,
              values: { quotationNumber: row.quotationNumber, customerName: row.customerName },
            },
          ]
        : [],
    );
  }
  if (rule.ruleType === 'VENDOR_PAYABLE') {
    const rows = await prisma.vendorPayable.findMany({
      where: {
        companyId,
        deletedAt: null,
        dueDate: { lte: lookahead },
        paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      include: { vendor: true, booking: true },
      take,
      orderBy: { dueDate: 'asc' },
    });
    return rows.flatMap((row) =>
      row.dueDate
        ? [
            {
              entityType: 'VendorPayable',
              entityId: row.id,
              baseDate: row.dueDate,
              dateBased: true,
              assignedToId: row.vendor.assignedToId,
              createdById: row.createdById,
              bookingId: row.bookingId,
              vendorId: row.vendorId,
              vendorPayableId: row.id,
              values: {
                payableNumber: row.payableNumber,
                vendorName: row.vendor.name,
                bookingNumber: row.booking.bookingNumber,
              },
            },
          ]
        : [],
    );
  }
  if (rule.ruleType === 'VENDOR_CONTRACT') {
    const rows = await prisma.vendor.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        contractEndDate: { gte: new Date(), lte: lookahead },
      },
      take,
      orderBy: { contractEndDate: 'asc' },
    });
    return rows.flatMap((row) =>
      row.contractEndDate
        ? [
            {
              entityType: 'Vendor',
              entityId: row.id,
              baseDate: row.contractEndDate,
              dateBased: true,
              assignedToId: row.assignedToId,
              createdById: row.createdById,
              vendorId: row.id,
              values: { vendorName: row.name, vendorCode: row.vendorCode },
            },
          ]
        : [],
    );
  }
  return [];
}

/** Manual reminders that have become due or overdue. In-app only — never email. */
async function processDue(companyId: string) {
  const now = new Date();
  await prisma.queryFollowUp.updateMany({
    where: { companyId, deletedAt: null, status: 'SNOOZED', scheduledAt: { lte: now } },
    data: { status: 'PENDING', snoozedUntil: null },
  });
  const due = await prisma.queryFollowUp.findMany({
    where: { companyId, deletedAt: null, status: 'PENDING', scheduledAt: { lte: now } },
    take: env.REMINDER_WORKER_BATCH_SIZE,
  });
  for (const reminder of due) {
    await notificationsService.create({
      companyId,
      recipientUserId: reminder.assignedToId,
      reminderId: reminder.id,
      category: 'REMINDER_OVERDUE',
      severity: reminder.reminderPriority === 'URGENT' ? 'CRITICAL' : 'WARNING',
      title: `Overdue · ${reminder.title}`,
      message: `This reminder was due ${reminder.scheduledAt.toLocaleString('en-IN')}.`,
      actionUrl: `/reminders/${reminder.id}`,
      entityType: 'QueryFollowUp',
      entityId: reminder.id,
      deduplicationKey: `reminder:${reminder.id}:overdue:${reminder.scheduledAt.toISOString()}`,
      channels: ['IN_APP'],
    });
  }
  return due.length;
}

export const reminderProcessor = {
  scheduleEvent(companyId: string, ruleTypes: ReminderRule['ruleType'][]) {
    // Automatic reminders are disabled — nothing is scheduled for creation.
    void companyId;
    void ruleTypes;
  },
  async previewRule(companyId: string, ruleId: string) {
    const rule = await prisma.reminderRule.findFirstOrThrow({
      where: { id: ruleId, companyId, deletedAt: null },
    });
    const rows = await candidates(companyId, rule, env.REMINDER_WORKER_BATCH_SIZE);
    const keys = rows.map(
      (candidate) =>
        `${rule.id}:${candidate.entityType}:${candidate.entityId}:${candidate.baseDate.toISOString()}`,
    );
    const existing = await prisma.reminderExecution.count({
      where: { companyId, triggerKey: { in: keys } },
    });
    return {
      matched: rows.length,
      eligible: rows.length - existing,
      alreadyProcessed: existing,
      sample: rows
        .slice(0, 10)
        .map((row) => ({ entityType: row.entityType, entityId: row.entityId, values: row.values })),
    };
  },
  async processCompany(companyId: string, options: { ruleId?: string; dryRun?: boolean } = {}) {
    // Automatic rule-based reminders are disabled — reminders are manual only.
    // Manual reminders still become due/overdue through processDue below.
    const results: Array<{ ruleId: string; matched: number; created: number; skipped: number }> =
      [];
    const due = options.dryRun ? 0 : await processDue(companyId);
    const deliveries = options.dryRun ? 0 : await notificationsService.retryPending(companyId);
    if (!options.dryRun)
      await prisma.notification.updateMany({
        where: {
          companyId,
          status: { not: 'ARCHIVED' },
          createdAt: { lt: new Date(Date.now() - env.NOTIFICATION_RETENTION_DAYS * 86_400_000) },
        },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });
    return { companyId, rules: results, dueProcessed: due, deliveriesRetried: deliveries };
  },
  async processAll() {
    const companies = await prisma.company.findMany({
      // The hidden system company has no tenant reminders.
      where: { status: 'ACTIVE', isSystem: false },
      select: { id: true },
    });
    const results = [];
    for (const company of companies) results.push(await this.processCompany(company.id));
    return results;
  },
  async processEvent(companyId: string, ruleTypes: ReminderRule['ruleType'][]) {
    // Automatic rule-based reminders are disabled — reminders are manual only.
    void companyId;
    void ruleTypes;
  },
};
