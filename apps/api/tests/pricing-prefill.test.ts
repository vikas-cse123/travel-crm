import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';

/**
 * Regression coverage for master-price → quotation-price snapshots.
 *
 * The master price is only a prefill SOURCE that is copied ONCE into the
 * quotation when the master is selected. The quotation must stay a stable
 * snapshot: editing a quotation amount must not touch the master, and changing
 * a master price later must not rewrite an already-saved quotation. Masters
 * with no price must never invent a quotation price.
 */

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

async function owner(email = 'owner@prefill.test', companyName = 'Prefill Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
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
  travelStartDate: '2026-09-10',
  travelEndDate: '2026-09-14',
  rooms: 1,
  adults: 2,
  childrenWithBed: 1,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL', 'SIGHTSEEING'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
});

async function setupMasters(client: Client, hotelPrice: number | null, sightseeingPricing?: unknown) {
  const city = (
    await client.post('/api/masters/cities', { countryCode: 'AZ', name: 'Baku', status: 'ACTIVE' })
  ).body.data;
  const destination = (
    await client.post('/api/masters/destinations', {
      countryCode: 'AZ',
      name: 'Azerbaijan',
      destinationType: 'INTERNATIONAL',
      cityIds: [city.id],
      status: 'ACTIVE',
    })
  ).body.data;
  const hotel = (
    await client.post('/api/masters/hotels', {
      destinationId: destination.id,
      cityId: city.id,
      name: 'Days Inn',
      starCategory: 3,
      price: hotelPrice,
      status: 'ACTIVE',
    })
  ).body.data;
  const cruise = (
    await client.post('/api/masters/cruises', {
      name: 'Dream Genting',
      price: 25000,
      status: 'ACTIVE',
    })
  ).body.data;
  const vehicle = (
    await client.post('/api/masters/vehicles', {
      name: 'Innova Crysta',
      vehicleType: 'Standard MPV',
      capacity: 8,
      price: 7000,
      status: 'ACTIVE',
    })
  ).body.data;
  const addOn = (
    await client.post('/api/masters/add-on-services', {
      name: 'Visa Assistance',
      price: 3800,
      status: 'ACTIVE',
    })
  ).body.data;
  const sightseeing = (
    await client.post('/api/masters/sightseeing', {
      destinationId: destination.id,
      cityId: city.id,
      title: 'Gobustan Tour',
      sequence: 1,
      status: 'ACTIVE',
      ...(sightseeingPricing !== undefined ? { pricing: sightseeingPricing } : {}),
    })
  ).body.data;
  return { city, destination, hotel, cruise, vehicle, addOn, sightseeing };
}

async function createQuotation(client: Client) {
  const lead = await client.post('/api/queries', leadPayload());
  expect(lead.status).toBe(201);
  const quotation = await client.post('/api/quotations', { queryId: lead.body.data.id });
  expect(quotation.status).toBe(201);
  const data = quotation.body.data as { id: string; versions: Array<{ id: string }> };
  return { id: data.id, versionId: data.versions[0]!.id };
}

const asNumber = (value: unknown): number | string => {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
};

describe('Hotel master price → quotation amount', () => {
  it('copies a priced hotel into the quotation snapshot and keeps it on reload', async () => {
    const client = await owner();
    const masters = await setupMasters(client, 1000);
    const quotation = await createQuotation(client);
    const versionId = quotation.versionId;

    // The frontend prefills hotelDetails.amount and hotels[].sellingPrice from
    // the master price when a priced master is selected.
    const saved = await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      title: 'Hotel snapshot',
      hotelDetails: { include: true, sectionTitle: 'Your Hotels', amount: 1000 },
      hotels: [
        {
          city: 'Baku',
          hotelName: 'Days Inn',
          rooms: 1,
          nights: 4,
          sellingPrice: 1000,
          selected: true,
          sequence: 1,
          hotelId: masters.hotel.id,
        },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.hotelDetails.amount).toBe(1000);
    expect(saved.body.data.hotels[0].sellingPrice).toBe('1000');

    // Reload persists the copied amount.
    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const version = reloaded.body.data.versions[0];
    expect(version.hotelDetails.amount).toBe(1000);
    expect(version.hotels[0].sellingPrice).toBe('1000');
    expect(version.hotels[0].hotelName).toBe('Days Inn');
  });

  it('keeps an already-saved quotation amount when the master price changes later', async () => {
    const client = await owner();
    const masters = await setupMasters(client, 1000);
    const quotation = await createQuotation(client);
    const versionId = quotation.versionId;

    await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      title: 'Stable snapshot',
      hotelDetails: { include: true, amount: 1200 },
      hotels: [
        {
          city: 'Baku',
          hotelName: 'Days Inn',
          rooms: 1,
          nights: 4,
          sellingPrice: 1200,
          selected: true,
          sequence: 1,
          hotelId: masters.hotel.id,
        },
      ],
    });

    // Employee edits the quotation amount independently of the master.
    await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      hotelDetails: { include: true, amount: 1200 },
      hotels: [
        {
          city: 'Baku',
          hotelName: 'Days Inn',
          rooms: 1,
          nights: 4,
          sellingPrice: 1200,
          selected: true,
          sequence: 1,
          hotelId: masters.hotel.id,
        },
      ],
    });

    // Master price changes to 1500.
    const updated = await client.patch(`/api/masters/hotels/${masters.hotel.id}`, {
      price: 1500,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.price).toBe(1500);

    // The saved quotation must NOT be rewritten by the new master price.
    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const version = reloaded.body.data.versions[0];
    expect(version.hotelDetails.amount).toBe(1200);
    expect(version.hotels[0].sellingPrice).toBe('1200');

    // A brand-new quotation selecting the same master would receive 1500.
    const mastersNow = (await client.get('/api/masters/hotels')).body.data.data as Array<{
      id: string;
      price: number | null;
    }>;
    expect(asNumber(mastersNow.find((h) => h.id === masters.hotel.id)?.price)).toBe(1500);
  });

  it('never invents a quotation price when the master has no price', async () => {
    const client = await owner();
    const masters = await setupMasters(client, null);
    const quotation = await createQuotation(client);
    const versionId = quotation.versionId;

    const saved = await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      title: 'No price master',
      hotelDetails: { include: true, amount: 0 },
      hotels: [
        {
          city: 'Baku',
          hotelName: 'Days Inn',
          rooms: 1,
          nights: 4,
          sellingPrice: 0,
          selected: true,
          sequence: 1,
          hotelId: masters.hotel.id,
        },
      ],
    });
    expect(saved.status).toBe(200);
    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const version = reloaded.body.data.versions[0];
    // A master with no price must not invent one: the quotation stays empty.
    expect(version.hotelDetails.amount ?? 0).toBe(0);
    expect(Number(version.hotels[0].sellingPrice ?? 0)).toBe(0);
  });
});

describe('Cruise / Vehicle / Add-on master price → service rows', () => {
  it('persists a priced cruise, vehicle and add-on into service rows and keeps them on reload', async () => {
    const client = await owner();
    const masters = await setupMasters(client, null);
    const quotation = await createQuotation(client);
    const versionId = quotation.versionId;

    // Frontend prefills service row sellingPrice from the master price.
    const saved = await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      title: 'Service snapshots',
      services: [
        {
          serviceType: 'CRUISE',
          name: 'Overnight cruise',
          quantity: 1,
          sellingPrice: 25000,
          sequence: 1,
          cruiseId: masters.cruise.id,
        },
        {
          serviceType: 'VEHICLE_TRANSFER',
          name: 'Airport transfer',
          quantity: 1,
          sellingPrice: 7000,
          sequence: 2,
          vehicleId: masters.vehicle.id,
        },
        {
          serviceType: 'OTHER_ADD_ON',
          name: 'Visa',
          quantity: 1,
          sellingPrice: 3800,
          sequence: 3,
          addOnServiceId: masters.addOn.id,
        },
      ],
    });
    expect(saved.status).toBe(200);

    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const version = reloaded.body.data.versions[0];
    const cruise = version.services.find((r: { serviceType: string }) => r.serviceType === 'CRUISE');
    const vehicle = version.services.find((r: { serviceType: string }) => r.serviceType === 'VEHICLE_TRANSFER');
    const addOn = version.services.find((r: { serviceType: string }) => r.serviceType === 'OTHER_ADD_ON');
    expect(Number(cruise.unitSellingPrice)).toBe(25000);
    expect(Number(vehicle.unitSellingPrice)).toBe(7000);
    expect(Number(addOn.unitSellingPrice)).toBe(3800);

    // Changing the master price later must not rewrite the saved quotation.
    await client.patch(`/api/masters/cruises/${masters.cruise.id}`, { price: 30000 });
    const after = await client.get(`/api/quotations/${quotation.id}`);
    const afterCruise = after.body.data.versions[0].services.find(
      (r: { serviceType: string }) => r.serviceType === 'CRUISE',
    );
    expect(Number(afterCruise.unitSellingPrice)).toBe(25000);
  });

  it('does not invent a price for a service row when the master price is empty', async () => {
    const client = await owner();
    const quotation = await createQuotation(client);
    const versionId = quotation.versionId;

    // No priced add-on master exists; the row carries an explicit 0.
    const saved = await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      title: 'No-price service',
      services: [
        {
          serviceType: 'OTHER_ADD_ON',
          name: 'Generic service',
          quantity: 1,
          sellingPrice: 0,
          sequence: 1,
        },
      ],
    });
    expect(saved.status).toBe(200);
    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const service = reloaded.body.data.versions[0].services[0];
    expect(Number(service.unitSellingPrice)).toBe(0);
  });
});

describe('Sightseeing pricing options → activity snapshot', () => {
  it('copies the master pricing options into the activity snapshot', async () => {
    const client = await owner();
    const masters = await setupMasters(client, null, [
      { label: 'Adult', price: 5000 },
      { label: 'Child', price: 3000 },
    ]);
    const quotation = await createQuotation(client);
    const versionId = quotation.versionId;

    const saved = await client.patch(`/api/quotations/${quotation.id}/versions/${versionId}`, {
      title: 'Sightseeing snapshot',
      sightseeingDetails: {
        include: true,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Baku',
            date: null,
            meals: { breakfast: false, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                name: 'Gobustan Tour',
                sightseeingId: masters.sightseeing.id,
                pricingOptions: [
                  { label: 'Adult', price: 5000 },
                  { label: 'Child', price: 3000 },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(saved.status).toBe(200);

    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const activity = reloaded.body.data.versions[0].sightseeingDetails.days[0].activities[0];
    expect(activity.pricingOptions).toEqual([
      { label: 'Adult', price: 5000 },
      { label: 'Child', price: 3000 },
    ]);
  });
});
