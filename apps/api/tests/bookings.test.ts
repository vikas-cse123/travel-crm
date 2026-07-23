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

// ---------------------------------------------------------------------------
// Phase 15 — commercials, refunds, master references and supplier operations
// ---------------------------------------------------------------------------

type Client = ReturnType<typeof createAuthClient>;

/** Build one of every master a booking service can point at. */
async function masters(client: Client, suffix = '') {
  const city = (
    await client.post('/api/masters/cities', { countryCode: 'AZ', name: `Baku${suffix}` })
  ).body.data;
  const destination = (
    await client.post('/api/masters/destinations', {
      countryCode: 'AZ',
      name: `Azerbaijan${suffix}`,
      destinationType: 'INTERNATIONAL',
      cityIds: [city.id],
    })
  ).body.data;
  const hotel = (
    await client.post('/api/masters/hotels', {
      destinationId: destination.id,
      cityId: city.id,
      name: `Shah Palace${suffix}`,
      starCategory: 4,
      address: 'Boyuk Qala 47',
    })
  ).body.data;
  const roomType = (
    await client.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Deluxe Room',
      maxOccupancy: 3,
      baseCost: 4000,
      sellingPrice: 6000,
    })
  ).body.data.roomTypes.at(-1);
  const mealPlan = (
    await client.post(`/api/masters/hotels/${hotel.id}/meal-plans`, {
      name: 'Breakfast Only',
      type: 'BREAKFAST',
      baseCost: 500,
      sellingPrice: 800,
    })
  ).body.data.mealPlans.at(-1);
  const airline = (
    await client.post('/api/masters/airlines', { name: `Air India${suffix}`, status: 'ACTIVE' })
  ).body.data;
  const cruise = (
    await client.post('/api/masters/cruises', {
      name: `Dream Genting${suffix}`,
      status: 'ACTIVE',
      roomTypes: [{ name: 'Interior', price: 18000 }],
    })
  ).body.data;
  const vehicle = (
    await client.post('/api/masters/vehicles', {
      name: `Innova${suffix}`,
      vehicleType: 'Standard MPV',
      capacity: 8,
      status: 'ACTIVE',
    })
  ).body.data;
  const sightseeing = (
    await client.post('/api/masters/sightseeing', {
      destinationId: destination.id,
      cityId: city.id,
      title: `Gobustan${suffix}`,
      sequence: 1,
      status: 'ACTIVE',
    })
  ).body.data;
  const addOn = (
    await client.post('/api/masters/add-on-services', {
      name: `Visa${suffix}`,
      price: 3800,
      status: 'ACTIVE',
    })
  ).body.data;
  return {
    hotel,
    roomType,
    mealPlan,
    airline,
    cruise,
    cruiseRoomType: cruise.roomTypes[0] as { id: string },
    vehicle,
    sightseeing,
    addOn,
  };
}

/** A quotation version whose rows each carry a master reference. */
function linkedVersion(m: Awaited<ReturnType<typeof masters>>) {
  return {
    title: 'Master linked package',
    hotels: [
      {
        city: 'Baku',
        hotelName: 'Shah Palace',
        roomType: 'Deluxe Room',
        mealPlan: 'Breakfast Only',
        rooms: 1,
        nights: 2,
        internalCost: 4500,
        sellingPrice: 6800,
        selected: true,
        sequence: 1,
        hotelId: m.hotel.id,
        hotelRoomTypeId: m.roomType.id,
        hotelMealPlanId: m.mealPlan.id,
      },
    ],
    services: [
      {
        serviceType: 'FLIGHT',
        name: 'Delhi-Baku',
        quantity: 2,
        sellingPrice: 30000,
        sequence: 1,
        airlineId: m.airline.id,
      },
      {
        serviceType: 'CRUISE',
        name: 'Cruise',
        quantity: 1,
        sellingPrice: 18000,
        sequence: 2,
        cruiseId: m.cruise.id,
        cruiseRoomTypeId: m.cruiseRoomType.id,
      },
      {
        serviceType: 'VEHICLE_TRANSFER',
        name: 'Transfer',
        quantity: 1,
        sellingPrice: 2500,
        sequence: 3,
        vehicleId: m.vehicle.id,
      },
      {
        serviceType: 'SIGHTSEEING',
        name: 'Gobustan',
        quantity: 2,
        sellingPrice: 3000,
        sequence: 4,
        sightseeingId: m.sightseeing.id,
      },
      {
        serviceType: 'OTHER_ADD_ON',
        name: 'Visa',
        quantity: 2,
        sellingPrice: 3800,
        sequence: 5,
        addOnServiceId: m.addOn.id,
      },
    ],
  };
}

/** Convert a master-linked quotation into a booking and return it. */
async function convertLinked(client: Client, m: Awaited<ReturnType<typeof masters>>) {
  const lead = (await client.post('/api/queries', leadPayload())).body.data;
  const quotation = (
    await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
  ).body.data;
  const version = quotation.versions[0];
  await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
  await db.quotation.update({
    where: { id: quotation.id },
    data: { status: 'ACCEPTED', acceptedVersionId: version.id, acceptedAt: new Date() },
  });
  const booking = (await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {})).body
    .data;
  return { booking, quotation, lead };
}

describe('Phase 15 booking master references and conversion', () => {
  it('carries every Phase-14 master reference from quotation to booking services', async () => {
    const client = await owner();
    const m = await masters(client);
    const { booking } = await convertLinked(client, m);
    const rows = await db.bookingService.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequence: 'asc' },
    });
    const hotel = rows.find((r) => r.serviceType === 'HOTEL')!;
    expect(hotel).toMatchObject({
      hotelId: m.hotel.id,
      hotelRoomTypeId: m.roomType.id,
      hotelMealPlanId: m.mealPlan.id,
    });
    expect(rows.find((r) => r.serviceType === 'FLIGHT')!.airlineId).toBe(m.airline.id);
    const cruise = rows.find((r) => r.serviceType === 'CRUISE')!;
    expect(cruise.cruiseId).toBe(m.cruise.id);
    expect(cruise.cruiseRoomTypeId).toBe(m.cruiseRoomType.id);
    expect(rows.find((r) => r.serviceType === 'VEHICLE_TRANSFER')!.vehicleId).toBe(m.vehicle.id);
    expect(rows.find((r) => r.serviceType === 'SIGHTSEEING')!.sightseeingId).toBe(m.sightseeing.id);
    expect(rows.find((r) => r.serviceType === 'OTHER_ADD_ON')!.addOnServiceId).toBe(m.addOn.id);
    // Snapshot text still renders and the detail response marks rows master-linked.
    const detail = (await client.get(`/api/bookings/${booking.id}`)).body.data;
    expect(detail.services.every((s: { masterLinked: boolean }) => s.masterLinked)).toBe(true);
  });

  it('still converts an old quotation with no master references (null links)', async () => {
    const { client, quotation } = await acceptedSetup();
    const booking = (await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {}))
      .body.data;
    const rows = await db.bookingService.findMany({ where: { bookingId: booking.id } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hotelId).toBeNull();
      expect(row.airlineId).toBeNull();
      expect(row.sightseeingId).toBeNull();
    }
  });

  it('converts even when a linked master was archived after quoting', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
    ).body.data;
    const version = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    await db.quotation.update({
      where: { id: quotation.id },
      data: { status: 'ACCEPTED', acceptedVersionId: version.id, acceptedAt: new Date() },
    });
    await client.delete(`/api/masters/vehicles/${m.vehicle.id}`); // archive
    const response = await client.post(`/api/quotations/${quotation.id}/convert-to-booking`, {});
    expect(response.status).toBe(201);
    const vehicleRow = await db.bookingService.findFirstOrThrow({
      where: { bookingId: response.body.data.id, serviceType: 'VEHICLE_TRANSFER' },
    });
    expect(vehicleRow.vehicleId).toBe(m.vehicle.id);
  });

  it('accepts a master on a manual service but rejects a cross-tenant one', async () => {
    const client = await owner();
    const m = await masters(client);
    const booking = (await client.post('/api/bookings', manualPayload())).body.data;
    const ok = await client.post(`/api/bookings/${booking.id}/services`, {
      serviceType: 'SIGHTSEEING',
      name: 'Gobustan tour',
      sightseeingId: m.sightseeing.id,
      sequence: 1,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.sightseeingId).toBe(m.sightseeing.id);

    const beta = await owner('owner@beta15.test', 'Beta Fifteen');
    const foreign = await masters(beta, 'B');
    const rejected = await client.post(`/api/bookings/${booking.id}/services`, {
      serviceType: 'VEHICLE_TRANSFER',
      name: 'Transfer',
      vehicleId: foreign.vehicle.id,
      sequence: 2,
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.message).toBe('The selected vehicle is not available.');

    const mismatched = await client.post(`/api/bookings/${booking.id}/services`, {
      serviceType: 'SIGHTSEEING',
      name: 'Wrong link',
      airlineId: m.airline.id,
      sequence: 3,
    });
    expect(mismatched.status).toBe(400);
    expect(mismatched.body.error.message).toContain('can only be linked to a flight service');
  });
});

describe('Phase 15 GST, TCS, refunds and profit', () => {
  async function paidBooking(client: Client, selling = 50000, paid = 50000) {
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        totalSellingAmount: selling,
        paymentSchedule: [
          { installmentNumber: 1, label: 'Full', amount: selling, dueDate: '2026-10-01' },
        ],
      })
    ).body.data;
    if (paid > 0)
      await client.post(`/api/bookings/${booking.id}/payments`, {
        paymentScheduleId: booking.paymentSchedules[0].id,
        amount: paid,
        currency: 'INR',
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'CLEARED',
        receivedAt: '2026-09-01',
      });
    return booking;
  }

  it('adds GST and TCS into total payable and outstanding', async () => {
    const client = await owner();
    const booking = await paidBooking(client, 50000, 0);
    const updated = await client.patch(`/api/bookings/${booking.id}/financials`, {
      gstAmount: 2500,
      tcsAmount: 500,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      gstAmount: '2500.00',
      tcsAmount: '500.00',
      totalPayable: '53000.00',
      totalCustomerOutstanding: '53000.00',
      grossProfit: '53000.00',
    });
  });

  it('processes a partial refund, reducing net revenue and marking partially refunded', async () => {
    const client = await owner();
    const booking = await paidBooking(client, 50000, 50000);
    const refunded = await client.post(`/api/bookings/${booking.id}/refunds`, {
      amount: 20000,
      currency: 'INR',
      refundMethod: 'BANK_TRANSFER',
      reason: 'Partial cancellation',
      processedAt: '2026-09-10',
    });
    expect(refunded.status).toBe(201);
    expect(refunded.body.data).toMatchObject({
      totalCustomerPaid: '50000.00',
      totalRefunded: '20000.00',
      netRevenue: '30000.00',
      totalCustomerOutstanding: '20000.00',
      paymentStatus: 'PARTIALLY_REFUNDED',
    });
    expect(refunded.body.data.refunds[0].refundNumber).toMatch(/^REF-\d{4}-000001$/);
  });

  it('marks a booking refunded when the full paid amount is returned', async () => {
    const client = await owner();
    const booking = await paidBooking(client, 40000, 40000);
    const full = await client.post(`/api/bookings/${booking.id}/refunds`, {
      amount: 40000,
      currency: 'INR',
      refundMethod: 'UPI',
      reason: 'Full cancellation',
      processedAt: '2026-09-11',
    });
    expect(full.body.data.paymentStatus).toBe('REFUNDED');
    expect(full.body.data.netRevenue).toBe('0.00');
    expect(full.body.data.netProfit).toBe('0.00');
  });

  it('rejects a refund larger than the eligible paid amount', async () => {
    const client = await owner();
    const booking = await paidBooking(client, 30000, 10000);
    const over = await client.post(`/api/bookings/${booking.id}/refunds`, {
      amount: 15000,
      currency: 'INR',
      refundMethod: 'CASH',
      reason: 'Too much',
      processedAt: '2026-09-12',
    });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toContain('eligible');
  });

  it('reverses a refund, restoring net revenue and keeping immutable history', async () => {
    const client = await owner();
    const booking = await paidBooking(client, 50000, 50000);
    const refund = (
      await client.post(`/api/bookings/${booking.id}/refunds`, {
        amount: 20000,
        currency: 'INR',
        refundMethod: 'BANK_TRANSFER',
        reason: 'Mistaken refund',
        processedAt: '2026-09-13',
      })
    ).body.data.refunds[0];
    const reversed = await client.post(`/api/bookings/${booking.id}/refunds/${refund.id}/reverse`, {
      reason: 'Refund issued in error',
    });
    expect(reversed.status).toBe(200);
    expect(reversed.body.data).toMatchObject({
      totalRefunded: '0.00',
      netRevenue: '50000.00',
      paymentStatus: 'PAID',
    });
    // Row retained, not deleted.
    expect(await db.bookingRefund.count({ where: { bookingId: booking.id } })).toBe(1);
    expect((await db.bookingRefund.findFirstOrThrow({ where: { id: refund.id } })).status).toBe(
      'REVERSED',
    );
    // Reversing again conflicts.
    expect(
      (
        await client.post(`/api/bookings/${booking.id}/refunds/${refund.id}/reverse`, {
          reason: 'again',
        })
      ).status,
    ).toBe(409);
  });

  it('computes gross profit from payable and net profit from realised revenue', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        totalSellingAmount: 50000,
        services: [
          {
            serviceType: 'HOTEL',
            name: 'Hotel',
            customerSellingAmount: 50000,
            internalCostSnapshot: 30000,
            sequence: 1,
          },
        ],
        paymentSchedule: [
          { installmentNumber: 1, label: 'Full', amount: 50000, dueDate: '2026-10-01' },
        ],
      })
    ).body.data;
    await client.post(`/api/bookings/${booking.id}/costs`, {
      costCategory: 'HOTEL',
      supplierName: 'Hotel Co',
      description: 'Room cost',
      amount: 30000,
      currency: 'INR',
    });
    await client.patch(`/api/bookings/${booking.id}/financials`, { gstAmount: 2000, tcsAmount: 0 });
    await client.post(`/api/bookings/${booking.id}/payments`, {
      paymentScheduleId: booking.paymentSchedules[0].id,
      amount: 50000,
      currency: 'INR',
      paymentMethod: 'CARD',
      paymentStatus: 'CLEARED',
      receivedAt: '2026-09-01',
    });
    const detail = (await client.get(`/api/bookings/${booking.id}`)).body.data;
    // payable = 52000, cost = 30000 → gross 22000; net revenue = 50000 → net profit 20000.
    expect(detail).toMatchObject({
      totalPayable: '52000.00',
      totalCost: '30000.00',
      grossProfit: '22000.00',
      netRevenue: '50000.00',
      netProfit: '20000.00',
    });
  });

  it('records a service cancellation charge and refunded allocation, capped at the service amount', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        services: [
          {
            serviceType: 'HOTEL',
            name: 'Hotel',
            customerSellingAmount: 20000,
            internalCostSnapshot: 12000,
            sequence: 1,
          },
        ],
      })
    ).body.data;
    const serviceId = booking.services[0].id;
    const ok = await client.patch(`/api/bookings/${booking.id}/services/${serviceId}/commercial`, {
      cancellationCharge: 3000,
      refundedAmount: 17000,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      cancellationCharge: '3000.00',
      refundedAmount: '17000.00',
    });
    const tooMuch = await client.patch(
      `/api/bookings/${booking.id}/services/${serviceId}/commercial`,
      { refundedAmount: 25000 },
    );
    expect(tooMuch.status).toBe(400);
  });
});

describe('Phase 15 supplier payables, analytics, filters and documents', () => {
  async function bookingWithVendorService(client: Client) {
    const m = await masters(client);
    const vendor = (
      await client.post('/api/vendors', { name: 'Ground Handler', vendorType: 'TRANSPORT' })
    ).body.data;
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        services: [
          {
            serviceType: 'VEHICLE_TRANSFER',
            name: 'Airport transfer',
            customerSellingAmount: 5000,
            internalCostSnapshot: 3000,
            sequence: 1,
          },
        ],
      })
    ).body.data;
    const serviceId = booking.services[0].id;
    await client.patch(`/api/bookings/${booking.id}/services/${serviceId}/vendor`, {
      vendorId: vendor.id,
    });
    return { booking, vendor, serviceId, m };
  }

  it('creates a supplier payable from a booking service and rejects a duplicate for the same cost', async () => {
    const client = await owner();
    const { booking, serviceId } = await bookingWithVendorService(client);
    const created = await client.post(`/api/bookings/${booking.id}/supplier-payables`, {
      bookingServiceId: serviceId,
      originalAmount: 3000,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.paymentStatus).toBe('UNPAID');
    expect(Number(created.body.data.outstandingAmount)).toBe(3000);

    // Vendor rollups appear on the booking detail.
    const detail = (await client.get(`/api/bookings/${booking.id}`)).body.data;
    expect(detail.totalVendorPayable).toBe('3000.00');
    expect(detail.totalVendorOutstanding).toBe('3000.00');

    // A cost linked to a payable cannot be billed twice.
    const cost = (
      await client.post(`/api/bookings/${booking.id}/costs`, {
        bookingServiceId: serviceId,
        costCategory: 'TRANSFER',
        supplierName: 'Ground Handler',
        description: 'Transfer cost',
        amount: 3000,
        currency: 'INR',
      })
    ).body.data;
    const first = await client.post(`/api/bookings/${booking.id}/supplier-payables`, {
      bookingCostId: cost.id,
      originalAmount: 3000,
    });
    expect(first.status).toBe(201);
    const dup = await client.post(`/api/bookings/${booking.id}/supplier-payables`, {
      bookingCostId: cost.id,
      originalAmount: 3000,
    });
    expect(dup.status).toBe(409);
  });

  it('requires a vendor on the service before a payable can be created', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        services: [
          { serviceType: 'GUIDE', name: 'Local guide', customerSellingAmount: 2000, sequence: 1 },
        ],
      })
    ).body.data;
    const response = await client.post(`/api/bookings/${booking.id}/supplier-payables`, {
      bookingServiceId: booking.services[0].id,
      originalAmount: 1000,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('vendor');
  });

  it('returns commercial analytics totals for a financial user', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        totalSellingAmount: 50000,
        gstAmount: 2500,
        tcsAmount: 500,
      })
    ).body.data;
    void booking;
    const analytics = (await client.get('/api/bookings/analytics')).body.data;
    expect(analytics).toMatchObject({
      totalBookings: 1,
      totalCustomerAmount: '50000.00',
      totalGst: '2500.00',
      totalTcs: '500.00',
      totalPayable: '53000.00',
    });
    expect(analytics).toHaveProperty('netProfit');
    expect(analytics).toHaveProperty('netRevenue');
  });

  it('filters by booking month and travel month', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        travelStartDate: '2026-11-15',
        travelEndDate: '2026-11-20',
      })
    ).body.data;
    const travelHit = await client.get('/api/bookings?travelMonth=2026-11');
    expect(travelHit.body.data.data.some((b: { id: string }) => b.id === booking.id)).toBe(true);
    const travelMiss = await client.get('/api/bookings?travelMonth=2026-12');
    expect(travelMiss.body.data.data.some((b: { id: string }) => b.id === booking.id)).toBe(false);
    // Booking month derives from createdAt (this run's current month always matches self).
    const created = new Date(booking.createdAt);
    const month = `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
    const bookingHit = await client.get(`/api/bookings?bookingMonth=${month}`);
    expect(bookingHit.body.data.data.some((b: { id: string }) => b.id === booking.id)).toBe(true);
  });

  it('generates invoice, tax invoice and a customer-safe voucher PDF', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        totalSellingAmount: 50000,
        gstAmount: 2500,
        tcsAmount: 500,
        services: [
          {
            serviceType: 'HOTEL',
            name: 'Seaside Hotel',
            customerSellingAmount: 50000,
            internalCostSnapshot: 30000,
            supplierReference: 'SUP-123',
            sequence: 1,
          },
        ],
      })
    ).body.data;
    const invoice = await client.post(`/api/bookings/${booking.id}/generate-invoice`, {});
    expect(invoice.status).toBe(200);
    expect(invoice.body.data.documentType).toBe('INVOICE');
    expect(invoice.body.data.reused).toBe(false);
    // Regenerating reuses the stored object.
    const again = await client.post(`/api/bookings/${booking.id}/generate-invoice`, {});
    expect(again.body.data.reused).toBe(true);

    const tax = await client.post(`/api/bookings/${booking.id}/generate-tax-invoice`, {});
    expect(tax.status).toBe(200);
    const voucher = await client.post(`/api/bookings/${booking.id}/generate-voucher`, {});
    expect(voucher.status).toBe(200);

    // All three stored as private, customer-visible documents.
    const docs = await db.bookingDocument.findMany({ where: { bookingId: booking.id } });
    expect(docs).toHaveLength(3);
    for (const doc of docs) expect(doc.visibility).toBe('CUSTOMER_VISIBLE');

    // The voucher object must not leak internal cost or vendor/profit figures.
    const voucherDoc = docs.find((d) => d.fileName.includes('voucher'))!;
    const object = (storageService as MemoryStorageService).read(voucherDoc.objectKey);
    const text = object ? object.toString('latin1') : '';
    expect(text).not.toContain('30000');
  });
});

describe('Phase 15 financial redaction and activity logs', () => {
  it('omits all new financial fields from a non-financial role', async () => {
    const client = await owner('owner@redact15.test', 'Redact Fifteen');
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        totalSellingAmount: 50000,
        gstAmount: 2500,
        tcsAmount: 500,
      })
    ).body.data;
    const sales = await createRoleClient(
      'owner@redact15.test',
      'Sales Executive',
      'sales15@redact15.test',
    );
    // Assign the booking to the sales user so it is visible to them.
    await db.booking.update({
      where: { id: booking.id },
      data: {
        assignedToId: (
          await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'sales15@redact15.test' } })
        ).id,
      },
    });
    const detail = (await sales.get(`/api/bookings/${booking.id}`)).body.data;
    for (const field of [
      'gstAmount',
      'tcsAmount',
      'totalPayable',
      'totalRefunded',
      'netRevenue',
      'netProfit',
      'totalVendorPayable',
      'totalVendorOutstanding',
      'refunds',
    ]) {
      expect(detail).not.toHaveProperty(field);
    }
    // And the refunds endpoint is forbidden without financial access.
    expect((await sales.get(`/api/bookings/${booking.id}/refunds`)).status).toBe(403);
  });

  it('writes activity actions for refunds and document generation', async () => {
    const client = await owner();
    const booking = (
      await client.post('/api/bookings', {
        ...manualPayload(),
        totalSellingAmount: 20000,
        paymentSchedule: [
          { installmentNumber: 1, label: 'Full', amount: 20000, dueDate: '2026-10-01' },
        ],
      })
    ).body.data;
    await client.post(`/api/bookings/${booking.id}/payments`, {
      paymentScheduleId: booking.paymentSchedules[0].id,
      amount: 20000,
      currency: 'INR',
      paymentMethod: 'CASH',
      paymentStatus: 'CLEARED',
      receivedAt: '2026-09-01',
    });
    await client.post(`/api/bookings/${booking.id}/refunds`, {
      amount: 5000,
      currency: 'INR',
      refundMethod: 'CASH',
      reason: 'Goodwill',
      processedAt: '2026-09-05',
    });
    await client.post(`/api/bookings/${booking.id}/generate-invoice`, {});
    const actions = (
      await db.activityLog.findMany({
        where: { entityType: { in: ['BookingRefund', 'BookingDocument'] } },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toContain('BOOKING_REFUND_PROCESSED');
    expect(actions).toContain('BOOKING_INVOICE_GENERATED');
  });
});
