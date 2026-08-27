import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
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

type Client = ReturnType<typeof createAuthClient>;

async function owner(email = 'owner@extra.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

async function roleClient(ownerEmail: string, roleName: string, email: string) {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const role = await db.role.findFirstOrThrow({ where: { companyId: ownerUser.companyId, name: roleName } });
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
  expect((await client.post('/api/auth/login', { email, password: 'Sales@2026', rememberMe: false })).status).toBe(200);
  return client;
}

async function setupHotel(client: Client) {
  const city = await client.post('/api/masters/cities', { countryCode: 'AZ', name: 'Baku', status: 'ACTIVE' });
  const destination = await client.post('/api/masters/destinations', {
    countryCode: 'AZ', name: 'Azerbaijan', destinationType: 'INTERNATIONAL', cityIds: [city.body.data.id], status: 'ACTIVE',
  });
  const hotel = await client.post('/api/masters/hotels', {
    destinationId: destination.body.data.id, cityId: city.body.data.id, name: 'Shah Palace Hotel', price: 10000, currency: 'INR', status: 'ACTIVE',
  });
  expect(hotel.status).toBe(201);
  return hotel.body.data as { id: string };
}

async function setupRoomType(client: Client, hotelId: string) {
  const room = await client.post(`/api/masters/hotels/${hotelId}/room-types`, { name: 'Deluxe Room', status: 'ACTIVE', sellingPrice: 5000, currency: 'INR' });
  expect(room.status).toBe(201);
  const created = room.body.data.roomTypes.find((r: { name: string }) => r.name === 'Deluxe Room');
  return created as { id: string };
}

describe('hotel room type extra bed / child without bed pricing', () => {
  it('creates a room type season with all three prices and persists', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    const season = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Peak Season', startDate: '2026-04-01', endDate: '2026-06-30', price: 12000, extraBedPrice: 4000, childWithoutBedPrice: 2000, currency: 'INR',
    });
    expect(season.status).toBe(201);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const saved = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(saved.seasons).toHaveLength(1);
    expect(saved.seasons[0]).toMatchObject({ name: 'Peak Season', price: 12000, extraBedPrice: 4000, childWithoutBedPrice: 2000, currency: 'INR' });
  });

  it('creates a room type month with all three prices and persists', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    const month = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, {
      month: 1, price: 8000, extraBedPrice: 2500, childWithoutBedPrice: 1000, currency: 'INR',
    });
    expect(month.status).toBe(201);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const saved = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(saved.monthPrices[0]).toMatchObject({ month: 1, price: 8000, extraBedPrice: 2500, childWithoutBedPrice: 1000 });
  });

  it('updates extra bed and child without bed prices independently', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Summer', startDate: '2026-07-01', endDate: '2026-07-31', price: 9000, extraBedPrice: 3000, childWithoutBedPrice: 1500,
    });
    const seasonId = created.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).seasons[0].id;
    const updated = await client.patch(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons/${seasonId}`, {
      extraBedPrice: 3500,
    });
    expect(updated.status).toBe(200);
    const afterFirst = updated.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).seasons[0];
    expect(afterFirst.extraBedPrice).toBe(3500);
    expect(afterFirst.childWithoutBedPrice).toBe(1500);
    expect(afterFirst.price).toBe(9000);

    const updated2 = await client.patch(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons/${seasonId}`, {
      childWithoutBedPrice: 1800,
    });
    expect(updated2.status).toBe(200);
    expect(updated2.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).seasons[0].childWithoutBedPrice).toBe(1800);

    // Month update
    const monthCreated = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, {
      month: 2, price: 8000, extraBedPrice: 2500, childWithoutBedPrice: 1000,
    });
    expect(monthCreated.status).toBe(201);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const monthId = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).monthPrices.find((m: { month: number }) => m.month === 2).id;
    const monthUpdated = await client.patch(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices/${monthId}`, {
      extraBedPrice: 2600, childWithoutBedPrice: 1100,
    });
    expect(monthUpdated.status).toBe(200);
    expect(monthUpdated.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).monthPrices.find((m: { id: string }) => m.id === monthId)).toMatchObject({ extraBedPrice: 2600, childWithoutBedPrice: 1100 });
  });

  it('keeps existing room pricing unchanged when extra prices are omitted (backward compat)', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    const legacy = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Legacy', startDate: '2026-08-01', endDate: '2026-08-31', price: 7000,
    });
    expect(legacy.status).toBe(201);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const season = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).seasons[0];
    expect(season.price).toBe(7000);
    expect(season.extraBedPrice).toBeNull();
    expect(season.childWithoutBedPrice).toBeNull();

    await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, { month: 3, price: 6000 });
    const detail2 = await client.get(`/api/masters/hotels/${hotel.id}`);
    const month = detail2.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).monthPrices.find((m: { month: number }) => m.month === 3);
    expect(month.price).toBe(6000);
    expect(month.extraBedPrice).toBeNull();
    expect(month.childWithoutBedPrice).toBeNull();
  });

  it('preserves overlap and adjacent validation for seasons with extra pricing', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Summer', startDate: '2026-06-01', endDate: '2026-06-30', price: 9000, extraBedPrice: 3000, childWithoutBedPrice: 1500,
    });
    const overlap = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Overlap', startDate: '2026-06-25', endDate: '2026-07-10', price: 9500, extraBedPrice: 3100, childWithoutBedPrice: 1600,
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.message).toContain('overlaps');
    const adjacent = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Adjacent', startDate: '2026-07-01', endDate: '2026-07-31', price: 9500, extraBedPrice: 3000, childWithoutBedPrice: 1500,
    });
    expect(adjacent.status).toBe(201);
  });

  it('rejects duplicate month (409) even with extra pricing', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, { month: 1, price: 8000, extraBedPrice: 2500, childWithoutBedPrice: 1000 });
    const dup = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, {
      month: 1, price: 9000, extraBedPrice: 3000, childWithoutBedPrice: 1500,
    });
    expect(dup.status).toBe(409);
  });

  it('rejects invalid month, negative price and invalid currency for extra pricing', async () => {
    const client = await owner();
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    const badMonth = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, { month: 13, price: 8000, extraBedPrice: 1000, childWithoutBedPrice: 500 });
    expect(badMonth.status).toBe(400);
    const negative = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Neg', startDate: '2026-09-01', endDate: '2026-09-30', price: 8000, extraBedPrice: -100, childWithoutBedPrice: 500,
    });
    expect(negative.status).toBe(400);
    const badCurrency = await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'BadCurr', startDate: '2026-10-01', endDate: '2026-10-31', price: 8000, extraBedPrice: 1000, childWithoutBedPrice: 500, currency: 'XX',
    });
    expect(badCurrency.status).toBe(400);
  });

  it('enforces tenant isolation for extra pricing', async () => {
    const clientA = await owner('a@extra.test');
    const hotelA = await setupHotel(clientA);
    const roomA = await setupRoomType(clientA, hotelA.id);
    await clientA.post(`/api/masters/hotels/${hotelA.id}/room-types/${roomA.id}/seasons`, {
      name: 'SeasonA', startDate: '2026-04-01', endDate: '2026-04-30', price: 10000, extraBedPrice: 3000, childWithoutBedPrice: 1500,
    });

    const clientB = await owner('b@extra.test');
    const notFound = await clientB.get(`/api/masters/hotels/${hotelA.id}`);
    expect(notFound.status).toBe(404);
    const forbidden = await clientB.post(`/api/masters/hotels/${hotelA.id}/room-types/${roomA.id}/seasons`, {
      name: 'Hack', startDate: '2026-05-01', endDate: '2026-05-31', price: 9999, extraBedPrice: 999, childWithoutBedPrice: 999,
    });
    expect([400, 404].includes(forbidden.status)).toBe(true);
  });

  it('redacts extra pricing for users without view-costing and blocks manage-costing writes', async () => {
    const ownerClient = await owner('owner2@extra.test');
    const hotel = await setupHotel(ownerClient);
    const room = await setupRoomType(ownerClient, hotel.id);
    await ownerClient.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'CostSeason', startDate: '2026-04-01', endDate: '2026-04-30', price: 12000, extraBedPrice: 4000, childWithoutBedPrice: 2000,
    });
    await ownerClient.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, {
      month: 5, price: 8000, extraBedPrice: 2500, childWithoutBedPrice: 1000,
    });

    const ownerDetail = await ownerClient.get(`/api/masters/hotels/${hotel.id}`);
    const ownerRoom = ownerDetail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(ownerRoom.seasons[0].extraBedPrice).toBe(4000);
    expect(ownerRoom.monthPrices[0].extraBedPrice).toBe(2500);

    const sales = await roleClient('owner2@extra.test', 'Sales Executive', 'sales2@extra.test');
    const salesView = await sales.get(`/api/masters/hotels/${hotel.id}`);
    expect(salesView.status).toBe(200);
    const salesRoom = salesView.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(salesRoom.seasons[0].extraBedPrice).toBeUndefined();
    expect(salesRoom.seasons[0].childWithoutBedPrice).toBeUndefined();
    expect(salesRoom.monthPrices[0].extraBedPrice).toBeUndefined();
    expect(salesRoom.monthPrices[0].childWithoutBedPrice).toBeUndefined();
    expect(salesRoom).not.toHaveProperty('sellingPrice');

    const dataEntry = await roleClient('owner2@extra.test', 'Data Entry', 'data2@extra.test');
    const limitedSeason = await dataEntry.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'LimitedSeason', startDate: '2026-08-01', endDate: '2026-08-31', price: 7000, extraBedPrice: 9999, childWithoutBedPrice: 9999,
    });
    expect(limitedSeason.status).toBe(201);
    const afterLimited = await ownerClient.get(`/api/masters/hotels/${hotel.id}`);
    const limitedSaved = afterLimited.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).seasons.find((s: { name: string }) => s.name === 'LimitedSeason');
    expect(limitedSaved.extraBedPrice).toBeNull();
    expect(limitedSaved.childWithoutBedPrice).toBeNull();
    expect(limitedSaved.price).toBe(7000);

    const monthLimited = await dataEntry.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/month-prices`, {
      month: 6, price: 8500, extraBedPrice: 9999, childWithoutBedPrice: 9999,
    });
    expect(monthLimited.status).toBe(201);
    const afterMonth = await ownerClient.get(`/api/masters/hotels/${hotel.id}`);
    const monthSaved = afterMonth.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).monthPrices.find((m: { month: number }) => m.month === 6);
    expect(monthSaved.extraBedPrice).toBeNull();
    expect(monthSaved.childWithoutBedPrice).toBeNull();
    expect(monthSaved.price).toBe(8500);
  });

  it('existing hotels without extra pricing still load with null extras', async () => {
    const client = await owner('legacy@extra.test');
    const hotel = await setupHotel(client);
    const room = await setupRoomType(client, hotel.id);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(detail.status).toBe(200);
    const saved = detail.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(saved.seasons ?? []).toHaveLength(0);
    expect(saved.monthPrices ?? []).toHaveLength(0);
    await client.post(`/api/masters/hotels/${hotel.id}/room-types/${room.id}/seasons`, {
      name: 'Legacy2', startDate: '2026-11-01', endDate: '2026-11-30', price: 6000,
    });
    const detail2 = await client.get(`/api/masters/hotels/${hotel.id}`);
    const season = detail2.body.data.roomTypes.find((r: { id: string }) => r.id === room.id).seasons[0];
    expect(season.extraBedPrice).toBeNull();
    expect(season.childWithoutBedPrice).toBeNull();
  });

  it('creates a room type with base extra bed and child-without-bed pricing and updates them', async () => {
    const client = await owner('base@extra.test');
    const hotel = await setupHotel(client);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Standard Room', status: 'ACTIVE', sellingPrice: 5000, extraBedPrice: 1500, childWithoutBedPrice: 800, currency: 'INR',
    });
    expect(created.status).toBe(201);
    const detail = await client.get(`/api/masters/hotels/${hotel.id}`);
    const room = detail.body.data.roomTypes.find((r: { name: string }) => r.name === 'Standard Room');
    expect(room).toMatchObject({ sellingPrice: 5000, extraBedPrice: 1500, childWithoutBedPrice: 800, currency: 'INR' });

    const updated = await client.patch(`/api/masters/hotels/${hotel.id}/room-types/${room.id}`, {
      extraBedPrice: 1800, childWithoutBedPrice: 950,
    });
    expect(updated.status).toBe(200);
    const after = updated.body.data.roomTypes.find((r: { id: string }) => r.id === room.id);
    expect(after.extraBedPrice).toBe(1800);
    expect(after.childWithoutBedPrice).toBe(950);
    expect(after.sellingPrice).toBe(5000);
  });

  it('redacts base extra pricing without view-costing and ignores manage-costing-less writes', async () => {
    const ownerClient = await owner('base-redact@extra.test');
    const hotel = await setupHotel(ownerClient);
    const created = await ownerClient.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Deluxe Room', status: 'ACTIVE', sellingPrice: 8000, extraBedPrice: 2000, childWithoutBedPrice: 1000, currency: 'INR',
    });
    const roomId = created.body.data.roomTypes.find((r: { name: string }) => r.name === 'Deluxe Room').id;

    const sales = await roleClient('base-redact@extra.test', 'Sales Executive', 'basesales@extra.test');
    const salesView = await sales.get(`/api/masters/hotels/${hotel.id}`);
    expect(salesView.status).toBe(200);
    const salesRoom = salesView.body.data.roomTypes.find((r: { id: string }) => r.id === roomId);
    expect(salesRoom).not.toHaveProperty('sellingPrice');
    expect(salesRoom).not.toHaveProperty('extraBedPrice');
    expect(salesRoom).not.toHaveProperty('childWithoutBedPrice');

    const dataEntry = await roleClient('base-redact@extra.test', 'Data Entry', 'basedata@extra.test');
    const limited = await dataEntry.patch(`/api/masters/hotels/${hotel.id}/room-types/${roomId}`, {
      extraBedPrice: 9999, childWithoutBedPrice: 9999,
    });
    expect(limited.status).toBe(200);
    const after = await ownerClient.get(`/api/masters/hotels/${hotel.id}`);
    const saved = after.body.data.roomTypes.find((r: { id: string }) => r.id === roomId);
    expect(saved.extraBedPrice).toBe(2000);
    expect(saved.childWithoutBedPrice).toBe(1000);
  });

  it('resolves pricing with Season > Month > Base including extra bed and child-without-bed', async () => {
    const client = await owner('precedence@extra.test');
    const hotel = await setupHotel(client);
    const created = await client.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Precedence Room', status: 'ACTIVE', sellingPrice: 5000, extraBedPrice: 1500, childWithoutBedPrice: 800, currency: 'INR',
    });
    const roomId = created.body.data.roomTypes.find((r: { name: string }) => r.name === 'Precedence Room').id;
    await client.post(`/api/masters/hotels/${hotel.id}/room-types/${roomId}/seasons`, {
      name: 'April', startDate: '2026-04-01', endDate: '2026-04-30', price: 7000, extraBedPrice: 2000, childWithoutBedPrice: 1200,
    });
    await client.post(`/api/masters/hotels/${hotel.id}/room-types/${roomId}/month-prices`, {
      month: 5, price: 6000, extraBedPrice: 1800, childWithoutBedPrice: 1000,
    });

    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'precedence@extra.test' } });
    const { resolveHotelRoomPricing } = await import('../src/modules/quotations/hotel-pricing-resolver.js');

    const season = await resolveHotelRoomPricing([ownerUser.companyId], roomId, '2026-04-10');
    expect(season).toMatchObject({ pricingSource: 'SEASON', baseRoomPrice: 7000, extraBedPrice: 2000, childWithoutBedPrice: 1200 });

    const month = await resolveHotelRoomPricing([ownerUser.companyId], roomId, '2026-05-10');
    expect(month).toMatchObject({ pricingSource: 'MONTH', baseRoomPrice: 6000, extraBedPrice: 1800, childWithoutBedPrice: 1000 });

    const base = await resolveHotelRoomPricing([ownerUser.companyId], roomId, '2026-06-10');
    expect(base).toMatchObject({ pricingSource: 'BASE', baseRoomPrice: 5000, extraBedPrice: 1500, childWithoutBedPrice: 800 });
  });
});
