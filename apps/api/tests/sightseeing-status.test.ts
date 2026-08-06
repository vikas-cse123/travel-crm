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

async function owner(email = 'owner@ss.test', companyName = 'Sight Status Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

async function createGeo(client: Client, cityName = 'Singapore', destinationName = 'Singapore') {
  const city = await client.post('/api/masters/cities', {
    countryCode: 'SG',
    name: cityName,
    status: 'ACTIVE',
  });
  expect(city.status).toBe(201);
  const cityId = city.body.data.id as string;
  const destination = await client.post('/api/masters/destinations', {
    countryCode: 'SG',
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
    title: 'Departure from Singapore',
    sequence: 1,
    estimatedHours: 2,
    suggestedStartTime: '09:00',
    description: '<p>Departure transfer.</p>',
    remarks: '<p>Carry documents.</p>',
    status: 'ACTIVE',
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; title: string; sequence: number };
}

describe('Sightseeing master status and restore', () => {
  it('list supports Current statuses (excludes archived), ACTIVE, INACTIVE and ARCHIVED', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    await createSightseeing(client, geo, { title: 'Active Tour' });
    await createSightseeing(client, geo, {
      title: 'Inactive Tour',
      status: 'INACTIVE',
    });
    await createSightseeing(client, geo, {
      title: 'Archived Tour',
      status: 'ARCHIVED',
    });

    const current = await client.get('/api/masters/sightseeing?pageSize=50');
    const currentTitles = current.body.data.data.map(
      (row: { title: string }) => row.title,
    );
    expect(currentTitles).toContain('Active Tour');
    expect(currentTitles).toContain('Inactive Tour');
    expect(currentTitles).not.toContain('Archived Tour');

    const activeList = await client.get('/api/masters/sightseeing?pageSize=50&status=ACTIVE');
    expect(activeList.body.data.data.map((r: { title: string }) => r.title)).toEqual([
      'Active Tour',
    ]);

    const inactiveList = await client.get('/api/masters/sightseeing?pageSize=50&status=INACTIVE');
    expect(inactiveList.body.data.data.map((r: { title: string }) => r.title)).toEqual([
      'Inactive Tour',
    ]);

    const archivedList = await client.get('/api/masters/sightseeing?pageSize=50&status=ARCHIVED');
    expect(archivedList.body.data.data.map((r: { title: string }) => r.title)).toEqual([
      'Archived Tour',
    ]);
    expect(archivedList.body.data.data[0].status).toBe('ARCHIVED');
  });

  it('status filtering is tenant-scoped', async () => {
    const alpha = await owner('owner@alpha-ss.test', 'Alpha Sight');
    const geo = await createGeo(alpha);
    await createSightseeing(alpha, geo, { title: 'Alpha Tour' });
    const beta = await owner('owner@beta-ss.test', 'Beta Sight');
    const betaList = await beta.get('/api/masters/sightseeing?pageSize=50&status=ACTIVE');
    expect(betaList.body.data.data).toHaveLength(0);
  });

  it('restore changes the original record to ACTIVE, preserves id and clears archival metadata', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo);
    const archived = await client.delete(`/api/masters/sightseeing/${row.id}`);
    expect(archived.status).toBe(200);
    const storedAfterArchive = await db.sightseeing.findUniqueOrThrow({ where: { id: row.id } });
    expect(storedAfterArchive.deletedAt).not.toBeNull();

    const restored = await client.patch(`/api/masters/sightseeing/${row.id}/status`, {
      status: 'ACTIVE',
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.status).toBe('ACTIVE');
    expect(restored.body.data.id).toBe(row.id);
    const stored = await db.sightseeing.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.deletedAt).toBeNull();
    expect(stored.title).toBe('Departure from Singapore');
    expect(stored.destinationId).toBe(geo.destinationId);
    expect(stored.cityId).toBe(geo.cityId);
    // Restored record is visible under ACTIVE again.
    const activeList = await client.get('/api/masters/sightseeing?pageSize=50&status=ACTIVE');
    expect(activeList.body.data.data.map((r: { id: string }) => r.id)).toContain(row.id);
    // Restore activity log written.
    const log = await db.activityLog.findFirst({
      where: { entityId: row.id, action: 'SIGHTSEEING_RESTORED' },
    });
    expect(log).not.toBeNull();
  });

  it('quotation lookups exclude archived and inactive records', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    await createSightseeing(client, geo, { title: 'Active Dropdown' });
    const inactive = await createSightseeing(client, geo, {
      title: 'Inactive Dropdown',
      status: 'INACTIVE',
    });
    const archived = await createSightseeing(client, geo, {
      title: 'Archived Dropdown',
      status: 'ARCHIVED',
    });
    const lookups = await client.get('/api/masters/sightseeing/lookups');
    const titles = lookups.body.data.sightseeings.map(
      (row: { title: string }) => row.title,
    );
    expect(titles).toContain('Active Dropdown');
    expect(titles).not.toContain('Inactive Dropdown');
    expect(titles).not.toContain('Archived Dropdown');
    void inactive;
    void archived;
  });

  it('creating an active/inactive duplicate keeps normal duplicate validation', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    await createSightseeing(client, geo, { title: 'Duplicate Tour', status: 'ACTIVE' });
    const duplicate = await client.post('/api/masters/sightseeing', {
      destinationId: geo.destinationId,
      cityId: geo.cityId,
      title: 'Duplicate Tour',
      status: 'ACTIVE',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('creating an archived duplicate returns the structured archived-duplicate error', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    await createSightseeing(client, geo, {
      title: 'Departure from Singapore',
      status: 'ARCHIVED',
    });
    const response = await client.post('/api/masters/sightseeing', {
      destinationId: geo.destinationId,
      cityId: geo.cityId,
      title: 'Departure from Singapore',
      status: 'ACTIVE',
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SIGHTSEEING_ARCHIVED_DUPLICATE');
    expect(response.body.error.details).toMatchObject({
      title: 'Departure from Singapore',
      cityName: 'Singapore',
      canRestore: true,
    });
    // No new row created.
    const rows = await db.sightseeing.findMany({
      where: { cityId: geo.cityId, normalizedTitle: 'departure from singapore' },
    });
    expect(rows).toHaveLength(1);
  });

  it('unauthorized restore returns 403', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo, { status: 'ARCHIVED' });
    // Downgrade the owner to a role without the sightseeing-update permission
    // and confirm the same session can no longer restore.
    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'owner@ss.test' },
    });
    const viewOnlyRole = await db.role.findFirstOrThrow({
      where: { companyId: user.companyId, name: 'View Only' },
    });
    await db.user.update({ where: { id: user.id }, data: { roleId: viewOnlyRole.id } });
    const response = await client.patch(`/api/masters/sightseeing/${row.id}/status`, {
      status: 'ACTIVE',
    });
    expect(response.status).toBe(403);
    const stored = await db.sightseeing.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.status).toBe('ARCHIVED');
  });

  it('cross-tenant restore does not work', async () => {
    const alpha = await owner('owner@a-ss.test', 'Alpha Restore');
    const geo = await createGeo(alpha);
    const row = await createSightseeing(alpha, geo, { status: 'ARCHIVED' });
    const beta = await owner('owner@b-ss.test', 'Beta Restore');
    const response = await beta.patch(`/api/masters/sightseeing/${row.id}/status`, {
      status: 'ACTIVE',
    });
    expect([403, 404]).toContain(response.status);
    const stored = await db.sightseeing.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.status).toBe('ARCHIVED');
  });

  it('restoring a non-archived record returns a suitable result', async () => {
    const client = await owner();
    const geo = await createGeo(client);
    const row = await createSightseeing(client, geo, { title: 'Already Active' });
    const response = await client.patch(`/api/masters/sightseeing/${row.id}/status`, {
      status: 'ACTIVE',
    });
    // Setting ACTIVE on an already-active record is a valid status update.
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ACTIVE');
  });
});
