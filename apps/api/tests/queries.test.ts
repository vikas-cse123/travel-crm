import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { hashPassword } from '../src/utils/crypto.js';

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
async function owner(email: string, companyName: string) {
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
  status = 'ACTIVE',
) {
  const lookups = await admin.get('/api/users/lookups');
  const role = lookups.body.data.roles.find((value: { name: string }) => value.name === roleName);
  return admin.post('/api/users', {
    fullName: username.replaceAll('-', ' '),
    username,
    email,
    roleId: role.id,
    permissionTemplateId: null,
    status,
    temporaryPassword: 'Temporary@2026',
    confirmTemporaryPassword: 'Temporary@2026',
    mustChangePassword: false,
  });
}
async function signIn(email: string) {
  const client = createAuthClient(app);
  const response = await client.post('/api/auth/login', {
    email,
    password: 'Temporary@2026',
    rememberMe: false,
  });
  expect(response.status).toBe(200);
  return client;
}
const payload = (phone = '+91 98765 43210') => ({
  customerName: 'Aarav Mehta',
  phone,
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'NEW_LEAD',
  priority: 'HIGH',
  rooms: 2,
  adults: 3,
  childrenWithBed: 1,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['FLIGHT', 'HOTEL'],
  itinerary: [
    { country: 'Thailand', destination: 'Bangkok', nights: 3, sequence: 1 },
    { country: 'Thailand', destination: 'Phuket', nights: 4, sequence: 2 },
  ],
  initialNote: 'Family holiday enquiry',
});

describe('Phase 6 travel lead management', () => {
  it('creates a transactional lead with normalized phone, services, ordered itinerary and histories', async () => {
    const client = await owner('owner@alpha.test', 'Alpha Travel');
    const response = await client.post('/api/queries', payload());
    expect(response.status).toBe(201);
    expect(response.body.data.queryNumber).toMatch(/^QRY-\d{4}-000001$/);
    expect(response.body.data.travellerSummary).toContain('3 Adults');
    expect(response.body.data.services).toHaveLength(2);
    expect(response.body.data.itinerary.map((x: { destination: string }) => x.destination)).toEqual(
      ['Bangkok', 'Phuket'],
    );
    expect(response.body.data).not.toHaveProperty('companyId');
    expect(response.body.data).not.toHaveProperty('normalizedPhone');
    expect(response.body.data).not.toHaveProperty('deletedAt');
    expect(response.body.data.itinerary[0]).not.toHaveProperty('companyId');
    expect(response.body.data.itinerary[0]).not.toHaveProperty('queryId');
    expect(response.body.data.assignedToId).toBe(response.body.data.createdById);
    const row = await db.query.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(row.normalizedPhone).toBe('9876543210');
    expect(await db.queryStageHistory.count({ where: { queryId: row.id } })).toBe(1);
    expect(await db.queryAssignmentHistory.count({ where: { queryId: row.id } })).toBe(1);
    expect(
      await db.activityLog.count({ where: { entityId: row.id, action: 'QUERY_CREATED' } }),
    ).toBe(1);
  });
  it('allocates unique company-scoped query numbers under concurrent creation', async () => {
    const client = await owner('owner@alpha.test', 'Alpha Travel');
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        client.post('/api/queries', payload(`+91 98765 43${210 + i}`)),
      ),
    );
    expect(created.every((r) => r.status === 201)).toBe(true);
    const numbers = created.map((r) => r.body.data.queryNumber);
    expect(new Set(numbers).size).toBe(6);
    expect(await db.queryCounter.findFirst()).toMatchObject({ value: 6 });
  });
  it('searches duplicate phone safely and enforces tenant isolation', async () => {
    const alpha = await owner('owner@alpha.test', 'Alpha');
    const created = await alpha.post('/api/queries', payload());
    const beta = await owner('owner@beta.test', 'Beta');
    const matches = await alpha.get('/api/queries/search-by-phone?phone=98765');
    expect(matches.body.data[0]).toMatchObject({
      customerName: 'Aarav Mehta',
      phone: '+91 98765 43210',
    });
    expect(JSON.stringify(matches.body.data)).not.toContain('internalRemarks');
    expect((await beta.get(`/api/queries/${created.body.data.id}`)).status).toBe(404);
    expect((await beta.get('/api/queries/search-by-phone?phone=98765')).body.data).toEqual([]);
  });
  it('filters and paginates leads and returns real visibility-scoped analytics', async () => {
    const client = await owner('owner@alpha.test', 'Alpha');
    await client.post('/api/queries', {
      ...payload(),
      travelStartDate: '2026-08-15',
      travelEndDate: '2026-08-22',
    });
    await client.post('/api/queries', {
      ...payload('+91 90000 00000'),
      customerName: 'Nina Shah',
      leadType: 'COLD',
      priority: 'LOW',
    });
    const list = await client.get(
      '/api/queries?leadType=HOT&search=Bangkok&page=1&pageSize=1&sortBy=customerName&sortOrder=asc',
    );
    expect(list.body.data.data).toHaveLength(1);
    expect(list.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    const dateFiltered = await client.get('/api/queries?travelFrom=2026-08-15&travelTo=2026-08-15');
    expect(dateFiltered.body.data.pagination.total).toBe(1);
    const analytics = await client.get('/api/queries/analytics');
    expect(analytics.body.data.totalLeads).toBe(2);
    expect(analytics.body.data.byLeadType).toMatchObject({ HOT: 1, COLD: 1 });
    expect(analytics.body.data.conversionRate).toBe(0);
  });
  it('limits Sales Executive visibility to assigned or created leads and denies assignment', async () => {
    const admin = await owner('owner@alpha.test', 'Alpha');
    const roleResponse = await admin.get('/api/users/lookups');
    const salesRole = roleResponse.body.data.roles.find(
      (role: { name: string }) => role.name === 'Sales Executive',
    );
    const salesUser = await admin.post('/api/users', {
      fullName: 'Sales Agent',
      username: 'sales-agent',
      email: 'sales@alpha.test',
      roleId: salesRole.id,
      permissionTemplateId: null,
      status: 'ACTIVE',
      temporaryPassword: 'Temporary@2026',
      confirmTemporaryPassword: 'Temporary@2026',
      mustChangePassword: false,
    });
    const assigned = await admin.post('/api/queries', {
      ...payload('+91 91111 11111'),
      assignedToId: salesUser.body.data.id,
    });
    const unrelated = await admin.post('/api/queries', payload('+91 92222 22222'));
    const sales = createAuthClient(app);
    expect(
      (
        await sales.post('/api/auth/login', {
          email: 'sales@alpha.test',
          password: 'Temporary@2026',
          rememberMe: false,
        })
      ).status,
    ).toBe(200);
    const list = await sales.get('/api/queries');
    expect(list.body.data.data.map((lead: { id: string }) => lead.id)).toEqual([
      assigned.body.data.id,
    ]);
    expect((await sales.get(`/api/queries/${unrelated.body.data.id}`)).status).toBe(404);
    expect(
      (
        await sales.patch(`/api/queries/${assigned.body.data.id}/assignment`, {
          assignedToId: null,
          movePendingFollowUps: false,
        })
      ).status,
    ).toBe(403);
  });
  it('enforces transitions and manages notes and follow-ups with audit history', async () => {
    const client = await owner('owner@alpha.test', 'Alpha');
    const id = (await client.post('/api/queries', payload())).body.data.id;
    expect(
      (await client.patch(`/api/queries/${id}/stage`, { stage: 'QUOTATION_SENT' })).status,
    ).toBe(400);
    expect((await client.patch(`/api/queries/${id}/stage`, { stage: 'CONTACTED' })).status).toBe(
      200,
    );
    expect((await client.patch(`/api/queries/${id}/stage`, { stage: 'LOST' })).status).toBe(400);
    expect(
      (
        await client.patch(`/api/queries/${id}/stage`, {
          stage: 'LOST',
          lostReason: 'Budget changed',
        })
      ).status,
    ).toBe(200);
    expect((await db.query.findUniqueOrThrow({ where: { id } })).lostReason).toBe('Budget changed');
    const note = await client.post(`/api/queries/${id}/notes`, { content: 'Called customer' });
    expect(note.status).toBe(201);
    await client.patch(`/api/queries/${id}/notes/${note.body.data.id}`, {
      content: 'Customer called back',
    });
    expect((await client.get(`/api/queries/${id}/notes`)).body.data[0].content).toBe(
      'Customer called back',
    );
    const followUp = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      notes: 'Discuss flights',
    });
    expect(followUp.status).toBe(201);
    expect((await db.query.findUniqueOrThrow({ where: { id } })).nextFollowUpAt).not.toBeNull();
    await client.patch(`/api/queries/${id}/follow-ups/${followUp.body.data.id}/complete`, {
      outcome: 'CONNECTED',
      notes: 'Requirements captured',
    });
    const updated = await db.query.findUniqueOrThrow({ where: { id } });
    expect(updated.nextFollowUpAt).toBeNull();
    expect(updated.lastContactedAt).not.toBeNull();
    expect((await client.get(`/api/queries/${id}/timeline`)).body.data.data.length).toBeGreaterThan(
      4,
    );
  });
  it('sets convertedAt, protects terminal stages, and allows an Owner to reopen them', async () => {
    const admin = await owner('owner@alpha.test', 'Alpha');
    const salesUser = await employee(admin, 'Sales Executive', 'sales@alpha.test', 'sales-agent');
    const id = (
      await admin.post('/api/queries', {
        ...payload(),
        assignedToId: salesUser.body.data.id,
      })
    ).body.data.id;
    for (const stage of [
      'QUALIFIED',
      'QUOTATION_REQUIRED',
      'QUOTATION_SENT',
      'READY_TO_BOOK',
      'BOOKING_CONFIRMED',
    ]) {
      expect((await admin.patch(`/api/queries/${id}/stage`, { stage })).status).toBe(200);
    }
    expect((await db.query.findUniqueOrThrow({ where: { id } })).convertedAt).not.toBeNull();
    const analytics = await admin.get('/api/queries/analytics');
    expect(analytics.body.data.conversionRate).toBe(100);
    expect(analytics.body.data.winRate).toBe(100);
    const sales = await signIn('sales@alpha.test');
    expect((await sales.patch(`/api/queries/${id}/stage`, { stage: 'CONTACTED' })).status).toBe(
      403,
    );
    expect((await admin.patch(`/api/queries/${id}/stage`, { stage: 'CONTACTED' })).status).toBe(
      200,
    );
    expect((await db.query.findUniqueOrThrow({ where: { id } })).convertedAt).toBeNull();
    expect(await db.queryStageHistory.count({ where: { queryId: id } })).toBe(7);
  });
  it('rejects cross-company and inactive assignees without leaving partial leads', async () => {
    const alpha = await owner('owner@alpha.test', 'Alpha');
    const beta = await owner('owner@beta.test', 'Beta');
    const betaOwner = await db.user.findFirstOrThrow({ where: { email: 'owner@beta.test' } });
    const inactive = await employee(
      alpha,
      'Sales Executive',
      'inactive@alpha.test',
      'inactive-agent',
      'INACTIVE',
    );
    expect(
      (
        await alpha.post('/api/queries', {
          ...payload(),
          assignedToId: betaOwner.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await alpha.post('/api/queries', {
          ...payload(),
          assignedToId: inactive.body.data.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await alpha.post('/api/queries', {
          ...payload(),
          initialFollowUp: {
            scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
            assignedToId: betaOwner.id,
          },
        })
      ).status,
    ).toBe(400);
    expect(await db.query.count()).toBe(0);
    const alphaOwner = await db.user.findFirstOrThrow({ where: { email: 'owner@alpha.test' } });
    const injected = await alpha.post('/api/queries', {
      ...payload(),
      companyId: betaOwner.companyId,
    });
    expect(injected.status).toBe(201);
    expect(
      (await db.query.findUniqueOrThrow({ where: { id: injected.body.data.id } })).companyId,
    ).toBe(alphaOwner.companyId);
    expect((await beta.get(`/api/queries/${injected.body.data.id}`)).status).toBe(404);
  });
  it('records reassignment history and explicitly moves pending follow-ups', async () => {
    const admin = await owner('owner@alpha.test', 'Alpha');
    const salesUser = await employee(admin, 'Sales Executive', 'sales@alpha.test', 'sales-agent');
    const id = (await admin.post('/api/queries', payload())).body.data.id;
    const followUp = await admin.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(
      (
        await admin.patch(`/api/queries/${id}/assignment`, {
          assignedToId: salesUser.body.data.id,
          movePendingFollowUps: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.queryFollowUp.findUniqueOrThrow({ where: { id: followUp.body.data.id } }))
        .assignedToId,
    ).toBe(salesUser.body.data.id);
    expect(await db.queryAssignmentHistory.count({ where: { queryId: id } })).toBe(2);
    expect(await db.activityLog.count({ where: { entityId: id, action: 'QUERY_ASSIGNED' } })).toBe(
      1,
    );
  });
  it('enforces note authorship while allowing Owner override and soft deletion', async () => {
    const admin = await owner('owner@alpha.test', 'Alpha');
    const first = await employee(admin, 'Sales Executive', 'first@alpha.test', 'first-agent');
    await employee(admin, 'Sales Executive', 'second@alpha.test', 'second-agent');
    const secondClient = await signIn('second@alpha.test');
    const id = (await secondClient.post('/api/queries', payload())).body.data.id;
    await admin.patch(`/api/queries/${id}/assignment`, {
      assignedToId: first.body.data.id,
      movePendingFollowUps: false,
    });
    const firstClient = await signIn('first@alpha.test');
    const note = await firstClient.post(`/api/queries/${id}/notes`, { content: 'Authored note' });
    expect(
      (
        await secondClient.patch(`/api/queries/${id}/notes/${note.body.data.id}`, {
          content: 'Unauthorized edit',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.patch(`/api/queries/${id}/notes/${note.body.data.id}`, {
          content: 'Owner-approved edit',
        })
      ).status,
    ).toBe(200);
    expect((await admin.delete(`/api/queries/${id}/notes/${note.body.data.id}`)).status).toBe(200);
    expect(
      (await db.queryNote.findUniqueOrThrow({ where: { id: note.body.data.id } })).deletedAt,
    ).not.toBeNull();
  });
  it('edits, cancels, completes and soft-deletes follow-ups with paginated safe timeline entries', async () => {
    const client = await owner('owner@alpha.test', 'Alpha');
    const id = (await client.post('/api/queries', payload())).body.data.id;
    const later = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 172_800_000).toISOString(),
      notes: 'Later call',
    });
    const sooner = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      notes: 'Sooner call',
    });
    const earliest = new Date(Date.now() + 3_600_000);
    expect(
      (
        await client.patch(`/api/queries/${id}/follow-ups/${later.body.data.id}`, {
          scheduledAt: earliest.toISOString(),
          notes: 'Moved earlier',
        })
      ).status,
    ).toBe(200);
    expect((await db.query.findUniqueOrThrow({ where: { id } })).nextFollowUpAt?.getTime()).toBe(
      earliest.getTime(),
    );
    expect(
      (
        await client.patch(`/api/queries/${id}/follow-ups/${later.body.data.id}/cancel`, {
          reason: 'No longer needed',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.patch(`/api/queries/${id}/follow-ups/${later.body.data.id}/complete`, {
          outcome: 'CONNECTED',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client.patch(`/api/queries/${id}/follow-ups/${sooner.body.data.id}/complete`, {
          outcome: 'CONNECTED',
          notes: 'Customer contacted',
        })
      ).status,
    ).toBe(200);
    expect((await db.query.findUniqueOrThrow({ where: { id } })).lastContactedAt).not.toBeNull();
    expect(
      (await client.delete(`/api/queries/${id}/follow-ups/${sooner.body.data.id}`)).status,
    ).toBe(400);
    const pendingToDelete = await client.post(`/api/queries/${id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 259_200_000).toISOString(),
      notes: 'Temporary follow-up',
    });
    expect(
      (await client.delete(`/api/queries/${id}/follow-ups/${pendingToDelete.body.data.id}`)).status,
    ).toBe(200);
    expect(
      (await db.queryFollowUp.findUniqueOrThrow({ where: { id: pendingToDelete.body.data.id } }))
        .deletedAt,
    ).not.toBeNull();
    const timeline = await client.get(`/api/queries/${id}/timeline?page=1&pageSize=2`);
    expect(timeline.body.data.data).toHaveLength(2);
    expect(timeline.body.data.pagination.total).toBeGreaterThan(2);
    expect(timeline.body.data.data[0]).not.toHaveProperty('companyId');
    expect(timeline.body.data.data[0].metadata).not.toHaveProperty('followUpId');
    expect(
      await db.activityLog.count({
        where: {
          entityId: id,
          action: {
            in: [
              'QUERY_FOLLOW_UP_RESCHEDULED',
              'QUERY_FOLLOW_UP_COMPLETED',
              'QUERY_FOLLOW_UP_CANCELLED',
              'QUERY_FOLLOW_UP_DELETED',
            ],
          },
        },
      }),
    ).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Phase 17 — enriched list, quick actions, bulk operations and CSV export
// ---------------------------------------------------------------------------

/** A client whose role holds only the given permission keys. */
async function restrictedClient(ownerEmail: string, keys: string[], email: string) {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const role = await db.role.create({
    data: {
      companyId: ownerUser.companyId,
      name: `Restricted ${email.split('@')[0]}`,
      description: 'Test role',
      hierarchyLevel: 10,
      isSystem: false,
    },
  });
  for (const key of keys) {
    const permission = await db.permission.findUniqueOrThrow({ where: { key } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  await db.user.create({
    data: {
      companyId: ownerUser.companyId,
      roleId: role.id,
      username: email.split('@')[0]!,
      fullName: 'Restricted User',
      email,
      normalizedEmail: email,
      passwordHash: await hashPassword('Sales@2026'),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const client = createAuthClient(app);
  expect(
    (await client.post('/api/auth/login', { email, password: 'Sales@2026', rememberMe: false }))
      .status,
  ).toBe(200);
  return client;
}

/** Create a lead, an accepted quotation for it, and return both. */
async function acceptedQuotation(client: ReturnType<typeof createAuthClient>, leadId: string) {
  const quotation = (await client.post('/api/quotations', { queryId: leadId })).body.data;
  const version = quotation.versions[0];
  await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
  await db.quotation.update({
    where: { id: quotation.id },
    data: { status: 'ACCEPTED', acceptedVersionId: version.id, acceptedAt: new Date() },
  });
  return { quotation, version };
}

describe('Phase 17 lead workflow parity', () => {
  it('enriches list rows with source, creator, quotation and booking summaries', async () => {
    const client = await owner('owner@p17.test', 'P17 Travel');
    const lead = (await client.post('/api/queries', payload())).body.data;
    await acceptedQuotation(client, lead.id);

    const list = await client.get('/api/queries');
    const row = list.body.data.data.find((r: { id: string }) => r.id === lead.id);
    expect(row.leadSource).toBe('REFERRAL');
    expect(row.createdBy).toHaveProperty('fullName');
    expect(row.quotationSummary).toMatchObject({ quotationStatus: 'ACCEPTED' });
    expect(row.quotationSummary.latestVersionAmount).not.toBeUndefined();
    // Accepted, unbooked quotation → convertible.
    expect(row.actions).toMatchObject({
      canCreateQuotation: true,
      canOpenQuotation: true,
      canConvertToBooking: true,
      canViewBooking: false,
    });
    expect(row.bookingSummary).toBeNull();
  });

  it('suppresses conversion and shows the booking summary once converted', async () => {
    const client = await owner('owner@p17b.test', 'P17b Travel');
    const lead = (await client.post('/api/queries', payload())).body.data;
    const { quotation } = await acceptedQuotation(client, lead.id);
    const booking = await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {});
    expect(booking.status).toBe(201);

    const list = await client.get('/api/queries');
    const row = list.body.data.data.find((r: { id: string }) => r.id === lead.id);
    expect(row.actions.canConvertToBooking).toBe(false);
    expect(row.actions.canViewBooking).toBe(true);
    expect(row.bookingSummary).toMatchObject({ bookingNumber: booking.body.data.bookingNumber });
    expect(row.bookingSummary).toHaveProperty('paymentStatus'); // owner has financials
  });

  it('omits quotation and booking blocks without the module permissions', async () => {
    const client = await owner('owner@p17c.test', 'P17c Travel');
    const lead = (await client.post('/api/queries', payload())).body.data;
    await acceptedQuotation(client, lead.id);
    // A user who can view leads but not quotations/bookings.
    const restricted = await restrictedClient(
      'owner@p17c.test',
      ['queries.view'],
      'restricted@p17c.test',
    );
    // Reassign the lead to the restricted user so it is visible to them.
    const restrictedUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'restricted@p17c.test' },
    });
    await db.query.update({ where: { id: lead.id }, data: { assignedToId: restrictedUser.id } });

    const list = await restricted.get('/api/queries');
    const row = list.body.data.data.find((r: { id: string }) => r.id === lead.id);
    expect(row.quotationSummary).toBeNull();
    expect(row.bookingSummary).toBeNull();
    expect(row.actions.canOpenQuotation).toBe(false);
    expect(row.actions.canConvertToBooking).toBe(false);
  });

  it('omits booking payment status without financial permission', async () => {
    const client = await owner('owner@p17d.test', 'P17d Travel');
    const lead = (await client.post('/api/queries', payload())).body.data;
    const { quotation } = await acceptedQuotation(client, lead.id);
    await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {});
    const restricted = await restrictedClient(
      'owner@p17d.test',
      ['queries.view', 'bookings.view'],
      'nofin@p17d.test',
    );
    const restrictedUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'nofin@p17d.test' },
    });
    await db.query.update({ where: { id: lead.id }, data: { assignedToId: restrictedUser.id } });
    const list = await restricted.get('/api/queries');
    const row = list.body.data.data.find((r: { id: string }) => r.id === lead.id);
    expect(row.bookingSummary).not.toBeNull();
    expect(row.bookingSummary).not.toHaveProperty('paymentStatus');
  });

  it('bulk-assigns leads, moves pending follow-ups and writes history', async () => {
    const client = await owner('owner@p17e.test', 'P17e Travel');
    await employee(client, 'Sales Executive', 'agent@p17e.test', 'agent-p17e');
    const agent = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'agent@p17e.test' },
    });
    const a = (await client.post('/api/queries', payload('+91 90000 11111'))).body.data;
    const b = (await client.post('/api/queries', payload('+91 90000 22222'))).body.data;
    // A pending follow-up on lead A.
    await client.post(`/api/queries/${a.id}/follow-ups`, {
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      reminderPriority: 'HIGH',
    });

    const result = await client.post('/api/queries/bulk-assignment', {
      queryIds: [a.id, b.id, a.id],
      assignedToId: agent.id,
    });
    expect(result.status).toBe(200);
    expect(result.body.data.updatedCount).toBe(2);
    expect(await db.query.count({ where: { assignedToId: agent.id } })).toBe(2);
    expect(await db.queryFollowUp.count({ where: { queryId: a.id, assignedToId: agent.id } })).toBe(
      1,
    );
    expect(await db.queryAssignmentHistory.count({ where: { queryId: a.id } })).toBeGreaterThan(0);
  });

  it('rejects a bulk assignment with a cross-company assignee or an unauthorized lead', async () => {
    const client = await owner('owner@p17f.test', 'P17f Travel');
    const lead = (await client.post('/api/queries', payload())).body.data;
    const beta = await owner('owner@p17f-beta.test', 'P17f Beta');
    const betaLead = (await beta.post('/api/queries', payload('+91 90000 33333'))).body.data;
    const betaUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@p17f-beta.test' },
    });
    // Cross-company assignee.
    expect(
      (
        await client.post('/api/queries/bulk-assignment', {
          queryIds: [lead.id],
          assignedToId: betaUser.id,
        })
      ).status,
    ).toBe(400);
    // A lead the caller cannot see (belongs to beta) → all-or-nothing rejection.
    const self = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'owner@p17f.test' } });
    const before = (await db.query.findUniqueOrThrow({ where: { id: lead.id } })).assignedToId;
    expect(
      (
        await client.post('/api/queries/bulk-assignment', {
          queryIds: [lead.id, betaLead.id],
          assignedToId: self.id,
        })
      ).status,
    ).toBe(400);
    // The batch is atomic: the visible lead's assignment is unchanged by the
    // rejected call.
    expect((await db.query.findUniqueOrThrow({ where: { id: lead.id } })).assignedToId).toBe(
      before,
    );
  });

  it('enforces the 100-id maximum on bulk operations', async () => {
    const client = await owner('owner@p17g.test', 'P17g Travel');
    const self = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'owner@p17g.test' } });
    const ids = Array.from({ length: 101 }, () => crypto.randomUUID());
    expect(
      (await client.post('/api/queries/bulk-assignment', { queryIds: ids, assignedToId: self.id }))
        .status,
    ).toBe(400);
  });

  it('bulk-changes stage with history and rejects invalid transitions atomically', async () => {
    const client = await owner('owner@p17h.test', 'P17h Travel');
    const a = (await client.post('/api/queries', payload('+91 90000 44444'))).body.data;
    const b = (await client.post('/api/queries', payload('+91 90000 55555'))).body.data;
    // NEW_LEAD → QUALIFIED is valid for both.
    const ok = await client.post('/api/queries/bulk-stage', {
      queryIds: [a.id, b.id],
      leadStage: 'QUALIFIED',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.updatedCount).toBe(2);
    expect(
      await db.queryStageHistory.count({ where: { queryId: a.id, newStage: 'QUALIFIED' } }),
    ).toBe(1);
    // QUALIFIED → BOOKING_CONFIRMED is not a valid direct transition → rejected, atomic.
    const bad = await client.post('/api/queries/bulk-stage', {
      queryIds: [a.id, b.id],
      leadStage: 'BOOKING_CONFIRMED',
    });
    expect(bad.status).toBe(400);
    expect((await db.query.findUniqueOrThrow({ where: { id: a.id } })).leadStage).toBe('QUALIFIED');
  });

  it('exports leads as CSV respecting filters, visibility and escaping', async () => {
    const client = await owner('owner@p17i.test', 'P17i Travel');
    await client.post('/api/queries', {
      ...payload('+91 90000 66666'),
      customerName: 'Comma, "Quote" Name',
      leadSource: 'WEBSITE',
    });
    await client.post('/api/queries', { ...payload('+91 90000 77777'), leadSource: 'REFERRAL' });

    const csv = await client.get('/api/queries/export?leadSource=WEBSITE');
    expect(csv.status).toBe(200);
    expect(csv.body.data.mimeType).toBe('text/csv');
    expect(csv.body.data.fileName).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.csv$/);
    const content = csv.body.data.content as string;
    expect(content.split('\n')[0]).toContain('Lead Number');
    // Filter parity: only the WEBSITE lead is present.
    expect(content).toContain('WEBSITE');
    expect(content).not.toContain('REFERRAL');
    // CSV escaping of quotes/commas.
    expect(content).toContain('"Comma, ""Quote"" Name"');
  });

  it('isolates the CSV export by tenant and requires the export permission', async () => {
    const alpha = await owner('owner@p17j.test', 'P17j Alpha');
    await alpha.post('/api/queries', { ...payload('+91 90000 88888'), customerName: 'Alpha Lead' });
    const beta = await owner('owner@p17j-beta.test', 'P17j Beta');
    const betaCsv = await beta.get('/api/queries/export');
    expect(betaCsv.body.data.content).not.toContain('Alpha Lead');
    // A role without queries.export is forbidden.
    const restricted = await restrictedClient(
      'owner@p17j.test',
      ['queries.view'],
      'noexport@p17j.test',
    );
    expect((await restricted.get('/api/queries/export')).status).toBe(403);
  });
});
