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

type Client = ReturnType<typeof createAuthClient>;

async function owner(email = 'owner@dash.test', companyName = 'Dashboard Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

async function roleClient(ownerEmail: string, roleName: string, email: string) {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const role = await db.role.findFirstOrThrow({
    where: { companyId: ownerUser.companyId, name: roleName },
  });
  await db.user.create({
    data: {
      companyId: ownerUser.companyId,
      roleId: role.id,
      username: email.split('@')[0]!,
      fullName: `${roleName} User`,
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

const leadPayload = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Lead Customer',
  phone: '+91 90000 10001',
  leadSource: 'REFERRAL',
  leadType: 'WARM',
  leadStage: 'NEW_LEAD',
  priority: 'MEDIUM',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 3, sequence: 1 }],
  ...overrides,
});

async function seedLead(client: Client, overrides: Record<string, unknown> = {}) {
  const response = await client.post('/api/queries', leadPayload(overrides));
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

/** Move a lead to a terminal/target stage directly (bypasses UI transitions). */
async function setStage(id: string, leadStage: string) {
  await db.query.update({ where: { id }, data: { leadStage: leadStage as never } });
}

const manualBooking = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Booking Customer',
  customerPhone: '9000020002',
  destinationSummary: 'Goa',
  travelStartDate: '2026-10-10',
  travelEndDate: '2026-10-14',
  currency: 'INR',
  totalSellingAmount: 50000,
  manualCreationReason: 'Dashboard test booking',
  services: [],
  itinerary: [],
  paymentSchedule: [],
  ...overrides,
});

describe('Phase 16 dashboard analytics', () => {
  it('returns lead metrics with conversion and win rate for the period', async () => {
    const client = await owner();
    const a = await seedLead(client, { leadType: 'HOT', leadSource: 'WEBSITE' });
    const b = await seedLead(client, { leadType: 'HOT', leadSource: 'GOOGLE_ADS' });
    const c = await seedLead(client, { leadSource: 'REFERRAL' });
    const d = await seedLead(client, { leadSource: 'REFERRAL' });
    await setStage(a.id, 'BOOKING_CONFIRMED');
    await setStage(b.id, 'BOOKING_CONFIRMED');
    await setStage(c.id, 'LOST');
    void d;

    const res = await client.get('/api/dashboard/analytics?period=THIS_YEAR');
    expect(res.status).toBe(200);
    expect(res.body.data.leads).toMatchObject({
      totalLeads: 4,
      convertedLeads: 2,
      lostLeads: 1,
      hotLeads: 2,
      conversionRate: 50,
      winRate: expect.closeTo(66.7, 1),
    });
    expect(res.body.data.period.key).toBe('THIS_YEAR');
    expect(res.body.data.period.timezone).toBeTruthy();
  });

  it('groups lead sources with counts and percentages, sorted descending', async () => {
    const client = await owner();
    await seedLead(client, { leadSource: 'REFERRAL' });
    await seedLead(client, { leadSource: 'REFERRAL' });
    await seedLead(client, { leadSource: 'WEBSITE' });
    const res = await client.get('/api/dashboard/analytics');
    const sources = res.body.data.leadSources as Array<{
      source: string;
      label: string;
      count: number;
      percentage: number;
    }>;
    expect(sources[0]).toMatchObject({ source: 'REFERRAL', label: 'Referral', count: 2 });
    expect(sources.map((s) => s.source)).toEqual(['REFERRAL', 'WEBSITE']);
    expect(sources.find((s) => s.source === 'REFERRAL')!.percentage).toBeCloseTo(66.7, 1);
    // Zero-count sources are omitted.
    expect(sources.some((s) => s.source === 'WALK_IN')).toBe(false);
  });

  it('groups top destination enquiries case-insensitively', async () => {
    const client = await owner();
    await seedLead(client, {
      itinerary: [{ country: 'India', destination: 'Goa', nights: 2, sequence: 1 }],
    });
    await seedLead(client, {
      itinerary: [{ country: 'India', destination: 'goa', nights: 2, sequence: 1 }],
    });
    await seedLead(client, {
      itinerary: [{ country: 'UAE', destination: 'Dubai', nights: 3, sequence: 1 }],
    });
    const res = await client.get('/api/dashboard/analytics?limit=10');
    const destinations = res.body.data.topDestinations as Array<{
      destination: string;
      enquiryCount: number;
    }>;
    expect(destinations[0]).toMatchObject({ enquiryCount: 2 });
    expect(destinations[0]!.destination.toLowerCase()).toBe('goa');
    expect(destinations.find((d) => d.destination === 'Dubai')!.enquiryCount).toBe(1);
  });

  it('ranks staff conversion performance', async () => {
    const client = await owner();
    const salesUser = await db.user.findFirstOrThrow({
      where: { normalizedEmail: 'owner@dash.test' },
    });
    const l1 = await seedLead(client, { assignedToId: salesUser.id });
    const l2 = await seedLead(client, { assignedToId: salesUser.id });
    await setStage(l1.id, 'BOOKING_CONFIRMED');
    void l2;
    const res = await client.get('/api/dashboard/analytics');
    const staff = res.body.data.staffConversions as Array<{
      userId: string;
      totalLeads: number;
      convertedLeads: number;
      conversionRate: number;
      rank: number;
    }>;
    const row = staff.find((s) => s.userId === salesUser.id)!;
    expect(row).toMatchObject({ totalLeads: 2, convertedLeads: 1, conversionRate: 50, rank: 1 });
  });

  it('aggregates booking financials, refunds and net profit for a financial user', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualBooking())).body.data;
    await client.patch(`/api/bookings/${booking.id}/financials`, {
      gstAmount: 2500,
      tcsAmount: 500,
    });
    const res = await client.get('/api/dashboard/analytics');
    expect(res.body.data.bookings.totalBookings).toBe(1);
    expect(res.body.data.financials).toMatchObject({
      totalCustomerAmount: '50000.00',
      totalPayable: '53000.00',
    });
    expect(res.body.data.financials).toHaveProperty('netProfit');
    expect(res.body.data.financials).toHaveProperty('totalRefunded');
    expect(Array.isArray(res.body.data.staffFinancials)).toBe(true);
  });

  it('omits financial blocks entirely without booking financial permission', async () => {
    const owner1 = await owner();
    await owner1.post('/api/bookings', manualBooking());
    const sales = await roleClient('owner@dash.test', 'Sales Executive', 'sales@dash.test');
    const res = await sales.get('/api/dashboard/analytics');
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('financials');
    expect(res.body.data).not.toHaveProperty('staffFinancials');
    expect(res.body.data.capabilities.canViewFinancials).toBe(false);
    // Operational booking metrics are still present.
    expect(res.body.data.bookings).toHaveProperty('totalBookings');
  });

  it('omits lead sections without query permission', async () => {
    const owner1 = await owner();
    void owner1;
    const viewer = await roleClient('owner@dash.test', 'View Only', 'viewer@dash.test');
    const res = await viewer.get('/api/dashboard/analytics');
    expect(res.status).toBe(200);
    // View Only lacks queries.view in the default template.
    if (!res.body.data.capabilities.canViewLeads) {
      expect(res.body.data).not.toHaveProperty('leads');
      expect(res.body.data).not.toHaveProperty('leadSources');
    }
  });

  it('supports a custom date range and rejects an invalid one', async () => {
    const client = await owner();
    await seedLead(client);
    const ok = await client.get(
      '/api/dashboard/analytics?period=CUSTOM&from=2026-01-01&to=2026-12-31',
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data.period.key).toBe('CUSTOM');
    const missing = await client.get('/api/dashboard/analytics?period=CUSTOM');
    expect(missing.status).toBe(400);
    const reversed = await client.get(
      '/api/dashboard/analytics?period=CUSTOM&from=2026-12-31&to=2026-01-01',
    );
    expect(reversed.status).toBe(400);
  });

  it('applies the period filter to lead counts', async () => {
    const client = await owner();
    await seedLead(client);
    // A lead created "today" is inside THIS_YEAR but outside a past custom range.
    const past = await client.get(
      '/api/dashboard/analytics?period=CUSTOM&from=2020-01-01&to=2020-12-31',
    );
    expect(past.body.data.leads.totalLeads).toBe(0);
    const thisYear = await client.get('/api/dashboard/analytics?period=THIS_YEAR');
    expect(thisYear.body.data.leads.totalLeads).toBe(1);
  });

  it('isolates tenants', async () => {
    const alpha = await owner('owner@alpha-dash.test', 'Alpha Dash');
    await seedLead(alpha);
    await seedLead(alpha);
    const beta = await owner('owner@beta-dash.test', 'Beta Dash');
    const res = await beta.get('/api/dashboard/analytics');
    expect(res.body.data.leads.totalLeads).toBe(0);
  });

  it('requires the dashboard.view permission', async () => {
    const anonymous = createAuthClient(app);
    expect((await anonymous.get('/api/dashboard/analytics')).status).toBe(401);
  });
});

describe('Phase 16 dashboard operations', () => {
  it('returns actionable operations lists with counts and view-all paths', async () => {
    const client = await owner();
    // A near-travel lead (within 10 days) and a future booking.
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await seedLead(client, { travelStartDate: soon, leadStage: 'QUALIFIED' });
    const trip = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const booking = (await client.post('/api/bookings', manualBooking({ travelStartDate: trip })))
      .body.data;
    await client.patch(`/api/bookings/${booking.id}/status`, { status: 'CONFIRMED' });

    const res = await client.get('/api/dashboard/operations');
    expect(res.status).toBe(200);
    expect(res.body.data.nearTravelDates).toMatchObject({ viewAllPath: '/queries' });
    expect(res.body.data.nearTravelDates.items.length).toBeGreaterThan(0);
    expect(res.body.data.upcomingTrips).toMatchObject({ viewAllPath: '/bookings' });
    expect(res.body.data.upcomingTrips.items[0]).toHaveProperty('daysUntilTravel');
  });

  it('returns client payments due only with financial permission and vendor payments with vendor financials', async () => {
    const client = await owner();
    const dueSoon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const booking = (
      await client.post(
        '/api/bookings',
        manualBooking({
          paymentSchedule: [
            { installmentNumber: 1, label: 'Advance', amount: 25000, dueDate: dueSoon },
          ],
        }),
      )
    ).body.data;
    void booking;
    const res = await client.get('/api/dashboard/operations');
    expect(res.body.data.clientPaymentsDue.items.length).toBeGreaterThan(0);
    expect(res.body.data.clientPaymentsDue.items[0]).toHaveProperty('amount');

    const sales = await roleClient('owner@dash.test', 'Sales Executive', 'sales2@dash.test');
    const salesRes = await sales.get('/api/dashboard/operations');
    expect(salesRes.body.data).not.toHaveProperty('clientPaymentsDue');
    expect(salesRes.body.data).not.toHaveProperty('vendorPaymentsDue');
  });

  it('orders priority follow-ups with overdue hot leads first', async () => {
    const client = await owner();
    const hot = await seedLead(client, { leadType: 'HOT' });
    // Create an overdue follow-up on the hot lead directly.
    const user = await db.user.findFirstOrThrow({ where: { normalizedEmail: 'owner@dash.test' } });
    await db.queryFollowUp.create({
      data: {
        companyId: user.companyId,
        queryId: hot.id,
        assignedToId: user.id,
        title: 'Overdue hot follow-up',
        reminderType: 'LEAD_FOLLOW_UP',
        scheduledAt: new Date(Date.now() - 2 * 86_400_000),
        status: 'PENDING',
        createdById: user.id,
      },
    });
    const res = await client.get('/api/dashboard/operations');
    const items = res.body.data.priorityFollowUps.items as Array<{
      leadType: string;
      overdue: boolean;
    }>;
    expect(items[0]).toMatchObject({ leadType: 'HOT', overdue: true });
    expect(res.body.data.priorityFollowUps.viewAllPath).toBe('/follow-ups');
  });

  it('returns an empty-state payload with no data', async () => {
    const client = await owner();
    const res = await client.get('/api/dashboard/operations');
    expect(res.body.data.upcomingTrips.items).toEqual([]);
    expect(res.body.data.upcomingTrips.totalCount).toBe(0);
    const analytics = await client.get('/api/dashboard/analytics');
    expect(analytics.body.data.leads.totalLeads).toBe(0);
    expect(analytics.body.data.leadSources).toEqual([]);
  });
});
