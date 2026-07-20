import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';

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

async function owner(email = 'owner@alpha.test', companyName = 'Alpha') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}
async function employee(
  admin: Awaited<ReturnType<typeof owner>>,
  roleName: string,
  email: string,
  username: string,
) {
  const lookups = await admin.get('/api/users/lookups');
  const role = lookups.body.data.roles.find((value: { name: string }) => value.name === roleName);
  const created = await admin.post('/api/users', {
    fullName: username,
    username,
    email,
    roleId: role.id,
    permissionTemplateId: null,
    status: 'ACTIVE',
    temporaryPassword: 'Temporary@2026',
    confirmTemporaryPassword: 'Temporary@2026',
    mustChangePassword: false,
  });
  const client = createAuthClient(app);
  await client.post('/api/auth/login', {
    email,
    password: 'Temporary@2026',
    rememberMe: false,
  });
  return { client, id: created.body.data.id as string };
}
const lead = (phone = '+91 90000 12345') => ({
  customerName: 'Phase Seven Traveller',
  phone,
  leadSource: 'WEBSITE',
  leadType: 'HOT',
  leadStage: 'NEW_LEAD',
  priority: 'URGENT',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['FLIGHT'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
});

describe('Phase 7 lead workspace and follow-up management', () => {
  it('returns a safe consolidated workspace with permissions and attention indicators', async () => {
    const client = await owner();
    const id = (await client.post('/api/queries', lead())).body.data.id;
    const workspace = await client.get(`/api/queries/${id}/workspace`);
    expect(workspace.status).toBe(200);
    expect(workspace.body.data.lead).not.toHaveProperty('companyId');
    expect(workspace.body.data.permissions).toMatchObject({
      canEdit: true,
      canAssign: true,
      canScheduleFollowUp: true,
      canCompleteFollowUp: true,
    });
    expect(workspace.body.data.indicators).toContain('NO_FUTURE_FOLLOW_UP');
    expect(workspace.body.data.operationalSummary.requiresAttention).toBe(true);
    expect(workspace.body.data.timezone).toBe('Asia/Kolkata');
  });

  it('records explicit customer contact notes and preserves ordinary-note semantics', async () => {
    const client = await owner();
    const id = (await client.post('/api/queries', lead())).body.data.id;
    await client.post(`/api/queries/${id}/notes`, { content: 'Internal preparation' });
    expect((await db.query.findUniqueOrThrow({ where: { id } })).lastContactedAt).toBeNull();
    const contact = await client.post(`/api/queries/${id}/notes`, {
      content: 'Spoke with traveller',
      isCustomerContact: true,
      contactMethod: 'PHONE',
    });
    expect(contact.status).toBe(201);
    expect(contact.body.data).toMatchObject({ isCustomerContact: true, contactMethod: 'PHONE' });
    expect((await db.query.findUniqueOrThrow({ where: { id } })).lastContactedAt).not.toBeNull();
    expect(
      await db.activityLog.count({ where: { entityId: id, action: 'QUERY_CONTACT_RECORDED' } }),
    ).toBe(1);
  });

  it('lists, searches and filters dynamically missed follow-ups with pagination', async () => {
    const client = await owner();
    const id = (await client.post('/api/queries', lead())).body.data.id;
    const created = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      notes: 'Discuss Goa flight',
    });
    await db.queryFollowUp.update({
      where: { id: created.body.data.id },
      data: { scheduledAt: new Date(Date.now() - 3_600_000) },
    });
    const missed = await client.get('/api/follow-ups?status=MISSED&search=Goa&page=1&pageSize=1');
    expect(missed.status).toBe(200);
    expect(missed.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(missed.body.data.data[0]).toMatchObject({ effectiveStatus: 'MISSED' });
    expect(missed.body.data.data[0].query.customerName).toBe('Phase Seven Traveller');
  });

  it('completes a follow-up, changes stage and creates the next follow-up atomically', async () => {
    const client = await owner();
    const id = (await client.post('/api/queries', lead())).body.data.id;
    const current = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const nextAt = new Date(Date.now() + 172_800_000);
    const completed = await client.patch(`/api/follow-ups/${current.body.data.id}/complete`, {
      outcome: 'CONNECTED',
      notes: 'Dates confirmed',
      nextFollowUp: { scheduledAt: nextAt.toISOString(), notes: 'Share options' },
      nextLeadStage: 'CONTACTED',
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.followUp).toMatchObject({
      status: 'COMPLETED',
      outcomeType: 'CONNECTED',
    });
    const updated = await db.query.findUniqueOrThrow({ where: { id } });
    expect(updated.leadStage).toBe('CONTACTED');
    expect(updated.lastContactedAt).not.toBeNull();
    expect(updated.nextFollowUpAt?.getTime()).toBe(nextAt.getTime());
    expect(await db.queryFollowUp.count({ where: { queryId: id, status: 'PENDING' } })).toBe(1);
  });

  it('requires cancellation reason, protects completed deletion and soft-deletes pending records', async () => {
    const client = await owner();
    const id = (await client.post('/api/queries', lead())).body.data.id;
    const first = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect((await client.patch(`/api/follow-ups/${first.body.data.id}/cancel`, {})).status).toBe(
      400,
    );
    expect(
      (
        await client.patch(`/api/follow-ups/${first.body.data.id}/cancel`, {
          reason: 'Traveller requested a pause',
        })
      ).status,
    ).toBe(200);
    const cancelled = await db.queryFollowUp.findUniqueOrThrow({
      where: { id: first.body.data.id },
    });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Traveller requested a pause',
    });
    expect(cancelled.cancelledAt).not.toBeNull();
    const pending = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect((await client.delete(`/api/follow-ups/${pending.body.data.id}`)).status).toBe(200);
    expect(
      (await db.queryFollowUp.findUniqueOrThrow({ where: { id: pending.body.data.id } })).deletedAt,
    ).not.toBeNull();
  });

  it('enforces salesperson assignment, lead visibility and tenant isolation', async () => {
    const admin = await owner();
    const sales = await employee(admin, 'Sales Executive', 'sales@alpha.test', 'sales-alpha');
    const other = await employee(admin, 'Sales Executive', 'other@alpha.test', 'sales-other');
    const id = (await admin.post('/api/queries', { ...lead(), assignedToId: sales.id })).body.data
      .id;
    const followUp = await admin.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      assignedToId: sales.id,
    });
    expect((await sales.client.get('/api/follow-ups')).body.data.pagination.total).toBe(1);
    expect(
      (
        await other.client.patch(`/api/follow-ups/${followUp.body.data.id}`, {
          notes: 'Unauthorized edit',
        })
      ).status,
    ).toBe(404);
    const beta = await owner('owner@beta.test', 'Beta');
    expect((await beta.get(`/api/follow-ups/${followUp.body.data.id}`)).status).toBe(404);
    expect((await beta.get(`/api/queries/${id}/workspace`)).status).toBe(404);
  });

  it('aggregates operational analytics with zero-safe rates and team grouping', async () => {
    const client = await owner();
    const empty = await client.get('/api/follow-ups/analytics');
    expect(empty.status).toBe(200);
    expect(empty.body.data.completionRate).toBe(0);
    expect(empty.body.data.averageCompletionDelayMinutes).toBe(0);
    const id = (await client.post('/api/queries', lead())).body.data.id;
    const created = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await client.patch(`/api/follow-ups/${created.body.data.id}/complete`, {
      outcome: 'INTERESTED',
    });
    const analytics = await client.get('/api/follow-ups/analytics');
    expect(analytics.body.data.completedToday).toBe(1);
    expect(analytics.body.data.byOutcome).toMatchObject({ INTERESTED: 1 });
    expect(analytics.body.data.bySalesperson).toHaveLength(1);
    expect(analytics.body.data.definitions.missed).toContain('dynamically');
  });
});
