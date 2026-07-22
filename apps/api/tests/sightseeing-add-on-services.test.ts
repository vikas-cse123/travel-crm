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
 * Phase 13D — Sightseeing and Add-On Services masters.
 *
 * Storage is the in-memory adapter under NODE_ENV=test, so nothing reaches AWS.
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

async function owner(email = 'owner@sa.test', companyName = 'Sight Travel') {
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

/** Build a destination with one linked city, which sightseeing requires. */
async function createGeo(client: Client, cityName = 'Baku', destinationName = 'Azerbaijan') {
  const city = await client.post('/api/masters/cities', {
    countryCode: 'AZ',
    name: cityName,
    status: 'ACTIVE',
  });
  expect(city.status).toBe(201);
  const cityId = city.body.data.id as string;

  const destination = await client.post('/api/masters/destinations', {
    countryCode: 'AZ',
    name: destinationName,
    destinationType: 'INTERNATIONAL',
    cityIds: [cityId],
    status: 'ACTIVE',
  });
  expect(destination.status).toBe(201);
  return { cityId, destinationId: destination.body.data.id as string };
}

async function createSightseeing(
  client: Client,
  geo: { destinationId: string; cityId: string },
  overrides: Record<string, unknown> = {},
) {
  const response = await client.post('/api/masters/sightseeing', {
    destinationId: geo.destinationId,
    cityId: geo.cityId,
    title: 'Gobustan Rock Art Tour',
    sequence: 1,
    estimatedHours: 5,
    suggestedStartTime: '10:00',
    description: '<p>Begin your exploration of Qobustan.</p>',
    remarks: '<p>Carry water.</p>',
    status: 'ACTIVE',
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; title: string; sequence: number };
}

async function createService(client: Client, overrides: Record<string, unknown> = {}) {
  const response = await client.post('/api/masters/add-on-services', {
    name: 'Singapore Visa',
    description: '<p><mark>Docs Required</mark>: Passport</p>',
    price: 3800,
    status: 'ACTIVE',
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Sightseeing
// ---------------------------------------------------------------------------

describe('Sightseeing master', () => {
  it('creates a sightseeing and returns a safe payload', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo);

    const detail = await client.get(`/api/masters/sightseeing/${row.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      title: 'Gobustan Rock Art Tour',
      sequence: 1,
      estimatedHours: 5,
      suggestedStartTime: '10:00',
    });
    expect(detail.body.data.destination.id).toBe(geo.destinationId);
    expect(detail.body.data.city.id).toBe(geo.cityId);
    expect(detail.body.data).not.toHaveProperty('companyId');
    expect(detail.body.data).not.toHaveProperty('normalizedTitle');
    expect(detail.body.data).not.toHaveProperty('imageObjectKey');
  });

  it('rejects a city that is not linked to the destination', async () => {
    const client = await owner();
    const first = await createGeo(client, 'Baku', 'Azerbaijan');
    // A second destination/city pair; mixing the two must fail.
    const second = await createGeo(client, 'Dubai', 'UAE');

    const response = await client.post('/api/masters/sightseeing', {
      destinationId: first.destinationId,
      cityId: second.cityId,
      title: 'Mismatched Tour',
      sequence: 1,
      status: 'ACTIVE',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/linked to the selected destination/i);
  });

  it('re-validates the destination/city pair on update', async () => {
    const client = await owner();
    const first = await createGeo(client, 'Baku', 'Azerbaijan');
    const second = await createGeo(client, 'Dubai', 'UAE');
    const row = await createSightseeing(client, first);

    // Swapping only the city, leaving the stored destination, must be refused.
    const response = await client.patch(`/api/masters/sightseeing/${row.id}`, {
      cityId: second.cityId,
    });
    expect(response.status).toBe(400);
  });

  it('rejects a cross-tenant destination reference', async () => {
    const a = await owner('a@sa.test', 'Company A');
    const b = await owner('b@sa.test', 'Company B');
    const geoA = await createGeo(a, 'Baku', 'Azerbaijan');

    // Company B trying to attach Company A's destination/city.
    const response = await b.post('/api/masters/sightseeing', {
      destinationId: geoA.destinationId,
      cityId: geoA.cityId,
      title: 'Stolen Geo',
      sequence: 1,
      status: 'ACTIVE',
    });
    expect(response.status).toBe(400);
    expect(await db.sightseeing.count()).toBe(0);
  });

  it('rejects a duplicate title within the same city', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    await createSightseeing(client, geo, { title: 'Repeat Tour' });

    const duplicate = await client.post('/api/masters/sightseeing', {
      destinationId: geo.destinationId,
      cityId: geo.cityId,
      title: 'repeat tour',
      sequence: 2,
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
  });

  it('validates the title, sequence and duration', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const base = { destinationId: geo.destinationId, cityId: geo.cityId, status: 'ACTIVE' };

    expect((await client.post('/api/masters/sightseeing', { ...base, title: '' })).status).toBe(
      400,
    );
    expect(
      (await client.post('/api/masters/sightseeing', { ...base, title: 'Ok', sequence: 0 })).status,
    ).toBe(400);
    expect(
      (await client.post('/api/masters/sightseeing', { ...base, title: 'Ok', estimatedHours: -1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await client.post('/api/masters/sightseeing', {
          ...base,
          title: 'Ok',
          suggestedStartTime: '25:00',
        })
      ).status,
    ).toBe(400);
  });

  it('updates a sightseeing', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo);

    const updated = await client.patch(`/api/masters/sightseeing/${row.id}`, {
      title: 'Renamed Tour',
      estimatedHours: 2.5,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ title: 'Renamed Tour', estimatedHours: 2.5 });
  });

  it('searches by title and filters by destination and city', async () => {
    const client = await owner();
    const first = await createGeo(client, 'Baku', 'Azerbaijan');
    const second = await createGeo(client, 'Dubai', 'UAE');
    await createSightseeing(client, first, { title: 'Gobustan Tour' });
    await createSightseeing(client, second, { title: 'Desert Safari' });

    const search = await client.get('/api/masters/sightseeing?search=Gobustan');
    expect(search.body.data.data).toHaveLength(1);

    const byDestination = await client.get(
      `/api/masters/sightseeing?destinationId=${second.destinationId}`,
    );
    expect(byDestination.body.data.data).toHaveLength(1);
    expect(byDestination.body.data.data[0].title).toBe('Desert Safari');

    const byCity = await client.get(`/api/masters/sightseeing?cityId=${first.cityId}`);
    expect(byCity.body.data.data).toHaveLength(1);
    expect(byCity.body.data.data[0].title).toBe('Gobustan Tour');
  });

  it('reorders rows within a city and stops at the boundary', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const first = await createSightseeing(client, geo, { title: 'First', sequence: 1 });
    const second = await createSightseeing(client, geo, { title: 'Second', sequence: 2 });

    const moved = await client.patch(`/api/masters/sightseeing/${second.id}/reorder`, {
      direction: 'UP',
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data.sequence).toBe(1);
    const firstAfter = await db.sightseeing.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstAfter.sequence).toBe(2);

    // Already top of its group: a no-op rather than an error.
    const atBoundary = await client.patch(`/api/masters/sightseeing/${second.id}/reorder`, {
      direction: 'UP',
    });
    expect(atBoundary.status).toBe(200);
    expect(atBoundary.body.data.sequence).toBe(1);
  });

  it('archives, filters by status and restores', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo);

    expect((await client.delete(`/api/masters/sightseeing/${row.id}`)).status).toBe(200);
    expect((await client.get('/api/masters/sightseeing')).body.data.data).toHaveLength(0);
    expect(
      (await client.get('/api/masters/sightseeing?status=ARCHIVED')).body.data.data,
    ).toHaveLength(1);

    const restored = await client.patch(`/api/masters/sightseeing/${row.id}/status`, {
      status: 'ACTIVE',
    });
    expect(restored.body.data.status).toBe('ACTIVE');
    const stored = await db.sightseeing.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.deletedAt).toBeNull();
  });

  it('reports summary statistics for the tenant', async () => {
    const client = await owner();
    const first = await createGeo(client, 'Baku', 'Azerbaijan');
    const second = await createGeo(client, 'Dubai', 'UAE');
    await createSightseeing(client, first, { title: 'One' });
    await createSightseeing(client, second, { title: 'Two' });

    const summary = await client.get('/api/masters/sightseeing/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({
      totalAttractions: 2,
      destinations: 2,
      citiesCovered: 2,
      withImages: 0,
    });
  });

  it('returns active rows through the lookup endpoint only', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const active = await createSightseeing(client, geo, { title: 'Lookup Active' });
    const archived = await createSightseeing(client, geo, {
      title: 'Lookup Archived',
      sequence: 2,
    });
    await client.delete(`/api/masters/sightseeing/${archived.id}`);

    const lookups = await client.get('/api/masters/sightseeing/lookups');
    expect(lookups.body.data.sightseeings).toHaveLength(1);
    expect(lookups.body.data.sightseeings[0].id).toBe(active.id);
    // Selector payloads stay lightweight.
    expect(lookups.body.data.sightseeings[0]).not.toHaveProperty('description');
    expect(lookups.body.data.sightseeings[0]).not.toHaveProperty('remarks');
  });

  it('isolates sightseeing between companies', async () => {
    const a = await owner('a@sa.test', 'Company A');
    const b = await owner('b@sa.test', 'Company B');
    const geo = await createGeo(a);
    const row = await createSightseeing(a, geo);

    expect((await b.get('/api/masters/sightseeing')).body.data.data).toHaveLength(0);
    expect((await b.get(`/api/masters/sightseeing/${row.id}`)).status).toBe(404);
    expect((await b.patch(`/api/masters/sightseeing/${row.id}`, { title: 'Hijack' })).status).toBe(
      404,
    );
    expect((await b.delete(`/api/masters/sightseeing/${row.id}`)).status).toBe(404);
    expect((await b.get('/api/masters/sightseeing/summary')).body.data.totalAttractions).toBe(0);
  });

  it('ignores a companyId supplied in the request body', async () => {
    const a = await owner('a@sa.test', 'Company A');
    await owner('b@sa.test', 'Company B');
    const companyB = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'b@sa.test' } });
    const geo = await createGeo(a);

    const created = await a.post('/api/masters/sightseeing', {
      destinationId: geo.destinationId,
      cityId: geo.cityId,
      title: 'Tenant Test',
      sequence: 1,
      status: 'ACTIVE',
      companyId: companyB.companyId,
    });
    expect(created.status).toBe(201);
    const stored = await db.sightseeing.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.companyId).not.toBe(companyB.companyId);
  });

  it('enforces permissions for a view-only role', async () => {
    const ownerClient = await owner();
    const geo = await createGeo(ownerClient);
    const row = await createSightseeing(ownerClient, geo);

    const viewOnly = await roleClient('owner@sa.test', 'View Only', 'viewonly@sa.test');
    expect((await viewOnly.get('/api/masters/sightseeing')).status).toBe(200);
    expect(
      (
        await viewOnly.post('/api/masters/sightseeing', {
          destinationId: geo.destinationId,
          cityId: geo.cityId,
          title: 'Nope',
          sequence: 1,
        })
      ).status,
    ).toBe(403);
    expect(
      (await viewOnly.patch(`/api/masters/sightseeing/${row.id}`, { title: 'No' })).status,
    ).toBe(403);
    expect(
      (await viewOnly.patch(`/api/masters/sightseeing/${row.id}/reorder`, { direction: 'UP' }))
        .status,
    ).toBe(403);
    expect((await viewOnly.delete(`/api/masters/sightseeing/${row.id}`)).status).toBe(403);
  });

  it('validates image MIME type and size, and scopes the key to the tenant', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo);

    expect(
      (
        await client.post(`/api/masters/sightseeing/${row.id}/image/upload`, {
          fileName: 'tour.svg',
          mimeType: 'image/svg+xml',
          fileSize: 10,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client.post(`/api/masters/sightseeing/${row.id}/image/upload`, {
          fileName: 'tour.png',
          mimeType: 'image/png',
          fileSize: 50 * 1024 * 1024,
        })
      ).status,
    ).toBe(400);

    const body = Buffer.from('sightseeing-image');
    const approval = await client.post(`/api/masters/sightseeing/${row.id}/image/upload`, {
      fileName: '../../Tour.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    expect(JSON.stringify(approval.body.data)).not.toContain('companies/');

    const pending = await db.sightseeing.findUniqueOrThrow({ where: { id: row.id } });
    expect(pending.pendingImageObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/sightseeing/${row.id}/images/`),
    );
    expect(pending.pendingImageObjectKey).not.toContain('..');

    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/sightseeing/${row.id}/image/confirm`);
    expect(confirmed.body.data).toMatchObject({ hasImage: true, imageMimeType: 'image/png' });
    expect(confirmed.body.data).not.toHaveProperty('imageObjectKey');

    const download = await client.get(`/api/masters/sightseeing/${row.id}/image/download-url`);
    expect(download.body.data.url).toMatch(/^memory:\/\/download\//);
    expect((await client.delete(`/api/masters/sightseeing/${row.id}/image`)).status).toBe(200);
  });

  it('writes activity logs for the sightseeing lifecycle', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo);
    await client.patch(`/api/masters/sightseeing/${row.id}`, { title: 'Audited Tour' });
    await client.delete(`/api/masters/sightseeing/${row.id}`);
    await client.patch(`/api/masters/sightseeing/${row.id}/status`, { status: 'ACTIVE' });

    const logs = await db.activityLog.findMany({ where: { entityId: row.id } });
    const actions = logs.map((log) => log.action);
    expect(actions).toContain('SIGHTSEEING_CREATED');
    expect(actions).toContain('SIGHTSEEING_UPDATED');
    expect(actions).toContain('SIGHTSEEING_ARCHIVED');
    expect(actions).toContain('SIGHTSEEING_RESTORED');
    // Logs must never carry storage keys or whole rich-text documents.
    expect(JSON.stringify(logs)).not.toContain('companies/');
    expect(JSON.stringify(logs)).not.toContain('Begin your exploration');
  });
});

// ---------------------------------------------------------------------------
// Add-On Services
// ---------------------------------------------------------------------------

describe('Add-on services master', () => {
  it('creates a service and returns a safe payload', async () => {
    const client = await owner();
    const service = await createService(client);

    const detail = await client.get(`/api/masters/add-on-services/${service.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      name: 'Singapore Visa',
      price: 3800,
      currency: 'INR',
      status: 'ACTIVE',
    });
    expect(detail.body.data).not.toHaveProperty('companyId');
    expect(detail.body.data).not.toHaveProperty('normalizedName');
  });

  it('defaults the price to zero when omitted', async () => {
    const client = await owner();
    const response = await client.post('/api/masters/add-on-services', {
      name: 'Arrival Card',
      status: 'ACTIVE',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.price).toBe(0);
  });

  it('rejects a duplicate service name', async () => {
    const client = await owner();
    await createService(client, { name: 'Travel Insurance' });
    const duplicate = await client.post('/api/masters/add-on-services', {
      name: 'travel insurance',
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
  });

  it('validates the name and price', async () => {
    const client = await owner();
    expect((await client.post('/api/masters/add-on-services', { name: '' })).status).toBe(400);
    expect(
      (await client.post('/api/masters/add-on-services', { name: 'Negative', price: -5 })).status,
    ).toBe(400);
    expect(
      (await client.post('/api/masters/add-on-services', { name: 'Huge', price: 100_000_000 }))
        .status,
    ).toBe(400);
  });

  it('updates a service', async () => {
    const client = await owner();
    const service = await createService(client);
    const updated = await client.patch(`/api/masters/add-on-services/${service.id}`, {
      price: 4200,
      status: 'INACTIVE',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ price: 4200, status: 'INACTIVE' });
  });

  it('searches by name', async () => {
    const client = await owner();
    await createService(client, { name: 'Bali eVISA' });
    await createService(client, { name: 'Ferry Service' });

    const search = await client.get('/api/masters/add-on-services?search=Ferry');
    expect(search.body.data.data).toHaveLength(1);
    expect(search.body.data.data[0].name).toBe('Ferry Service');
  });

  it('archives, filters by status and restores', async () => {
    const client = await owner();
    const service = await createService(client);

    expect((await client.delete(`/api/masters/add-on-services/${service.id}`)).status).toBe(200);
    expect((await client.get('/api/masters/add-on-services')).body.data.data).toHaveLength(0);
    expect(
      (await client.get('/api/masters/add-on-services?status=ARCHIVED')).body.data.data,
    ).toHaveLength(1);

    const restored = await client.patch(`/api/masters/add-on-services/${service.id}/status`, {
      status: 'ACTIVE',
    });
    expect(restored.body.data.status).toBe('ACTIVE');
    const stored = await db.addOnService.findUniqueOrThrow({ where: { id: service.id } });
    expect(stored.deletedAt).toBeNull();
  });

  it('returns active services through the lookup endpoint only', async () => {
    const client = await owner();
    const active = await createService(client, { name: 'Lookup Active' });
    const archived = await createService(client, { name: 'Lookup Archived' });
    await client.delete(`/api/masters/add-on-services/${archived.id}`);

    const lookups = await client.get('/api/masters/add-on-services/lookups');
    expect(lookups.body.data.addOnServices).toHaveLength(1);
    expect(lookups.body.data.addOnServices[0].id).toBe(active.id);
    expect(lookups.body.data.addOnServices[0]).not.toHaveProperty('description');
  });

  it('isolates services between companies', async () => {
    const a = await owner('a@sa.test', 'Company A');
    const b = await owner('b@sa.test', 'Company B');
    const service = await createService(a);

    expect((await b.get('/api/masters/add-on-services')).body.data.data).toHaveLength(0);
    expect((await b.get(`/api/masters/add-on-services/${service.id}`)).status).toBe(404);
    expect(
      (await b.patch(`/api/masters/add-on-services/${service.id}`, { name: 'Hijack' })).status,
    ).toBe(404);
    expect((await b.delete(`/api/masters/add-on-services/${service.id}`)).status).toBe(404);
  });

  it('enforces permissions for a view-only role', async () => {
    const ownerClient = await owner();
    const service = await createService(ownerClient);

    const viewOnly = await roleClient('owner@sa.test', 'View Only', 'viewonly@sa.test');
    expect((await viewOnly.get('/api/masters/add-on-services')).status).toBe(200);
    expect((await viewOnly.post('/api/masters/add-on-services', { name: 'Nope' })).status).toBe(
      403,
    );
    expect(
      (await viewOnly.patch(`/api/masters/add-on-services/${service.id}`, { name: 'No' })).status,
    ).toBe(403);
    expect((await viewOnly.delete(`/api/masters/add-on-services/${service.id}`)).status).toBe(403);
  });

  it('writes activity logs for the service lifecycle', async () => {
    const client = await owner();
    const service = await createService(client);
    await client.patch(`/api/masters/add-on-services/${service.id}`, { price: 100 });
    await client.delete(`/api/masters/add-on-services/${service.id}`);
    await client.patch(`/api/masters/add-on-services/${service.id}/status`, { status: 'ACTIVE' });

    const actions = (await db.activityLog.findMany({ where: { entityId: service.id } })).map(
      (log) => log.action,
    );
    expect(actions).toContain('ADD_ON_SERVICE_CREATED');
    expect(actions).toContain('ADD_ON_SERVICE_UPDATED');
    expect(actions).toContain('ADD_ON_SERVICE_ARCHIVED');
    expect(actions).toContain('ADD_ON_SERVICE_RESTORED');
  });
});
