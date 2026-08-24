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
  await client.post('/api/auth/register', registrationPayload({ email: 'owner@season.test' }));
  await client.post('/api/auth/verify-email', {
    otp: getMemoryEmailProvider()?.lastOtp('owner@season.test'),
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

const season = {
  name: 'Peak Season',
  startDate: '2026-12-20',
  endDate: '2027-01-05',
  price: 15000,
  currency: 'USD',
};

describe('hotel seasons (date-range rates)', () => {
  it('creates a season and returns it with the hotel details', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, season);
    expect(created.status).toBe(201);
    expect(created.body.data.seasons).toHaveLength(1);
    expect(created.body.data.seasons[0]).toMatchObject({
      name: 'Peak Season',
      price: 15000,
      currency: 'USD',
    });
    // The base price and currency are untouched.
    expect(created.body.data.price).toBe(10000);
    expect(created.body.data.currency).toBe('INR');

    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.seasons).toHaveLength(1);
    expect(detail.body.data.seasons[0].startDate).toBe('2026-12-20');
    expect(detail.body.data.seasons[0].endDate).toBe('2027-01-05');
  });

  it('defaults season currency to INR when omitted', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Low Season',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      price: 8000,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.seasons[0].currency).toBe('INR');
  });

  it('rejects an inverted date range', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const bad = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      ...season,
      startDate: '2027-01-05',
      endDate: '2026-12-20',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.endDate[0]).toContain('End date');
  });

  it('rejects an overlapping date range', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    await client.post(`/api/masters/hotels/${hotel.id}/seasons`, season);
    const overlap = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Overlap Season',
      startDate: '2026-12-25',
      endDate: '2027-01-10',
      price: 9000,
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.message).toContain('overlaps');

    // Adjacent ranges (touching but not overlapping) are allowed.
    const adjacent = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Adjacent Season',
      startDate: '2027-01-06',
      endDate: '2027-01-31',
      price: 9000,
    });
    expect(adjacent.status).toBe(201);
  });

  it('updates a season and lets its own range stay unchanged', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, season);
    const id = created.body.data.seasons[0].id;

    const updated = await client.patch(`/api/masters/hotels/${hotel.id}/seasons/${id}`, {
      price: 18000,
      currency: 'INR',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.seasons[0]).toMatchObject({ price: 18000, currency: 'INR' });

    // Updating a different season to an overlapping range is rejected.
    const second = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, {
      name: 'Second Season',
      startDate: '2027-02-01',
      endDate: '2027-02-28',
      price: 7000,
    });
    const secondId = second.body.data.seasons.find((s: { name: string }) => s.name === 'Second Season')
      .id;
    const overlap = await client.patch(`/api/masters/hotels/${hotel.id}/seasons/${secondId}`, {
      startDate: '2026-12-25',
      endDate: '2027-01-10',
    });
    expect(overlap.status).toBe(400);
  });

  it('deletes a season', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/seasons`, season);
    const id = created.body.data.seasons[0].id;
    const deleted = await client.delete(`/api/masters/hotels/${hotel.id}/seasons/${id}`);
    expect(deleted.status).toBe(200);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.body.data.seasons).toHaveLength(0);
  });

  it('exposes seasons in the hotel list used by the quotation builder', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    await client.post(`/api/masters/hotels/${hotel.id}/seasons`, season);
    const list = await client.get(
      `/api/masters/hotels?status=ACTIVE&pageSize=100&search=Shah`,
    );
    expect(list.status).toBe(200);
    const row = list.body.data.data[0];
    expect(row.seasons).toHaveLength(1);
    expect(row.seasons[0]).toMatchObject({ name: 'Peak Season', price: 15000, currency: 'USD' });
  });
});