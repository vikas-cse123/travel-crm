import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

type Client = ReturnType<typeof createAuthClient>;

async function owner(email = 'owner@ha.test', companyName = 'Hotel Travel') {
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

async function createCity(client: Client, name = 'Baku') {
  const response = await client.post('/api/masters/cities', {
    countryCode: 'AZ',
    name,
    status: 'ACTIVE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

async function createDestination(client: Client, cityIds: string[], name = 'Azerbaijan') {
  const response = await client.post('/api/masters/destinations', {
    countryCode: 'AZ',
    name,
    destinationType: 'INTERNATIONAL',
    cityIds,
    status: 'ACTIVE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

async function setupDestinationCity(client: Client, cityName = 'Baku') {
  const city = await createCity(client, cityName);
  const destination = await createDestination(client, [city.id]);
  return { city, destination };
}

async function createHotel(
  client: Client,
  destinationId: string,
  cityId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await client.post('/api/masters/hotels', {
    destinationId,
    cityId,
    name: 'Shah Palace Hotel',
    starCategory: 4,
    address: 'Boyuk Qala 47, Baku',
    status: 'ACTIVE',
    ...overrides,
  });
  return response;
}

describe('Phase 13B hotels master', () => {
  it('creates hotels only for a valid destination-city pairing', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const created = await createHotel(client, destination.id, city.id);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Shah Palace Hotel', starCategory: 4 });
    expect(created.body.data).not.toHaveProperty('companyId');
    expect(created.body.data).not.toHaveProperty('imageObjectKey');
    expect(created.body.data).not.toHaveProperty('normalizedName');

    // A city that is not linked to the destination must be rejected server-side.
    const unlinked = await createCity(client, 'Ganja');
    const invalid = await createHotel(client, destination.id, unlinked.id);
    expect(invalid.status).toBe(400);
  });

  it('supports search, destination, city and star filters with pagination', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    await createHotel(client, destination.id, city.id, { name: 'Grand Baku', starCategory: 5 });
    await createHotel(client, destination.id, city.id, { name: 'Budget Inn', starCategory: 2 });
    const list = await client.get(
      `/api/masters/hotels?page=1&pageSize=10&search=grand&destinationId=${destination.id}&cityId=${city.id}&starCategory=5`,
    );
    expect(list.status).toBe(200);
    expect(list.body.data.pagination).toMatchObject({ total: 1 });
    expect(list.body.data.data[0]).toMatchObject({ name: 'Grand Baku', starCategory: 5 });
  });

  it('rejects a duplicate hotel name within the same city and isolates tenants', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const first = await createHotel(client, destination.id, city.id);
    expect(first.status).toBe(201);
    const dup = await createHotel(client, destination.id, city.id, {
      name: '  SHAH PALACE HOTEL ',
    });
    expect(dup.status).toBe(409);

    const other = await owner('other@ha.test', 'Other Hotel Travel');
    expect((await other.get(`/api/masters/hotels/${first.body.data.id}`)).status).toBe(404);
  });

  it('keeps only one active default hotel per city, transactionally', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const a = await createHotel(client, destination.id, city.id, {
      name: 'Default A',
      isDefaultForCity: true,
    });
    const b = await createHotel(client, destination.id, city.id, {
      name: 'Default B',
      isDefaultForCity: true,
    });
    expect(
      (await db.hotel.findUniqueOrThrow({ where: { id: a.body.data.id } })).isDefaultForCity,
    ).toBe(false);
    expect(
      (await db.hotel.findUniqueOrThrow({ where: { id: b.body.data.id } })).isDefaultForCity,
    ).toBe(true);

    // Archiving the default hotel strips its default flag transactionally.
    expect((await client.delete(`/api/masters/hotels/${b.body.data.id}`)).status).toBe(200);
    const archived = await db.hotel.findUniqueOrThrow({ where: { id: b.body.data.id } });
    expect(archived).toMatchObject({ status: 'ARCHIVED', isDefaultForCity: false });
    expect(archived.deletedAt).not.toBeNull();
  });

  it('manages room types and meal plans and redacts costing by permission', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const hotel = (await createHotel(client, destination.id, city.id)).body.data as { id: string };

    const room = await client.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Deluxe Room',
      maxOccupancy: 3,
      baseCost: 4000,
      sellingPrice: 6000,
      currency: 'inr',
    });
    expect(room.status).toBe(201);
    await client.post(`/api/masters/hotels/${hotel.id}/meal-plans`, {
      name: 'Breakfast Only',
      type: 'BREAKFAST',
      baseCost: 500,
      sellingPrice: 800,
    });

    const ownerView = await client.get(`/api/masters/hotels/${hotel.id}`);
    expect(ownerView.body.data.roomTypes[0]).toMatchObject({
      name: 'Deluxe Room',
      baseCost: 4000,
      sellingPrice: 6000,
      currency: 'INR',
    });
    expect(ownerView.body.data.mealPlans[0]).toMatchObject({ baseCost: 500 });

    // A role with view but without view_costing must never receive cost fields.
    const sales = await roleClient('owner@ha.test', 'Sales Executive', 'sales@ha.test');
    const salesView = await sales.get(`/api/masters/hotels/${hotel.id}`);
    expect(salesView.status).toBe(200);
    expect(salesView.body.data.roomTypes[0]).toMatchObject({ name: 'Deluxe Room' });
    expect(salesView.body.data.roomTypes[0]).not.toHaveProperty('baseCost');
    expect(salesView.body.data.roomTypes[0]).not.toHaveProperty('sellingPrice');
    expect(salesView.body.data.mealPlans[0]).not.toHaveProperty('baseCost');
    expect(JSON.stringify(salesView.body.data)).not.toContain('6000');

    // Data Entry can manage rooms but not costing — cost input must be dropped.
    const dataEntry = await roleClient('owner@ha.test', 'Data Entry', 'data@ha.test');
    const cheapRoom = await dataEntry.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Standard Room',
      baseCost: 1000,
      sellingPrice: 2000,
    });
    expect(cheapRoom.status).toBe(201);
    const stored = await db.hotelRoomType.findFirstOrThrow({ where: { name: 'Standard Room' } });
    expect(stored.baseCost).toBeNull();
    expect(stored.sellingPrice).toBeNull();
  });

  it('enforces create and archive permissions for read-only roles', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const hotel = (await createHotel(client, destination.id, city.id)).body.data as { id: string };
    const sales = await roleClient('owner@ha.test', 'Sales Executive', 'sales@ha.test');
    expect(
      (
        await sales.post('/api/masters/hotels', {
          destinationId: destination.id,
          cityId: city.id,
          name: 'X',
        })
      ).status,
    ).toBe(403);
    expect((await sales.delete(`/api/masters/hotels/${hotel.id}`)).status).toBe(403);
  });

  it('approves, verifies and deletes tenant-keyed hotel images and rejects unsafe uploads', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const hotel = (await createHotel(client, destination.id, city.id)).body.data as { id: string };

    expect(
      (
        await client.post(`/api/masters/hotels/${hotel.id}/image/upload`, {
          fileName: 'x.svg',
          mimeType: 'image/svg+xml',
          fileSize: 10,
        })
      ).status,
    ).toBe(400);

    const body = Buffer.from('hotel-image');
    const approval = await client.post(`/api/masters/hotels/${hotel.id}/image/upload`, {
      fileName: '../../Palace.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    expect(JSON.stringify(approval.body.data)).not.toContain('companies/');
    const pending = await db.hotel.findUniqueOrThrow({ where: { id: hotel.id } });
    expect(pending.pendingImageObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/hotels/${hotel.id}/images/`),
    );
    expect(pending.pendingImageObjectKey).not.toContain('..');
    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/hotels/${hotel.id}/image/confirm`);
    expect(confirmed.body.data).toMatchObject({ hasImage: true, imageMimeType: 'image/png' });
    expect(confirmed.body.data).not.toHaveProperty('imageObjectKey');
    const download = await client.get(`/api/masters/hotels/${hotel.id}/image/download-url`);
    expect(download.body.data.url).toMatch(/^memory:\/\/download\//);
    expect((await client.delete(`/api/masters/hotels/${hotel.id}/image`)).status).toBe(200);
  });

  it('records hotel activity across create, default change and archive', async () => {
    const client = await owner();
    const { city, destination } = await setupDestinationCity(client);
    const hotel = (await createHotel(client, destination.id, city.id)).body.data as { id: string };
    await client.patch(`/api/masters/hotels/${hotel.id}`, { isDefaultForCity: true });
    await client.post(`/api/masters/hotels/${hotel.id}/room-types`, { name: 'Suite' });
    await client.delete(`/api/masters/hotels/${hotel.id}`);
    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'HOTEL_CREATED',
        'HOTEL_DEFAULT_CHANGED',
        'HOTEL_ROOM_TYPE_CREATED',
        'HOTEL_ARCHIVED',
      ]),
    );
  });
});

describe('Phase 13B airlines master', () => {
  async function createAirline(client: Client, overrides: Record<string, unknown> = {}) {
    return client.post('/api/masters/airlines', {
      name: 'Air India',
      status: 'ACTIVE',
      ...overrides,
    });
  }

  it('creates airlines, normalizes codes and snapshots the country', async () => {
    const client = await owner();
    const created = await createAirline(client, {
      iataCode: 'ai',
      icaoCode: 'aic',
      countryCode: 'in',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'Air India',
      iataCode: 'AI',
      icaoCode: 'AIC',
      countryCode: 'IN',
      countryName: 'India',
      hasLogo: false,
    });
    expect(created.body.data).not.toHaveProperty('companyId');
  });

  it('rejects invalid and duplicate codes and names within a tenant', async () => {
    const client = await owner();
    expect((await createAirline(client, { iataCode: 'ABC' })).status).toBe(400);
    await createAirline(client, { iataCode: '6E' });
    const dupName = await createAirline(client, { name: ' air india ' });
    expect(dupName.status).toBe(409);
    const dupCode = await createAirline(client, { name: 'IndiGo', iataCode: '6e' });
    expect(dupCode.status).toBe(409);
  });

  it('lists, filters, updates, archives and isolates airlines by tenant', async () => {
    const client = await owner();
    const a = (await createAirline(client, { name: 'Emirates', countryCode: 'AE' })).body.data as {
      id: string;
    };
    await createAirline(client, { name: 'Air India', countryCode: 'IN' });
    const list = await client.get('/api/masters/airlines?search=emir&country=AE');
    expect(list.body.data.pagination.total).toBe(1);
    expect(list.body.data.data[0]).toMatchObject({ name: 'Emirates' });

    const updated = await client.patch(`/api/masters/airlines/${a.id}`, {
      website: 'emirates.com',
    });
    expect(updated.body.data).toMatchObject({ website: 'emirates.com' });
    expect((await client.delete(`/api/masters/airlines/${a.id}`)).status).toBe(200);
    expect(await db.airline.count({ where: { id: a.id, status: 'ARCHIVED' } })).toBe(1);

    const other = await owner('other@ha.test', 'Other Air');
    expect((await other.get(`/api/masters/airlines/${a.id}`)).status).toBe(404);
  });

  it('validates and stores tenant-keyed airline logos', async () => {
    const client = await owner();
    const airline = (await createAirline(client)).body.data as { id: string };
    expect(
      (
        await client.post(`/api/masters/airlines/${airline.id}/logo/upload`, {
          fileName: 'big.png',
          mimeType: 'image/png',
          fileSize: 5 * 1024 * 1024,
        })
      ).status,
    ).toBe(400);
    const body = Buffer.from('logo');
    const approval = await client.post(`/api/masters/airlines/${airline.id}/logo/upload`, {
      fileName: 'logo.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    const pending = await db.airline.findUniqueOrThrow({ where: { id: airline.id } });
    expect(pending.pendingLogoObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/airlines/${airline.id}/logos/`),
    );
    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingLogoObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/airlines/${airline.id}/logo/confirm`);
    expect(confirmed.body.data).toMatchObject({ hasLogo: true });
    expect(confirmed.body.data).not.toHaveProperty('logoObjectKey');

    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toEqual(expect.arrayContaining(['AIRLINE_CREATED', 'AIRLINE_LOGO_UPLOADED']));
  });

  const pngBytes = () =>
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);

  const stubLogoFetch = (calls: string[] = [], failWithStatus = 0) => {
    const fetchSpy = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      calls.push(href);
      if (failWithStatus) return new Response(null, { status: failWithStatus });
      return new Response(pngBytes(), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  };

  it('imports a remote airline logo into master storage', async () => {
    const client = await owner();
    const airline = (await createAirline(client)).body.data as { id: string };
    const fetchCalls: string[] = [];
    stubLogoFetch(fetchCalls);
    try {
      const imported = await client.post(`/api/masters/airlines/${airline.id}/logo/import`, {
        url: 'https://www.gstatic.com/flights/airline_logos/70px/6E.png',
      });
      expect(imported.status).toBe(200);
      expect(imported.body.data).toMatchObject({ hasLogo: true });
      expect(imported.body.data).not.toHaveProperty('logoObjectKey');
      expect(fetchCalls[0]).toBe('https://www.gstatic.com/flights/airline_logos/70px/6E.png');

      const row = await db.airline.findUniqueOrThrow({ where: { id: airline.id } });
      expect(row.logoObjectKey).toMatch(
        new RegExp(`^companies/${row.companyId}/masters/airlines/${airline.id}/logos/`),
      );
      expect(row.logoConfirmedAt).not.toBeNull();
      expect(row.logoMimeType).toBe('image/png');
      const stored = (storageService as MemoryStorageService).read(row.logoObjectKey!);
      expect(stored).toBeDefined();
      expect(stored!.length).toBe(12);

      const actions = (await db.activityLog.findMany()).map((log) => log.action);
      expect(actions).toContain('AIRLINE_LOGO_IMPORTED');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not re-import when the airline already has a confirmed logo', async () => {
    const client = await owner();
    const airline = (await createAirline(client)).body.data as { id: string };
    const fetchCalls: string[] = [];
    stubLogoFetch(fetchCalls);
    try {
      const first = await client.post(`/api/masters/airlines/${airline.id}/logo/import`, {
        url: 'https://img.example.com/airline.png',
      });
      expect(first.status).toBe(200);
      const firstKey = (await db.airline.findUniqueOrThrow({ where: { id: airline.id } }))
        .logoObjectKey;
      expect(fetchCalls).toHaveLength(1);

      const second = await client.post(`/api/masters/airlines/${airline.id}/logo/import`, {
        url: 'https://img.example.com/airline-2.png',
      });
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({ hasLogo: true });
      // The logo was NOT re-fetched or re-uploaded.
      expect(fetchCalls).toHaveLength(1);
      const secondKey = (await db.airline.findUniqueOrThrow({ where: { id: airline.id } }))
        .logoObjectKey;
      expect(secondKey).toBe(firstKey);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves the airline without a logo when the remote download fails', async () => {
    const client = await owner();
    const airline = (await createAirline(client)).body.data as { id: string };
    stubLogoFetch([], 404);
    try {
      const response = await client.post(`/api/masters/airlines/${airline.id}/logo/import`, {
        url: 'https://img.example.com/missing.png',
      });
      expect(response.status).toBe(400);
      const row = await db.airline.findUniqueOrThrow({ where: { id: airline.id } });
      expect(row.logoObjectKey).toBeNull();
      expect(row.logoConfirmedAt).toBeNull();
      const actions = (await db.activityLog.findMany()).map((log) => log.action);
      expect(actions).not.toContain('AIRLINE_LOGO_IMPORTED');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a remote response that is not a valid image', async () => {
    const client = await owner();
    const airline = (await createAirline(client)).body.data as { id: string };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new TextEncoder().encode('not an image'), {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );
    try {
      const response = await client.post(`/api/masters/airlines/${airline.id}/logo/import`, {
        url: 'https://img.example.com/fake.png',
      });
      expect(response.status).toBe(400);
      const row = await db.airline.findUniqueOrThrow({ where: { id: airline.id } });
      expect(row.logoObjectKey).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
