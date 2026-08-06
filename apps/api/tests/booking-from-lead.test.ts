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

async function owner(email = 'owner@bfl.test', companyName = 'Booking From Lead Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

const leadPayload = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Booking Customer',
  phone: '+91 90000 12345',
  email: 'customer@example.test',
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'BOOKING_CONFIRMED',
  priority: 'HIGH',
  travelStartDate: '2026-10-10',
  travelEndDate: '2026-10-14',
  rooms: 1,
  adults: 2,
  childrenWithBed: 1,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
  ...overrides,
});

/** Lead with a finalized quotation version ready to be booked. */
async function readyLead(overrides: Record<string, unknown> = {}) {
  const client = await owner();
  const lead = (await client.post('/api/queries', leadPayload())).body.data;
  // Apply any type/stage overrides directly so rejection tests exercise the
  // booking validation, not lead-creation transition rules.
  if (overrides.leadType || overrides.leadStage) {
    await db.query.update({
      where: { id: lead.id },
      data: {
        ...(overrides.leadType ? { leadType: overrides.leadType as 'HOT' } : {}),
        ...(overrides.leadStage ? { leadStage: overrides.leadStage as 'BOOKING_CONFIRMED' } : {}),
      },
    });
  }
  const refreshed = (await client.get(`/api/queries/${lead.id}`)).body.data;
  const quotation = (await client.post('/api/quotations', { queryId: refreshed.id })).body.data;
  const version = quotation.versions[0];
  await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
  return { client, lead: refreshed, quotation, version };
}

const fromLeadPayload = (quotationId: string, overrides: Record<string, unknown> = {}) => ({
  leadId: 'REPLACED',
  quotationId,
  title: 'Booking Customer - Test Quotation',
  notes: 'Please confirm',
  totalSellingAmount: 50000,
  tcsExempt: true,
  gstRate: 18,
  gstMode: 'ADDITIVE',
  placeOfSupply: 'Karnataka',
  reminders: [{ daysBefore: 2, dueTime: '11:00' }],
  ...overrides,
});

describe('Create Booking from Lead', () => {
  it('creating a lead does not create a customer', async () => {
    const client = await owner();
    const before = await db.customer.count();
    await client.post('/api/queries', leadPayload());
    expect(await db.customer.count()).toBe(before);
  });

  it('creates a booking and a new customer transactionally for a Hot + Booking Confirmed lead', async () => {
    const { client, lead, quotation, version } = await readyLead();
    const customerBefore = await db.customer.count();
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      queryId: lead.id,
      quotationId: quotation.id,
      quotationVersionId: version.id,
      tcsExempt: true,
      gstRate: 18,
      gstMode: 'ADDITIVE',
      placeOfSupply: 'Karnataka',
    });
    expect(await db.customer.count()).toBe(customerBefore + 1);
    // The booking links to the newly created customer.
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: { customer: true },
    });
    expect(booking.customerId).not.toBeNull();
    // The customer is linked back to the source lead and the selected quotation.
    const linkedLead = await db.query.findUniqueOrThrow({ where: { id: lead.id } });
    expect(linkedLead.customerId).toBe(booking.customerId);
    const linkedQuotation = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(linkedQuotation.customerId).toBe(booking.customerId);
    // Imported hotel service snapshot from the finalized version.
    expect(await db.bookingService.count({ where: { bookingId: booking.id } })).toBeGreaterThan(0);
    // A booking reminder was created.
    const reminders = await db.bookingReminder.findMany({ where: { bookingId: booking.id } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ daysBefore: 2, dueTime: '11:00' });
  });

  it('rejects a non-Hot lead', async () => {
    const { client, lead, quotation } = await readyLead({ leadType: 'FRESH' });
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Lead type must be Hot');
  });

  it('rejects a non-Booking-Confirmed lead', async () => {
    const { client, lead, quotation } = await readyLead({ leadStage: 'NEW_LEAD' });
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Lead stage must be Booking Confirmed');
  });

  it('rejects a missing finalized quotation', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload('00000000-0000-4000-8000-000000000000', { leadId: lead.id }));
    expect([404, 422]).toContain(response.status);
  });

  it('rejects a draft quotation version', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    // Version is still DRAFT — no finalized version exists.
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('finalized quotation');
  });

  it('rejects a quotation belonging to another lead', async () => {
    const client = await owner();
    const leadA = (await client.post('/api/queries', leadPayload())).body.data;
    const leadB = (await client.post('/api/queries', leadPayload({ phone: '+91 90000 99999' }))).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: leadA.id })).body.data;
    await client.post(`/api/quotations/${quotation.id}/versions/${quotation.versions[0].id}/finalize`);
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: leadB.id }));
    expect(response.status).toBe(404);
  });

  it('reuses an existing exact-phone customer', async () => {
    const { client, lead, quotation } = await readyLead();
    // Seed a matching customer directly (standalone creation is removed).
    const company = await db.company.findFirstOrThrow({
      select: { id: true, users: { take: 1, select: { id: true } } },
    });
    await db.customer.create({
      data: {
        companyId: company.id,
        customerNumber: 'CUS-000010',
        displayName: 'Booking Customer',
        normalizedName: 'booking customer',
        primaryPhone: '+91 90000 12345',
        normalizedPhone: '+919000012345',
        email: 'customer@example.test',
        normalizedEmail: 'customer@example.test',
        createdById: company.users[0]!.id,
      },
    });
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(response.status).toBe(201);
    expect(await db.customer.count()).toBe(1);
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: { customer: true },
    });
    expect(booking.customer?.customerNumber).toBe('CUS-000010');
  });

  it('rejects duplicate booking creation for the same lead', async () => {
    const { client, lead, quotation } = await readyLead();
    const first = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(first.status).toBe(201);
    const second = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain('A booking already exists');
  });

  it('rolls back a newly created customer when booking creation fails', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    // No finalized version → create fails inside the transaction.
    const before = await db.customer.count();
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, { leadId: lead.id }));
    expect(response.status).toBe(409);
    expect(await db.customer.count()).toBe(before);
  });

  it('exposes the normalized duration window in the preview', async () => {
    const { client, lead, quotation } = await readyLead();
    const preview = await client.get(
      `/api/bookings/from-lead/preview?leadId=${lead.id}&quotationId=${quotation.id}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data.duration).toEqual({
      travelStart: '2026-10-10',
      travelEnd: '2026-10-14',
      totalNights: 4,
      totalDays: 5,
      durationLabel: '4 Nights / 5 Days',
    });
    expect(preview.body.data.customerState).toBeNull();
  });

  it('resolves duration from version stay-night allocations when dates are incomplete', async () => {
    const client = await owner();
    const company = await db.company.findFirstOrThrow({ select: { id: true } });
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const version = quotation.versions[0];
    // Only a start date exists; the stay-night allocation carries the length.
    await db.quotationVersion.update({
      where: { id: version.id },
      data: { travelEndDate: null },
    });
    await db.quotation.update({
      where: { id: quotation.id },
      data: { travelEndDate: null },
    });
    await db.quotationVersionHotelOption.create({
      data: {
        companyId: company.id,
        quotationVersionId: version.id,
        city: 'Goa',
        hotelName: 'Test Hotel',
        nights: 5,
        checkInDate: new Date('2026-10-10T00:00:00.000Z'),
        checkOutDate: new Date('2026-10-15T00:00:00.000Z'),
        internalCost: 0,
        sellingPrice: 0,
        selected: true,
        sequence: 1,
      },
    });
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const preview = await client.get(
      `/api/bookings/from-lead/preview?leadId=${lead.id}&quotationId=${quotation.id}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data.duration).toEqual({
      travelStart: '2026-10-10',
      travelEnd: '2026-10-15',
      totalNights: 5,
      totalDays: 6,
      durationLabel: '5 Nights / 6 Days',
    });
  });

  it('uses reviewed customer overrides from the create request', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, {
      leadId: lead.id,
      customer: {
        displayName: 'Aarav Mehta Edited',
        phone: '+91 90000 00001',
        email: 'edited@example.test',
      },
    }));
    expect(response.status).toBe(201);
    const customer = await db.customer.findFirstOrThrow({
      where: { id: response.body.data.customerId },
    });
    expect(customer.displayName).toBe('Aarav Mehta Edited');
    expect(customer.primaryPhone).toBe('+91 90000 00001');
    expect(customer.email).toBe('edited@example.test');
    // The booking reflects the reviewed customer details, not the lead's.
    expect(response.body.data).toMatchObject({
      customerName: 'Aarav Mehta Edited',
      customerPhone: '+91 90000 00001',
      customerEmail: 'edited@example.test',
    });
  });

  it('persists the selected state on the newly created customer address', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, {
      leadId: lead.id,
      customer: {
        displayName: 'Stateful Customer',
        phone: '+91 90000 00004',
        email: null,
        state: 'Karnataka',
      },
    }));
    expect(response.status).toBe(201);
    const customer = await db.customer.findFirstOrThrow({
      where: { id: response.body.data.customerId },
      include: { addresses: { where: { deletedAt: null } } },
    });
    expect(customer.addresses).toHaveLength(1);
    expect(customer.addresses[0]).toMatchObject({
      state: 'Karnataka',
      isPrimary: true,
    });
  });

  it('does not persist a state when none is supplied', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, {
      leadId: lead.id,
      customer: {
        displayName: 'No State Customer',
        phone: '+91 90000 00005',
      },
    }));
    expect(response.status).toBe(201);
    const customer = await db.customer.findFirstOrThrow({
      where: { id: response.body.data.customerId },
      include: { addresses: { where: { deletedAt: null } } },
    });
    expect(customer.addresses).toHaveLength(0);
  });

  it('does not overwrite an existing customer state from the new-customer form', async () => {
    const { client, lead, quotation } = await readyLead();
    const company = await db.company.findFirstOrThrow({
      select: { id: true, users: { take: 1, select: { id: true } } },
    });
    const customer = await db.customer.create({
      data: {
        companyId: company.id,
        customerNumber: 'CUS-000012',
        displayName: 'Existing Stateful',
        normalizedName: 'existing stateful',
        primaryPhone: '+91 90000 00006',
        normalizedPhone: '+919000000006',
        createdById: company.users[0]!.id,
      },
    });
    await db.customerAddress.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        type: 'HOME',
        line1: 'Line 1',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        isPrimary: true,
      },
    });
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, {
      leadId: lead.id,
      customer: {
        displayName: 'Existing Stateful',
        phone: '+91 90000 00006',
        state: null,
      },
    }));
    expect(response.status).toBe(201);
    expect(await db.customer.count()).toBe(1);
    const after = await db.customerAddress.findFirstOrThrow({
      where: { customerId: customer.id, deletedAt: null },
    });
    expect(after.state).toBe('Karnataka');
  });

  it('prefills customerState from the matched customer primary address', async () => {
    const { client, lead, quotation } = await readyLead();
    const company = await db.company.findFirstOrThrow({
      select: { id: true, users: { take: 1, select: { id: true } } },
    });
    const customer = await db.customer.create({
      data: {
        companyId: company.id,
        customerNumber: 'CUS-000013',
        displayName: 'Aarav Mehta',
        normalizedName: 'aarav mehta',
        primaryPhone: '+91 90000 12345',
        normalizedPhone: '+919000012345',
        createdById: company.users[0]!.id,
      },
    });
    await db.customerAddress.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        type: 'HOME',
        line1: 'Line 1',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        isPrimary: true,
      },
    });
    const preview = await client.get(
      `/api/bookings/from-lead/preview?leadId=${lead.id}&quotationId=${quotation.id}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data.customerState).toBe('Maharashtra');
  });

  it('reuses an existing matching customer at submission even with an override', async () => {
    const { client, lead, quotation } = await readyLead();
    const company = await db.company.findFirstOrThrow({
      select: { id: true, users: { take: 1, select: { id: true } } },
    });
    await db.customer.create({
      data: {
        companyId: company.id,
        customerNumber: 'CUS-000011',
        displayName: 'Original Match',
        normalizedName: 'original match',
        primaryPhone: '+91 90000 00002',
        normalizedPhone: '+919000000002',
        createdById: company.users[0]!.id,
      },
    });
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, {
      leadId: lead.id,
      customer: {
        displayName: 'Should Not Duplicate',
        phone: '+91 90000 00002',
      },
    }));
    expect(response.status).toBe(201);
    expect(await db.customer.count()).toBe(1);
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: { customer: true },
    });
    expect(booking.customer?.displayName).toBe('Original Match');
  });

  it('defaults tcsExempt to false and stores the false value', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post(
      '/api/bookings/from-lead',
      fromLeadPayload(quotation.id, { leadId: lead.id, tcsExempt: false }),
    );
    expect(response.status).toBe(201);
    expect(response.body.data.tcsExempt).toBe(false);
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(booking.tcsExempt).toBe(false);
  });

  it('does not add TCS when exempt and keeps GST unchanged', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post(
      '/api/bookings/from-lead',
      fromLeadPayload(quotation.id, {
        leadId: lead.id,
        tcsExempt: true,
        gstRate: 18,
        gstMode: 'ADDITIVE',
      }),
    );
    expect(response.status).toBe(201);
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(booking.tcsExempt).toBe(true);
    expect(booking.tcsAmount.toString()).toBe('0');
    // TCS exemption must not disable GST.
    expect(booking.gstRate).toBe(18);
    expect(booking.gstMode).toBe('ADDITIVE');
    expect(booking.gstAmount.toString()).toBe('0');
  });

  it('treats a null customer email as missing instead of inventing one', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post('/api/bookings/from-lead', fromLeadPayload(quotation.id, {
      leadId: lead.id,
      customer: {
        displayName: 'No Email Customer',
        phone: '+91 90000 00003',
        email: null,
      },
    }));
    expect(response.status).toBe(201);
    const customer = await db.customer.findFirstOrThrow({
      where: { id: response.body.data.customerId },
    });
    expect(customer.email).toBeNull();
    const booking = await db.booking.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(booking.customerEmail).toBeNull();
  });

  it('rejects duplicate reminder offsets', async () => {
    const { client, lead, quotation } = await readyLead();
    const response = await client.post(
      '/api/bookings/from-lead',
      fromLeadPayload(quotation.id, {
        leadId: lead.id,
        reminders: [
          { daysBefore: 2, dueTime: '11:00' },
          { daysBefore: 2, dueTime: '09:00' },
        ],
      }),
    );
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Duplicate reminder');
    // Booking must be rolled back.
    expect(await db.booking.count()).toBe(0);
    expect(await db.customer.count()).toBe(0);
  });

  it('blocks standalone customer creation via the API', async () => {
    const client = await owner();
    const response = await client.post('/api/customers', {
      displayName: 'Should Not Create',
      primaryPhone: '+91 90000 00000',
      type: 'INDIVIDUAL',
      status: 'ACTIVE',
    });
    expect(response.status).toBe(404);
    expect(await db.customer.count()).toBe(0);
  });

  it('returns a customer-conflict when multiple exact phone matches exist', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    await client.post(`/api/quotations/${quotation.id}/versions/${quotation.versions[0].id}/finalize`);
    const company = await db.company.findFirstOrThrow({
      select: { id: true, users: { take: 1, select: { id: true } } },
    });
    await db.customer.createMany({
      data: [1, 2].map((n) => ({
        companyId: company.id,
        customerNumber: `CUS-00000${n}`,
        displayName: `Dup ${n}`,
        normalizedName: `dup ${n}`,
        primaryPhone: '+91 90000 12345',
        normalizedPhone: '+919000012345',
        createdById: company.users[0]!.id,
      })),
    });
    const preview = await client.get(`/api/bookings/from-lead/preview?leadId=${lead.id}&quotationId=${quotation.id}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.customer).toEqual({ conflict: true });
  });
});
