import type {
  NotificationCategory,
  NotificationDeliveryChannel,
  NotificationSeverity,
  Prisma,
} from '@prisma/client';
import type { NotificationPreferenceInput } from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { emailService } from '../../services/email/email.service.js';
import { NotFoundError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

function activity(
  auth: AuthContext,
  action:
    | 'NOTIFICATION_READ'
    | 'NOTIFICATION_UNREAD'
    | 'NOTIFICATION_ARCHIVED'
    | 'NOTIFICATIONS_READ_ALL'
    | 'NOTIFICATION_PREFERENCES_UPDATED',
  entityId: string | null,
  context: RequestContext,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: entityId ? 'Notification' : 'NotificationPreference',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}

function categoryPreference(category: NotificationCategory) {
  if (category === 'REMINDER') return 'reminderAlerts' as const;
  if (category === 'REMINDER_OVERDUE') return 'overdueAlerts' as const;
  if (category === 'ESCALATION') return 'escalationAlerts' as const;
  if (category === 'BOOKING') return 'bookingAlerts' as const;
  if (category === 'PAYMENT') return 'paymentAlerts' as const;
  if (category === 'QUOTATION') return 'quotationAlerts' as const;
  if (category === 'DOCUMENT') return 'documentAlerts' as const;
  if (category === 'VENDOR') return 'vendorAlerts' as const;
  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export async function deliverNotification(notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      recipient: { select: { email: true, fullName: true } },
      company: { select: { name: true } },
      deliveries: true,
    },
  });
  if (!notification) return;
  const emailDelivery = notification.deliveries.find((entry) => entry.channel === 'EMAIL');
  if (!emailDelivery || emailDelivery.status === 'SENT' || emailDelivery.status === 'SKIPPED')
    return;
  if (!env.REMINDER_EMAIL_ENABLED) {
    await prisma.notificationDelivery.update({
      where: { id: emailDelivery.id },
      data: { status: 'SKIPPED', lastError: 'Reminder email delivery is disabled.' },
    });
    return;
  }
  try {
    await emailService.sendMessage({
      to: notification.recipient.email,
      subject: notification.title,
      text: `${notification.message}\n\nOpen: ${env.WEB_URL}${notification.actionUrl ?? '/reminders/notifications'}\n\n${notification.company.name}`,
      html: `<p>Hello ${escapeHtml(notification.recipient.fullName)},</p><p>${escapeHtml(notification.message)}</p><p><a href="${env.WEB_URL}${notification.actionUrl ?? '/reminders/notifications'}">Open in Travel CRM</a></p><p>${escapeHtml(notification.company.name)}</p>`,
    });
    await prisma.notificationDelivery.update({
      where: { id: emailDelivery.id },
      data: { status: 'SENT', attempts: { increment: 1 }, sentAt: new Date(), lastError: null },
    });
  } catch (error) {
    const attempts = emailDelivery.attempts + 1;
    await prisma.notificationDelivery.update({
      where: { id: emailDelivery.id },
      data: {
        status: 'FAILED',
        attempts,
        lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown email error',
        nextAttemptAt: attempts < 3 ? new Date(Date.now() + attempts * 15 * 60_000) : null,
      },
    });
    logger.error({ err: error, notificationId }, 'Reminder notification email failed');
  }
}

export const notificationsService = {
  async create(input: {
    companyId: string;
    recipientUserId: string;
    reminderId?: string;
    category: NotificationCategory;
    severity?: NotificationSeverity;
    title: string;
    message: string;
    actionUrl?: string;
    entityType?: string;
    entityId?: string;
    deduplicationKey?: string;
    channels?: NotificationDeliveryChannel[];
    metadata?: Prisma.InputJsonValue;
  }) {
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: input.recipientUserId },
    });
    const categoryKey = categoryPreference(input.category);
    if (preference && categoryKey && !preference[categoryKey]) return null;
    const channels = input.channels ?? ['IN_APP'];
    const allowedChannels = channels.filter((channel) => {
      if (channel === 'IN_APP') return preference?.inAppEnabled ?? true;
      return (
        (preference?.emailEnabled ?? true) &&
        (preference?.digestMode ?? 'IMMEDIATE') === 'IMMEDIATE'
      );
    });
    if (!allowedChannels.length) return null;
    const notification = await prisma.notification.upsert({
      where: {
        companyId_recipientUserId_deduplicationKey: {
          companyId: input.companyId,
          recipientUserId: input.recipientUserId,
          deduplicationKey: input.deduplicationKey ?? `notification:${crypto.randomUUID()}`,
        },
      },
      create: {
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        reminderId: input.reminderId ?? null,
        category: input.category,
        severity: input.severity ?? 'INFO',
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        deduplicationKey: input.deduplicationKey ?? null,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        deliveries: {
          create: allowedChannels.map((channel) => ({
            company: { connect: { id: input.companyId } },
            channel,
            status: channel === 'IN_APP' ? 'SENT' : 'PENDING',
            ...(channel === 'IN_APP' ? { sentAt: new Date() } : {}),
          })),
        },
      },
      update: {},
      include: { deliveries: true },
    });
    await deliverNotification(notification.id);
    return notification;
  },

  async list(auth: AuthContext, q: Record<string, unknown>) {
    const page = resolvePagination(q as { page?: number; pageSize?: number });
    const search = typeof q.search === 'string' ? q.search : undefined;
    const status = typeof q.status === 'string' ? q.status : undefined;
    const category = typeof q.category === 'string' ? q.category : undefined;
    const where: Prisma.NotificationWhereInput = {
      companyId: auth.companyId,
      recipientUserId: auth.userId,
      ...(status
        ? { status: status as Prisma.EnumNotificationStatusFilter }
        : { status: { not: 'ARCHIVED' } }),
      ...(category ? { category: category as Prisma.EnumNotificationCategoryFilter } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.notification.count({ where }),
    ]);
    return {
      data,
      pagination: { ...page, total, totalPages: total ? Math.ceil(total / page.pageSize) : 0 },
    };
  },

  async details(auth: AuthContext, id: string) {
    const row = await prisma.notification.findFirst({
      where: { id, companyId: auth.companyId, recipientUserId: auth.userId },
      include: { deliveries: true },
    });
    if (!row) throw new NotFoundError('Notification not found.');
    return row;
  },

  async analytics(auth: AuthContext) {
    const base = { companyId: auth.companyId, recipientUserId: auth.userId } as const;
    const [total, unread, reminderAlerts, escalations] = await prisma.$transaction([
      prisma.notification.count({ where: { ...base, status: { not: 'ARCHIVED' } } }),
      prisma.notification.count({ where: { ...base, status: 'UNREAD' } }),
      prisma.notification.count({
        where: {
          ...base,
          category: { in: ['REMINDER', 'REMINDER_OVERDUE'] },
          status: { not: 'ARCHIVED' },
        },
      }),
      prisma.notification.count({
        where: { ...base, category: 'ESCALATION', status: { not: 'ARCHIVED' } },
      }),
    ]);
    return { total, unread, reminderAlerts, escalations };
  },

  async setStatus(
    auth: AuthContext,
    id: string,
    status: 'READ' | 'UNREAD' | 'ARCHIVED',
    context: RequestContext,
  ) {
    await this.details(auth, id);
    const now = new Date();
    const [row] = await prisma.$transaction([
      prisma.notification.update({
        where: { id },
        data: {
          status,
          ...(status === 'READ' ? { readAt: now } : status === 'UNREAD' ? { readAt: null } : {}),
          ...(status === 'ARCHIVED' ? { archivedAt: now } : { archivedAt: null }),
        },
      }),
      prisma.activityLog.create({
        data: activity(
          auth,
          status === 'READ'
            ? 'NOTIFICATION_READ'
            : status === 'UNREAD'
              ? 'NOTIFICATION_UNREAD'
              : 'NOTIFICATION_ARCHIVED',
          id,
          context,
        ),
      }),
    ]);
    return row;
  },

  async readAll(auth: AuthContext, context: RequestContext) {
    const [result] = await prisma.$transaction([
      prisma.notification.updateMany({
        where: { companyId: auth.companyId, recipientUserId: auth.userId, status: 'UNREAD' },
        data: { status: 'READ', readAt: new Date() },
      }),
      prisma.activityLog.create({ data: activity(auth, 'NOTIFICATIONS_READ_ALL', null, context) }),
    ]);
    return { updated: result.count };
  },

  async preferences(auth: AuthContext) {
    return prisma.notificationPreference.upsert({
      where: { userId: auth.userId },
      create: { companyId: auth.companyId, userId: auth.userId },
      update: {},
    });
  },

  async updatePreferences(
    auth: AuthContext,
    input: NotificationPreferenceInput,
    context: RequestContext,
  ) {
    const preferenceData = {
      ...input,
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
    };
    const [preference] = await prisma.$transaction([
      prisma.notificationPreference.upsert({
        where: { userId: auth.userId },
        create: { companyId: auth.companyId, userId: auth.userId, ...preferenceData },
        update: preferenceData,
      }),
      prisma.activityLog.create({
        data: activity(auth, 'NOTIFICATION_PREFERENCES_UPDATED', null, context),
      }),
    ]);
    return preference;
  },

  async retryPending(companyId?: string) {
    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        channel: 'EMAIL',
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: 3 },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      select: { notificationId: true },
      take: env.REMINDER_WORKER_BATCH_SIZE,
    });
    for (const delivery of deliveries) await deliverNotification(delivery.notificationId);
    return deliveries.length;
  },
};
