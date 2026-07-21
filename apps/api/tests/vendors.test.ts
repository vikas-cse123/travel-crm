import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import {
  storageService,
  type MemoryStorageService,
} from '../src/services/storage/storage.service.js';
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

async function owner(email = 'owner@vendors.test', companyName = 'Vendor Travel') {
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
const vendorPayload = (suffix = '') => ({
  name: `Harbour Hotels${suffix}`,
  vendorType: 'HOTEL',
  contactPerson: 'Maya Sen',
  primaryPhone: `98765432${suffix || '10'}`,
  primaryEmail: `hotel${suffix || ''}@example.test`,
  city: 'Goa',
  country: 'India',
  coverageAreas: 'Goa, Konkan',
  servicesOffered: 'Hotels and meals',
  contractType: 'NET_RATE',
  paymentTerm: 'NET_30',
  status: 'ACTIVE',
  createAnyway: false,
});
const bookingPayload = () => ({
  customerName: 'Vendor Booking Customer',
  customerEmail: 'traveller@example.test',
  customerPhone: '9000012345',
  destinationSummary: 'Goa',
  travelStartDate: '2026-11-01',
  travelEndDate: '2026-11-05',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  currency: 'INR',
  totalSellingAmount: 50000,
  manualCreationReason: 'Vendor integration test',
  services: [
    {
      serviceType: 'HOTEL',
      name: 'Goa hotel',
      confirmationStatus: 'PENDING',
      customerSellingAmount: 40000,
      internalCostSnapshot: 0,
      sequence: 1,
    },
  ],
  itinerary: [],
  paymentSchedule: [],
});

describe('Phase 11 vendor and supplier management', () => {
  it('creates normalized tenant-scoped vendors with concurrency-safe readable codes', async () => {
    const client = await owner();
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        client.post('/api/vendors', {
          ...vendorPayload(` ${index}`),
          primaryPhone: String(9000000010 + index),
          primaryEmail: `vendor-${index}@example.test`,
        }),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const codes = responses.map((response) => response.body.data.vendorCode);
    expect(new Set(codes).size).toBe(4);
    expect(codes.every((code: string) => /^VEN-\d{4}-\d{6}$/.test(code))).toBe(true);
    const stored = await db.vendor.findUniqueOrThrow({ where: { id: responses[0]!.body.data.id } });
    expect(stored.normalizedPhone).toMatch(/^\+91/);
    expect(stored.normalizedEmail).toBe('vendor-0@example.test');
    expect(responses[0]!.body.data).not.toHaveProperty('companyId');
    expect(responses[0]!.body.data).not.toHaveProperty('normalizedEmail');
  });

  it('detects exact phone, email, GST, PAN and name/city duplicates with explicit override', async () => {
    const client = await owner();
    const first = (
      await client.post('/api/vendors', {
        ...vendorPayload(),
        gstNumber: '22AAAAA0000A1Z5',
        panNumber: 'AAAAA0000A',
      })
    ).body.data;
    const matches = await client.get(
      '/api/vendors/duplicates?phone=%2B91%2098765%2043210&email=HOTEL%40EXAMPLE.TEST&gstNumber=22AAAAA0000A1Z5&panNumber=AAAAA0000A&name=Harbour%20Hotels&city=Goa',
    );
    expect(matches.body.data[0]).toMatchObject({ id: first.id, strongMatch: true });
    expect(matches.body.data[0].reasons).toEqual(
      expect.arrayContaining([
        'PHONE_EXACT',
        'EMAIL_EXACT',
        'GST_EXACT',
        'PAN_EXACT',
        'NAME_CITY_EXACT',
      ]),
    );
    expect(
      (
        await client.post('/api/vendors', {
          ...vendorPayload(' New'),
          primaryPhone: '+91 98765 43210',
          primaryEmail: 'HOTEL@example.test',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await client.post('/api/vendors', {
          ...vendorPayload(' New'),
          primaryPhone: '+91 98765 43210',
          primaryEmail: 'HOTEL@example.test',
          createAnyway: true,
        })
      ).status,
    ).toBe(201);
  });

  it('enforces tenant isolation and reduces financial projections for Sales Executive', async () => {
    const first = await owner();
    const vendor = (await first.post('/api/vendors', vendorPayload())).body.data;
    const second = await owner('other@vendors.test', 'Other Vendor Travel');
    expect((await second.get(`/api/vendors/${vendor.id}`)).status).toBe(404);
    const sales = await roleClient('owner@vendors.test', 'Sales Executive', 'sales@vendors.test');
    const list = await sales.get('/api/vendors');
    expect(list.status).toBe(200);
    expect(list.body.data.data[0]).not.toHaveProperty('totalBusiness');
    expect(list.body.data.data[0]).not.toHaveProperty('totalOutstanding');
    expect((await sales.get(`/api/vendors/${vendor.id}/payments`)).status).toBe(403);
    expect((await sales.get(`/api/vendors/${vendor.id}/bank-accounts`)).status).toBe(403);
  });

  it('manages structured services/rates and immutable booking supplier snapshots', async () => {
    const client = await owner();
    const vendor = (await client.post('/api/vendors', vendorPayload())).body.data;
    const service = (
      await client.post(`/api/vendors/${vendor.id}/services`, {
        serviceType: 'HOTEL',
        name: 'Harbour Deluxe Room',
        city: 'Goa',
        currency: 'INR',
        baseCost: 12000,
        sellingReferencePrice: 15000,
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        status: 'ACTIVE',
      })
    ).body.data;
    const rate = await client.post(`/api/vendors/${vendor.id}/services/${service.id}/rates`, {
      name: 'Winter net',
      currency: 'INR',
      rateType: 'NET_RATE',
      netRate: 11500,
      effectiveFrom: '2026-10-01',
      effectiveUntil: '2026-12-20',
    });
    expect(rate.status).toBe(201);
    const booking = (await client.post('/api/bookings', bookingPayload())).body.data;
    const bookingService = booking.services[0];
    expect(
      (
        await client.patch(`/api/bookings/${booking.id}/services/${bookingService.id}/vendor`, {
          vendorId: vendor.id,
          vendorServiceId: service.id,
          vendorRateId: rate.body.data.id,
          supplierConfirmationNumber: 'SUP-99',
        })
      ).status,
    ).toBe(200);
    await client.patch(`/api/vendors/${vendor.id}`, { name: 'Renamed Harbour Group' });
    await client.patch(`/api/vendors/${vendor.id}/services/${service.id}`, {
      name: 'Renamed Room',
    });
    const stored = await db.bookingService.findUniqueOrThrow({ where: { id: bookingService.id } });
    expect(stored.vendorNameSnapshot).toBe('Harbour Hotels');
    expect(stored.vendorServiceSnapshot).toBe('Harbour Deluxe Room');
    expect(stored.internalCostSnapshot.toFixed(2)).toBe('11500.00');
    await client.patch(`/api/vendors/${vendor.id}/status`, { status: 'INACTIVE' });
    const secondBooking = (
      await client.post('/api/bookings', {
        ...bookingPayload(),
        customerPhone: '9000012346',
        customerEmail: 'second@example.test',
      })
    ).body.data;
    expect(
      (
        await client.patch(
          `/api/bookings/${secondBooking.id}/services/${secondBooking.services[0].id}/vendor`,
          { vendorId: vendor.id },
        )
      ).status,
    ).toBe(400);
  });

  it('allocates partial and full supplier payments and transactionally reverses them', async () => {
    const client = await owner();
    const vendor = (await client.post('/api/vendors', vendorPayload())).body.data;
    const booking = (await client.post('/api/bookings', bookingPayload())).body.data;
    const serviceId = booking.services[0].id;
    await client.patch(`/api/bookings/${booking.id}/services/${serviceId}/vendor`, {
      vendorId: vendor.id,
      internalCostSnapshot: 10000,
    });
    const payable = (
      await client.post(`/api/vendors/${vendor.id}/payables`, {
        bookingId: booking.id,
        bookingServiceId: serviceId,
        description: 'Hotel net payable',
        currency: 'INR',
        originalAmount: 10000,
        dueDate: '2026-07-01',
      })
    ).body.data;
    const partial = await client.post(`/api/vendors/${vendor.id}/payments`, {
      amount: 4000,
      currency: 'INR',
      paymentMethod: 'BANK_TRANSFER',
      paidAt: new Date().toISOString(),
      allocations: [{ payableId: payable.id, amount: 4000 }],
    });
    expect(partial.status).toBe(201);
    let stored = await db.vendorPayable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(stored.paymentStatus).toBe('PARTIALLY_PAID');
    expect(stored.outstandingAmount.toFixed(2)).toBe('6000.00');
    const remaining = await client.post(`/api/vendors/${vendor.id}/payments`, {
      amount: 6000,
      currency: 'INR',
      paymentMethod: 'UPI',
      paidAt: new Date().toISOString(),
      allocations: [{ payableId: payable.id, amount: 6000 }],
    });
    stored = await db.vendorPayable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(stored.paymentStatus).toBe('PAID');
    expect(stored.outstandingAmount.toFixed(2)).toBe('0.00');
    expect(
      (
        await client.post(`/api/vendors/${vendor.id}/payments/${remaining.body.data.id}/reverse`, {
          reason: 'Duplicate settlement test',
        })
      ).status,
    ).toBe(200);
    stored = await db.vendorPayable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(stored.paymentStatus).toBe('PARTIALLY_PAID');
    expect(stored.outstandingAmount.toFixed(2)).toBe('6000.00');
    expect(
      (
        await client.post(`/api/vendors/${vendor.id}/payments`, {
          amount: 7000,
          currency: 'INR',
          paymentMethod: 'CASH',
          paidAt: new Date().toISOString(),
          allocations: [{ payableId: payable.id, amount: 7000 }],
        })
      ).status,
    ).toBe(400);
  });

  it('encrypts bank numbers, masks normal responses and never writes full values to activity logs', async () => {
    const client = await owner();
    const vendor = (await client.post('/api/vendors', vendorPayload())).body.data;
    const response = await client.post(`/api/vendors/${vendor.id}/bank-accounts`, {
      accountHolderName: 'Harbour Hotels',
      bankName: 'Example Bank',
      accountNumber: '123456789012',
      ifscCode: 'EXAM0001234',
      isPrimary: true,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.accountNumber).toMatch(/9012$/);
    const stored = await db.vendorBankAccount.findFirstOrThrow({ where: { vendorId: vendor.id } });
    expect(stored.accountNumberEncrypted).not.toContain('123456789012');
    expect(stored.accountNumberLast4).toBe('9012');
    const logs = await db.activityLog.findMany({ where: { companyId: stored.companyId } });
    expect(JSON.stringify(logs)).not.toContain('123456789012');
  });

  it('creates tenant-scoped private document keys and confirms memory uploads without live AWS', async () => {
    const client = await owner();
    const vendor = (await client.post('/api/vendors', vendorPayload())).body.data;
    const approved = await client.post(`/api/vendors/${vendor.id}/documents/uploads`, {
      documentType: 'RATE_CONTRACT',
      fileName: '../Rate Contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 4,
    });
    expect(approved.status).toBe(201);
    const document = await db.vendorDocument.findUniqueOrThrow({
      where: { id: approved.body.data.document.id },
    });
    expect(document.objectKey).toMatch(
      new RegExp(`^companies/${document.companyId}/vendors/${vendor.id}/documents/${document.id}/`),
    );
    expect(document.objectKey).not.toContain('..');
    await (storageService as MemoryStorageService).putObject({
      key: document.objectKey,
      body: Buffer.from('test'),
      contentType: 'application/pdf',
    });
    expect(
      (await client.post(`/api/vendors/${vendor.id}/documents/uploads/${document.id}/confirm`))
        .status,
    ).toBe(200);
    expect(
      (await client.get(`/api/vendors/${vendor.id}/documents/${document.id}/download-url`)).body
        .data.url,
    ).toMatch(/^memory:\/\/download/);
  });

  it('serves analytics, filters, contacts, notes and a redaction-aware timeline', async () => {
    const client = await owner();
    const vendor = (await client.post('/api/vendors', vendorPayload())).body.data;
    expect(
      (
        await client.post(`/api/vendors/${vendor.id}/contacts`, {
          name: 'Reservations',
          phone: '9876500000',
          isPrimary: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await client.post(`/api/vendors/${vendor.id}/notes`, {
          noteType: 'PERFORMANCE',
          content: 'Fast confirmation',
          isPinned: true,
        })
      ).status,
    ).toBe(201);
    const list = await client.get(
      '/api/vendors?vendorType=HOTEL&status=ACTIVE&coverageArea=Goa&sortBy=vendorCode&sortOrder=asc',
    );
    expect(list.body.data.data).toHaveLength(1);
    const analytics = await client.get('/api/vendors/analytics');
    expect(analytics.body.data).toMatchObject({ total: 1, active: 1 });
    expect(analytics.body.data.distribution.HOTEL).toBe(1);
    const timeline = await client.get(`/api/vendors/${vendor.id}/timeline`);
    expect(timeline.body.data.data.map((row: { type: string }) => row.type)).toEqual(
      expect.arrayContaining(['VENDOR_CREATED', 'VENDOR_CONTACT_CREATED', 'VENDOR_NOTE_CREATED']),
    );
  });
});
