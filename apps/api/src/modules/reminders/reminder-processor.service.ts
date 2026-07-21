import type { ReminderDelayUnit, ReminderRule } from '@prisma/client';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { atLocalTime } from '../../utils/timezone.js';
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

function duration(value: number, unit: ReminderDelayUnit) {
  if (unit === 'MINUTES') return value * 60_000;
  if (unit === 'HOURS') return value * 3_600_000;
  if (unit === 'DAYS') return value * 86_400_000;
  if (unit === 'WEEKS') return value * 7 * 86_400_000;
  return value * 30 * 86_400_000;
}

function render(template: string | null, values: Record<string, string>) {
  return (template ?? '').replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

function source(rule: ReminderRule) {
  if (rule.ruleType === 'LEAD_STAGE') return 'LEAD_STAGE_RULE' as const;
  if (rule.ruleType === 'QUOTATION_EXPIRY') return 'QUOTATION_RULE' as const;
  if (rule.ruleType === 'CUSTOMER_PAYMENT') return 'PAYMENT_RULE' as const;
  if (['BOOKING_DOCUMENT', 'VISA'].includes(rule.ruleType)) return 'DOCUMENT_RULE' as const;
  if (['VENDOR_PAYABLE', 'VENDOR_CONTRACT'].includes(rule.ruleType)) return 'VENDOR_RULE' as const;
  return 'BOOKING_RULE' as const;
}

function assignee(rule: ReminderRule, candidate: Candidate) {
  if (rule.assignToMode === 'FIXED_USER') return rule.fixedUserId;
  return candidate.assignedToId ?? candidate.createdById;
}

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

async function processRule(
  companyId: string,
  timezone: string,
  rule: ReminderRule,
  dryRun: boolean,
) {
  const rows = await candidates(companyId, rule, env.REMINDER_WORKER_BATCH_SIZE);
  let created = 0;
  let skipped = 0;
  for (const candidate of rows) {
    const triggerKey = `${rule.id}:${candidate.entityType}:${candidate.entityId}:${candidate.baseDate.toISOString()}`;
    if (
      await prisma.reminderExecution.findUnique({
        where: { companyId_triggerKey: { companyId, triggerKey } },
        select: { id: true },
      })
    ) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      created += 1;
      continue;
    }
    const assignedToId = assignee(rule, candidate);
    if (!assignedToId) {
      skipped += 1;
      continue;
    }
    const offset = duration(rule.delayValue, rule.delayUnit);
    const rawDue = new Date(
      candidate.baseDate.getTime() + (candidate.dateBased ? -offset : offset),
    );
    const dueAt = candidate.dateBased ? atLocalTime(timezone, rawDue, rule.dueTime) : rawDue;
    try {
      const reminder = await prisma.$transaction(async (tx) => {
        const execution = await tx.reminderExecution.create({
          data: {
            companyId,
            ruleId: rule.id,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            triggerKey,
            attempts: 1,
          },
        });
        const row = await tx.queryFollowUp.create({
          data: {
            companyId,
            assignedToId,
            createdById: rule.createdById,
            reminderRuleId: rule.id,
            title: render(rule.titleTemplate, candidate.values),
            notes: render(rule.descriptionTemplate, candidate.values) || null,
            scheduledAt: dueAt,
            originalDueAt: dueAt,
            reminderType: rule.reminderType,
            reminderPriority: rule.reminderPriority,
            source: source(rule),
            deduplicationKey: triggerKey,
            queryId: candidate.queryId ?? null,
            customerId: candidate.customerId ?? null,
            quotationId: candidate.quotationId ?? null,
            bookingId: candidate.bookingId ?? null,
            bookingPaymentScheduleId: candidate.bookingPaymentScheduleId ?? null,
            bookingTravellerId: candidate.bookingTravellerId ?? null,
            bookingServiceId: candidate.bookingServiceId ?? null,
            vendorId: candidate.vendorId ?? null,
            vendorPayableId: candidate.vendorPayableId ?? null,
          },
        });
        await tx.reminderExecution.update({
          where: { id: execution.id },
          data: { status: 'COMPLETED', reminderId: row.id, completedAt: new Date() },
        });
        return row;
      });
      await notificationsService.create({
        companyId,
        recipientUserId: assignedToId,
        reminderId: reminder.id,
        category: 'REMINDER',
        severity:
          rule.reminderPriority === 'URGENT'
            ? 'CRITICAL'
            : rule.reminderPriority === 'HIGH'
              ? 'WARNING'
              : 'INFO',
        title: reminder.title,
        message: `An automated reminder was assigned to you: ${reminder.title}`,
        actionUrl: `/reminders/${reminder.id}`,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        deduplicationKey: `${triggerKey}:created`,
        channels: rule.channels,
      });
      created += 1;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        skipped += 1;
        continue;
      }
      logger.error(
        { err: error, companyId, ruleId: rule.id, entityId: candidate.entityId },
        'Reminder rule execution failed',
      );
      skipped += 1;
    }
  }
  return { matched: rows.length, created, skipped };
}

async function processDue(companyId: string) {
  const now = new Date();
  await prisma.queryFollowUp.updateMany({
    where: { companyId, deletedAt: null, status: 'SNOOZED', scheduledAt: { lte: now } },
    data: { status: 'PENDING', snoozedUntil: null },
  });
  const due = await prisma.queryFollowUp.findMany({
    where: { companyId, deletedAt: null, status: 'PENDING', scheduledAt: { lte: now } },
    include: { reminderRule: true },
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
      channels: reminder.reminderRule?.channels ?? ['IN_APP'],
    });
    const rule = reminder.reminderRule;
    if (!rule?.escalationEnabled || !rule.escalationAfterValue || !rule.escalationAfterUnit)
      continue;
    if (
      now.getTime() <
      reminder.scheduledAt.getTime() + duration(rule.escalationAfterValue, rule.escalationAfterUnit)
    )
      continue;
    const manager = await prisma.user.findFirst({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        role: { name: rule.escalationRoleName ?? env.REMINDER_ESCALATION_MANAGER_ROLE },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!manager || manager.id === reminder.assignedToId) continue;
    const key = `reminder:${reminder.id}:escalation:1`;
    const escalation = await prisma.reminderEscalation.upsert({
      where: { companyId_deduplicationKey: { companyId, deduplicationKey: key } },
      create: {
        companyId,
        reminderId: reminder.id,
        escalatedToUserId: manager.id,
        reason: `Reminder remains overdue: ${reminder.title}`,
        deduplicationKey: key,
      },
      update: {},
    });
    await notificationsService.create({
      companyId,
      recipientUserId: manager.id,
      reminderId: reminder.id,
      category: 'ESCALATION',
      severity: 'CRITICAL',
      title: `Escalation · ${reminder.title}`,
      message: 'A team reminder remains overdue and needs attention.',
      actionUrl: `/reminders/${reminder.id}`,
      entityType: 'ReminderEscalation',
      entityId: escalation.id,
      deduplicationKey: key,
      channels: ['IN_APP', 'EMAIL'],
    });
  }
  return due.length;
}

export const reminderProcessor = {
  scheduleEvent(companyId: string, ruleTypes: ReminderRule['ruleType'][]) {
    // Tests invoke processCompany directly; background work would otherwise
    // outlive a request and race the next test's database reset.
    if (env.NODE_ENV === 'test') return;
    setImmediate(() => {
      void this.processEvent(companyId, ruleTypes).catch((error) =>
        logger.error({ err: error, companyId, ruleTypes }, 'Event reminder reconciliation failed'),
      );
    });
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
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { timezone: true },
    });
    const rules = await prisma.reminderRule.findMany({
      where: {
        companyId,
        deletedAt: null,
        isEnabled: true,
        ...(options.ruleId ? { id: options.ruleId } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
    const results = [];
    for (const rule of rules)
      results.push({
        ruleId: rule.id,
        ...(await processRule(
          companyId,
          company.timezone || env.REMINDER_WORKER_TIMEZONE_FALLBACK,
          rule,
          options.dryRun ?? false,
        )),
      });
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
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    const results = [];
    for (const company of companies) results.push(await this.processCompany(company.id));
    return results;
  },
  async processEvent(companyId: string, ruleTypes: ReminderRule['ruleType'][]) {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { timezone: true },
    });
    const rules = await prisma.reminderRule.findMany({
      where: { companyId, deletedAt: null, isEnabled: true, ruleType: { in: ruleTypes } },
    });
    for (const rule of rules)
      await processRule(
        companyId,
        company.timezone || env.REMINDER_WORKER_TIMEZONE_FALLBACK,
        rule,
        false,
      );
  },
};
