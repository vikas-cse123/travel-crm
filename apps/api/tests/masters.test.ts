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

async function owner(email = 'owner@masters.test', companyName = 'Master Travel') {
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

async function createCity(client: Awaited<ReturnType<typeof owner>>, name = 'Jaipur') {
  const response = await client.post('/api/masters/cities', {
    countryCode: 'IN',
    name,
    airportCode: name === 'Jaipur' ? 'JAI' : null,
    status: 'ACTIVE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

async function createDestination(
  client: Awaited<ReturnType<typeof owner>>,
  cityIds: string[],
  name = 'Rajasthan Highlights',
) {
  const response = await client.post('/api/masters/destinations', {
    countryCode: 'IN',
    name,
    destinationType: 'DOMESTIC',
    cityIds,
    inclusions: '<p>Breakfast and <strong>transfers</strong></p>',
    exclusions: null,
    paymentPolicies: null,
    cancellationPolicies: null,
    bookingTerms: null,
    status: 'ACTIVE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; cities: Array<{ cityId: string }> };
}

describe('Phase 13A cities and destinations masters', () => {
  it('validates city input and supports pagination, search, country, status, and sorting', async () => {
    const client = await owner();
    expect(
      (
        await client.post('/api/masters/cities', {
          countryCode: 'IN',
          name: '',
          airportCode: 'DE',
        })
      ).status,
    ).toBe(400);
    await createCity(client, 'Udaipur');
    const jaipur = await createCity(client);
    await client.patch(`/api/masters/cities/${jaipur.id}/status`, { status: 'INACTIVE' });
    const otherCountry = await client.post('/api/masters/cities', {
      countryCode: 'AE',
      name: 'Udaipur',
      airportCode: null,
      status: 'ACTIVE',
    });
    expect(otherCountry.status).toBe(201);
    const result = await client.get(
      '/api/masters/cities?page=1&pageSize=1&search=udai&country=IN&status=ACTIVE&sortBy=name&sortOrder=desc',
    );
    expect(result.status).toBe(200);
    expect(result.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(result.body.data.data[0]).toMatchObject({ name: 'Udaipur', countryCode: 'IN' });
  });

  it('provides country lookups and normalized, tenant-scoped city CRUD', async () => {
    const client = await owner();
    const lookup = await client.get('/api/masters/cities/lookups?country=IN&search=jai');
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.countries).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'IN', name: 'India' })]),
    );

    const city = await createCity(client);
    const duplicate = await client.post('/api/masters/cities', {
      countryCode: 'in',
      name: '  JAIPUR  ',
      airportCode: 'jai',
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
    const updated = await client.patch(`/api/masters/cities/${city.id}`, {
      name: 'Jaipur City',
      airportCode: 'JAI',
    });
    expect(updated.body.data).toMatchObject({
      countryCode: 'IN',
      countryName: 'India',
      name: 'Jaipur City',
      airportCode: 'JAI',
    });
    expect(updated.body.data).not.toHaveProperty('companyId');
    expect(updated.body.data).not.toHaveProperty('normalizedName');

    const other = await owner('other@masters.test', 'Other Master Travel');
    expect((await other.get(`/api/masters/cities/${city.id}`)).status).toBe(404);
  });

  it('creates ordered same-country destination cities and sanitizes rich text', async () => {
    const client = await owner();
    const jaipur = await createCity(client);
    const jodhpur = await createCity(client, 'Jodhpur');
    const destination = await createDestination(client, [jaipur.id, jodhpur.id]);
    const updated = await client.patch(`/api/masters/destinations/${destination.id}`, {
      cityIds: [jodhpur.id, jaipur.id],
      inclusions:
        '<p onclick="steal()">Safe</p><script>alert(1)</script><a href="javascript:bad">Link</a>',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.cities.map((link: { cityId: string }) => link.cityId)).toEqual([
      jodhpur.id,
      jaipur.id,
    ]);
    expect(updated.body.data.inclusions).toContain('<p>Safe</p>');
    expect(updated.body.data.inclusions).not.toContain('onclick');
    expect(updated.body.data.inclusions).not.toContain('<script');
    expect(updated.body.data.inclusions).not.toContain('javascript:');
    expect(updated.body.data).not.toHaveProperty('imageObjectKey');

    const dubai = await client.post('/api/masters/cities', {
      countryCode: 'AE',
      name: 'Dubai',
      airportCode: 'DXB',
      status: 'ACTIVE',
    });
    expect(
      (
        await client.patch(`/api/masters/destinations/${destination.id}`, {
          cityIds: [dubai.body.data.id],
        })
      ).status,
    ).toBe(400);
  });

  it('supports domestic/international uniqueness, destination filters, counts, and isolation', async () => {
    const client = await owner();
    const jaipur = await createCity(client);
    const domestic = await createDestination(client, [jaipur.id]);
    const duplicate = await client.post('/api/masters/destinations', {
      countryCode: 'IN',
      name: '  RAJASTHAN HIGHLIGHTS ',
      destinationType: 'INTERNATIONAL',
      cityIds: [jaipur.id],
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
    const international = await client.post('/api/masters/destinations', {
      countryCode: 'IN',
      name: 'International India Circuit',
      destinationType: 'INTERNATIONAL',
      cityIds: [jaipur.id],
      status: 'ACTIVE',
    });
    expect(international.status).toBe(201);
    const list = await client.get(
      `/api/masters/destinations?page=1&pageSize=1&search=international&country=IN&destinationType=INTERNATIONAL&cityId=${jaipur.id}&sortBy=cityCount&sortOrder=desc`,
    );
    expect(list.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(list.body.data.data[0]).toMatchObject({
      id: international.body.data.id,
      destinationType: 'INTERNATIONAL',
      _count: { cities: 1 },
    });
    const other = await owner('isolated@masters.test', 'Isolated Masters');
    expect((await other.get(`/api/masters/destinations/${domestic.id}`)).status).toBe(404);
    expect(
      (
        await other.post(`/api/masters/destinations/${domestic.id}/cities`, {
          cityId: jaipur.id,
        })
      ).status,
    ).toBe(404);
  });

  it('archives without hard deletion and preserves destination relationships', async () => {
    const client = await owner();
    const city = await createCity(client);
    const destination = await createDestination(client, [city.id]);
    expect((await client.delete(`/api/masters/cities/${city.id}`)).status).toBe(200);
    const storedCity = await db.city.findUniqueOrThrow({ where: { id: city.id } });
    expect(storedCity).toMatchObject({ status: 'ARCHIVED' });
    expect(storedCity.deletedAt).not.toBeNull();
    const detail = await client.get(`/api/masters/destinations/${destination.id}`);
    expect(detail.body.data.cities[0].city).toMatchObject({ id: city.id, status: 'ARCHIVED' });
    expect((await client.delete(`/api/masters/destinations/${destination.id}`)).status).toBe(200);
    expect(await db.destination.count({ where: { id: destination.id } })).toBe(1);
  });

  it('enforces role permissions and active-only visibility for read-only roles', async () => {
    const client = await owner();
    const active = await createCity(client);
    const inactive = await createCity(client, 'Udaipur');
    await client.patch(`/api/masters/cities/${inactive.id}/status`, { status: 'INACTIVE' });
    const sales = await roleClient('owner@masters.test', 'Sales Executive', 'sales@masters.test');
    const salesList = await sales.get('/api/masters/cities?status=INACTIVE');
    expect(salesList.status).toBe(200);
    expect(salesList.body.data.data.map((row: { id: string }) => row.id)).toEqual([active.id]);
    expect(
      (
        await sales.post('/api/masters/cities', {
          countryCode: 'IN',
          name: 'Pushkar',
          status: 'ACTIVE',
        })
      ).status,
    ).toBe(403);

    const dataEntry = await roleClient(
      'owner@masters.test',
      'Data Entry',
      'data-entry@masters.test',
    );
    expect(
      (
        await dataEntry.post('/api/masters/cities', {
          countryCode: 'IN',
          name: 'Pushkar',
          status: 'ACTIVE',
        })
      ).status,
    ).toBe(201);
    expect((await dataEntry.delete(`/api/masters/cities/${active.id}`)).status).toBe(403);
  });

  it('approves, verifies, serves and deletes tenant-keyed destination images', async () => {
    const client = await owner();
    const city = await createCity(client);
    const destination = await createDestination(client, [city.id]);
    const body = Buffer.from('fake-png-content');
    const approval = await client.post(`/api/masters/destinations/${destination.id}/image/upload`, {
      fileName: '../../Palace View.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    expect(approval.body.data.uploadUrl).toMatch(/^memory:\/\/upload\//);
    expect(JSON.stringify(approval.body.data)).not.toContain('companies/');
    const pending = await db.destination.findUniqueOrThrow({ where: { id: destination.id } });
    expect(pending.pendingImageObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/destinations/${destination.id}/images/`),
    );
    expect(pending.pendingImageObjectKey).not.toContain('..');
    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(
      `/api/masters/destinations/${destination.id}/image/confirm`,
    );
    expect(confirmed.body.data).toMatchObject({ hasImage: true, imageMimeType: 'image/png' });
    expect(confirmed.body.data).not.toHaveProperty('imageObjectKey');
    const download = await client.get(
      `/api/masters/destinations/${destination.id}/image/download-url`,
    );
    expect(download.body.data.url).toMatch(/^memory:\/\/download\//);
    expect((await client.delete(`/api/masters/destinations/${destination.id}/image`)).status).toBe(
      200,
    );
    expect(
      (storageService as MemoryStorageService).read(pending.pendingImageObjectKey!),
    ).toBeUndefined();
  });

  it('rejects unsafe image metadata and preserves the active image until replacement confirms', async () => {
    const client = await owner();
    const city = await createCity(client);
    const destination = await createDestination(client, [city.id]);
    expect(
      (
        await client.post(`/api/masters/destinations/${destination.id}/image/upload`, {
          fileName: 'payload.svg',
          mimeType: 'image/svg+xml',
          fileSize: 10,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await client.post(`/api/masters/destinations/${destination.id}/image/upload`, {
          fileName: 'too-large.png',
          mimeType: 'image/png',
          fileSize: 6 * 1024 * 1024,
        })
      ).status,
    ).toBe(400);

    const firstBody = Buffer.from('first-image');
    await client.post(`/api/masters/destinations/${destination.id}/image/upload`, {
      fileName: 'first.png',
      mimeType: 'image/png',
      fileSize: firstBody.length,
    });
    let row = await db.destination.findUniqueOrThrow({ where: { id: destination.id } });
    const firstKey = row.pendingImageObjectKey!;
    await (storageService as MemoryStorageService).putObject({
      key: firstKey,
      body: firstBody,
      contentType: 'image/png',
    });
    await client.post(`/api/masters/destinations/${destination.id}/image/confirm`);

    const secondBody = Buffer.from('second-image');
    await client.post(`/api/masters/destinations/${destination.id}/image/upload`, {
      fileName: 'second.webp',
      mimeType: 'image/webp',
      fileSize: secondBody.length,
    });
    row = await db.destination.findUniqueOrThrow({ where: { id: destination.id } });
    expect(row.imageObjectKey).toBe(firstKey);
    expect((storageService as MemoryStorageService).read(firstKey)).toEqual(firstBody);
    await (storageService as MemoryStorageService).putObject({
      key: row.pendingImageObjectKey!,
      body: secondBody,
      contentType: 'image/webp',
    });
    await client.post(`/api/masters/destinations/${destination.id}/image/confirm`);
    expect((storageService as MemoryStorageService).read(firstKey)).toBeUndefined();
  });

  it('records city, destination, link and image changes in the audit log', async () => {
    const client = await owner();
    const city = await createCity(client);
    const second = await createCity(client, 'Jodhpur');
    const destination = await createDestination(client, [city.id]);
    await client.post(`/api/masters/destinations/${destination.id}/cities`, { cityId: second.id });
    await client.post(`/api/masters/destinations/${destination.id}/cities/reorder`, {
      cityIds: [second.id, city.id],
    });
    await client.delete(`/api/masters/destinations/${destination.id}/cities/${city.id}`);
    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'CITY_CREATED',
        'DESTINATION_CREATED',
        'DESTINATION_CITY_ADDED',
        'DESTINATION_CITY_REORDERED',
        'DESTINATION_CITY_REMOVED',
      ]),
    );
  });
});
