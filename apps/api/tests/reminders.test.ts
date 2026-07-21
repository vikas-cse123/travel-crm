import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { hashPassword } from '../src/utils/crypto.js';
import { reminderProcessor } from '../src/modules/reminders/reminder-processor.service.js';

let app: Express;
let db: PrismaClient;
beforeAll(async () => {
  db = createTestPrismaClient();
  app = (await import('../src/app.js')).createApp();
});
afterAll(async () => db.$disconnect());
beforeEach(async () => {
  await truncateAll(db);
  getMemoryEmailProvider()?.clear();
});

async function owner(email = 'owner@reminders.test', companyName = 'Reminder Travel') {
  const client = createAuthClient(app);
  expect(
    (await client.post('/api/auth/register', registrationPayload({ email, companyName }))).status,
  ).toBe(201);
  expect(
    (await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) }))
      .status,
  ).toBe(200);
  return client;
}

async function employee(ownerEmail: string, roleName: string, email: string) {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const role = await db.role.findFirstOrThrow({
    where: { companyId: ownerUser.companyId, name: roleName },
  });
  const user = await db.user.create({
    data: {
      companyId: ownerUser.companyId,
      roleId: role.id,
      username: email.split('@')[0]!,
      fullName: `${roleName} Agent`,
      email,
      normalizedEmail: email,
      passwordHash: await hashPassword('Reminder@2026'),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const client = createAuthClient(app);
  expect(
    (await client.post('/api/auth/login', { email, password: 'Reminder@2026', rememberMe: false }))
      .status,
  ).toBe(200);
  return { client, user };
}

const reminderPayload = (assignedToId: string) => ({
  title: 'Confirm passport documents',
  description: 'Collect the missing passport scan from the customer.',
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  assignedToId,
  reminderType: 'DOCUMENT_PENDING',
  priority: 'HIGH',
});

describe('Phase 12 reminders, notifications and automation', () => {
  it('provisions default rules and performs the complete manual reminder lifecycle atomically', async () => {
    const client = await owner();
    const ownerUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@reminders.test' },
    });
    expect(
      await db.reminderRule.count({ where: { companyId: ownerUser.companyId } }),
    ).toBeGreaterThan(10);

    const created = await client.post('/api/reminders', reminderPayload(ownerUser.id));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      title: 'Confirm passport documents',
      status: 'ACTIVE',
      priority: 'HIGH',
    });
    expect(
      await db.activityLog.count({
        where: { entityId: created.body.data.id, action: 'REMINDER_CREATED' },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { reminderId: created.body.data.id, recipientUserId: ownerUser.id },
      }),
    ).toBe(1);
    expect(
      await db.notificationDelivery.count({
        where: { notification: { reminderId: created.body.data.id } },
      }),
    ).toBe(2);

    expect(
      (
        await client.patch(`/api/reminders/${created.body.data.id}/snooze`, {
          until: new Date(Date.now() + 172_800_000).toISOString(),
          reason: 'Waiting for customer',
        })
      ).body.data.status,
    ).toBe('SNOOZED');
    expect(
      (
        await client.patch(`/api/reminders/${created.body.data.id}/complete`, {
          outcome: 'Documents received',
          notes: 'Verified by sales',
        })
      ).body.data.status,
    ).toBe('COMPLETED');
    const stored = await db.queryFollowUp.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.completedById).toBe(ownerUser.id);
    expect(stored.completionOutcome).toBe('Documents received');
  });

  it('enforces reminder visibility, recipient-only notifications and tenant isolation', async () => {
    const admin = await owner();
    const ownerUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@reminders.test' },
    });
    const sales = await employee('owner@reminders.test', 'Sales Executive', 'sales@reminders.test');
    const viewer = await employee('owner@reminders.test', 'View Only', 'viewer@reminders.test');
    const assigned = await admin.post('/api/reminders', reminderPayload(sales.user.id));
    const privateOwner = await admin.post('/api/reminders', {
      ...reminderPayload(ownerUser.id),
      title: 'Owner private reminder',
    });

    const salesList = await sales.client.get('/api/reminders');
    expect(salesList.body.data.data.map((row: { id: string }) => row.id)).toContain(
      assigned.body.data.id,
    );
    expect(salesList.body.data.data.map((row: { id: string }) => row.id)).not.toContain(
      privateOwner.body.data.id,
    );
    expect(
      (await sales.client.get('/api/notifications')).body.data.data.every((row: { id: string }) =>
        Boolean(row.id),
      ),
    ).toBe(true);
    expect((await viewer.client.get(`/api/reminders/${assigned.body.data.id}`)).status).toBe(404);
    expect(
      (await viewer.client.post('/api/reminders', reminderPayload(viewer.user.id))).status,
    ).toBe(403);

    const other = await owner('other@reminders.test', 'Other Reminder Travel');
    expect((await other.get(`/api/reminders/${assigned.body.data.id}`)).status).toBe(404);
    expect((await other.get('/api/notifications')).body.data.data).toEqual([]);
  });

  it('supports recipient inbox actions and persists personal preferences independently', async () => {
    const client = await owner();
    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@reminders.test' },
    });
    await client.post('/api/reminders', reminderPayload(user.id));
    const inbox = await client.get('/api/notifications?status=UNREAD');
    const notification = inbox.body.data.data[0];
    expect(notification.status).toBe('UNREAD');
    expect(
      (await client.patch(`/api/notifications/${notification.id}/read`)).body.data.status,
    ).toBe('READ');
    expect(
      (await client.patch(`/api/notifications/${notification.id}/unread`)).body.data.status,
    ).toBe('UNREAD');
    expect((await client.patch('/api/notifications/read-all')).body.data.updated).toBeGreaterThan(
      0,
    );
    expect(
      (await client.patch(`/api/notifications/${notification.id}/archive`)).body.data.status,
    ).toBe('ARCHIVED');

    const preference = {
      inAppEnabled: true,
      emailEnabled: false,
      reminderAlerts: true,
      overdueAlerts: true,
      escalationAlerts: false,
      bookingAlerts: true,
      paymentAlerts: true,
      quotationAlerts: true,
      documentAlerts: true,
      vendorAlerts: false,
      digestMode: 'NONE',
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    };
    expect(
      (await client.patch('/api/notification-preferences', preference)).body.data,
    ).toMatchObject(preference);
    expect(await db.notificationPreference.count({ where: { userId: user.id } })).toBe(1);
  });

  it('processes lead-stage automation idempotently and exposes safe rule preview/run APIs', async () => {
    const client = await owner();
    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@reminders.test' },
    });
    const lead = await client.post('/api/queries', {
      customerName: 'Automation Customer',
      phone: '+91 90000 12345',
      leadSource: 'REFERRAL',
      leadType: 'FRESH',
      leadStage: 'NEW_LEAD',
      priority: 'HIGH',
      rooms: 1,
      adults: 2,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      extraBeds: 0,
      currency: 'INR',
      services: ['HOTEL'],
      itinerary: [{ country: 'India', destination: 'Goa', nights: 3, sequence: 1 }],
    });
    expect(lead.status).toBe(201);
    const rule = await db.reminderRule.findFirstOrThrow({
      where: { companyId: user.companyId, ruleType: 'LEAD_STAGE', leadStage: 'NEW_LEAD' },
    });
    const preview = await client.get(`/api/reminder-rules/${rule.id}/preview`);
    expect(preview.body.data.eligible).toBeGreaterThan(0);
    await reminderProcessor.processCompany(user.companyId, { ruleId: rule.id });
    await reminderProcessor.processCompany(user.companyId, { ruleId: rule.id });
    expect(
      await db.queryFollowUp.count({
        where: { companyId: user.companyId, reminderRuleId: rule.id, queryId: lead.body.data.id },
      }),
    ).toBe(1);
    expect(
      await db.reminderExecution.count({
        where: { companyId: user.companyId, ruleId: rule.id, entityId: lead.body.data.id },
      }),
    ).toBe(1);
    expect((await client.post(`/api/reminder-rules/${rule.id}/run-preview`)).status).toBe(200);
  });
});
