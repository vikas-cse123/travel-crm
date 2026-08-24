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

type Client = ReturnType<typeof createAuthClient>;

async function owner() {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email: 'owner@pricing.test' }));
  await client.post('/api/auth/verify-email', {
    otp: getMemoryEmailProvider()?.lastOtp('owner@pricing.test'),
  });
  return client;
}

async function setupHotel(client: Client, overrides: Record<string, unknown> = {}) {
  const city = await client.post('/api/masters/cities', {
    countryCode: 'AZ',
    name: 'Baku',
    status: 'ACTIVE',
  });
  const destination = await client.post('/api/masters/destinations', {
    countryCode: 'AZ',
    name: 'Azerbaijan',
    destinationType: 'INTERNATIONAL',
    cityIds: [city.body.data.id],
    status: 'ACTIVE',
  });
  const hotel = await client.post('/api/masters/hotels', {
    destinationId: destination.body.data.id,
    cityId: city.body.data.id,
    name: 'Shah Palace Hotel',
    price: 10000,
    currency: 'INR',
    status: 'ACTIVE',
    ...overrides,
  });
  expect(hotel.status).toBe(201);
  return hotel.body.data as { id: string };
}

async function setupRoomType(client: Client, hotelId: string, overrides: Record<string, unknown> = {}) {
  const room = await client.post(`/api/masters/hotels/${hotelId}/room-types`, {
    name: 'Deluxe Room',
    status: 'ACTIVE',
    ...overrides,
  });
  expect(room.status).toBe(201);
  const created = room.body.data.roomTypes.find((r: { name: string }) => r.name === 'Deluxe Room');
  return created as { id: string };
}

async function setupMealPlan(client: Client, hotelId: string, overrides: Record<string, unknown> = {}) {
  const meal = await client.post(`/api/masters/hotels/${hotelId}/meal-plans`, {
    name: 'Breakfast',
    type: 'BREAKFAST',
    status: 'ACTIVE',
    ...overrides,
  });
  expect(meal.status).toBe(201);
  const created = meal.body.data.mealPlans.find((p: { name: string }) => p.name === 'Breakfast');
  return created as { id: string };
}

describe('master monthly & seasonal pricing', () => {
  it('keeps the base price untouched when adding month/season rates', async () => {
    const client = await owner();
    const hotel = await setupHotel(client, { price: 5000, currency: 'INR' });
    await client.post(`/api/masters/hotels/${hotel.id}/month-prices`, {
      month: 1,
      price: 6000,
      currency: 'INR',
    });
    await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Christmas',
      startDate: '2026-12-15',
      endDate: '2027-01-05',
      price: 9000,
      currency: 'INR',
    });
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.price).toBe(5000);
    expect(detail.body.data.currency).toBe('INR');
    expect(detail.body.data.monthPrices).toHaveLength(1);
    expect(detail.body.data.seasons).toHaveLength(1);
  });

  it('creates, lists multiple month prices and edits/deletes one', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const jan = await client.post(`/api/masters/hotels/${hotel.id}/month-prices`, {
      month: 1,
      price: 6000,
    });
    expect(jan.status).toBe(201);
    await client.post(`/api/masters/hotels/${hotel.id}/month-prices`, {
      month: 4,
      price: 7000,
      currency: 'USD',
    });
    let detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.monthPrices).toHaveLength(2);

    const janId = detail.body.data.monthPrices.find((m: { month: number }) => m.month === 1).id;
    const updated = await client.patch(`/api/masters/hotels/${hotel.id}/month-prices/${janId}`, {
      price: 6500,
      currency: 'EUR',
    });
    expect(updated.status).toBe(200);
    expect(
      updated.body.data.monthPrices.find((m: { id: string }) => m.id === janId),
    ).toMatchObject({ month: 1, price: 6500, currency: 'EUR' });

    const deleted = await client.delete(`/api/masters/hotels/${hotel.id}/month-prices/${janId}`);
    expect(deleted.status).toBe(200);
    detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.monthPrices).toHaveLength(1);
  });

  it('rejects a duplicate month for the same hotel', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    await client.post(`/api/masters/hotels/${hotel.id}/month-prices`, { month: 3, price: 8000 });
    const duplicate = await client.post(`/api/masters/hotels/${hotel.id}/month-prices`, {
      month: 3,
      price: 9000,
    });
    expect(duplicate.status).toBe(409);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.monthPrices).toHaveLength(1);
  });

  it('rejects an invalid month number', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const bad = await client.post(`/api/masters/hotels/${hotel.id}/month-prices`, {
      month: 13,
      price: 8000,
    });
    expect(bad.status).toBe(400);
  });

  it('rejects overlapping seasons and allows adjacent ones', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Summer',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      price: 9000,
    });
    const overlap = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Overlap',
      startDate: '2026-06-25',
      endDate: '2026-07-10',
      price: 9500,
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.message).toContain('overlaps');

    const adjacent = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Adjacent',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      price: 9500,
    });
    expect(adjacent.status).toBe(201);
  });

  it('supports month and season pricing on room types', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id, { sellingPrice: 5000, currency: 'INR' });

    const month = await client.post(
      `/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`,
      { month: 1, price: 6000 },
    );
    expect(month.status).toBe(201);
    const season = await client.post(
      `/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`,
      { name: 'Summer', startDate: '2026-04-01', endDate: '2026-06-30', price: 7500 },
    );
    expect(season.status).toBe(201);

    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const saved = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(saved.sellingPrice).toBe(5000); // base price untouched
    expect(saved.monthPrices).toHaveLength(1);
    expect(saved.monthPrices[0]).toMatchObject({ month: 1, price: 6000 });
    expect(saved.seasons).toHaveLength(1);
    expect(saved.seasons[0]).toMatchObject({ name: 'Summer', price: 7500 });

    // Overlap within the same room type is rejected.
    const overlap = await client.post(
      `/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`,
      { name: 'Clash', startDate: '2026-05-01', endDate: '2026-05-31', price: 7000 },
    );
    expect(overlap.status).toBe(400);

    // Duplicate month on the same room type is rejected.
    const duplicateMonth = await client.post(
      `/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`,
      { month: 1, price: 9999 },
    );
    expect(duplicateMonth.status).toBe(409);
  });

  it('supports month and season pricing on meal plans', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const meal = await setupMealPlan(client, hotel.id, { sellingPrice: 800, currency: 'INR' });

    const month = await client.post(
      `/api/masters/hotels/${hotel.id}/meal-plans/${meal.id}/month-prices`,
      { month: 1, price: 1000 },
    );
    expect(month.status).toBe(201);
    const season = await client.post(
      `/api/masters/hotels/${hotel.id}/meal-plans/${meal.id}/seasons`,
      { name: 'Peak', startDate: '2026-12-01', endDate: '2026-12-31', price: 1300 },
    );
    expect(season.status).toBe(201);

    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const saved = detail.body.data.mealPlans.find((p: { id: string }) => p.id === meal.id);
    expect(saved.sellingPrice).toBe(800);
    expect(saved.monthPrices).toHaveLength(1);
    expect(saved.seasons).toHaveLength(1);
    expect(saved.seasons[0]).toMatchObject({ name: 'Peak', price: 1300 });

    // Month/season rows are edited and deleted.
    const monthId = saved.monthPrices[0].id;
    const edited = await client.patch(
      `/api/masters/hotels/${hotel.id}/meal-plans/${meal.id}/month-prices/${monthId}`,
      { price: 1100 },
    );
    expect(edited.status).toBe(200);
    const seasonId = saved.seasons[0].id;
    const deleted = await client.delete(
      `/api/masters/hotels/${hotel.id}/meal-plans/${meal.id}/seasons/${seasonId}`,
    );
    expect(deleted.status).toBe(200);
  });

  it('keeps existing records without month/season pricing working', async () => {
    const client = await owner();
    const hotel = await setupHotel(client, { price: 10000, currency: 'INR' });
    const room = await setupRoomType(client, hotel.id, { sellingPrice: 5000 });
    const meal = await setupMealPlan(client, hotel.id, { sellingPrice: 800 });

    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.price).toBe(10000);
    expect(detail.body.data.monthPrices ?? []).toHaveLength(0);
    expect(detail.body.data.seasons).toHaveLength(0);
    const roomRow = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    const mealRow = detail.body.data.mealPlans.find((p: { id: string }) => p.id === meal.id);
    expect(roomRow.sellingPrice).toBe(5000);
    expect(roomRow.monthPrices ?? []).toHaveLength(0);
    expect(roomRow.seasons ?? []).toHaveLength(0);
    expect(mealRow.sellingPrice).toBe(800);
    expect(mealRow.monthPrices ?? []).toHaveLength(0);
    expect(mealRow.seasons ?? []).toHaveLength(0);
  });
});