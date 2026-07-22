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

/**
 * Phase 13C — Cruise and Vehicle masters.
 *
 * Storage is the in-memory adapter under NODE_ENV=test, so nothing here
 * reaches AWS.
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

async function owner(email = 'owner@cv.test', companyName = 'Cruise Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

/** Sign in as a system role inside an existing company. */
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

async function createCruise(client: Client, name = 'La Regina Legend', roomTypes?: unknown[]) {
  const response = await client.post('/api/masters/cruises', {
    name,
    description: '<p>A comfortable ship.</p>',
    status: 'ACTIVE',
    ...(roomTypes ? { roomTypes } : {}),
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

async function createVehicle(client: Client, name = 'Toyota Innova Crysta') {
  const response = await client.post('/api/masters/vehicles', {
    name,
    vehicleType: 'Standard MPV (Family Vehicle)',
    capacity: 8,
    description: 'Ideal for airport transfers.',
    status: 'ACTIVE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Cruises
// ---------------------------------------------------------------------------

describe('Cruise master', () => {
  it('creates a cruise with room types and returns a safe payload', async () => {
    const client = await owner();
    const cruise = await createCruise(client, 'Dream Genting', [
      { name: 'Premium Suite Ocean View', description: 'Balcony suite', price: 45000 },
      { name: 'Interior', price: 18000 },
    ]);

    const detail = await client.get(`/api/masters/cruises/${cruise.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.name).toBe('Dream Genting');
    expect(detail.body.data.roomTypes).toHaveLength(2);
    expect(detail.body.data.roomTypes[0].name).toBe('Premium Suite Ocean View');
    expect(detail.body.data.priceRange).toEqual({ min: 18000, max: 45000 });
    // Internals must never surface.
    expect(detail.body.data).not.toHaveProperty('companyId');
    expect(detail.body.data).not.toHaveProperty('normalizedName');
    expect(detail.body.data).not.toHaveProperty('imageObjectKey');
  });

  it('rejects a duplicate cruise name in the same company', async () => {
    const client = await owner();
    await createCruise(client, 'Repeat Cruise');
    const duplicate = await client.post('/api/masters/cruises', {
      name: 'repeat cruise',
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
  });

  it('validates a missing cruise name', async () => {
    const client = await owner();
    const response = await client.post('/api/masters/cruises', { name: '', status: 'ACTIVE' });
    expect(response.status).toBe(400);
  });

  it('replaces room types on update', async () => {
    const client = await owner();
    const cruise = await createCruise(client, 'Replace Me', [{ name: 'Interior', price: 100 }]);

    const updated = await client.patch(`/api/masters/cruises/${cruise.id}`, {
      name: 'Replace Me',
      roomTypes: [
        { name: 'Ocean View', price: 250 },
        { name: 'Suite', price: 900 },
      ],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.roomTypes.map((r: { name: string }) => r.name)).toEqual([
      'Ocean View',
      'Suite',
    ]);
    expect(await db.cruiseRoomType.count({ where: { cruiseId: cruise.id } })).toBe(2);
  });

  it('searches by name and by room type name', async () => {
    const client = await owner();
    await createCruise(client, 'Aurora Explorer', [{ name: 'Panorama Deck' }]);
    await createCruise(client, 'Baltic Star');

    const byName = await client.get('/api/masters/cruises?search=Aurora');
    expect(byName.body.data.data).toHaveLength(1);
    const byRoomType = await client.get('/api/masters/cruises?search=Panorama');
    expect(byRoomType.body.data.data).toHaveLength(1);
    expect(byRoomType.body.data.data[0].name).toBe('Aurora Explorer');
  });

  it('paginates and reports room type counts on the list', async () => {
    const client = await owner();
    await createCruise(client, 'Cruise One', [{ name: 'A' }, { name: 'B' }]);
    await createCruise(client, 'Cruise Two');

    const page = await client.get('/api/masters/cruises?pageSize=1&page=1');
    expect(page.body.data.data).toHaveLength(1);
    expect(page.body.data.pagination.total).toBe(2);
    const all = await client.get('/api/masters/cruises');
    const one = all.body.data.data.find((row: { name: string }) => row.name === 'Cruise One');
    expect(one.roomTypeCount).toBe(2);
  });

  it('archives, filters by status and restores', async () => {
    const client = await owner();
    const cruise = await createCruise(client, 'Archivable');

    expect((await client.delete(`/api/masters/cruises/${cruise.id}`)).status).toBe(200);
    // Archived rows drop out of the default list.
    expect((await client.get('/api/masters/cruises')).body.data.data).toHaveLength(0);
    expect((await client.get('/api/masters/cruises?status=ARCHIVED')).body.data.data).toHaveLength(
      1,
    );

    const restored = await client.patch(`/api/masters/cruises/${cruise.id}/status`, {
      status: 'ACTIVE',
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.status).toBe('ACTIVE');
    const row = await db.cruise.findUniqueOrThrow({ where: { id: cruise.id } });
    expect(row.deletedAt).toBeNull();
  });

  it('returns active cruises through the lookup endpoint only', async () => {
    const client = await owner();
    const active = await createCruise(client, 'Lookup Active', [{ name: 'Interior' }]);
    const archived = await createCruise(client, 'Lookup Archived');
    await client.delete(`/api/masters/cruises/${archived.id}`);

    const lookups = await client.get('/api/masters/cruises/lookups');
    expect(lookups.status).toBe(200);
    expect(lookups.body.data.cruises).toHaveLength(1);
    expect(lookups.body.data.cruises[0].id).toBe(active.id);
    // Selector payloads stay lightweight.
    expect(lookups.body.data.cruises[0]).not.toHaveProperty('description');
  });

  it('isolates cruises between companies', async () => {
    const a = await owner('a@cv.test', 'Company A');
    const b = await owner('b@cv.test', 'Company B');
    const cruiseA = await createCruise(a, 'Company A Cruise');

    expect((await b.get('/api/masters/cruises')).body.data.data).toHaveLength(0);
    // A cross-tenant id is indistinguishable from a missing one.
    expect((await b.get(`/api/masters/cruises/${cruiseA.id}`)).status).toBe(404);
    expect((await b.patch(`/api/masters/cruises/${cruiseA.id}`, { name: 'Hijack' })).status).toBe(
      404,
    );
    expect((await b.delete(`/api/masters/cruises/${cruiseA.id}`)).status).toBe(404);
    const untouched = await db.cruise.findUniqueOrThrow({ where: { id: cruiseA.id } });
    expect(untouched.name).toBe('Company A Cruise');
  });

  it('ignores a companyId supplied in the request body', async () => {
    const a = await owner('a@cv.test', 'Company A');
    const b = await owner('b@cv.test', 'Company B');
    const companyB = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'b@cv.test' } });

    const created = await a.post('/api/masters/cruises', {
      name: 'Tenant Test',
      status: 'ACTIVE',
      companyId: companyB.companyId,
    });
    expect(created.status).toBe(201);
    const row = await db.cruise.findUniqueOrThrow({ where: { id: created.body.data.id } });
    const companyA = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'a@cv.test' } });
    expect(row.companyId).toBe(companyA.companyId);
    expect(row.companyId).not.toBe(companyB.companyId);
    expect((await b.get('/api/masters/cruises')).body.data.data).toHaveLength(0);
  });

  it('enforces permissions for view-only and sales roles', async () => {
    const ownerClient = await owner();
    const cruise = await createCruise(ownerClient, 'Permission Cruise');

    const viewOnly = await roleClient('owner@cv.test', 'View Only', 'viewonly@cv.test');
    expect((await viewOnly.get('/api/masters/cruises')).status).toBe(200);
    expect((await viewOnly.post('/api/masters/cruises', { name: 'Nope' })).status).toBe(403);
    expect((await viewOnly.patch(`/api/masters/cruises/${cruise.id}`, { name: 'No' })).status).toBe(
      403,
    );
    expect((await viewOnly.delete(`/api/masters/cruises/${cruise.id}`)).status).toBe(403);
  });

  it('hides prices from a role without the costing permission', async () => {
    const ownerClient = await owner();
    await createCruise(ownerClient, 'Costed Cruise', [{ name: 'Suite', price: 5000 }]);

    // Sales Executive gets view but not view_costing.
    const sales = await roleClient('owner@cv.test', 'Sales Executive', 'sales@cv.test');
    const list = await sales.get('/api/masters/cruises');
    expect(list.status).toBe(200);
    expect(list.body.data.data[0].priceRange).toBeNull();

    const detail = await sales.get(`/api/masters/cruises/${list.body.data.data[0].id}`);
    expect(detail.body.data.roomTypes[0]).not.toHaveProperty('price');
    expect(detail.body.data.roomTypes[0].name).toBe('Suite');
  });

  it('validates image MIME type and size, and scopes the key to the tenant', async () => {
    const client = await owner();
    const cruise = await createCruise(client, 'Media Cruise');

    // Unsupported type.
    expect(
      (
        await client.post(`/api/masters/cruises/${cruise.id}/image/upload`, {
          fileName: 'ship.svg',
          mimeType: 'image/svg+xml',
          fileSize: 10,
        })
      ).status,
    ).toBe(400);

    // Oversized file.
    expect(
      (
        await client.post(`/api/masters/cruises/${cruise.id}/image/upload`, {
          fileName: 'ship.png',
          mimeType: 'image/png',
          fileSize: 50 * 1024 * 1024,
        })
      ).status,
    ).toBe(400);

    const body = Buffer.from('cruise-image');
    const approval = await client.post(`/api/masters/cruises/${cruise.id}/image/upload`, {
      // A traversal attempt in the filename must not escape the tenant prefix.
      fileName: '../../Ship.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    expect(JSON.stringify(approval.body.data)).not.toContain('companies/');

    const pending = await db.cruise.findUniqueOrThrow({ where: { id: cruise.id } });
    expect(pending.pendingImageObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/cruises/${cruise.id}/images/`),
    );
    expect(pending.pendingImageObjectKey).not.toContain('..');

    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/cruises/${cruise.id}/image/confirm`);
    expect(confirmed.body.data).toMatchObject({ hasImage: true, imageMimeType: 'image/png' });
    expect(confirmed.body.data).not.toHaveProperty('imageObjectKey');

    const download = await client.get(`/api/masters/cruises/${cruise.id}/image/download-url`);
    expect(download.body.data.url).toMatch(/^memory:\/\/download\//);
    expect((await client.delete(`/api/masters/cruises/${cruise.id}/image`)).status).toBe(200);
  });

  it('writes activity logs for the cruise lifecycle', async () => {
    const client = await owner();
    const cruise = await createCruise(client, 'Audited Cruise');
    await client.patch(`/api/masters/cruises/${cruise.id}`, { name: 'Audited Cruise Renamed' });
    await client.delete(`/api/masters/cruises/${cruise.id}`);
    await client.patch(`/api/masters/cruises/${cruise.id}/status`, { status: 'ACTIVE' });

    const actions = (await db.activityLog.findMany({ where: { entityId: cruise.id } })).map(
      (log) => log.action,
    );
    expect(actions).toContain('CRUISE_CREATED');
    expect(actions).toContain('CRUISE_UPDATED');
    expect(actions).toContain('CRUISE_ARCHIVED');
    expect(actions).toContain('CRUISE_RESTORED');
    // Logs must never carry storage keys.
    const logs = await db.activityLog.findMany({ where: { entityId: cruise.id } });
    expect(JSON.stringify(logs)).not.toContain('companies/');
  });
});

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

describe('Vehicle master', () => {
  it('creates a vehicle and returns a safe payload', async () => {
    const client = await owner();
    const vehicle = await createVehicle(client);

    const detail = await client.get(`/api/masters/vehicles/${vehicle.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      name: 'Toyota Innova Crysta',
      vehicleType: 'Standard MPV (Family Vehicle)',
      capacity: 8,
    });
    expect(detail.body.data).not.toHaveProperty('companyId');
    expect(detail.body.data).not.toHaveProperty('imageObjectKey');
  });

  it('rejects a duplicate vehicle name in the same company', async () => {
    const client = await owner();
    await createVehicle(client, 'Repeat Vehicle');
    const duplicate = await client.post('/api/masters/vehicles', {
      name: 'repeat vehicle',
      vehicleType: 'SUV',
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
  });

  it('validates required fields and numeric capacity', async () => {
    const client = await owner();
    // Missing type.
    expect((await client.post('/api/masters/vehicles', { name: 'No Type' })).status).toBe(400);
    // Non-integer capacity.
    expect(
      (
        await client.post('/api/masters/vehicles', {
          name: 'Fractional',
          vehicleType: 'SUV',
          capacity: 4.5,
        })
      ).status,
    ).toBe(400);
    // Zero and negative capacity.
    expect(
      (
        await client.post('/api/masters/vehicles', {
          name: 'Zero',
          vehicleType: 'SUV',
          capacity: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client.post('/api/masters/vehicles', {
          name: 'Negative',
          vehicleType: 'SUV',
          capacity: -3,
        })
      ).status,
    ).toBe(400);
    // Absurdly large.
    expect(
      (
        await client.post('/api/masters/vehicles', {
          name: 'Huge',
          vehicleType: 'SUV',
          capacity: 100000,
        })
      ).status,
    ).toBe(400);
  });

  it('updates a vehicle', async () => {
    const client = await owner();
    const vehicle = await createVehicle(client);
    const updated = await client.patch(`/api/masters/vehicles/${vehicle.id}`, {
      vehicleType: 'Luxury SUV',
      capacity: 6,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ vehicleType: 'Luxury SUV', capacity: 6 });
  });

  it('searches and filters by vehicle type', async () => {
    const client = await owner();
    await createVehicle(client, 'Toyota Coaster');
    await client.post('/api/masters/vehicles', {
      name: 'AC Coach 40 Seater',
      vehicleType: 'AC Coach',
      capacity: 40,
      status: 'ACTIVE',
    });

    const search = await client.get('/api/masters/vehicles?search=Coaster');
    expect(search.body.data.data).toHaveLength(1);

    const filtered = await client.get(
      `/api/masters/vehicles?vehicleType=${encodeURIComponent('AC Coach')}`,
    );
    expect(filtered.body.data.data).toHaveLength(1);
    expect(filtered.body.data.data[0].name).toBe('AC Coach 40 Seater');
  });

  it('lists the distinct vehicle types in use', async () => {
    const client = await owner();
    await createVehicle(client, 'Innova One');
    await client.post('/api/masters/vehicles', {
      name: 'Coach One',
      vehicleType: 'AC Coach',
      status: 'ACTIVE',
    });

    const types = await client.get('/api/masters/vehicles/types');
    expect(types.status).toBe(200);
    expect(types.body.data.vehicleTypes).toEqual(['AC Coach', 'Standard MPV (Family Vehicle)']);
  });

  it('archives, filters by status and restores', async () => {
    const client = await owner();
    const vehicle = await createVehicle(client, 'Archivable Vehicle');

    expect((await client.delete(`/api/masters/vehicles/${vehicle.id}`)).status).toBe(200);
    expect((await client.get('/api/masters/vehicles')).body.data.data).toHaveLength(0);
    expect((await client.get('/api/masters/vehicles?status=ARCHIVED')).body.data.data).toHaveLength(
      1,
    );

    const restored = await client.patch(`/api/masters/vehicles/${vehicle.id}/status`, {
      status: 'ACTIVE',
    });
    expect(restored.body.data.status).toBe('ACTIVE');
    const row = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(row.deletedAt).toBeNull();
  });

  it('returns active vehicles through the lookup endpoint only', async () => {
    const client = await owner();
    const active = await createVehicle(client, 'Lookup Vehicle');
    const archived = await createVehicle(client, 'Archived Vehicle');
    await client.delete(`/api/masters/vehicles/${archived.id}`);

    const lookups = await client.get('/api/masters/vehicles/lookups');
    expect(lookups.body.data.vehicles).toHaveLength(1);
    expect(lookups.body.data.vehicles[0].id).toBe(active.id);
    expect(lookups.body.data.vehicles[0]).not.toHaveProperty('description');
  });

  it('isolates vehicles between companies', async () => {
    const a = await owner('a@cv.test', 'Company A');
    const b = await owner('b@cv.test', 'Company B');
    const vehicleA = await createVehicle(a, 'Company A Vehicle');

    expect((await b.get('/api/masters/vehicles')).body.data.data).toHaveLength(0);
    expect((await b.get(`/api/masters/vehicles/${vehicleA.id}`)).status).toBe(404);
    expect((await b.patch(`/api/masters/vehicles/${vehicleA.id}`, { name: 'Hijack' })).status).toBe(
      404,
    );
    expect((await b.delete(`/api/masters/vehicles/${vehicleA.id}`)).status).toBe(404);
    // The type dropdown must not leak another tenant's values either.
    expect((await b.get('/api/masters/vehicles/types')).body.data.vehicleTypes).toEqual([]);
  });

  it('enforces permissions for a view-only role', async () => {
    const ownerClient = await owner();
    const vehicle = await createVehicle(ownerClient, 'Permission Vehicle');

    const viewOnly = await roleClient('owner@cv.test', 'View Only', 'viewonly@cv.test');
    expect((await viewOnly.get('/api/masters/vehicles')).status).toBe(200);
    expect(
      (await viewOnly.post('/api/masters/vehicles', { name: 'Nope', vehicleType: 'SUV' })).status,
    ).toBe(403);
    expect(
      (await viewOnly.patch(`/api/masters/vehicles/${vehicle.id}`, { name: 'No' })).status,
    ).toBe(403);
    expect((await viewOnly.delete(`/api/masters/vehicles/${vehicle.id}`)).status).toBe(403);
    expect(
      (
        await viewOnly.post(`/api/masters/vehicles/${vehicle.id}/image/upload`, {
          fileName: 'x.png',
          mimeType: 'image/png',
          fileSize: 10,
        })
      ).status,
    ).toBe(403);
  });

  it('validates image MIME type and size, and scopes the key to the tenant', async () => {
    const client = await owner();
    const vehicle = await createVehicle(client, 'Media Vehicle');

    expect(
      (
        await client.post(`/api/masters/vehicles/${vehicle.id}/image/upload`, {
          fileName: 'car.svg',
          mimeType: 'image/svg+xml',
          fileSize: 10,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client.post(`/api/masters/vehicles/${vehicle.id}/image/upload`, {
          fileName: 'car.png',
          mimeType: 'image/png',
          fileSize: 50 * 1024 * 1024,
        })
      ).status,
    ).toBe(400);

    const body = Buffer.from('vehicle-image');
    const approval = await client.post(`/api/masters/vehicles/${vehicle.id}/image/upload`, {
      fileName: '../../Car.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    expect(JSON.stringify(approval.body.data)).not.toContain('companies/');

    const pending = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(pending.pendingImageObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/vehicles/${vehicle.id}/images/`),
    );
    expect(pending.pendingImageObjectKey).not.toContain('..');

    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/vehicles/${vehicle.id}/image/confirm`);
    expect(confirmed.body.data).toMatchObject({ hasImage: true, imageMimeType: 'image/png' });
    expect(confirmed.body.data).not.toHaveProperty('imageObjectKey');

    const download = await client.get(`/api/masters/vehicles/${vehicle.id}/image/download-url`);
    expect(download.body.data.url).toMatch(/^memory:\/\/download\//);
    expect((await client.delete(`/api/masters/vehicles/${vehicle.id}/image`)).status).toBe(200);
  });

  it('rejects a confirm whose uploaded bytes do not match the approval', async () => {
    const client = await owner();
    const vehicle = await createVehicle(client, 'Mismatch Vehicle');
    await client.post(`/api/masters/vehicles/${vehicle.id}/image/upload`, {
      fileName: 'car.png',
      mimeType: 'image/png',
      fileSize: 100,
    });
    const pending = await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    // Upload a different size than was approved.
    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body: Buffer.from('tiny'),
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/vehicles/${vehicle.id}/image/confirm`);
    expect(confirmed.status).toBe(400);
  });

  it('writes activity logs for the vehicle lifecycle', async () => {
    const client = await owner();
    const vehicle = await createVehicle(client, 'Audited Vehicle');
    await client.patch(`/api/masters/vehicles/${vehicle.id}`, { capacity: 4 });
    await client.delete(`/api/masters/vehicles/${vehicle.id}`);
    await client.patch(`/api/masters/vehicles/${vehicle.id}/status`, { status: 'ACTIVE' });

    const actions = (await db.activityLog.findMany({ where: { entityId: vehicle.id } })).map(
      (log) => log.action,
    );
    expect(actions).toContain('VEHICLE_CREATED');
    expect(actions).toContain('VEHICLE_UPDATED');
    expect(actions).toContain('VEHICLE_ARCHIVED');
    expect(actions).toContain('VEHICLE_RESTORED');
  });
});
