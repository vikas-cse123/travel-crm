import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@interscale/shared';
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

async function owner(email = 'owner@reports.test', companyName = 'Reports Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

/** A client on a bespoke role holding exactly `permissionKeys`. */
async function customClient(ownerEmail: string, email: string, permissionKeys: string[]) {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const role = await db.role.create({
    data: {
      companyId: ownerUser.companyId,
      name: `Role ${email}`,
      description: 'Reports test role',
      hierarchyLevel: 30,
      isSystem: false,
    },
  });
  const permissions = await db.permission.findMany({ where: { key: { in: permissionKeys } } });
  expect(permissions).toHaveLength(permissionKeys.length);
  await db.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
  });
  await db.user.create({
    data: {
      companyId: ownerUser.companyId,
      roleId: role.id,
      username: email.split('@')[0]!,
      fullName: 'Scoped User',
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

const setStage = (id: string, leadStage: string) =>
  db.query.update({ where: { id }, data: { leadStage: leadStage as never } });

const manualBooking = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Booking Customer',
  customerPhone: '9000020002',
  destinationSummary: 'Goa',
  travelStartDate: '2026-10-10',
  travelEndDate: '2026-10-14',
  currency: 'INR',
  totalSellingAmount: 50000,
  manualCreationReason: 'Reports test booking',
  services: [],
  itinerary: [],
  paymentSchedule: [],
  ...overrides,
});

async function seedBooking(client: Client, overrides: Record<string, unknown> = {}) {
  const response = await client.post('/api/bookings', manualBooking(overrides));
  expect(response.status).toBe(201);
  return response.body.data as { id: string; bookingNumber: string; paymentSchedules?: unknown[] };
}

/** Seed a vendor + payable directly; the report is a pure read path. */
async function seedPayable(
  ownerEmail: string,
  bookingId: string,
  overrides: Record<string, unknown> = {},
) {
  const user = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const vendor = await db.vendor.create({
    data: {
      companyId: user.companyId,
      vendorCode: `VEN-${Math.floor(Math.random() * 100000)}`,
      name: 'Coastal DMC',
      normalizedName: 'coastal dmc',
      vendorType: 'DMC',
      createdById: user.id,
    },
  });
  return db.vendorPayable.create({
    data: {
      companyId: user.companyId,
      vendorId: vendor.id,
      bookingId,
      payableNumber: `VP-${Math.floor(Math.random() * 100000)}`,
      description: 'Land package',
      currency: 'INR',
      originalAmount: 10000,
      paidAmount: 0,
      outstandingAmount: 10000,
      dueDate: new Date('2026-09-01'),
      paymentStatus: 'UNPAID',
      supplierInvoiceNumber: 'SUP-77',
      createdById: user.id,
      ...overrides,
    },
  });
}

const q = (params: Record<string, string | number> = {}) =>
  new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
  ).toString();

// ---------------------------------------------------------------------------

describe('Phase 19 reports access and period handling', () => {
  it('requires the reports.view permission', async () => {
    const client = await owner();
    const scoped = await customClient('owner@reports.test', 'noreports@reports.test', [
      PERMISSIONS.QUERIES_VIEW,
    ]);
    expect((await client.get('/api/reports/summary')).status).toBe(200);
    expect((await scoped.get('/api/reports/summary')).status).toBe(403);
    expect((await scoped.get('/api/reports/bookings')).status).toBe(403);
    expect((await scoped.get('/api/reports/bookings/export')).status).toBe(403);
  });

  it('defaults to THIS_YEAR and echoes the resolved company-timezone period', async () => {
    const client = await owner();
    const body = (await client.get('/api/reports/summary')).body.data;
    expect(body.period.key).toBe('THIS_YEAR');
    expect(body.period.timezone).toBe('Asia/Kolkata');
    // Half-open range: from is the local start of the year, to is exclusive.
    expect(new Date(body.period.from).getTime()).toBeLessThan(new Date(body.period.to).getTime());
  });

  it('accepts a custom range and rejects an inverted or incomplete one', async () => {
    const client = await owner();
    const ok = await client.get(
      `/api/reports/summary?${q({ period: 'CUSTOM', from: '2026-01-01', to: '2026-06-30' })}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data.period.key).toBe('CUSTOM');
    expect(
      (
        await client.get(
          `/api/reports/summary?${q({ period: 'CUSTOM', from: '2026-06-30', to: '2026-01-01' })}`,
        )
      ).status,
    ).toBe(400);
    expect((await client.get(`/api/reports/summary?${q({ period: 'CUSTOM' })}`)).status).toBe(400);
  });

  it('honours the period boundary in the company timezone', async () => {
    const client = await owner();
    const lead = await seedLead(client);
    // Push the lead to last year: it must fall outside THIS_YEAR but inside ALL_TIME.
    await db.query.update({
      where: { id: lead.id },
      data: { createdAt: new Date('2020-05-05T00:00:00.000Z') },
    });
    expect((await client.get('/api/reports/summary')).body.data.leads.total).toBe(0);
    expect(
      (await client.get(`/api/reports/summary?${q({ period: 'ALL_TIME' })}`)).body.data.leads.total,
    ).toBe(1);
  });

  it('isolates tenants', async () => {
    const alpha = await owner();
    await seedLead(alpha);
    await seedBooking(alpha);
    const beta = await owner('owner@beta-reports.test', 'Beta Reports');
    const body = (await beta.get(`/api/reports/summary?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(body.leads.total).toBe(0);
    expect(body.bookings.total).toBe(0);
    const rows = (await beta.get(`/api/reports/bookings?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(rows.rows).toHaveLength(0);
  });

  it('respects assignment visibility for a non-view-all user', async () => {
    const client = await owner();
    const mine = await seedLead(client);
    await seedLead(client, { customerName: 'Someone Else', phone: '+91 90000 10002' });
    const scoped = await customClient('owner@reports.test', 'scoped@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.QUERIES_VIEW,
    ]);
    const scopedUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'scoped@reports.test' },
    });
    await db.query.update({ where: { id: mine.id }, data: { assignedToId: scopedUser.id } });
    const body = (await scoped.get(`/api/reports/summary?${q({ period: 'ALL_TIME' })}`)).body.data;
    // Only the assigned lead is visible, not the whole company.
    expect(body.leads.total).toBe(1);
  });
});

describe('Phase 19 reports summary', () => {
  it('returns lead, quotation and booking metrics for the period', async () => {
    const client = await owner();
    const won = await seedLead(client);
    const lost = await seedLead(client, { phone: '+91 90000 10003' });
    await setStage(won.id, 'BOOKING_CONFIRMED');
    await setStage(lost.id, 'LOST');
    await client.post('/api/quotations', { queryId: won.id });
    await seedBooking(client);

    const body = (await client.get(`/api/reports/summary?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(body.leads).toMatchObject({ total: 2, converted: 1, lost: 1, conversionRate: 50 });
    expect(body.leads.winRate).toBe(50);
    expect(body.quotations.total).toBe(1);
    expect(body.bookings.total).toBe(1);
    expect(body.financials.customerAmount).toBe('50000.00');
    expect(body.capabilities.canViewFinancials).toBe(true);
  });

  it('omits financial and receivable blocks without booking financial permission', async () => {
    const client = await owner();
    await seedBooking(client);
    const scoped = await customClient('owner@reports.test', 'nofin@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.QUERIES_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW_ALL,
    ]);
    const body = (await scoped.get(`/api/reports/summary?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(body.bookings.total).toBe(1);
    // Omitted entirely — never a zero-filled block.
    expect(body).not.toHaveProperty('financials');
    expect(body).not.toHaveProperty('receivables');
    expect(body).not.toHaveProperty('vendorPayables');
    expect(body.capabilities.canViewFinancials).toBe(false);
  });

  it('returns an empty-state payload with no data', async () => {
    const client = await owner();
    const body = (await client.get('/api/reports/summary')).body.data;
    expect(body.leads).toMatchObject({ total: 0, converted: 0, conversionRate: 0 });
    expect(body.bookings.total).toBe(0);
    expect(body.financials.netProfit).toBe('0.00');
  });
});

describe('Phase 19 lead, source and destination reports', () => {
  it('returns lead summary and breakdowns', async () => {
    const client = await owner();
    const won = await seedLead(client);
    await setStage(won.id, 'BOOKING_CONFIRMED');
    await seedLead(client, { phone: '+91 90000 10004', leadType: 'HOT', leadSource: 'WEBSITE' });

    const body = (await client.get(`/api/reports/leads?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(body.summary.totalLeads).toBe(2);
    expect(body.summary.convertedLeads).toBe(1);
    expect(body.byStage.some((r: { stage: string }) => r.stage === 'BOOKING_CONFIRMED')).toBe(true);
    expect(body.byType.some((r: { type: string }) => r.type === 'HOT')).toBe(true);
    expect(body.bySource).toHaveLength(2);
    expect(body.byDestination[0].destination).toBe('Goa');
  });

  it('computes lead-source counts, conversion and share', async () => {
    const client = await owner();
    const a = await seedLead(client, { leadSource: 'WEBSITE' });
    await seedLead(client, { leadSource: 'WEBSITE', phone: '+91 90000 10005' });
    await seedLead(client, { leadSource: 'REFERRAL', phone: '+91 90000 10006' });
    await setStage(a.id, 'BOOKING_CONFIRMED');

    const rows = (await client.get(`/api/reports/lead-sources?${q({ period: 'ALL_TIME' })}`)).body
      .data.rows;
    const website = rows.find((r: { source: string }) => r.source === 'WEBSITE');
    expect(website).toMatchObject({ leadCount: 2, convertedCount: 1, conversionRate: 50 });
    expect(website.label).toBe('Website');
    expect(Math.round(website.percentage)).toBe(67);
    // Zero-count sources are dropped.
    expect(rows.every((r: { leadCount: number }) => r.leadCount > 0)).toBe(true);
  });

  it('merges destinations case-insensitively, trims and ignores blanks', async () => {
    const client = await owner();
    const first = await seedLead(client, {
      itinerary: [{ country: 'India', destination: '  goa  ', nights: 2, sequence: 1 }],
    });
    await seedLead(client, {
      phone: '+91 90000 10007',
      itinerary: [{ country: 'India', destination: 'GOA', nights: 2, sequence: 1 }],
    });
    await seedLead(client, {
      phone: '+91 90000 10008',
      itinerary: [{ country: 'India', destination: 'Kerala', nights: 2, sequence: 1 }],
    });
    await setStage(first.id, 'BOOKING_CONFIRMED');

    const body = (await client.get(`/api/reports/destinations?${q({ period: 'ALL_TIME' })}`)).body
      .data;
    const goa = body.rows[0];
    expect(goa.enquiryCount).toBe(2);
    expect(goa.rank).toBe(1);
    expect(goa.convertedCount).toBe(1);
    // A readable display value is preserved (trimmed), not the lowercase key.
    expect(goa.destination.trim()).toBe(goa.destination);
    expect(goa.destination.toLowerCase()).toBe('goa');
    expect(body.rows).toHaveLength(2);
  });
});

describe('Phase 19 quotation report and CSV', () => {
  it('summarises quotations and returns paginated rows', async () => {
    const client = await owner();
    const lead = await seedLead(client);
    const created = await client.post('/api/quotations', { queryId: lead.id });
    expect(created.status).toBe(201);

    const body = (await client.get(`/api/reports/quotations?${q({ period: 'ALL_TIME' })}`)).body
      .data;
    expect(body.summary.totalQuotations).toBe(1);
    expect(body.summary.draft).toBe(1);
    expect(body.rows[0]).toMatchObject({
      quotationNumber: created.body.data.quotationNumber,
      status: 'DRAFT',
      currency: 'INR',
    });
    expect(body.rows[0].leadNumber).toBeTruthy();
    expect(body.rows[0].currentVersion).toBe(1);
    expect(body.pagination).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });

  it('exports quotation CSV with the exact headers and escapes quotes', async () => {
    const client = await owner();
    const lead = await seedLead(client, { customerName: 'Quote "Q" Customer' });
    await client.post('/api/quotations', { queryId: lead.id });

    const csv = (await client.get(`/api/reports/quotations/export?${q({ period: 'ALL_TIME' })}`))
      .body.data;
    expect(csv.mimeType).toBe('text/csv');
    expect(csv.fileName).toMatch(/^quotations-report-\d{4}-\d{2}-\d{2}\.csv$/);
    const [header] = csv.content.split('\n');
    expect(header).toBe(
      '"Quotation Number","Lead Number","Customer","Destination","Status","Current Version","Currency","Current Amount","Sent At","Accepted At","Created By","Created At","Linked Booking Number"',
    );
    // Embedded quotes are doubled, never dropped.
    expect(csv.content).toContain('Quote ""Q"" Customer');
    expect(csv).toMatchObject({ exportedCount: 1, truncated: false, rowLimit: 5000 });
  });

  it('omits the quotation section without quotations.view', async () => {
    const client = await owner();
    const lead = await seedLead(client);
    await client.post('/api/quotations', { queryId: lead.id });
    const scoped = await customClient('owner@reports.test', 'noquote@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.QUERIES_VIEW,
    ]);
    const body = (await scoped.get(`/api/reports/quotations?${q({ period: 'ALL_TIME' })}`)).body
      .data;
    expect(body).not.toHaveProperty('rows');
    expect(body.capabilities.canViewQuotations).toBe(false);
    expect((await scoped.get('/api/reports/quotations/export')).status).toBe(403);
  });
});

describe('Phase 19 booking report and CSV redaction', () => {
  it('returns booking rows with financial columns for a financial user', async () => {
    const client = await owner();
    await seedBooking(client, { totalSellingAmount: 50000, gstAmount: 2500, tcsAmount: 500 });
    const body = (await client.get(`/api/reports/bookings?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(body.includesFinancials).toBe(true);
    expect(body.summary.totalBookings).toBe(1);
    expect(body.financialSummary.totalCustomerAmount).toBe('50000.00');
    expect(body.rows[0]).toMatchObject({
      customerAmount: '50000.00',
      gstAmount: '2500.00',
      tcsAmount: '500.00',
    });
    expect(body.rows[0]).toHaveProperty('netProfit');
    expect(body.pagination.total).toBe(1);
  });

  it('omits every financial field from booking rows without financial permission', async () => {
    const client = await owner();
    await seedBooking(client);
    const scoped = await customClient('owner@reports.test', 'opsonly@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW_ALL,
    ]);
    const body = (await scoped.get(`/api/reports/bookings?${q({ period: 'ALL_TIME' })}`)).body.data;
    expect(body.includesFinancials).toBe(false);
    expect(body).not.toHaveProperty('financialSummary');
    const row = body.rows[0];
    expect(row.bookingNumber).toBeTruthy();
    for (const field of [
      'customerAmount',
      'totalPayable',
      'netRevenue',
      'grossProfit',
      'netProfit',
      'marginPercentage',
    ])
      expect(row).not.toHaveProperty(field);
  });

  it('builds booking CSV headers dynamically from the caller permission', async () => {
    const client = await owner();
    await seedBooking(client);
    const full = (await client.get(`/api/reports/bookings/export?${q({ period: 'ALL_TIME' })}`))
      .body.data;
    const fullHeader = full.content.split('\n')[0];
    expect(fullHeader).toContain('"Gross Profit"');
    expect(fullHeader).toContain('"Margin"');
    expect(full.fileName).toMatch(/^bookings-report-\d{4}-\d{2}-\d{2}\.csv$/);

    const scoped = await customClient('owner@reports.test', 'opscsv@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW_ALL,
    ]);
    const redacted = (await scoped.get(`/api/reports/bookings/export?${q({ period: 'ALL_TIME' })}`))
      .body.data;
    const redactedHeader = redacted.content.split('\n')[0];
    // Financial columns are absent from the header, not blank-filled.
    for (const column of ['Gross Profit', 'Net Profit', 'Customer Amount', 'Margin'])
      expect(redactedHeader).not.toContain(`"${column}"`);
    expect(redactedHeader).toContain('"Booking Number"');
    expect(redactedHeader).toContain('"Assigned To"');
    expect(redacted.content.split('\n')[1].split(',')).toHaveLength(11);
  });

  it('isolates CSV exports by tenant', async () => {
    const alpha = await owner();
    await seedBooking(alpha, { customerName: 'Alpha Only' });
    const beta = await owner('owner@beta-csv.test', 'Beta CSV');
    const csv = (await beta.get(`/api/reports/bookings/export?${q({ period: 'ALL_TIME' })}`)).body
      .data;
    expect(csv.content).not.toContain('Alpha Only');
    expect(csv.exportedCount).toBe(0);
  });
});

describe('Phase 19 client payments report and CSV', () => {
  const scheduleBooking = () =>
    manualBooking({
      totalSellingAmount: 50000,
      paymentSchedule: [
        { installmentNumber: 1, label: 'Advance', amount: 20000, dueDate: '2026-08-01' },
        { installmentNumber: 2, label: 'Balance', amount: 30000, dueDate: '2026-09-01' },
      ],
    });

  it('summarises receivables and derives per-installment outstanding', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', scheduleBooking())).body.data;
    const scheduleId = booking.paymentSchedules[0].id;
    await client.post(`/api/bookings/${booking.id}/payments`, {
      paymentScheduleId: scheduleId,
      amount: 5000,
      currency: 'INR',
      paymentMethod: 'UPI',
      paymentStatus: 'RECEIVED',
      receivedAt: '2026-08-02',
    });

    const body = (await client.get(`/api/reports/client-payments?${q({ period: 'ALL_TIME' })}`))
      .body.data;
    expect(body.summary.totalSchedules).toBe(2);
    expect(body.summary.totalScheduledAmount).toBe('50000.00');
    expect(body.summary.totalPaidAmount).toBe('5000.00');
    expect(body.summary.totalOutstandingAmount).toBe('45000.00');
    const advance = body.rows.find((r: { label: string }) => r.label === 'Advance');
    expect(advance).toMatchObject({
      amount: '20000.00',
      paidAmount: '5000.00',
      outstandingAmount: '15000.00',
    });
    expect(advance.bookingNumber).toBe(booking.bookingNumber);
  });

  it('applies the period to the due date rather than createdAt', async () => {
    const client = await owner();
    await client.post('/api/bookings', scheduleBooking());
    // Both schedules are due in 2026; a 2025 window must exclude them even though
    // the rows were created today.
    const outside = await client.get(
      `/api/reports/client-payments?${q({ period: 'CUSTOM', from: '2025-01-01', to: '2025-12-31' })}`,
    );
    expect(outside.body.data.summary.totalSchedules).toBe(0);
    const inside = await client.get(
      `/api/reports/client-payments?${q({ period: 'CUSTOM', from: '2026-01-01', to: '2026-12-31' })}`,
    );
    expect(inside.body.data.summary.totalSchedules).toBe(2);
  });

  it('requires booking financial permission for the report and its CSV', async () => {
    const client = await owner();
    await client.post('/api/bookings', scheduleBooking());
    const scoped = await customClient('owner@reports.test', 'nopay@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW_ALL,
    ]);
    const body = (await scoped.get('/api/reports/client-payments')).body.data;
    expect(body).not.toHaveProperty('rows');
    expect(body.capabilities.canViewClientPayments).toBe(false);
    expect((await scoped.get('/api/reports/client-payments/export')).status).toBe(403);
  });

  it('exports the client payments CSV with the documented columns', async () => {
    const client = await owner();
    await client.post('/api/bookings', scheduleBooking());
    const csv = (
      await client.get(`/api/reports/client-payments/export?${q({ period: 'ALL_TIME' })}`)
    ).body.data;
    expect(csv.content.split('\n')[0]).toBe(
      '"Booking Number","Customer","Installment Number","Label","Due Date","Amount","Paid","Outstanding","Status","Assigned User"',
    );
    expect(csv.exportedCount).toBe(2);
    expect(csv.truncated).toBe(false);
    expect(csv.content).toContain('"Advance"');
  });
});

describe('Phase 19 vendor payables report and CSV', () => {
  it('summarises payables and returns rows', async () => {
    const client = await owner();
    const booking = await seedBooking(client);
    await seedPayable('owner@reports.test', booking.id);

    const body = (await client.get(`/api/reports/vendor-payables?${q({ period: 'ALL_TIME' })}`))
      .body.data;
    expect(body.summary).toMatchObject({
      totalPayables: 1,
      originalAmount: '10000.00',
      paidAmount: '0.00',
      outstandingAmount: '10000.00',
    });
    expect(body.rows[0]).toMatchObject({
      vendorName: 'Coastal DMC',
      bookingNumber: booking.bookingNumber,
      supplierInvoiceNumber: 'SUP-77',
      paymentStatus: 'UNPAID',
    });
  });

  it('requires vendor view and vendor financial permission', async () => {
    const client = await owner();
    const booking = await seedBooking(client);
    await seedPayable('owner@reports.test', booking.id);
    const scoped = await customClient('owner@reports.test', 'novend@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.VENDORS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW_ALL,
    ]);
    const body = (await scoped.get('/api/reports/vendor-payables')).body.data;
    expect(body).not.toHaveProperty('rows');
    expect(body.capabilities.canViewVendorPayables).toBe(false);
    expect((await scoped.get('/api/reports/vendor-payables/export')).status).toBe(403);
  });

  it('exports the vendor payables CSV and never includes bank details', async () => {
    const client = await owner();
    const booking = await seedBooking(client);
    await seedPayable('owner@reports.test', booking.id);
    const csv = (
      await client.get(`/api/reports/vendor-payables/export?${q({ period: 'ALL_TIME' })}`)
    ).body.data;
    expect(csv.content.split('\n')[0]).toBe(
      '"Payable Number","Vendor","Booking Number","Supplier Invoice Number","Due Date","Original Amount","Paid","Outstanding","Payment Status","Created At"',
    );
    expect(csv.exportedCount).toBe(1);
    for (const banned of ['accountNumber', 'ifsc', 'IFSC', 'Bank Account'])
      expect(csv.content).not.toContain(banned);
  });
});

describe('Phase 19 staff reports keep their attribution conventions', () => {
  it('ranks lead conversion by Query.assignedToId', async () => {
    const client = await owner();
    const scoped = await customClient('owner@reports.test', 'staff@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.QUERIES_VIEW,
    ]);
    const staff = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'staff@reports.test' },
    });
    const won = await seedLead(client);
    const lost = await seedLead(client, { phone: '+91 90000 10009' });
    await db.query.updateMany({
      where: { id: { in: [won.id, lost.id] } },
      data: { assignedToId: staff.id },
    });
    await setStage(won.id, 'BOOKING_CONFIRMED');
    await setStage(lost.id, 'LOST');

    const rows = (await client.get(`/api/reports/staff-conversions?${q({ period: 'ALL_TIME' })}`))
      .body.data.rows;
    expect(rows[0]).toMatchObject({
      userId: staff.id,
      totalLeads: 2,
      convertedLeads: 1,
      lostLeads: 1,
      conversionRate: 50,
      winRate: 50,
      rank: 1,
    });
    void scoped;
  });

  it('ranks revenue by Booking.bookedById and is financial-gated', async () => {
    const client = await owner();
    await seedBooking(client, { totalSellingAmount: 50000 });
    const ownerUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@reports.test' },
    });
    const rows = (await client.get(`/api/reports/staff-financials?${q({ period: 'ALL_TIME' })}`))
      .body.data.rows;
    // Attribution follows the booking originator, never the operational assignee.
    expect(rows[0]).toMatchObject({ userId: ownerUser.id, bookingCount: 1, rank: 1 });
    expect(rows[0].revenue).toBe('50000.00');

    const scoped = await customClient('owner@reports.test', 'nostaff@reports.test', [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW,
      PERMISSIONS.BOOKINGS_VIEW_ALL,
    ]);
    const denied = (await scoped.get('/api/reports/staff-financials')).body.data;
    expect(denied).not.toHaveProperty('rows');
  });
});

describe('Phase 19 leaves existing surfaces unchanged', () => {
  it('keeps the dashboard analytics and operations endpoints working', async () => {
    const client = await owner();
    await seedLead(client);
    await seedBooking(client);
    const analytics = await client.get('/api/dashboard/analytics');
    expect(analytics.status).toBe(200);
    expect(analytics.body.data.period.key).toBe('THIS_YEAR');
    expect(analytics.body.data.leads.totalLeads).toBe(1);
    expect((await client.get('/api/dashboard/operations')).status).toBe(200);
  });

  it('keeps the existing lead, customer and vendor CSV exports unchanged', async () => {
    const client = await owner();
    await seedLead(client);
    const leads = (await client.get('/api/queries/export')).body.data;
    expect(leads.mimeType).toBe('text/csv');
    expect(leads.fileName).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(leads.content.split('\n')[0]).toContain('"Lead Number"');
    // The legacy contract has no report metadata attached.
    expect(leads).not.toHaveProperty('rowLimit');

    const customers = (await client.get('/api/customers/export')).body.data;
    expect(customers.mimeType).toBe('text/csv');
    expect(customers.fileName).toMatch(/^customers-\d{4}-\d{2}-\d{2}\.csv$/);

    // The vendor export is a columns/rows JSON payload, not a CSV — unchanged.
    const vendors = (await client.get('/api/vendors/export')).body.data;
    expect(Array.isArray(vendors.columns)).toBe(true);
    expect(Array.isArray(vendors.rows)).toBe(true);
    expect(vendors.truncated).toBe(false);
    expect(vendors.columns).not.toContain('bankAccounts');
  });
});
