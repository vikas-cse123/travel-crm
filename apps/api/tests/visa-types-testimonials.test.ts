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

type Client = ReturnType<typeof createAuthClient>;

async function owner(email = 'owner@vt.test', companyName = 'Visa Travel') {
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

async function createDestination(client: Client, name = 'Thailand') {
  const city = await client.post('/api/masters/cities', {
    countryCode: 'TH',
    name: 'Bangkok',
    status: 'ACTIVE',
  });
  expect(city.status).toBe(201);
  const destination = await client.post('/api/masters/destinations', {
    countryCode: 'TH',
    name,
    destinationType: 'INTERNATIONAL',
    cityIds: [city.body.data.id],
    status: 'ACTIVE',
  });
  expect(destination.status).toBe(201);
  return destination.body.data as { id: string };
}

describe('Phase 21 visa types master', () => {
  it('creates a visa type with ordered sections and validates the destination', async () => {
    const client = await owner();
    const destination = await createDestination(client);
    const created = await client.post('/api/masters/visa-types', {
      destinationId: destination.id,
      name: 'Tourist Visa',
      status: 'ACTIVE',
      sections: [
        { title: 'Overview', content: '<p onclick="x()">Visa <strong>overview</strong></p>' },
        { title: 'Visa Fees', content: '<p>USD 40</p>' },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Tourist Visa' });
    expect(created.body.data.sections).toHaveLength(2);
    expect(created.body.data.sections[0]).toMatchObject({ title: 'Overview', sequence: 0 });
    // Rich text is sanitized.
    expect(created.body.data.sections[0].content).toContain('<strong>overview</strong>');
    expect(created.body.data.sections[0].content).not.toContain('onclick');
    expect(created.body.data).not.toHaveProperty('companyId');
    expect(created.body.data._count).toMatchObject({ sections: 2 });

    // A destination that does not exist for this tenant is rejected server-side.
    const other = await owner('other@vt.test', 'Other Visa Travel');
    const otherDest = await createDestination(other, 'Malaysia');
    const invalid = await client.post('/api/masters/visa-types', {
      destinationId: otherDest.id,
      name: 'Business Visa',
    });
    expect(invalid.status).toBe(400);
  });

  it('rejects a missing name and a duplicate name within the same destination', async () => {
    const client = await owner();
    const destination = await createDestination(client);
    expect(
      (await client.post('/api/masters/visa-types', { destinationId: destination.id })).status,
    ).toBe(400);
    expect(
      (
        await client.post('/api/masters/visa-types', {
          destinationId: destination.id,
          name: 'Tourist Visa',
        })
      ).status,
    ).toBe(201);
    const dup = await client.post('/api/masters/visa-types', {
      destinationId: destination.id,
      name: '  TOURIST VISA ',
    });
    expect(dup.status).toBe(409);
  });

  it('lists with search, destination and status filters plus pagination, and replaces sections on update', async () => {
    const client = await owner();
    const destination = await createDestination(client);
    const a = await client.post('/api/masters/visa-types', {
      destinationId: destination.id,
      name: 'Tourist Visa',
      sections: [{ title: 'Overview', content: '<p>a</p>' }],
    });
    await client.post('/api/masters/visa-types', {
      destinationId: destination.id,
      name: 'Business Visa',
    });
    const list = await client.get(
      `/api/masters/visa-types?page=1&pageSize=10&search=tourist&destinationId=${destination.id}&status=ACTIVE`,
    );
    expect(list.body.data.pagination).toMatchObject({ total: 1 });
    expect(list.body.data.data[0]).toMatchObject({ name: 'Tourist Visa' });

    const updated = await client.patch(`/api/masters/visa-types/${a.body.data.id}`, {
      sections: [
        { title: 'Requirements', content: '<p>passport</p>' },
        { title: 'Fees', content: '<p>USD 50</p>' },
      ],
    });
    expect(updated.body.data.sections).toHaveLength(2);
    expect(updated.body.data.sections.map((s: { title: string }) => s.title)).toEqual([
      'Requirements',
      'Fees',
    ]);
  });

  it('archives without hard delete, excludes archived from read-only roles, and isolates tenants', async () => {
    const client = await owner();
    const destination = await createDestination(client);
    const visa = await client.post('/api/masters/visa-types', {
      destinationId: destination.id,
      name: 'Tourist Visa',
    });
    expect((await client.delete(`/api/masters/visa-types/${visa.body.data.id}`)).status).toBe(200);
    const stored = await db.visaType.findUniqueOrThrow({ where: { id: visa.body.data.id } });
    expect(stored).toMatchObject({ status: 'ARCHIVED' });
    expect(stored.deletedAt).not.toBeNull();

    // A read-only role cannot see archived rows even when filtering for them.
    const viewer = await roleClient('owner@vt.test', 'View Only', 'viewer@vt.test');
    const viewerList = await viewer.get('/api/masters/visa-types?status=ARCHIVED');
    expect(viewerList.status).toBe(200);
    expect(viewerList.body.data.data).toHaveLength(0);

    const other = await owner('iso@vt.test', 'Iso Visa');
    expect((await other.get(`/api/masters/visa-types/${visa.body.data.id}`)).status).toBe(404);
  });

  it('enforces permissions and records activity for create/update/archive', async () => {
    const client = await owner();
    const destination = await createDestination(client);
    const visa = await client.post('/api/masters/visa-types', {
      destinationId: destination.id,
      name: 'Tourist Visa',
    });
    const viewer = await roleClient('owner@vt.test', 'View Only', 'viewer@vt.test');
    expect(
      (
        await viewer.post('/api/masters/visa-types', {
          destinationId: destination.id,
          name: 'Blocked',
        })
      ).status,
    ).toBe(403);
    expect((await viewer.delete(`/api/masters/visa-types/${visa.body.data.id}`)).status).toBe(403);

    await client.patch(`/api/masters/visa-types/${visa.body.data.id}`, { name: 'Tourist Visa 2' });
    await client.delete(`/api/masters/visa-types/${visa.body.data.id}`);
    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining(['VISA_TYPE_CREATED', 'VISA_TYPE_UPDATED', 'VISA_TYPE_ARCHIVED']),
    );
  });
});

describe('Phase 21 testimonials master', () => {
  async function createTestimonial(client: Client, overrides: Record<string, unknown> = {}) {
    return client.post('/api/masters/testimonials', {
      clientName: 'Asha Rao',
      destinationName: 'Bali',
      description: 'Wonderful trip, superbly organised.',
      isVisible: true,
      status: 'ACTIVE',
      ...overrides,
    });
  }

  it('creates a testimonial, allows anonymous, and validates required fields', async () => {
    const client = await owner();
    const created = await createTestimonial(client);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      clientName: 'Asha Rao',
      destinationName: 'Bali',
      isVisible: true,
      hasImage: false,
    });
    expect(created.body.data).not.toHaveProperty('companyId');
    expect(created.body.data).not.toHaveProperty('imageObjectKey');

    // clientName is optional (anonymous testimonial).
    const anon = await createTestimonial(client, { clientName: '' });
    expect(anon.status).toBe(201);
    expect(anon.body.data.clientName).toBeNull();

    // destinationName and description are required.
    expect((await createTestimonial(client, { destinationName: '' })).status).toBe(400);
    expect((await createTestimonial(client, { description: '' })).status).toBe(400);
  });

  it('lists with search, status filter and pagination; updates and toggles visibility', async () => {
    const client = await owner();
    const a = await createTestimonial(client, { destinationName: 'Bali', clientName: 'Asha' });
    await createTestimonial(client, { destinationName: 'Dubai', clientName: 'Vikram' });
    const list = await client.get(
      '/api/masters/testimonials?page=1&pageSize=10&search=bali&status=ACTIVE',
    );
    expect(list.body.data.pagination).toMatchObject({ total: 1 });
    expect(list.body.data.data[0]).toMatchObject({ destinationName: 'Bali' });

    const updated = await client.patch(`/api/masters/testimonials/${a.body.data.id}`, {
      isVisible: false,
      description: 'Updated review.',
    });
    expect(updated.body.data).toMatchObject({ isVisible: false, description: 'Updated review.' });
  });

  it('archives softly, excludes archived from read-only roles, isolates tenants, and enforces permissions', async () => {
    const client = await owner();
    const t = await createTestimonial(client);
    const viewer = await roleClient('owner@vt.test', 'View Only', 'viewer@vt.test');
    expect(
      (await viewer.post('/api/masters/testimonials', { destinationName: 'X', description: 'Y' }))
        .status,
    ).toBe(403);

    expect((await client.delete(`/api/masters/testimonials/${t.body.data.id}`)).status).toBe(200);
    expect(await db.testimonial.count({ where: { id: t.body.data.id, status: 'ARCHIVED' } })).toBe(
      1,
    );
    const viewerList = await viewer.get('/api/masters/testimonials?status=ARCHIVED');
    expect(viewerList.body.data.data).toHaveLength(0);

    const other = await owner('iso2@vt.test', 'Iso Testi');
    expect((await other.get(`/api/masters/testimonials/${t.body.data.id}`)).status).toBe(404);
  });

  it('approves, verifies and deletes a tenant-keyed testimonial image and rejects unsafe uploads', async () => {
    const client = await owner();
    const t = (await createTestimonial(client)).body.data as { id: string };

    expect(
      (
        await client.post(`/api/masters/testimonials/${t.id}/image/upload`, {
          fileName: 'x.svg',
          mimeType: 'image/svg+xml',
          fileSize: 10,
        })
      ).status,
    ).toBe(400);

    const body = Buffer.from('client-photo');
    const approval = await client.post(`/api/masters/testimonials/${t.id}/image/upload`, {
      fileName: '../../Client.png',
      mimeType: 'image/png',
      fileSize: body.length,
    });
    expect(approval.status).toBe(201);
    expect(JSON.stringify(approval.body.data)).not.toContain('companies/');
    const pending = await db.testimonial.findUniqueOrThrow({ where: { id: t.id } });
    expect(pending.pendingImageObjectKey).toMatch(
      new RegExp(`^companies/${pending.companyId}/masters/testimonials/${t.id}/images/`),
    );
    expect(pending.pendingImageObjectKey).not.toContain('..');
    await (storageService as MemoryStorageService).putObject({
      key: pending.pendingImageObjectKey!,
      body,
      contentType: 'image/png',
    });
    const confirmed = await client.post(`/api/masters/testimonials/${t.id}/image/confirm`);
    expect(confirmed.body.data).toMatchObject({ hasImage: true, imageMimeType: 'image/png' });
    expect(confirmed.body.data).not.toHaveProperty('imageObjectKey');
    const download = await client.get(`/api/masters/testimonials/${t.id}/image/download-url`);
    expect(download.body.data.url).toMatch(/^memory:\/\/download\//);
    expect((await client.delete(`/api/masters/testimonials/${t.id}/image`)).status).toBe(200);

    const actions = (await db.activityLog.findMany()).map((log) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'TESTIMONIAL_CREATED',
        'TESTIMONIAL_IMAGE_UPLOADED',
        'TESTIMONIAL_IMAGE_DELETED',
      ]),
    );
  });
});
