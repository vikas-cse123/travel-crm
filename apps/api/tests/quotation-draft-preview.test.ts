import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { resetSystemCompanyIdCache } from '../src/modules/masters/master-visibility.js';
import { validateQuotationPricing, resolveQuotationPricing } from '@interscale/shared';

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
  resetSystemCompanyIdCache();
});

async function owner(email = 'owner@alpha.test', companyName = 'Alpha Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

const leadPayload = (phone = '+91 98765 43210') => ({
  customerName: 'Aarav Mehta',
  phone,
  email: 'aarav@example.test',
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'QUALIFIED',
  priority: 'HIGH',
  travelStartDate: '2026-09-10',
  travelEndDate: '2026-09-14',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL', 'SIGHTSEEING', 'FLIGHT', 'CRUISE', 'VEHICLE_TRANSFER'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
});

describe('draft preview vs finalize - By Section partially priced', () => {
  it('partially priced By Section draft can generate weblink, classic PDF, stylish PDF, but cannot finalize', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const q = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const versionId = q.versions[0].id;

    // Make By Section with only Flight priced, Hotel/Cruise/Vehicle unpriced
    const patch = await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      pricingMode: 'SECTION_WISE',
      currency: 'INR',
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 25000,
        pricingBasis: 'FIXED_TOTAL',
        entryMode: 'MANUAL',
        journeyType: 'ROUND_TRIP',
        outbound: { fromCity: 'Delhi', toCity: 'Goa', travelClass: 'Economy', segments: [{ from: 'Delhi', to: 'Goa', departureDate: '2026-09-10', departureTime: '10:00', arrivalDate: '2026-09-10', arrivalTime: '12:00' }] },
        returnJourney: { fromCity: 'Goa', toCity: 'Delhi', travelClass: 'Economy', segments: [{ from: 'Goa', to: 'Delhi', departureDate: '2026-09-14', departureTime: '14:00', arrivalDate: '2026-09-14', arrivalTime: '16:00' }] },
      },
      hotelDetails: { include: true, sectionTitle: 'Your Hotels', amount: 0, description: null },
      hotels: [
        {
          city: 'Goa',
          hotelName: 'Coastal Bay',
          rooms: 1,
          nights: 4,
          selected: true,
          sequence: 1,
          sellingPrice: 0,
          baseRoomPrice: null,
          extraBedPrice: null,
          childWithoutBedPrice: null,
        },
      ],
      services: [
        // Cruise unpriced
        { serviceType: 'CRUISE', name: 'Ocean Cruise', quantity: 1, sellingPrice: 0, pricingBasis: 'FIXED', sequence: 1 },
        // Vehicle unpriced
        { serviceType: 'VEHICLE_TRANSFER', name: 'Innova', quantity: 1, sellingPrice: 0, pricingBasis: 'PER_DAY', sequence: 2 },
      ],
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: 0,
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Goa',
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ name: 'Beach Walk', pricingOptions: [], sequence: 1 }],
          },
        ],
      },
      discountAmount: 0,
      taxRate: 0,
      perAdultPrice: 0,
    });
    expect(patch.status).toBe(200);
    // Resolver: subtotal should be 25000, not including unpriced sections
    const pricing = resolveQuotationPricing({
      version: patch.body.data,
      quotation: { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, currency: 'INR' },
    });
    expect(pricing.subtotal).toBe(25000);
    expect(pricing.grandTotal).toBe(25000);
    // Unpriced sections must be 0 and not contribute
    const hotelSec = pricing.sections.find((s) => s.id === 'hotel')!;
    const cruiseSec = pricing.sections.find((s) => s.id === 'cruise')!;
    const vehicleSec = pricing.sections.find((s) => s.id === 'vehicle')!;
    expect(hotelSec.amount).toBe(0);
    expect(cruiseSec.amount).toBe(0);
    expect(vehicleSec.amount).toBe(0);
    // Draft weblink should be allowed
    const link = await client.post(`/api/quotations/${q.id}/public-link`, { quotationVersionId: versionId });
    expect(link.status).toBe(200);
    expect(link.body.data.url).toMatch(/\/q\//);
    // Draft publicView must return 200 (browser flow) via token
    const token = link.body.data.url.split('/q/')[1]?.split('/').pop()?.split('?')[0] ?? '';
    expect(token.length).toBeGreaterThan(10);
    const pub = await request(app).get(`/api/public/quotations/${token}`);
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    expect(pub.body.data.quotation.quotationNumber).toBe(q.quotationNumber);
    expect(pub.body.data.version.pricingMode).toBe('SECTION_WISE');
    // Also verify by-slug route works for draft preview when slug is set
    await client.patch(`/api/quotations/${q.id}/weblink-name`, { publicSlug: 'test-preview-slug-draft-123' });
    const slugView = await request(app).get('/api/public/quotations/by-slug/test-preview-slug-draft-123');
    expect(slugView.status, JSON.stringify(slugView.body)).toBe(200);
    expect(slugView.body.data.version.id).toBe(versionId);
    // Public page should render with correct pricing (only Flight)
    const pubPricing = resolveQuotationPricing({ version: pub.body.data.version, quotation: pub.body.data.quotation });
    expect(pubPricing.subtotal).toBe(25000);
    expect(pubPricing.sections.find((s) => s.id === 'flight')!.amount).toBe(25000);
    // Draft classic PDF should be allowed
    const classic = await client.post(`/api/quotations/${q.id}/versions/${versionId}/generate-pdf`, { force: true, style: 'CLASSIC' });
    expect(classic.status).toBe(200);
    // Draft stylish PDF should be allowed
    const stylish = await client.post(`/api/quotations/${q.id}/versions/${versionId}/generate-pdf`, { force: true, style: 'STYLISH', coverSource: 'DESTINATION' });
    expect(stylish.status).toBe(200);
    // Finalize must still be blocked (ValidationError 400)
    const finalize = await client.post(`/api/quotations/${q.id}/versions/${versionId}/finalize`);
    expect([400, 409]).toContain(finalize.status);
    expect(finalize.body.error.message).toMatch(/Hotel pricing is incomplete|Cruise pricing is incomplete|Vehicle pricing is required/);
    // Validation must still report errors
    const issues = validateQuotationPricing({ version: patch.body.data, quotation: { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 } });
    expect(issues.length).toBeGreaterThan(0);
  });

  it('complete By Section quotation can finalize', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const q = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const versionId = q.versions[0].id;
    const patch = await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      pricingMode: 'SECTION_WISE',
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 25000,
        pricingBasis: 'FIXED_TOTAL',
        entryMode: 'MANUAL',
        journeyType: 'ROUND_TRIP',
        outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [{ from: 'Delhi', to: 'Goa' }] },
        returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [{ from: 'Goa', to: 'Delhi' }] },
      },
      hotelDetails: { include: true, sectionTitle: 'Your Hotels', amount: 0 },
      hotels: [
        {
          city: 'Goa',
          hotelName: 'Coastal Bay',
          rooms: 1,
          nights: 4,
          selected: true,
          sequence: 1,
          sellingPrice: 40000,
          baseRoomPrice: 10000,
          extraBedPrice: null,
          childWithoutBedPrice: null,
        },
      ],
      services: [
        { serviceType: 'CRUISE', name: 'Ocean Cruise', quantity: 2, sellingPrice: 82000, pricingBasis: 'FIXED', sequence: 1 },
        { serviceType: 'VEHICLE_TRANSFER', name: 'Innova', quantity: 5, sellingPrice: 5000, pricingBasis: 'PER_DAY', sequence: 2 },
      ],
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: 15000,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Goa',
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ name: 'Beach', pricingOptions: [{ label: 'Adult', price: 5000 }, { label: 'Child', price: 3000 }], pricingBasis: 'FIXED', pricingQuantity: 1, sequence: 1 }],
          },
        ],
      },
      discountAmount: 0,
      taxRate: 0,
    });
    expect(patch.status).toBe(200);
    const finalize = await client.post(`/api/quotations/${q.id}/versions/${versionId}/finalize`);
    expect(finalize.status).toBe(200);
    // After finalize, PDF still works and total is preserved, and publicView via token still 200
    const pdf = await client.post(`/api/quotations/${q.id}/versions/${versionId}/generate-pdf`, { force: true, style: 'CLASSIC' });
    expect(pdf.status).toBe(200);
    const link2 = await client.post(`/api/quotations/${q.id}/public-link`, { quotationVersionId: versionId });
    expect(link2.status).toBe(200);
    const token2 = link2.body.data.url.split('/q/')[1]?.split('/').pop()?.split('?')[0] ?? '';
    const pub2 = await request(app).get(`/api/public/quotations/${token2}`);
    expect(pub2.status, JSON.stringify(pub2.body)).toBe(200);
  });

  it('By Traveler incomplete may be previewed but finalize still requires valid traveler pricing', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const q = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const versionId = q.versions[0].id;
    const patch = await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      pricingMode: 'PER_PERSON',
      perAdultPrice: 0,
      perChildWithBedPrice: 0,
      perChildWithoutBedPrice: 0,
      perInfantPrice: 0,
      hotelDetails: { include: true, sectionTitle: 'Your Hotels', amount: 0, description: null, images: [] },
    });
    expect(patch.status).toBe(200);
    // Preview should be allowed (weblink) and publicView for DRAFT must be 200
    const link = await client.post(`/api/quotations/${q.id}/public-link`, { quotationVersionId: versionId });
    expect(link.status).toBe(200);
    const tokenDraft = link.body.data.url.split('/q/')[1]?.split('/').pop()?.split('?')[0] ?? '';
    const pubDraft = await request(app).get(`/api/public/quotations/${tokenDraft}`);
    expect(pubDraft.status, JSON.stringify(pubDraft.body)).toBe(200);
    // Classic PDF preview should be allowed (now DRAFT)
    const classic = await client.post(`/api/quotations/${q.id}/versions/${versionId}/generate-pdf`, { force: true, style: 'CLASSIC' });
    expect(classic.status).toBe(200);
    // Finalize must be blocked (incomplete traveler pricing with hasAnyPricingConfig true -> ERROR)
    const finalize = await client.post(`/api/quotations/${q.id}/versions/${versionId}/finalize`);
    expect([400, 409]).toContain(finalize.status);
    // Now set valid traveler pricing and finalize should succeed and publicView still 200
    await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      perAdultPrice: 50000,
      perChildWithBedPrice: 30000,
    });
    const finalize2 = await client.post(`/api/quotations/${q.id}/versions/${versionId}/finalize`);
    expect(finalize2.status).toBe(200);
    const link2 = await client.post(`/api/quotations/${q.id}/public-link`, { quotationVersionId: versionId });
    const token2 = link2.body.data.url.split('/q/')[1]?.split('/').pop()?.split('?')[0] ?? '';
    const pub2 = await request(app).get(`/api/public/quotations/${token2}`);
    expect(pub2.status).toBe(200);
  });
});
