import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { storageService } from '../src/services/storage/storage.service.js';
import type { MemoryStorageService } from '../src/services/storage/storage.service.js';
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

async function owner(email = 'owner@booking.test', companyName = 'Booking Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

async function createRoleClient(ownerEmail: string, roleName: string, email: string) {
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
  const login = await client.post('/api/auth/login', {
    email,
    password: 'Sales@2026',
    rememberMe: false,
  });
  expect(login.status).toBe(200);
  return client;
}

const leadPayload = (phone = '+91 90000 12345') => ({
  customerName: 'Booking Customer',
  phone,
  email: 'customer@example.test',
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'QUALIFIED',
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
});
const templatePayload = () => ({
  name: 'Booking source package',
  destinationSummary: 'Goa',
  durationDays: 5,
  durationNights: 4,
  baseCurrency: 'INR',
  status: 'ACTIVE',
  itinerary: [
    {
      dayNumber: 1,
      title: 'Arrival',
      destination: 'Goa',
      description: 'Airport transfer and hotel check-in.',
      sequence: 1,
    },
  ],
  hotels: [
    {
      city: 'Goa',
      hotelName: 'Harbour Hotel',
      rooms: 1,
      nights: 4,
      internalCost: 20000,
      sellingPrice: 26000,
      selected: true,
      sequence: 1,
    },
  ],
  services: [
    {
      serviceType: 'SIGHTSEEING',
      name: 'City tour',
      quantity: 1,
      internalCost: 4000,
      sellingPrice: 6000,
      sequence: 1,
    },
  ],
  inclusions: [{ content: 'Breakfast', sequence: 1 }],
  exclusions: [],
  terms: [{ content: 'Non refundable', sequence: 1 }],
});
const manualPayload = (suffix = '') => ({
  customerName: `Manual Customer ${suffix}`.trim(),
  customerEmail: 'manual@example.test',
  customerPhone: `90000123${suffix || '00'}`,
  destinationSummary: 'Kerala',
  travelStartDate: '2026-11-01',
  travelEndDate: '2026-11-05',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  currency: 'INR',
  totalSellingAmount: 50000,
  manualCreationReason: 'Corporate offline confirmation',
  services: [],
  itinerary: [],
  paymentSchedule: [],
});

async function acceptedSetup() {
  const client = await owner();
  const lead = (await client.post('/api/queries', leadPayload())).body.data;
  const template = (await client.post('/api/quotation-templates', templatePayload())).body.data;
  const quotation = (
    await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
  ).body.data;
  const version = quotation.versions[0];
  await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
  await db.quotation.update({
    where: { id: quotation.id },
    data: { status: 'ACCEPTED', acceptedVersionId: version.id, acceptedAt: new Date() },
  });
  return { client, lead, quotation, version, template };
}

describe('Phase 9 booking conversion and lifecycle', () => {
  it('transactionally converts the exact accepted version, copies snapshots and prevents duplicates', async () => {
    const { client, lead, quotation, version, template } = await acceptedSetup();
    const response = await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {
      quotationVersionId: version.id,
      paymentSchedule: [
        { installmentNumber: 1, label: 'Advance', amount: 16000, dueDate: '2026-08-01' },
      ],
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      quotationId: quotation.id,
      quotationVersionId: version.id,
      bookingStatus: 'PENDING_CONFIRMATION',
    });
    expect(response.body.data.bookingNumber).toMatch(/^BK-\d{4}-000001$/);
    expect(response.body.data.services).toHaveLength(2);
    expect(response.body.data.itinerary[0].title).toBe('Arrival');
    expect(response.body.data.totalSellingAmount).toBe('32000.00');
    expect(response.body.data.totalCost).toBe('24000.00');
    expect((await db.query.findUniqueOrThrow({ where: { id: lead.id } })).leadStage).toBe(
      'BOOKING_CONFIRMED',
    );
    await client.patch(`/api/quotation-templates/${template.id}`, {
      name: 'Changed after conversion',
    });
    expect((await client.get(`/api/bookings/${response.body.data.id}`)).body.data.sourceTitle).toBe(
      'Booking source package',
    );
    expect(
      (await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {})).status,
    ).toBe(409);
    expect(
      (
        await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {
          quotationVersionId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(400);
  });

  it('rejects non-accepted and cross-company quotations', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    expect(
      (await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {})).status,
    ).toBe(409);
    const beta = await owner('owner@beta-booking.test', 'Beta Booking');
    expect((await beta.post(`/api/quotations/${quotation.id}/convert-to-booking`, {})).status).toBe(
      404,
    );
  });

  it('creates manual bookings only with a reason and allocates numbers concurrently', async () => {
    const client = await owner();
    expect(
      (await client.post('/api/bookings', { ...manualPayload(), manualCreationReason: '' })).status,
    ).toBe(400);
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        client.post('/api/bookings', manualPayload(String(index + 1))),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body.data.bookingNumber)).size).toBe(5);
    expect((await db.bookingCounter.findFirstOrThrow()).bookingValue).toBe(5);
  });

  it('enforces explicit status transitions and cancellation reasons', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    expect(
      (await client.patch(`/api/bookings/${booking.id}/status`, { status: 'COMPLETED' })).status,
    ).toBe(409);
    expect(
      (await client.patch(`/api/bookings/${booking.id}/status`, { status: 'CANCELLED' })).status,
    ).toBe(400);
    expect(
      (await client.patch(`/api/bookings/${booking.id}/status`, { status: 'CONFIRMED' })).status,
    ).toBe(200);
    expect(
      (await client.patch(`/api/bookings/${booking.id}/status`, { status: 'TRAVEL_IN_PROGRESS' }))
        .status,
    ).toBe(200);
    expect(
      (await client.patch(`/api/bookings/${booking.id}/status`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    expect(await db.bookingStatusHistory.count({ where: { bookingId: booking.id } })).toBe(4);
  });

  it('paginates, searches and filters the server-side booking list', async () => {
    const client = await owner();
    await client.post('/api/bookings', manualPayload('11'));
    await client.post('/api/bookings', {
      ...manualPayload('22'),
      customerName: 'Unique Search Guest',
      destinationSummary: 'Andaman',
    });
    const page = await client.get(
      '/api/bookings?page=1&pageSize=1&sortBy=customerName&sortOrder=asc',
    );
    expect(page.status).toBe(200);
    expect(page.body.data.data).toHaveLength(1);
    expect(page.body.data.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    const filtered = await client.get(
      '/api/bookings?search=Unique%20Search&bookingStatus=PENDING_CONFIRMATION&paymentStatus=UNPAID&travelFrom=2026-10-01&travelTo=2026-12-01',
    );
    expect(filtered.body.data.data).toHaveLength(1);
    expect(filtered.body.data.data[0]).toMatchObject({
      customerName: 'Unique Search Guest',
      destinationSummary: 'Andaman',
    });
  });

  it('enforces linked visibility and removes all financial projections for Sales', async () => {
    const client = await owner();
    const visible = (
      await client.post('/api/bookings', {
        ...manualPayload('31'),
        services: [
          {
            serviceType: 'HOTEL',
            name: 'Private rate hotel',
            customerSellingAmount: 50000,
            internalCostSnapshot: 30000,
            confirmationStatus: 'PENDING',
            sequence: 1,
          },
        ],
        paymentSchedule: [
          { installmentNumber: 1, label: 'Advance', amount: 50000, dueDate: '2026-12-01' },
        ],
      })
    ).body.data;
    await client.post('/api/bookings', manualPayload('32'));
    const salesEmail = 'sales@booking.test';
    const sales = await createRoleClient('owner@booking.test', 'Sales Executive', salesEmail);
    const salesUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: salesEmail } });
    await client.patch(`/api/bookings/${visible.id}/assignment`, { assignedToId: salesUser.id });

    const list = await sales.get('/api/bookings');
    expect(list.status).toBe(200);
    expect(list.body.data.data).toHaveLength(1);
    expect(list.body.data.data[0]).not.toHaveProperty('totalSellingAmount');
    expect(list.body.data.data[0].services[0]).not.toHaveProperty('customerSellingAmount');
    expect(list.body.data.data[0].paymentSchedules[0]).not.toHaveProperty('amount');
    expect(list.body.data.data[0].payments).toEqual([]);
    expect(list.body.data.data[0]).not.toHaveProperty('costs');
    expect((await sales.get('/api/bookings?amountMin=1')).status).toBe(403);

    const hidden = await db.booking.findFirstOrThrow({
      where: { customerName: 'Manual Customer 32' },
    });
    expect((await sales.get(`/api/bookings/${hidden.id}`)).status).toBe(404);

    const traveller = (
      await client.post(`/api/bookings/${visible.id}/travellers`, {
        travellerType: 'ADULT',
        title: 'Mr',
        firstName: 'Secure',
        lastName: 'Traveller',
        visaStatus: 'NOT_STARTED',
        sequence: 1,
      })
    ).body.data;
    const approved = await client.post(`/api/bookings/${visible.id}/documents/uploads`, {
      travellerId: traveller.id,
      documentType: 'PASSPORT',
      visibility: 'INTERNAL',
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      fileSize: 4,
    });
    const document = await db.bookingDocument.findUniqueOrThrow({
      where: { id: approved.body.data.document.id },
    });
    await storageService.putObject({
      key: document.objectKey,
      body: Buffer.from('test'),
      contentType: 'application/pdf',
    });
    await client.post(`/api/bookings/${visible.id}/documents/uploads/${document.id}/confirm`);
    expect(
      (await sales.get(`/api/bookings/${visible.id}/documents/${document.id}/download-url`)).status,
    ).toBe(403);
  });
});

describe('Phase 9 travellers, payments, costs and documents', () => {
  it('encrypts passport numbers, masks responses and preserves traveller documents on soft deletion', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    const response = await client.post(`/api/bookings/${booking.id}/travellers`, {
      travellerType: 'ADULT',
      title: 'Mr',
      firstName: 'Ravi',
      lastName: 'Kumar',
      passportNumber: 'P1234567',
      passportExpiresAt: '2026-11-15',
      visaStatus: 'APPROVED',
      isPrimaryTraveller: true,
      sequence: 1,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.passportMasked).toMatch(/4567$/);
    expect(response.body.data).not.toHaveProperty('passportNumberEncrypted');
    const stored = await db.bookingTraveller.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(stored.passportNumberEncrypted).not.toContain('P1234567');
    expect(
      (await client.delete(`/api/bookings/${booking.id}/travellers/${stored.id}`)).status,
    ).toBe(200);
    expect(
      (await db.bookingTraveller.findUniqueOrThrow({ where: { id: stored.id } })).deletedAt,
    ).not.toBeNull();
  });

  it('validates passport chronology and prevents traveller-count reductions below recorded rows', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    expect(
      (
        await client.post(`/api/bookings/${booking.id}/travellers`, {
          travellerType: 'ADULT',
          title: 'Mr',
          firstName: 'Expired',
          lastName: 'Passport',
          passportIssuedAt: '2025-01-01',
          passportExpiresAt: '2026-01-01',
          visaStatus: 'NOT_STARTED',
          sequence: 1,
        })
      ).status,
    ).toBe(400);
    await client.post(`/api/bookings/${booking.id}/travellers`, {
      travellerType: 'ADULT',
      title: 'Mr',
      firstName: 'Valid',
      lastName: 'Traveller',
      visaStatus: 'NOT_STARTED',
      sequence: 1,
    });
    await client.post(`/api/bookings/${booking.id}/travellers`, {
      travellerType: 'ADULT',
      title: 'Ms',
      firstName: 'Second',
      lastName: 'Traveller',
      visaStatus: 'NOT_STARTED',
      sequence: 2,
    });
    expect((await client.patch(`/api/bookings/${booking.id}`, { adults: 1 })).status).toBe(400);
  });

  it('allocates partial/full payments, blocks overpayment and reverses without deleting history', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        paymentSchedule: [
          { installmentNumber: 1, label: 'Full', amount: 50000, dueDate: '2026-10-01' },
        ],
      })
    ).body.data;
    const scheduleId = booking.paymentSchedules[0].id;
    expect(
      (
        await client.post(`/api/bookings/${booking.id}/payments`, {
          amount: 1000,
          currency: 'INR',
          paymentMethod: 'CASH',
          receivedAt: '2026-08-31',
        })
      ).status,
    ).toBe(400);
    const first = await client.post(`/api/bookings/${booking.id}/payments`, {
      paymentScheduleId: scheduleId,
      amount: 20000,
      currency: 'INR',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'RECEIVED',
      receivedAt: '2026-09-01',
    });
    expect(first.body.data.paymentNumber).toMatch(/^PAY-\d{4}-000001$/);
    expect((await client.get(`/api/bookings/${booking.id}`)).body.data).toMatchObject({
      totalCustomerPaid: '20000.00',
      totalCustomerOutstanding: '30000.00',
      paymentStatus: 'PARTIALLY_PAID',
    });
    await client.post(`/api/bookings/${booking.id}/payments`, {
      paymentScheduleId: scheduleId,
      amount: 30000,
      currency: 'INR',
      paymentMethod: 'UPI',
      paymentStatus: 'CLEARED',
      receivedAt: '2026-09-02',
    });
    expect((await client.get(`/api/bookings/${booking.id}`)).body.data.paymentStatus).toBe('PAID');
    expect(
      (
        await client.post(`/api/bookings/${booking.id}/payments`, {
          amount: 1,
          currency: 'INR',
          paymentMethod: 'CASH',
          receivedAt: '2026-09-03',
          notes: 'Unallocated overpayment check',
        })
      ).status,
    ).toBe(409);
    await client.post(`/api/bookings/${booking.id}/payments/${first.body.data.id}/reverse`, {
      reason: 'Duplicate bank entry',
    });
    const after = (await client.get(`/api/bookings/${booking.id}`)).body.data;
    expect(after.totalCustomerPaid).toBe('30000.00');
    expect(after.paymentStatus).toBe('PARTIALLY_PAID');
    expect(await db.bookingPayment.count({ where: { bookingId: booking.id } })).toBe(2);
  });

  it('uses active booking costs as the profit source of truth', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    const hotel = await client.post(`/api/bookings/${booking.id}/costs`, {
      costCategory: 'HOTEL',
      supplierName: 'Hotel Supplier',
      description: 'Four nights',
      amount: 20000.12,
      currency: 'INR',
      costStatus: 'PAYABLE',
    });
    await client.post(`/api/bookings/${booking.id}/costs`, {
      costCategory: 'FLIGHT',
      supplierName: 'Airline',
      description: 'Tickets',
      amount: 10000.13,
      currency: 'INR',
      costStatus: 'PAID',
      paidAt: '2026-09-01',
    });
    let details = (await client.get(`/api/bookings/${booking.id}`)).body.data;
    expect(details.totalCost).toBe('30000.25');
    expect(details.grossProfit).toBe('19999.75');
    expect(details.profitMarginPercentage).toBe('39.9995');
    await client.delete(`/api/bookings/${booking.id}/costs/${hotel.body.data.id}`);
    details = (await client.get(`/api/bookings/${booking.id}`)).body.data;
    expect(details.totalCost).toBe('10000.13');
  });

  it('generates tenant-scoped document keys and validates upload confirmation/download', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    const traveller = (
      await client.post(`/api/bookings/${booking.id}/travellers`, {
        travellerType: 'ADULT',
        title: 'Ms',
        firstName: 'Nina',
        lastName: 'Shah',
        visaStatus: 'NOT_STARTED',
        isPrimaryTraveller: true,
        sequence: 1,
      })
    ).body.data;
    const approved = await client.post(`/api/bookings/${booking.id}/documents/uploads`, {
      travellerId: traveller.id,
      documentType: 'PASSPORT',
      visibility: 'INTERNAL',
      fileName: '../../passport.pdf',
      mimeType: 'application/pdf',
      fileSize: 4,
    });
    expect(approved.status).toBe(201);
    const document = await db.bookingDocument.findUniqueOrThrow({
      where: { id: approved.body.data.document.id },
    });
    expect(document.objectKey).toContain(
      `companies/${document.companyId}/bookings/${booking.id}/travellers/${traveller.id}/documents/`,
    );
    expect(document.objectKey).not.toContain('..');
    await storageService.putObject({
      key: document.objectKey,
      body: Buffer.from('test'),
      contentType: 'application/pdf',
    });
    expect(
      (await client.post(`/api/bookings/${booking.id}/documents/uploads/${document.id}/confirm`))
        .status,
    ).toBe(200);
    expect(
      (await client.get(`/api/bookings/${booking.id}/documents/${document.id}/download-url`))
        .status,
    ).toBe(200);
    const beta = await owner('owner@document-beta.test', 'Document Beta');
    expect(
      (await beta.get(`/api/bookings/${booking.id}/documents/${document.id}/download-url`)).status,
    ).toBe(404);
  });

  it('creates a customer-safe confirmation PDF and logs confirmation/reminder email outcomes', async () => {
    const client = await owner();
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    const pdf = await client.post(`/api/bookings/${booking.id}/generate-confirmation`, {});
    expect(pdf.status).toBe(200);
    const document = await db.bookingDocument.findUniqueOrThrow({
      where: { id: pdf.body.data.id },
    });
    const buffer = (storageService as MemoryStorageService).read(document.objectKey);
    expect(buffer?.subarray(0, 4).toString()).toBe('%PDF');
    const confirmation = await client.post(`/api/bookings/${booking.id}/send-confirmation`, {
      recipientEmail: 'customer@example.test',
    });
    const reminder = await client.post(`/api/bookings/${booking.id}/send-payment-reminder`, {
      recipientEmail: 'customer@example.test',
    });
    expect(confirmation.status).toBe(200);
    expect(reminder.status).toBe(200);
    expect(
      await db.bookingEmailLog.count({ where: { bookingId: booking.id, status: 'SENT' } }),
    ).toBe(2);
    expect(
      getMemoryEmailProvider()
        ?.all()
        .filter((message) => message.subject.includes(booking.bookingNumber)),
    ).toHaveLength(2);
  });
});
