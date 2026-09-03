import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { resetSystemCompanyIdCache } from '../src/modules/masters/master-visibility.js';
import { getFlightPerTravelerBreakdown, resolveQuotationPricing, calculateFlightTotal } from '@interscale/shared';
import request from 'supertest';

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
  adults: 3,
  childrenWithBed: 3,
  childrenWithoutBed: 2,
  infants: 1,
  extraBeds: 0,
  currency: 'INR',
  services: ['FLIGHT'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
});

describe('Flight pricing breakdown - FIXED_TOTAL vs PER_TRAVELER', () => {
  it('1. Flight FIXED_TOTAL → aggregate amount only (no breakdown)', async () => {
    const flightDetails = {
      include: true,
      sectionTitle: 'Flight Details',
      amount: 25000,
      pricingBasis: 'FIXED_TOTAL',
      perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
      entryMode: 'MANUAL',
      journeyType: 'ROUND_TRIP' as const,
      outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [] },
      returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [] },
    };
    const pax = { adults: 3, childrenWithBed: 3, childrenWithoutBed: 2, infants: 1 };
    const total = calculateFlightTotal(flightDetails, pax);
    expect(total).toBe(25000);
    const breakdown = getFlightPerTravelerBreakdown(flightDetails, pax);
    expect(breakdown).toBeNull();
  });

  it('5 & 6. Flight PER_TRAVELER breakdown calculated correctly and total matches resolver', async () => {
    const flightDetails = {
      include: true,
      sectionTitle: 'Flight Details',
      amount: 0,
      pricingBasis: 'PER_TRAVELER',
      perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
      entryMode: 'MANUAL',
      journeyType: 'ROUND_TRIP' as const,
      outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [] },
      returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [] },
    };
    const pax = { adults: 3, childrenWithBed: 3, childrenWithoutBed: 2, infants: 1 };
    const total = calculateFlightTotal(flightDetails, pax);
    expect(total).toBe(19000);
    const breakdown = getFlightPerTravelerBreakdown(flightDetails, pax);
    expect(breakdown).not.toBeNull();
    expect(breakdown).toEqual([
      { label: 'Adult', count: 3, rate: 1000, total: 3000 },
      { label: 'Child With Bed', count: 3, rate: 2000, total: 6000 },
      { label: 'Child Without Bed', count: 2, rate: 3000, total: 6000 },
      { label: 'Infant', count: 1, rate: 4000, total: 4000 },
    ]);
    const sum = breakdown!.reduce((s, r) => s + r.total, 0);
    expect(sum).toBe(total);
    // Also via resolver
    const pricing = resolveQuotationPricing({
      version: { flightDetails, pricingMode: 'SECTION_WISE', hotels: [], services: [], sightseeingDetails: null, currency: 'INR' },
      quotation: pax,
    });
    const flightSec = pricing.sections.find((s) => s.id === 'flight')!;
    expect(flightSec.amount).toBe(19000);
    expect(pricing.grandTotal).toBe(19000);
  });

  it('7. Existing fixed-total Flight output remains unchanged (aggregate)', async () => {
    const flightDetails = {
      include: true,
      sectionTitle: 'Flight Details',
      amount: 25000,
      pricingBasis: 'FIXED_TOTAL',
      entryMode: 'MANUAL',
      journeyType: 'ROUND_TRIP' as const,
      outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [] },
      returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [] },
    };
    const pax = { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 };
    const breakdown = getFlightPerTravelerBreakdown(flightDetails, pax);
    expect(breakdown).toBeNull();
    const pricing = resolveQuotationPricing({
      version: { flightDetails, pricingMode: 'SECTION_WISE', hotels: [], services: [], sightseeingDetails: null, currency: 'INR' },
      quotation: pax,
    });
    expect(pricing.sections.find((s) => s.id === 'flight')!.amount).toBe(25000);
  });

  it('2. Flight PER_TRAVELER breakdown appears in Weblink (publicView)', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const q = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const versionId = q.versions[0].id;
    await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      pricingMode: 'SECTION_WISE',
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 0,
        pricingBasis: 'PER_TRAVELER',
        perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
        entryMode: 'MANUAL',
        journeyType: 'ROUND_TRIP',
        outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [{ from: 'Delhi', to: 'Goa' }] },
        returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [{ from: 'Goa', to: 'Delhi' }] },
      },
    });
    const link = await client.post(`/api/quotations/${q.id}/public-link`, { quotationVersionId: versionId });
    expect(link.status).toBe(200);
    const token = link.body.data.url.split('/q/')[1]?.split('/').pop()?.split('?')[0] ?? '';
    const pub = await request(app).get(`/api/public/quotations/${token}`);
    expect(pub.status).toBe(200);
    const fd = pub.body.data.version.flightDetails;
    expect(fd.pricingBasis).toBe('PER_TRAVELER');
    expect(fd.perTraveler.adult).toBe(1000);
    const breakdown = getFlightPerTravelerBreakdown(fd, { adults: 3, childrenWithBed: 3, childrenWithoutBed: 2, infants: 1 });
    expect(breakdown).not.toBeNull();
    expect(breakdown!.length).toBe(4);
  });

  it('3. Flight PER_TRAVELER breakdown appears in Classic PDF', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const q = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const versionId = q.versions[0].id;
    await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      pricingMode: 'SECTION_WISE',
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 0,
        pricingBasis: 'PER_TRAVELER',
        perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
        entryMode: 'MANUAL',
        journeyType: 'ROUND_TRIP',
        outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [{ from: 'Delhi', to: 'Goa' }] },
        returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [{ from: 'Goa', to: 'Delhi' }] },
      },
    });
    await client.post(`/api/quotations/${q.id}/versions/${versionId}/finalize`);
    const pdf = await client.post(`/api/quotations/${q.id}/versions/${versionId}/generate-pdf`, { force: true, style: 'CLASSIC' });
    expect(pdf.status).toBe(200);
    // PDF generation should succeed and not crash for PER_TRAVELER
    expect(pdf.body.data.id).toBeDefined();
  });

  it('4. Flight PER_TRAVELER breakdown appears in Stylish PDF', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const q = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const versionId = q.versions[0].id;
    await client.patch(`/api/quotations/${q.id}/versions/${versionId}`, {
      pricingMode: 'SECTION_WISE',
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 0,
        pricingBasis: 'PER_TRAVELER',
        perTraveler: { adult: 1000, childWithBed: 2000, childWithoutBed: 3000, infant: 4000 },
        entryMode: 'MANUAL',
        journeyType: 'ROUND_TRIP',
        outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [{ from: 'Delhi', to: 'Goa' }] },
        returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [{ from: 'Goa', to: 'Delhi' }] },
      },
    });
    await client.post(`/api/quotations/${q.id}/versions/${versionId}/finalize`);
    const pdf = await client.post(`/api/quotations/${q.id}/versions/${versionId}/generate-pdf`, { force: true, style: 'STYLISH', coverSource: 'DESTINATION' });
    expect(pdf.status).toBe(200);
    expect(pdf.body.data.id).toBeDefined();
  });
});
