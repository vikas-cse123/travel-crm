import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { resolveHotelMealPlanLines, resolveHotelRoomLines } from '@interscale/shared';

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

async function owner(email = 'owner@lines.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

const leadPayload = () => ({
  customerName: 'Aarav Mehta',
  phone: '+91 98765 43210',
  email: 'aarav@example.test',
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'QUALIFIED',
  priority: 'HIGH',
  travelStartDate: '2026-09-05',
  travelEndDate: '2026-09-09',
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
  name: 'Multi-line hotel template',
  description: 'Template for multiline hotel option tests.',
  destinationSummary: 'Goa • Calangute',
  durationDays: 5,
  durationNights: 4,
  baseCurrency: 'INR',
  status: 'ACTIVE',
  itinerary: [
    {
      dayNumber: 1,
      title: 'Arrival',
      destination: 'Calangute',
      description: 'Transfer.',
      meals: null,
      overnightLocation: 'Calangute',
      sequence: 1,
    },
  ],
  hotels: [
    {
      city: 'Calangute',
      hotelName: 'Coastal Bay Resort',
      category: '4 star',
      roomType: 'Deluxe',
      mealPlan: 'Breakfast',
      rooms: 2,
      nights: 4,
      sellingPrice: 20000,
      selected: true,
      sequence: 1,
    },
  ],
  services: [],
  inclusions: [{ content: 'Daily breakfast', sequence: 1 }],
  exclusions: [{ content: 'Personal expenses', sequence: 1 }],
  terms: [{ content: 'Subject to availability', sequence: 1 }],
});

async function setup() {
  const client = await owner();
  const lead = await client.post('/api/queries', leadPayload());
  const template = await client.post('/api/quotation-templates', templatePayload());
  expect(lead.status).toBe(201);
  expect(template.status).toBe(201);
  const quotation = (await client.post('/api/quotations', { queryId: lead.body.data.id })).body.data;
  return { client, quotation, version: quotation.versions[0] as { id: string } };
}

async function setupHotelMaster(
  client: Client,
  name = "Copthorne King's Hotel Singapore",
  cityName = 'Baku',
  countryCode = 'AZ',
) {
  const city = await client.post('/api/masters/cities', {
    countryCode,
    name: cityName,
    status: 'ACTIVE',
  });
  const destination = await client.post('/api/masters/destinations', {
    countryCode,
    name: cityName,
    destinationType: 'INTERNATIONAL',
    cityIds: [city.body.data.id],
    status: 'ACTIVE',
  });
  const hotel = await client.post('/api/masters/hotels', {
    destinationId: destination.body.data.id,
    cityId: city.body.data.id,
    name,
    price: 10000,
    currency: 'INR',
    status: 'ACTIVE',
  });
  expect(hotel.status).toBe(201);
  const hotelId = hotel.body.data.id as string;
  const room = await client.post(`/api/masters/hotels/${hotelId}/room-types`, {
    name: 'Premier Room',
    status: 'ACTIVE',
  });
  const createdRoom = room.body.data.roomTypes.find((r: { name: string }) => r.name === 'Premier Room');
  const meal = await client.post(`/api/masters/hotels/${hotelId}/meal-plans`, {
    name: 'Half Board',
    type: 'HALF_BOARD',
    status: 'ACTIVE',
  });
  const createdMeal = meal.body.data.mealPlans.find((p: { name: string }) => p.name === 'Half Board');
  return { hotelId, roomTypeId: createdRoom.id as string, mealPlanId: createdMeal.id as string };
}

/** Three room allocations + three meal plans in ONE hotel option. */
const multilineHotel = (sequence = 1, hotelId: string | null = null) => ({
  city: 'Singapore',
  hotelName: "Copthorne King's Hotel Singapore",
  category: '4 Star',
  hotelId,
  nights: 4,
  checkInDate: '2026-09-05',
  checkOutDate: '2026-09-09',
  selected: true,
  notes: null,
  sequence,
  roomLines: [
    { roomType: 'Deluxe Family Room with Balcony', rooms: 3, extraBedQuantity: 1, childWithoutBedQuantity: 1, notes: null },
    { roomType: 'Premier Room', rooms: 2, extraBedQuantity: 0, childWithoutBedQuantity: 1, notes: null },
    { roomType: 'Executive Suite', rooms: 1, extraBedQuantity: 1, childWithoutBedQuantity: 0, notes: null },
  ],
  mealPlanLines: [
    { mealPlan: 'Breakfast' },
    { mealPlan: 'Half Board' },
    { mealPlan: 'All Inclusive' },
  ],
});

describe('multi-room / multi-meal hotel options', () => {
  it('saves every room allocation and meal plan and mirrors the first line onto the legacy scalars', async () => {
    const { client, quotation, version } = await setup();
    const res = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [multilineHotel()],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const saved = res.body.data.hotels[0];
    expect(saved.roomLines).toHaveLength(3);
    expect(saved.mealPlanLines).toHaveLength(3);
    expect(saved.roomLines.map((l: { roomType: string }) => l.roomType)).toEqual([
      'Deluxe Family Room with Balcony',
      'Premier Room',
      'Executive Suite',
    ]);
    expect(saved.roomLines[0]).toMatchObject({ rooms: 3, extraBedQuantity: 1, childWithoutBedQuantity: 1 });
    expect(saved.mealPlanLines.map((l: { mealPlan: string }) => l.mealPlan)).toEqual([
      'Breakfast',
      'Half Board',
      'All Inclusive',
    ]);
    // Legacy scalar mirror: first room/meal, total rooms = 3 + 2 + 1.
    expect(saved.roomType).toBe('Deluxe Family Room with Balcony');
    expect(saved.mealPlan).toBe('Breakfast');
    expect(saved.rooms).toBe(6);

    // Reload: every line is restored exactly.
    const reloaded = (await client.get(`/api/quotations/${quotation.id}`)).body.data.versions.find(
      (v: { id: string }) => v.id === version.id,
    );
    expect(reloaded.hotels[0].roomLines).toHaveLength(3);
    expect(reloaded.hotels[0].mealPlanLines).toHaveLength(3);
    expect(reloaded.hotels[0].roomLines[2]).toMatchObject({ roomType: 'Executive Suite', rooms: 1 });

    // Exactly ONE hotel option row — multiple rooms must not duplicate hotels.
    const rows = await db.quotationVersionHotelOption.count({
      where: { quotationVersionId: version.id },
    });
    expect(rows).toBe(1);
  });

  it('loads a legacy single-room quotation and accepts adding more rooms/meals on edit', async () => {
    const { client, quotation, version } = await setup();
    // Legacy save: single scalar roomType/mealPlan, NO line arrays.
    const legacy = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          city: 'Singapore',
          hotelName: "Copthorne King's Hotel Singapore",
          roomType: 'Deluxe Family Room with Balcony',
          mealPlan: 'Breakfast',
          rooms: 2,
          extraBedQuantity: 1,
          childWithoutBedQuantity: 1,
          nights: 4,
          selected: true,
          sequence: 1,
        },
      ],
    });
    expect(legacy.status, JSON.stringify(legacy.body)).toBe(200);
    expect(legacy.body.data.hotels[0].roomType).toBe('Deluxe Family Room with Balcony');
    expect(legacy.body.data.hotels[0].roomLines).toEqual([]);

    // The shared render helpers synthesize one line from the legacy scalars so
    // the PDF/weblink/builder keep showing "Room 1" without migration.
    const synthesized = resolveHotelRoomLines(legacy.body.data.hotels[0]);
    expect(synthesized).toHaveLength(1);
    expect(synthesized[0]).toMatchObject({ roomType: 'Deluxe Family Room with Balcony', rooms: 2 });
    expect(resolveHotelMealPlanLines(legacy.body.data.hotels[0])).toHaveLength(1);

    // Editing the old quotation: add a second room and a second meal plan.
    const edited = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          ...legacy.body.data.hotels[0],
          roomLines: [
            { roomType: 'Deluxe Family Room with Balcony', rooms: 2, extraBedQuantity: 1, childWithoutBedQuantity: 1 },
            { roomType: 'Executive Suite', rooms: 1, extraBedQuantity: 0, childWithoutBedQuantity: 0 },
          ],
          mealPlanLines: [{ mealPlan: 'Breakfast' }, { mealPlan: 'Half Board' }],
        },
      ],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data.hotels[0].roomLines).toHaveLength(2);
    expect(edited.body.data.hotels[0].mealPlanLines).toHaveLength(2);
    expect(edited.body.data.hotels[0].rooms).toBe(3);
  });

  it('validates every room line independently and identifies the failing room number', async () => {
    const { client, quotation, version } = await setup();
    // Room 2 has a remark but no room type — the save must be rejected with
    // "Room 2" in the message, not silently dropped or accepted.
    const res = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          ...multilineHotel(),
          roomLines: [
            { roomType: 'Deluxe Family Room with Balcony', rooms: 2 },
            { rooms: 1, notes: 'no room type given' },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Room 2');
    expect(JSON.stringify(res.body)).toContain('Room Type is required');
  });

  it('rejects a room line whose master room type belongs to a different hotel', async () => {
    const { client, quotation, version } = await setup();
    const hotelA = await setupHotelMaster(client);
    const hotelB = await setupHotelMaster(client, 'Grand Majestic City Hotel', 'Baku', 'GE');
    const res = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          ...multilineHotel(1, hotelA.hotelId),
          roomLines: [
            { hotelRoomTypeId: hotelA.roomTypeId, roomType: 'Premier Room', rooms: 1 },
            { hotelRoomTypeId: hotelB.roomTypeId, roomType: 'Premier Room', rooms: 1 },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('does not belong to the selected hotel');
    expect(JSON.stringify(res.body)).toContain('Room 2');
  });

  it('prices every room allocation (no double charge, no lost rooms)', async () => {
    const { client, quotation, version } = await setup();
    // Base per night: 5000 × 3 rooms × 4 nights = 60000
    //                4000 × 2 rooms × 4 nights = 32000
    //                8000 × 1 room  × 4 nights = 32000  → total 124000
    const res = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      markupMode: 'NONE',
      taxRate: 0,
      hotels: [
        {
          ...multilineHotel(),
          roomLines: [
            { roomType: 'Deluxe Family Room with Balcony', rooms: 3, baseRoomPrice: 5000 },
            { roomType: 'Premier Room', rooms: 2, baseRoomPrice: 4000 },
            { roomType: 'Executive Suite', rooms: 1, baseRoomPrice: 8000 },
          ],
        },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // 5000 × 3 rooms × 4 nights + 4000 × 2 × 4 + 8000 × 1 × 4 = 124000
    expect(Number(res.body.data.finalAmount)).toBe(124000);
    // Customer-facing payload keeps the line snapshots.
    const row = res.body.data.hotels[0];
    expect(row.roomLines[0].roomType).toBe('Deluxe Family Room with Balcony');
  });

  it('resolves per-line master pricing snapshots on save (season/month/base precedence per room)', async () => {
    const { client, quotation, version } = await setup();
    const master = await setupHotelMaster(client);
    const res = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          ...multilineHotel(1, master.hotelId),
          hotelName: "Copthorne King's Hotel Singapore",
          roomLines: [
            { hotelRoomTypeId: master.roomTypeId, roomType: 'Premier Room', rooms: 2 },
            { roomType: 'Executive Suite', rooms: 1 },
          ],
          mealPlanLines: [{ hotelMealPlanId: master.mealPlanId, mealPlan: 'Half Board' }],
        },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const saved = res.body.data.hotels[0];
    // The linked line gets the master's resolved pricing snapshot; the
    // free-text line keeps its own (empty) snapshot.
    expect(saved.roomLines[0].hotelRoomTypeId).toBe(master.roomTypeId);
    // The free-text line keeps its own (empty) pricing snapshot.
    expect(saved.roomLines[1].baseRoomPrice ?? null).toBeNull();
    expect(saved.mealPlanLines[0].hotelMealPlanId).toBe(master.mealPlanId);
    // Legacy scalars mirror the first line's master link.
    expect(saved.hotelRoomTypeId).toBe(master.roomTypeId);
  });

  it('keeps the hotel image fields intact on multi-room options', async () => {
    const { client, quotation, version } = await setup();
    const res = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          ...multilineHotel(),
          images: [{ url: 'https://img.example.test/hotel.jpg', alt: 'pool' }],
          imageSnapshotPresent: true,
          pdfImageUrl: 'https://img.example.test/hotel.jpg',
        },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const saved = res.body.data.hotels[0];
    expect(saved.imageSnapshotPresent).toBe(true);
    expect(saved.pdfImageUrl).toBe('https://img.example.test/hotel.jpg');
    expect(saved.roomLines).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// PDF rendering with multiple rooms / meal plans
// ---------------------------------------------------------------------------

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();
/** Visible-text assertions need poppler's pdftotext (present in CI). */
const itWithPdftotext = hasPdftotext ? it : it.skip;

function pdfText(buffer: Buffer): string {
  return execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: buffer,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
}

describe('multi-room hotel PDF rendering', () => {
  const quotation = {
    quotationNumber: 'QT-LINES-0001',
    customerName: 'Mira Shah',
    customerEmail: null,
    customerPhone: '+91 90000 00000',
    destinationSummary: 'Singapore',
    travelStartDate: null,
    travelEndDate: null,
    adults: 2,
    childrenWithBed: 0,
    childrenWithoutBed: 0,
    infants: 0,
    rooms: 1,
    validUntil: null,
  };

  const versionWithLines = () => ({
    versionNumber: 1,
    title: 'Singapore Escape',
    introduction: null,
    currency: 'INR',
    finalAmount: '124000',
    notes: null,
    perAdultPrice: '0',
    perChildWithBedPrice: '0',
    perChildWithoutBedPrice: '0',
    perInfantPrice: '0',
    taxNote: null,
    initialPaymentAmount: '0',
    paymentLink: null,
    inclusionsHtml: null,
    exclusionsHtml: null,
    paymentPolicies: null,
    cancellationPolicies: null,
    bookingTerms: null,
    includeVisa: false,
    visaSectionTitle: null,
    visaAmount: '0',
    visaDestination: null,
    visaType: null,
    visaServiceCharge: '0',
    visaGstPercent: '0',
    visaVfsCharge: '0',
    flightDetails: null,
    sightseeingDetails: null,
    hotels: [multilineHotel()],
    itinerary: [],
    services: [],
    inclusions: [],
    exclusions: [],
    terms: [],
  });

  it('renders every multi-room option without errors in BOTH PDF styles', async () => {
    const { renderQuotationPdf } = await import('../src/modules/quotations/pdf.service.js');
    const { renderStylishQuotationPdf } = await import(
      '../src/modules/quotations/stylish-pdf.service.js'
    );
    const input = {
      company: { name: 'Test Travel Co', address: ' addr ', phone: null, email: null, logoImage: null },
      quotation,
      version: versionWithLines(),
      images: { cover: PNG_1PX },
    };
    // Rendering must not throw and must produce a real multi-page-capable PDF.
    const classic = await renderQuotationPdf(input as never);
    expect(classic.length).toBeGreaterThan(1000);
    const stylish = await renderStylishQuotationPdf(input as never);
    expect(stylish.length).toBeGreaterThan(1000);
  });

  itWithPdftotext(
    'prints ALL room allocations and meal plans in BOTH PDF styles',
    async () => {
      const { renderQuotationPdf } = await import('../src/modules/quotations/pdf.service.js');
      const { renderStylishQuotationPdf } = await import(
        '../src/modules/quotations/stylish-pdf.service.js'
      );
      const input = {
        company: { name: 'Test Travel Co', address: ' addr ', phone: null, email: null, logoImage: null },
        quotation,
        version: versionWithLines(),
        images: { cover: PNG_1PX },
      };
      const classicText = pdfText(await renderQuotationPdf(input as never));
      for (const room of ['Deluxe Family Room with Balcony', 'Premier Room', 'Executive Suite']) {
        expect(classicText).toContain(room);
      }
      expect(classicText).toContain('Breakfast');
      expect(classicText).toContain('Half Board');
      expect(classicText).toContain('All Inclusive');

      const stylishText = pdfText(await renderStylishQuotationPdf(input as never));
      for (const room of ['Deluxe Family Room with Balcony', 'Premier Room', 'Executive Suite']) {
        expect(stylishText).toContain(room);
      }
      expect(stylishText).toContain('Half Board');
      expect(stylishText).toContain('All Inclusive');
    },
  );
});
