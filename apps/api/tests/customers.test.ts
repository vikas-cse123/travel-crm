import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { storageService } from '../src/services/storage/storage.service.js';

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

async function owner(email = 'owner@customers.test', companyName = 'Customer Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

const customerPayload = (suffix = '') => ({
  type: 'INDIVIDUAL',
  status: 'ACTIVE',
  lifecycleStage: 'PROSPECT',
  displayName: `Aarav Mehta${suffix}`,
  primaryPhone: `98765432${suffix || '10'}`,
  email: `aarav${suffix || ''}@example.test`,
  preferredCurrency: 'INR',
  addresses: [],
  tagIds: [],
  createAnyway: false,
});

const leadPayload = (phone = '+91 98765 43210', email = 'aarav@example.test') => ({
  customerName: 'Aarav Mehta',
  phone,
  email,
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'QUALIFIED',
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

describe('Phase 10 customer profiles and relationship history', () => {
  it('creates tenant-scoped customer numbers and never exposes normalization keys', async () => {
    const client = await owner();
    const response = await client.post('/api/customers', customerPayload());
    expect(response.status).toBe(201);
    expect(response.body.data.customerNumber).toMatch(/^CUS-\d{4}-000001$/);
    expect(response.body.data).not.toHaveProperty('companyId');
    expect(response.body.data).not.toHaveProperty('normalizedPhone');
    expect(response.body.data).not.toHaveProperty('normalizedEmail');
    const stored = await db.customer.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(stored.normalizedPhone).toBe('+919876543210');
    expect(stored.normalizedEmail).toBe('aarav@example.test');
    const analytics = await client.get('/api/customers/analytics');
    expect(analytics.status).toBe(200);
    expect(analytics.body.data).toMatchObject({
      total: 1,
      active: 1,
      newThisMonth: 1,
      possibleDuplicateGroups: 0,
      repeatPercentage: 0,
    });
    const list = await client.get(
      '/api/customers?customerType=INDIVIDUAL&isRepeatCustomer=false&hasOutstandingBalance=false&sortBy=customerNumber&sortOrder=asc&createdFrom=2020-01-01',
    );
    expect(list.status).toBe(200);
    expect(list.body.data.data.map((item: { id: string }) => item.id)).toEqual([
      response.body.data.id,
    ]);
  });

  it('allocates customer numbers concurrently and ignores invalid phones as duplicate keys', async () => {
    const client = await owner();
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        client.post('/api/customers', {
          ...customerPayload(` ${index}`),
          primaryPhone: index === 0 ? 'not-a-phone' : String(9000000000 + index),
          email: `concurrent-${index}@example.test`,
        }),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const numbers = responses.map((response) => response.body.data.customerNumber);
    expect(new Set(numbers).size).toBe(4);
    expect(
      (await db.customer.findFirstOrThrow({ where: { email: 'concurrent-0@example.test' } }))
        .normalizedPhone,
    ).toBeNull();
  });

  it('detects exact phone and email matches and requires explicit override', async () => {
    const client = await owner();
    const created = (await client.post('/api/customers', customerPayload())).body.data;
    const duplicates = await client.get(
      '/api/customers/duplicates?phone=%2B91%2098765%2043210&email=AARAV%40EXAMPLE.TEST&displayName=Aarav%20Mehta',
    );
    expect(duplicates.body.data[0]).toMatchObject({ id: created.id, strongMatch: true });
    expect(
      (
        await client.post('/api/customers/check-duplicates', {
          phone: '+91 98765 43210',
          email: 'AARAV@example.test',
        })
      ).body.data[0],
    ).toMatchObject({ id: created.id, strongMatch: true });
    expect(duplicates.body.data[0].reasons).toEqual(
      expect.arrayContaining(['PHONE_EXACT', 'EMAIL_EXACT']),
    );
    expect(
      (
        await client.post('/api/customers', {
          ...customerPayload(' Junior'),
          primaryPhone: '+91 98765 43210',
          email: 'AARAV@example.test',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await client.post('/api/customers', {
          ...customerPayload(' Junior'),
          primaryPhone: '+91 98765 43210',
          email: 'AARAV@example.test',
          createAnyway: true,
        })
      ).status,
    ).toBe(201);
  });

  it('automatically links lead creation to one strong customer and propagates to quotations', async () => {
    const client = await owner();
    const customer = (await client.post('/api/customers', customerPayload())).body.data;
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    expect(lead.customer.id).toBe(customer.id);
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    expect((await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } })).customerId).toBe(
      customer.id,
    );
    expect((await client.get(`/api/customers/${customer.id}/quotations`)).body.data).toHaveLength(
      1,
    );
  });

  it('creates a customer in the same lead transaction when no match exists', async () => {
    const client = await owner();
    const lead = (
      await client.post('/api/queries', leadPayload('+91 90000 00001', 'new@example.test'))
    ).body.data;
    expect(lead.customer.customerNumber).toMatch(/^CUS-/);
    expect(await db.customer.count()).toBe(1);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: lead.customer.id } })).queryCount,
    ).toBe(1);
  });

  it('manages tags, notes, communications and a unified timeline', async () => {
    const client = await owner();
    const customer = (await client.post('/api/customers', customerPayload())).body.data;
    const tag = (
      await client.post('/api/customers/tags', { name: 'VIP prospect', color: '#7c3aed' })
    ).body.data;
    expect(
      (await client.post(`/api/customers/${customer.id}/tags`, { tagId: tag.id })).status,
    ).toBe(200);
    expect(
      (
        await client.post(`/api/customers/${customer.id}/notes`, {
          type: 'PREFERENCE',
          content: 'Prefers beach resorts',
          isPinned: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await client.post(`/api/customers/${customer.id}/communications`, {
          type: 'WHATSAPP',
          direction: 'OUTBOUND',
          summary: 'Shared itinerary',
          occurredAt: new Date().toISOString(),
        })
      ).status,
    ).toBe(201);
    const timeline = await client.get(`/api/customers/${customer.id}/timeline`);
    expect(timeline.body.data.data.map((item: { type: string }) => item.type)).toEqual(
      expect.arrayContaining(['NOTE', 'COMMUNICATION']),
    );
  });

  it('supports canonical tag routes and communication update, linkage and soft deletion', async () => {
    const client = await owner();
    const customer = (await client.post('/api/customers', customerPayload())).body.data;
    const tag = (await client.post('/api/customer-tags', { name: 'Family', color: '#2563eb' })).body
      .data;
    expect(
      (await client.post('/api/customer-tags', { name: ' family ', color: '#2563eb' })).status,
    ).toBe(409);
    expect(
      (await client.patch(`/api/customer-tags/${tag.id}`, { name: 'Family Travel' })).status,
    ).toBe(200);
    const lead = (
      await client.post('/api/queries', {
        ...leadPayload(),
        customerId: customer.id,
      })
    ).body.data;
    const communication = await client.post(`/api/customers/${customer.id}/communications`, {
      type: 'PHONE',
      direction: 'OUTBOUND',
      summary: 'Discussed preferred dates',
      occurredAt: new Date().toISOString(),
      leadId: lead.id,
      nextAction: 'Call with revised itinerary',
      nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(communication.status).toBe(201);
    expect(
      (
        await client.patch(
          `/api/customers/${customer.id}/communications/${communication.body.data.id}`,
          { outcome: 'Customer requested an update' },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await client.delete(
          `/api/customers/${customer.id}/communications/${communication.body.data.id}`,
        )
      ).status,
    ).toBe(200);
    expect((await client.get(`/api/customers/${customer.id}/communications`)).body.data).toEqual(
      [],
    );
    expect(
      (
        await db.customerCommunication.findUniqueOrThrow({
          where: { id: communication.body.data.id },
        })
      ).deletedAt,
    ).not.toBeNull();
  });

  it('projects travellers and financial payment history without turning travellers into customers', async () => {
    const client = await owner();
    const customer = (await client.post('/api/customers', customerPayload())).body.data;
    const booking = (
      await client.post('/api/bookings', {
        customerId: customer.id,
        customerName: customer.displayName,
        customerEmail: customer.email,
        customerPhone: customer.primaryPhone,
        destinationSummary: 'Kerala',
        rooms: 1,
        adults: 1,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        currency: 'INR',
        totalSellingAmount: 50000,
        manualCreationReason: 'Direct relationship-history test',
        services: [],
        itinerary: [],
        paymentSchedule: [
          { installmentNumber: 1, label: 'Deposit', amount: 50000, dueDate: '2026-10-01' },
        ],
      })
    ).body.data;
    await client.post(`/api/bookings/${booking.id}/travellers`, {
      travellerType: 'ADULT',
      title: 'Ms',
      firstName: 'Nina',
      lastName: 'Shah',
      visaStatus: 'NOT_STARTED',
      isPrimaryTraveller: true,
      sequence: 1,
    });
    await client.post(`/api/bookings/${booking.id}/payments`, {
      paymentScheduleId: booking.paymentSchedules[0].id,
      amount: 10000,
      currency: 'INR',
      paymentMethod: 'UPI',
      paymentStatus: 'RECEIVED',
      receivedAt: '2026-09-01',
    });
    const travellers = await client.get(`/api/customers/${customer.id}/travellers`);
    expect(travellers.body.data[0]).toMatchObject({ firstName: 'Nina', lastName: 'Shah' });
    expect(travellers.body.data[0]).not.toHaveProperty('passportNumberEncrypted');
    expect((await client.get(`/api/customers/${customer.id}/payments`)).body.data[0]).toMatchObject(
      {
        amount: '10000.00',
        booking: { bookingNumber: booking.bookingNumber },
      },
    );
    expect((await client.get(`/api/customers/${customer.id}`)).body.data.totalPaid).toBe(
      '10000.00',
    );
    await client.patch(`/api/bookings/${booking.id}/status`, { status: 'CONFIRMED' });
    const repeatBooking = (
      await client.post('/api/bookings', {
        customerId: customer.id,
        customerName: customer.displayName,
        customerEmail: customer.email,
        customerPhone: customer.primaryPhone,
        destinationSummary: 'Goa',
        rooms: 1,
        adults: 1,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        currency: 'INR',
        totalSellingAmount: 25000,
        manualCreationReason: 'Repeat-customer metric test',
        services: [],
        itinerary: [],
        paymentSchedule: [],
      })
    ).body.data;
    await client.patch(`/api/bookings/${repeatBooking.id}/status`, { status: 'CONFIRMED' });
    expect((await client.get(`/api/customers/${customer.id}`)).body.data).toMatchObject({
      bookingCount: 2,
      isRepeatCustomer: true,
      lifecycleStage: 'REPEAT_CUSTOMER',
    });
    expect(await db.customer.count()).toBe(1);
  });

  it('keeps customer documents private, tenant-scoped and soft deletable', async () => {
    const client = await owner();
    const customer = (await client.post('/api/customers', customerPayload())).body.data;
    expect(
      (
        await client.post(`/api/customers/${customer.id}/documents/upload`, {
          type: 'AGREEMENT',
          name: 'unsafe.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 4,
        })
      ).status,
    ).toBe(400);
    const approved = await client.post(`/api/customers/${customer.id}/documents/upload`, {
      type: 'AGREEMENT',
      name: '../../customer-agreement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4,
    });
    expect(approved.status).toBe(201);
    const stored = await db.customerDocument.findUniqueOrThrow({
      where: { id: approved.body.data.document.id },
    });
    expect(stored.objectKey).toContain(
      `companies/${stored.companyId}/customers/${customer.id}/documents/${stored.id}/`,
    );
    expect(stored.objectKey).not.toContain('..');
    await storageService.putObject({
      key: stored.objectKey,
      body: Buffer.from('test'),
      contentType: 'application/pdf',
    });
    expect(
      (await client.post(`/api/customers/${customer.id}/documents/${stored.id}/confirm`, {}))
        .status,
    ).toBe(200);
    const listed = await client.get(`/api/customers/${customer.id}/documents`);
    expect(listed.body.data[0]).toMatchObject({ id: stored.id, source: 'CUSTOMER' });
    expect(listed.body.data[0]).not.toHaveProperty('objectKey');
    expect(
      (await client.get(`/api/customers/${customer.id}/documents/${stored.id}/url`)).status,
    ).toBe(200);
    expect(
      (await client.delete(`/api/customers/${customer.id}/documents/${stored.id}`)).status,
    ).toBe(200);
    expect(
      (await db.customerDocument.findUniqueOrThrow({ where: { id: stored.id } })).deletedAt,
    ).not.toBeNull();
  });

  it('merges duplicates transactionally and preserves provenance', async () => {
    const client = await owner();
    const target = (await client.post('/api/customers', customerPayload())).body.data;
    const source = (
      await client.post('/api/customers', {
        ...customerPayload(' Two'),
        primaryPhone: '9000000002',
        email: 'two@example.test',
      })
    ).body.data;
    await client.post('/api/queries', {
      ...leadPayload('9000000002', 'two@example.test'),
      customerId: source.id,
    });
    const input = {
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      reason: 'Same traveller',
      fieldChoices: {},
    };
    expect(
      (await client.post('/api/customers/merge/preview', input)).body.data.relationshipMoves.leads,
    ).toBe(1);
    expect(
      (await client.get(`/api/customers/${source.id}/merge-preview/${target.id}`)).body.data
        .relationshipMoves.leads,
    ).toBe(1);
    expect(
      (
        await client.post(`/api/customers/${source.id}/merge/${target.id}`, {
          reason: input.reason,
          fieldChoices: {},
          confirmation: true,
        })
      ).status,
    ).toBe(200);
    const merged = await db.customer.findUniqueOrThrow({ where: { id: source.id } });
    expect(merged).toMatchObject({ status: 'MERGED', mergedIntoId: target.id });
    expect(await db.query.count({ where: { customerId: target.id } })).toBe(1);
    expect(
      await db.customerMergeHistory.count({
        where: { sourceCustomerId: source.id, targetCustomerId: target.id },
      }),
    ).toBe(1);
  });

  it('enforces tenant isolation on details, relationships and merge', async () => {
    const alpha = await owner();
    const customer = (await alpha.post('/api/customers', customerPayload())).body.data;
    const beta = await owner('owner@beta-customers.test', 'Beta Customers');
    expect(
      (
        await beta.get(
          '/api/customers/duplicates?phone=%2B91%2098765%2043210&email=aarav%40example.test',
        )
      ).body.data,
    ).toEqual([]);
    expect((await beta.get(`/api/customers/${customer.id}`)).status).toBe(404);
    expect((await beta.get(`/api/customers/${customer.id}/timeline`)).status).toBe(404);
    const betaCustomer = (
      await beta.post('/api/customers', {
        ...customerPayload(' Beta'),
        email: 'beta@example.test',
        primaryPhone: '9111111111',
      })
    ).body.data;
    expect(
      (
        await beta.post('/api/customers/merge/preview', {
          sourceCustomerId: betaCustomer.id,
          targetCustomerId: customer.id,
          fieldChoices: {},
        })
      ).status,
    ).toBe(404);
  });

  it('does not allow hard archival when booking history exists', async () => {
    const client = await owner();
    const customer = (await client.post('/api/customers', customerPayload())).body.data;
    const booking = await client.post('/api/bookings', {
      customerId: customer.id,
      customerName: customer.displayName,
      customerEmail: customer.email,
      customerPhone: customer.primaryPhone,
      destinationSummary: 'Kerala',
      rooms: 1,
      adults: 2,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      currency: 'INR',
      totalSellingAmount: 50000,
      manualCreationReason: 'Direct booking',
      services: [],
      itinerary: [],
      paymentSchedule: [],
    });
    expect(booking.status).toBe(201);
    expect((await client.delete(`/api/customers/${customer.id}`)).status).toBe(409);
    expect(
      (await client.patch(`/api/customers/${customer.id}/status`, { status: 'INACTIVE' })).status,
    ).toBe(200);
  });
});
