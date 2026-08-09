import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { storageService } from '../src/services/storage/storage.service.js';

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

async function owner(email = 'owner@alpha.test', companyName = 'Alpha Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

const leadPayload = (phone = '+91 98765 43210') => ({
  customerName: 'Aarav Mehta',
  phone,
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

const templatePayload = (name = 'Goa family escape') => ({
  name,
  description: 'A relaxed coastal package.',
  destinationSummary: 'Goa • Calangute • Panjim',
  durationDays: 5,
  durationNights: 4,
  baseCurrency: 'INR',
  adultBasePrice: 35000,
  childWithBedBasePrice: 22000,
  childWithoutBedBasePrice: 12000,
  infantBasePrice: 2500,
  status: 'ACTIVE',
  itinerary: [
    {
      dayNumber: 1,
      title: 'Arrival and check-in',
      destination: 'Calangute',
      description: 'Private transfer to the hotel.',
      meals: 'Breakfast',
      overnightLocation: 'Calangute',
      sequence: 1,
    },
  ],
  hotels: [
    {
      city: 'Calangute',
      hotelName: 'Coastal Bay Resort',
      category: '4 star',
      roomType: 'Deluxe',
      mealPlan: 'Breakfast',
      rooms: 1,
      nights: 4,
      internalCost: 10000.1,
      sellingPrice: 12500.25,
      selected: true,
      sequence: 1,
    },
  ],
  services: [
    {
      serviceType: 'SIGHTSEEING',
      name: 'North Goa tour',
      city: 'Goa',
      dayNumber: 2,
      quantity: 2,
      internalCost: 500.15,
      sellingPrice: 750.25,
      sequence: 1,
    },
  ],
  inclusions: [{ content: 'Daily breakfast', sequence: 1 }],
  exclusions: [{ content: 'Personal expenses', sequence: 1 }],
  terms: [{ content: 'Subject to availability', sequence: 1 }],
});

async function setup() {
  const client = await owner();
  const lead = await client.post('/api/queries', leadPayload());
  const template = await client.post('/api/quotation-templates', templatePayload());
  expect(lead.status).toBe(201);
  expect(template.status).toBe(201);
  return { client, lead: lead.body.data, template: template.body.data };
}

describe('Phase 8 quotation templates', () => {
  it('creates, searches, previews, duplicates inactive, changes status and soft deletes', async () => {
    const { client, template } = await setup();
    expect(template.templateCode).toMatch(/^QTP-000001$/);
    const list = await client.get(
      '/api/quotation-templates?search=Coastal&destination=Goa&status=ACTIVE',
    );
    expect(list.body.data.pagination.total).toBe(1);
    const preview = await client.get(`/api/quotation-templates/${template.id}/preview`);
    expect(preview.body.data.counts).toMatchObject({ cities: 1, services: 1, hotelOptions: 1 });
    expect(preview.body.data).not.toHaveProperty('internalNotes');
    expect(preview.body.data.hotels[0]).not.toHaveProperty('internalCost');
    const duplicate = await client.post(`/api/quotation-templates/${template.id}/duplicate`);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.data.status).toBe('INACTIVE');
    expect(duplicate.body.data.usageCount).toBe(0);
    expect(duplicate.body.data.name).toContain('(Copy)');
    await client.patch(`/api/quotation-templates/${duplicate.body.data.id}/status`, {
      status: 'ACTIVE',
    });
    expect((await client.delete(`/api/quotation-templates/${duplicate.body.data.id}`)).status).toBe(
      200,
    );
    expect(
      await db.quotationTemplate.count({ where: { id: duplicate.body.data.id, deletedAt: null } }),
    ).toBe(0);
  });

  it('allocates company-scoped template codes under concurrent creation', async () => {
    const client = await owner();
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        client.post('/api/quotation-templates', templatePayload(`Goa package ${index}`)),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body.data.templateCode)).size).toBe(5);
    expect((await db.quotationCounter.findFirstOrThrow()).templateValue).toBe(5);
  });

  it('enforces tenant isolation for templates', async () => {
    const { template } = await setup();
    const beta = await owner('owner@beta.test', 'Beta Travel');
    expect((await beta.get(`/api/quotation-templates/${template.id}`)).status).toBe(404);
    expect((await beta.get('/api/quotation-templates')).body.data.data).toEqual([]);
  });
});

describe('Phase 8 customer quotations', () => {
  it('creates an independent snapshot from a lead/template and calculates decimal-safe totals', async () => {
    const { client, lead, template } = await setup();
    const response = await client.post('/api/quotations', {
      queryId: lead.id,
      templateId: template.id,
      validUntil: '2026-09-01',
      version: { markupMode: 'PERCENTAGE', markupValue: 10, taxRate: 5, discountAmount: 100 },
    });
    expect(response.status).toBe(201);
    expect(response.body.data.quotationNumber).toMatch(/^QT-001000$/);
    expect(response.body.data.versions[0]).toMatchObject({
      versionNumber: 1,
      status: 'DRAFT',
      subtotalCost: '11000.4',
      subtotalSellingPrice: '14000.75',
      totalMarkup: '1400.08',
      discountAmount: '100',
      taxAmount: '765.04',
      finalAmount: '16065.87',
    });
    expect(
      (await db.quotationTemplate.findUniqueOrThrow({ where: { id: template.id } })).usageCount,
    ).toBe(1);
    await client.patch(`/api/quotation-templates/${template.id}`, { name: 'Changed later' });
    expect(
      (await client.get(`/api/quotations/${response.body.data.id}`)).body.data.versions[0].title,
    ).toBe('Goa family escape');
  });

  it('allocates quotation numbers concurrently without count plus one', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => client.post('/api/quotations', { queryId: lead.id })),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body.data.quotationNumber)).size).toBe(5);
    expect((await db.quotationCounter.findFirstOrThrow()).quotationValue).toBe(1004);
  });

  it('starts a fresh quotation sequence at QT-001000 and increments by exactly one', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const first = await client.post('/api/quotations', { queryId: lead.id });
    const second = await client.post('/api/quotations', { queryId: lead.id });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.quotationNumber).toBe('QT-001000');
    expect(second.body.data.quotationNumber).toBe('QT-001001');
    expect((await db.quotationCounter.findFirstOrThrow()).quotationValue).toBe(1001);
    // Already-issued numbers never change.
    expect(
      (await db.quotation.findUniqueOrThrow({ where: { id: first.body.data.id } })).quotationNumber,
    ).toBe('QT-001000');
    expect(
      (await db.quotation.findUniqueOrThrow({ where: { id: second.body.data.id } }))
        .quotationNumber,
    ).toBe('QT-001001');
  });

  it('jumps a legacy counter below the floor to QT-001000', async () => {
    const client = await owner();
    const companyId = (await db.company.findFirstOrThrow()).id;
    await db.quotationCounter.upsert({
      where: { companyId_year: { companyId, year: 0 } },
      create: { companyId, year: 0, quotationValue: 34 },
      update: { quotationValue: 34 },
    });
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const response = await client.post('/api/quotations', { queryId: lead.id });
    expect(response.status).toBe(201);
    expect(response.body.data.quotationNumber).toBe('QT-001000');
    // The legacy counter was raised, never lowered, and the next one continues.
    const next = await client.post('/api/quotations', { queryId: lead.id });
    expect(next.body.data.quotationNumber).toBe('QT-001001');
  });

  it('continues from an existing counter above 1000', async () => {
    const client = await owner();
    const companyId = (await db.company.findFirstOrThrow()).id;
    await db.quotationCounter.upsert({
      where: { companyId_year: { companyId, year: 0 } },
      create: { companyId, year: 0, quotationValue: 1457 },
      update: { quotationValue: 1457 },
    });
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const response = await client.post('/api/quotations', { queryId: lead.id });
    expect(response.status).toBe(201);
    expect(response.body.data.quotationNumber).toBe('QT-001458');
  });

  it('starts at QT-001000 even when a template counter exists first', async () => {
    const client = await owner();
    await client.post('/api/quotation-templates', templatePayload());
    expect((await db.quotationCounter.findFirstOrThrow()).quotationValue).toBe(0);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const response = await client.post('/api/quotations', { queryId: lead.id });
    expect(response.status).toBe(201);
    expect(response.body.data.quotationNumber).toBe('QT-001000');
  });

  it('keeps quotation counters isolated per company, both starting at 1000', async () => {
    const alpha = await owner('owner@alpha.test', 'Alpha Travel');
    const beta = await owner('owner@beta.test', 'Beta Travel');
    const leadAlpha = (await alpha.post('/api/queries', leadPayload('+91 90000 00001'))).body.data;
    const leadBeta = (await beta.post('/api/queries', leadPayload('+91 90000 00002'))).body.data;
    const a1 = await alpha.post('/api/quotations', { queryId: leadAlpha.id });
    const b1 = await beta.post('/api/quotations', { queryId: leadBeta.id });
    expect(a1.body.data.quotationNumber).toBe('QT-001000');
    expect(b1.body.data.quotationNumber).toBe('QT-001000');
    const a2 = await alpha.post('/api/quotations', { queryId: leadAlpha.id });
    const b2 = await beta.post('/api/quotations', { queryId: leadBeta.id });
    expect(a2.body.data.quotationNumber).toBe('QT-001001');
    expect(b2.body.data.quotationNumber).toBe('QT-001001');
  });

  it('finalizes immutable versions and creates revisions without overwriting history', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const first = quotation.versions[0];
    expect(
      (await client.post(`/api/quotations/${quotation.id}/versions/${first.id}/finalize`)).status,
    ).toBe(200);
    expect(
      (
        await client.patch(`/api/quotations/${quotation.id}/versions/${first.id}`, {
          title: 'Illegal edit',
        })
      ).status,
    ).toBe(409);
    const revision = await client.post(`/api/quotations/${quotation.id}/versions`, {
      sourceVersionId: first.id,
    });
    expect(revision.body.data.versionNumber).toBe(2);
    await client.patch(`/api/quotations/${quotation.id}/versions/${revision.body.data.id}`, {
      title: 'Revised package',
    });
    const versions = await client.get(`/api/quotations/${quotation.id}/versions`);
    expect(versions.body.data.map((version: { title: string }) => version.title)).toEqual([
      'Revised package',
      'Goa family escape',
    ]);
  });

  it('accepts hotels: [] and rejects empty hotel rows when hotels are supplied', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const version = quotation.versions[0];

    // Empty hotels array (hotel excluded) is a valid draft save.
    const cleared = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [],
    });
    expect(cleared.status).toBe(200);

    // An empty hotel row is still rejected when hotel data is supplied.
    const invalid = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          city: 'Goa',
          hotelName: '',
          rooms: 1,
          nights: 1,
          selected: true,
          sequence: 1,
        },
      ],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.fields['hotels.0.hotelName']).toBeDefined();

    // Valid hotel information saves successfully.
    const valid = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      hotels: [
        {
          city: 'Goa',
          hotelName: 'Coastal Bay Resort',
          rooms: 1,
          nights: 4,
          selected: true,
          sequence: 1,
        },
      ],
    });
    expect(valid.status).toBe(200);
    expect(valid.body.data.hotels[0].hotelName).toBe('Coastal Bay Resort');
  });

  it('generates and reuses a customer-safe PDF in fake private storage', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const version = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const first = await client.post(
      `/api/quotations/${quotation.id}/versions/${version.id}/generate-pdf`,
      {},
    );
    const second = await client.post(
      `/api/quotations/${quotation.id}/versions/${version.id}/generate-pdf`,
      {},
    );
    expect(first.body.data.reused).toBe(false);
    expect(second.body.data.reused).toBe(true);
    expect(await db.quotationDocument.count({ where: { quotationId: quotation.id } })).toBe(1);
    const document = await db.quotationDocument.findFirstOrThrow({
      where: { quotationId: quotation.id },
    });
    expect(document.objectKey).toContain(
      `companies/${document.companyId}/quotations/${quotation.id}/versions/${version.id}/documents/`,
    );
    expect(document.checksum).toMatch(/^[a-f0-9]{64}$/);
    await storageService.deleteObject(document.objectKey);
    const regenerated = await client.post(
      `/api/quotations/${quotation.id}/versions/${version.id}/generate-pdf`,
      {},
    );
    expect(regenerated.body.data.reused).toBe(false);
    expect(
      await db.quotationDocument.groupBy({
        by: ['status'],
        where: { quotationId: quotation.id },
        _count: true,
        orderBy: { status: 'asc' },
      }),
    ).toEqual([
      { status: 'AVAILABLE', _count: 1 },
      { status: 'FAILED', _count: 1 },
    ]);
  });

  it('sends finalized quotations, logs delivery and includes a hashed public link', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const version = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const sent = await client.post(`/api/quotations/${quotation.id}/send`, {
      quotationVersionId: version.id,
      recipientEmail: 'customer@example.test',
      cc: [],
      includePdf: true,
      includePublicLink: true,
    });
    expect(sent.status).toBe(200);
    expect(sent.body.data.publicUrl).toContain('/q/');
    expect(getMemoryEmailProvider()?.last('customer@example.test')?.text).toContain(
      quotation.quotationNumber,
    );
    const stored = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(stored.status).toBe('SENT');
    expect(stored.publicTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sent.body.data.publicUrl).not.toContain(stored.publicTokenHash!);
    expect(
      (await client.get(`/api/quotations/${quotation.id}/email-history`)).body.data[0].status,
    ).toBe('SENT');
  });

  it('validates, confirms and tenant-isolates direct attachment uploads', async () => {
    const { client, lead } = await setup();
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    expect(
      (
        await client.post(`/api/quotations/${quotation.id}/uploads`, {
          fileName: 'wrong.exe',
          mimeType: 'application/pdf',
          fileSize: 4,
          documentType: 'SUPPORTING_ATTACHMENT',
        })
      ).status,
    ).toBe(400);
    const approved = await client.post(`/api/quotations/${quotation.id}/uploads`, {
      fileName: 'voucher.pdf',
      mimeType: 'application/pdf',
      fileSize: 4,
      documentType: 'SUPPORTING_ATTACHMENT',
    });
    expect(approved.status).toBe(201);
    expect(approved.body.data.uploadUrl).toMatch(/^memory:\/\/upload\//);
    const pending = await db.quotationDocument.findUniqueOrThrow({
      where: { id: approved.body.data.documentId },
    });
    expect(pending.objectKey).toContain(
      `companies/${pending.companyId}/quotations/${quotation.id}/attachments/`,
    );
    await storageService.putObject({
      key: pending.objectKey,
      body: Buffer.from('%PDF'),
      contentType: 'application/pdf',
    });
    const confirmed = await client.post(
      `/api/quotations/${quotation.id}/uploads/${pending.id}/confirm`,
    );
    expect(confirmed.body.data.status).toBe('AVAILABLE');
    const beta = await owner('owner@beta.test', 'Beta Travel');
    expect(
      (await beta.get(`/api/quotations/${quotation.id}/documents/${pending.id}/download-url`))
        .status,
    ).toBe(404);
  });

  it('tracks a public view, excludes costing, accepts once and protects terminal state', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const version = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    const token = link.body.data.url.split('/q/')[1];
    const anonymous = createAuthClient(app);
    const view = await anonymous.get(`/public/quotations/${token}`);
    expect(view.status).toBe(200);
    expect(JSON.stringify(view.body.data)).not.toMatch(
      /subtotalCost|internalCost|marginAmount|internalNotes/,
    );
    expect(
      (await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } })).firstViewedAt,
    ).not.toBeNull();
    expect(
      (
        await client.post(
          `/public/quotations/${token}/accept`,
          { customerName: 'Aarav Mehta', confirmed: true },
          { csrf: null },
        )
      ).status,
    ).toBe(200);
    expect(
      (await anonymous.post(`/public/quotations/${token}/reject`, { reason: 'Changed mind' }))
        .status,
    ).toBe(409);
    expect((await db.query.findUniqueOrThrow({ where: { id: lead.id } })).leadStage).toBe(
      'READY_TO_BOOK',
    );
    expect(
      (
        await client.post(`/api/quotations/${quotation.id}/versions`, {
          sourceVersionId: version.id,
        })
      ).status,
    ).toBe(409);
  });

  describe('quotation weblink view analytics', () => {
    async function readyQuotation() {
      const { client, lead, template } = await setup();
      const quotation = (
        await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
      ).body.data;
      const version = quotation.versions[0];
      await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
      const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
        quotationVersionId: version.id,
      });
      const token = link.body.data.url.split('/q/')[1];
      return { client, lead, template, quotation, version, token };
    }

    const publicGet = (token: string, ip: string) =>
      request(app).get(`/public/quotations/${token}`).set('X-Forwarded-For', ip);

    it('records one EXTERNAL view per successful public load', async () => {
      const { token } = await readyQuotation();
      const view = await publicGet(token, '203.0.113.10');
      expect(view.status).toBe(200);
      const rows = await db.quotationWeblinkView.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ ipAddress: '203.0.113.10', type: 'EXTERNAL', viewCount: 1 });
      expect(rows[0].firstViewedAt).toBeInstanceOf(Date);
      expect(rows[0].lastViewedAt).toBeInstanceOf(Date);
    });

    it('increments the same IP row on repeat views', async () => {
      const { token } = await readyQuotation();
      await publicGet(token, '203.0.113.10');
      await publicGet(token, '203.0.113.10');
      const rows = await db.quotationWeblinkView.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].viewCount).toBe(2);
      expect(rows[0].type).toBe('EXTERNAL');
      const analytics = (
        await db.quotationWeblinkView.aggregate({
          where: { ipAddress: rows[0].ipAddress },
          _sum: { viewCount: true },
          _count: { _all: true },
        })
      );
      expect(analytics._sum.viewCount).toBe(2);
      expect(analytics._count._all).toBe(1);
    });

    it('adds a second unique IP and increases totals', async () => {
      const { token, quotation } = await readyQuotation();
      await publicGet(token, '203.0.113.10');
      await publicGet(token, '198.51.100.7');
      const analytics = await db.quotationWeblinkView.groupBy({
        by: ['quotationId'],
        where: { quotationId: quotation.id },
        _sum: { viewCount: true },
      });
      expect(analytics[0]._sum.viewCount).toBe(2);
      expect(await db.quotationWeblinkView.count()).toBe(2);
    });

    it('classifies a same-tenant authenticated view as HOME', async () => {
      const { client, token } = await readyQuotation();
      const view = await client.get(`/public/quotations/${token}`);
      expect(view.status).toBe(200);
      const rows = await db.quotationWeblinkView.findMany();
      expect(rows[0].type).toBe('HOME');
      expect(rows[0].viewCount).toBe(1);
    });

    it('classifies a different-tenant authenticated view as EXTERNAL', async () => {
      const { token } = await readyQuotation();
      const other = await owner('other@tenant.test', 'Other Travel');
      const view = await other.get(`/public/quotations/${token}`);
      expect(view.status).toBe(200);
      const rows = await db.quotationWeblinkView.findMany();
      expect(rows[0].type).toBe('EXTERNAL');
    });

    it('records nothing for an invalid or expired token', async () => {
      const before = await db.quotationWeblinkView.count();
      const missing = await request(app)
        .get('/public/quotations/0000000000000000000000000000000000000000')
        .set('X-Forwarded-For', '203.0.113.10');
      expect(missing.status).toBe(404);
      expect(await db.quotationWeblinkView.count()).toBe(before);
    });

    it('returns aggregated analytics with sorted entries and zero defaults', async () => {
      const { client, lead, template, quotation, token } = await readyQuotation();
      await publicGet(token, '203.0.113.10');
      await client.get(`/public/quotations/${token}`); // HOME
      const res = await client.get(`/api/quotations/${quotation.id}/weblink-analytics`);
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.totalViews).toBe(2);
      expect(data.externalViews).toBe(1);
      expect(data.homeIpViews).toBe(1);
      expect(data.uniqueIps).toBe(2);
      expect(data.totalViews).toBe(data.externalViews + data.homeIpViews);
      expect(data.entries).toHaveLength(2);
      const times = data.entries.map((e: { lastViewedAt: string }) => new Date(e.lastViewedAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      // Zero state on a fresh quotation (same tenant, no public link/views).
      const fresh = (
        await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
      ).body.data;
      const freshRes = await client.get(`/api/quotations/${fresh.id}/weblink-analytics`);
      expect(freshRes.status).toBe(200);
      expect(freshRes.body.data).toMatchObject({
        totalViews: 0,
        externalViews: 0,
        homeIpViews: 0,
        uniqueIps: 0,
        entries: [],
      });
    });

    it('denies analytics to another tenant', async () => {
      const { quotation, token } = await readyQuotation();
      await publicGet(token, '203.0.113.10');
      const other = await owner('other2@tenant.test', 'Other Travel 2');
      const res = await other.get(`/api/quotations/${quotation.id}/weblink-analytics`);
      expect(res.status).toBe(404);
    });

    it('creates a public link idempotently without resetting analytics', async () => {
      const { client, quotation, version, token } = await readyQuotation();
      await publicGet(token, '203.0.113.10');
      const second = await client.post(`/api/quotations/${quotation.id}/public-link`, {
        quotationVersionId: version.id,
      });
      expect(second.status).toBe(200);
      expect(second.body.data.url).toContain('/q/');
      // Same token reused: the URL matches the first link.
      expect(second.body.data.url.split('/q/')[1]).toBe(token);
      expect(second.body.data.reused).toBe(true);
      // Analytics preserved.
      expect(await db.quotationWeblinkView.count()).toBe(1);
    });

    it('provisions a usable public weblink automatically at quotation creation', async () => {
      const { client, lead, template } = await setup();
      const quotation = (
        await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
      ).body.data;
      const version = quotation.versions[0];
      await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
      const row = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
      expect(row.publicToken).toBeTruthy();
      expect(row.publicTokenHash).toBeTruthy();
      expect(row.publicVersionId).toBe(version.id);
      // The URL is usable and secured by the token (no manual Create needed).
      const publicGet = request(app)
        .get(`/public/quotations/${row.publicToken}`)
        .set('X-Forwarded-For', '203.0.113.55');
      expect((await publicGet).status).toBe(200);
    });

    it('backfills a missing public link for legacy quotations idempotently', async () => {
      const { client, lead, template } = await setup();
      const quotation = (
        await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
      ).body.data;
      const version = quotation.versions[0];
      await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
      // Simulate a legacy quotation created before link provisioning.
      await db.quotation.update({
        where: { id: quotation.id },
        data: { publicToken: null, publicTokenHash: null, publicVersionId: null },
      });
      const { backfillQuotationWeblinks } = await import('../src/scripts/backfill-quotation-weblinks.js');
      const first = await backfillQuotationWeblinks(db);
      expect(first.created).toBe(1);
      const after = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
      expect(after.publicToken).toBeTruthy();
      expect(after.publicVersionId).toBe(version.id);
      // Idempotent: a second run creates nothing and keeps the same token.
      const tokenBefore = after.publicToken;
      const second = await backfillQuotationWeblinks(db);
      expect(second.created).toBe(0);
      expect((await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } })).publicToken).toBe(
        tokenBefore,
      );
      // The Leads-style URL is usable.
      const anon = createAuthClient(app);
      const view = await anon.get(`/public/quotations/${tokenBefore}`);
      expect(view.status).toBe(200);
    });
  });

  it('records a public rejection without advancing the lead', async () => {
    const { client, lead } = await setup();
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const version = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    const token = link.body.data.url.split('/q/')[1];
    const rejected = await createAuthClient(app).post(`/public/quotations/${token}/reject`, {
      reason: 'Dates no longer work',
      note: 'Please contact me next season.',
    });
    expect(rejected.body.data.status).toBe('REJECTED');
    expect(await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } })).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Dates no longer work',
    });
  });

  it('exposes company settings and the quotation timestamp on the public view', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const version = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    const token = link.body.data.url.split('/q/')[1];

    await client.patch('/api/settings/profile', {
      name: 'Alpha Travel',
      email: 'owner@alpha.test',
      operatingSince: 2015,
      tripsSold: 4200,
    });
    await client.patch('/api/settings/tax', {
      taxRegistrationNumber: '29ABCDE1234F1Z5',
      tan: 'ABCD12345E',
    });

    const view = await createAuthClient(app).get(`/public/quotations/${token}`);
    expect(view.status).toBe(200);
    const body = view.body.data;
    expect(body.company).toMatchObject({
      name: 'Alpha Travel',
      operatingSince: 2015,
      tripsSold: 4200,
      tan: 'ABCD12345E',
      taxRegistrationNumber: '29ABCDE1234F1Z5',
      logoUrl: null,
    });
    expect(typeof body.quotation.createdAt).toBe('string');
    expect(body.quotation.quotationNumber).toMatch(/^QT-\d{6}$/);
    expect(body.quotation.quotationNumber).toBe(quotation.quotationNumber);
    // Never leak storage keys or sensitive fields to the public view.
    expect(
      JSON.stringify(body).match(/logoObjectKey|pendingLogoObjectKey|logoBucket|ObjectKey|accountNumber/),
    ).toBeNull();
  });

  it('follows lead visibility and rejects cross-company quotation/document IDs', async () => {
    const { client, lead, template } = await setup();
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, templateId: template.id })
    ).body.data;
    const beta = await owner('owner@beta.test', 'Beta Travel');
    expect((await beta.get(`/api/quotations/${quotation.id}`)).status).toBe(404);
    expect((await beta.post('/api/quotations', { queryId: lead.id })).status).toBe(404);
    expect((await beta.get(`/api/quotations/${quotation.id}/documents`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Phase 14 — travel masters linked from quotation and template rows
// ---------------------------------------------------------------------------

type Client = ReturnType<typeof createAuthClient>;

/** Build one of every master a quotation row can point at. */
async function masters(client: Client, suffix = '') {
  const city = (
    await client.post('/api/masters/cities', { countryCode: 'AZ', name: `Baku${suffix}` })
  ).body.data;
  const destination = (
    await client.post('/api/masters/destinations', {
      countryCode: 'AZ',
      name: `Azerbaijan${suffix}`,
      destinationType: 'INTERNATIONAL',
      cityIds: [city.id],
    })
  ).body.data;
  const hotel = (
    await client.post('/api/masters/hotels', {
      destinationId: destination.id,
      cityId: city.id,
      name: `Shah Palace${suffix}`,
      starCategory: 4,
      address: 'Boyuk Qala 47',
    })
  ).body.data;
  // These two endpoints return the refreshed parent hotel, not the child row.
  const roomType = (
    await client.post(`/api/masters/hotels/${hotel.id}/room-types`, {
      name: 'Deluxe Room',
      maxOccupancy: 3,
      baseCost: 4000,
      sellingPrice: 6000,
    })
  ).body.data.roomTypes.at(-1);
  const mealPlan = (
    await client.post(`/api/masters/hotels/${hotel.id}/meal-plans`, {
      name: 'Breakfast Only',
      type: 'BREAKFAST',
      baseCost: 500,
      sellingPrice: 800,
    })
  ).body.data.mealPlans.at(-1);
  const airline = (
    await client.post('/api/masters/airlines', { name: `Air India${suffix}`, status: 'ACTIVE' })
  ).body.data;
  const cruise = (
    await client.post('/api/masters/cruises', {
      name: `Dream Genting${suffix}`,
      status: 'ACTIVE',
      roomTypes: [{ name: 'Interior', price: 18000 }],
    })
  ).body.data;
  const vehicle = (
    await client.post('/api/masters/vehicles', {
      name: `Innova Crysta${suffix}`,
      vehicleType: 'Standard MPV',
      capacity: 8,
      status: 'ACTIVE',
    })
  ).body.data;
  const sightseeing = (
    await client.post('/api/masters/sightseeing', {
      destinationId: destination.id,
      cityId: city.id,
      title: `Gobustan Tour${suffix}`,
      sequence: 1,
      status: 'ACTIVE',
    })
  ).body.data;
  const addOn = (
    await client.post('/api/masters/add-on-services', {
      name: `Visa Assistance${suffix}`,
      price: 3800,
      status: 'ACTIVE',
    })
  ).body.data;
  return {
    city,
    destination,
    hotel,
    roomType,
    mealPlan,
    airline,
    cruise,
    cruiseRoomType: cruise.roomTypes[0] as { id: string },
    vehicle,
    sightseeing,
    addOn,
  };
}

/** A version body whose every row carries its matching master reference. */
function linkedVersion(m: Awaited<ReturnType<typeof masters>>) {
  return {
    title: 'Linked package',
    hotels: [
      {
        city: 'Baku',
        hotelName: 'Shah Palace',
        roomType: 'Deluxe Room',
        mealPlan: 'Breakfast Only',
        rooms: 1,
        nights: 2,
        internalCost: 4500,
        sellingPrice: 6800,
        selected: true,
        sequence: 1,
        hotelId: m.hotel.id,
        hotelRoomTypeId: m.roomType.id,
        hotelMealPlanId: m.mealPlan.id,
      },
    ],
    services: [
      {
        serviceType: 'FLIGHT',
        name: 'Delhi to Baku',
        quantity: 2,
        sellingPrice: 30000,
        sequence: 1,
        airlineId: m.airline.id,
      },
      {
        serviceType: 'CRUISE',
        name: 'Overnight cruise',
        quantity: 1,
        sellingPrice: 18000,
        sequence: 2,
        cruiseId: m.cruise.id,
        cruiseRoomTypeId: m.cruiseRoomType.id,
      },
      {
        serviceType: 'VEHICLE_TRANSFER',
        name: 'Airport transfer',
        quantity: 1,
        sellingPrice: 2500,
        sequence: 3,
        vehicleId: m.vehicle.id,
      },
      {
        serviceType: 'SIGHTSEEING',
        name: 'Gobustan',
        quantity: 2,
        sellingPrice: 3000,
        sequence: 4,
        sightseeingId: m.sightseeing.id,
      },
      {
        serviceType: 'OTHER_ADD_ON',
        name: 'Visa',
        quantity: 2,
        sellingPrice: 3800,
        sequence: 5,
        addOnServiceId: m.addOn.id,
      },
    ],
  };
}

const SERVICE_FK = [
  'airlineId',
  'cruiseId',
  'cruiseRoomTypeId',
  'vehicleId',
  'sightseeingId',
  'addOnServiceId',
] as const;

describe('Phase 14 quotation master references', () => {
  it('persists every hotel and service master reference on version creation', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
    ).body.data;

    const stored = await db.quotationVersionHotelOption.findFirstOrThrow({
      where: { quotationVersionId: quotation.versions[0].id },
    });
    expect(stored).toMatchObject({
      hotelId: m.hotel.id,
      hotelRoomTypeId: m.roomType.id,
      hotelMealPlanId: m.mealPlan.id,
    });
    const services = await db.quotationVersionService.findMany({
      where: { quotationVersionId: quotation.versions[0].id },
      orderBy: { sequence: 'asc' },
    });
    expect(services.map((row) => row.airlineId)).toEqual([m.airline.id, null, null, null, null]);
    expect(services[1]).toMatchObject({
      cruiseId: m.cruise.id,
      cruiseRoomTypeId: m.cruiseRoomType.id,
    });
    expect(services[2]!.vehicleId).toBe(m.vehicle.id);
    expect(services[3]!.sightseeingId).toBe(m.sightseeing.id);
    expect(services[4]!.addOnServiceId).toBe(m.addOn.id);
  });

  it('returns master references on internal detail but strips them from customer-safe views', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
    ).body.data;
    const version = quotation.versions[0];

    const internal = await client.get(`/api/quotations/${quotation.id}`);
    expect(internal.body.data.versions[0].hotels[0].hotelId).toBe(m.hotel.id);
    expect(internal.body.data.versions[0].services[0].airlineId).toBe(m.airline.id);

    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    const token = link.body.data.url.split('/q/')[1];
    const publicView = await createAuthClient(app).get(`/public/quotations/${token}`);
    expect(publicView.status).toBe(200);
    const hotelPresentation = Object.values(
      publicView.body.data.hotelPresentations as Record<string, unknown>,
    )[0];
    expect(hotelPresentation).toMatchObject({
      imageUrl: null,
      starCategory: 4,
      address: 'Boyuk Qala 47',
      destination: 'Azerbaijan',
      country: 'Azerbaijan',
    });
    const body = JSON.stringify(publicView.body.data);
    for (const field of [...SERVICE_FK, 'hotelId', 'hotelRoomTypeId', 'hotelMealPlanId'])
      expect(body).not.toContain(field);
    // The snapshot text still renders without the master links.
    expect(body).toContain('Shah Palace');
  });

  it('carries master references through revisions and updates', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
    ).body.data;
    const first = quotation.versions[0];
    await client.post(`/api/quotations/${quotation.id}/versions/${first.id}/finalize`);

    const revision = (
      await client.post(`/api/quotations/${quotation.id}/versions`, { sourceVersionId: first.id })
    ).body.data;
    const copied = await db.quotationVersionService.findMany({
      where: { quotationVersionId: revision.id },
      orderBy: { sequence: 'asc' },
    });
    expect(copied[0]!.airlineId).toBe(m.airline.id);
    expect(copied[1]!.cruiseRoomTypeId).toBe(m.cruiseRoomType.id);

    // An update that rewrites the service rows must keep the references.
    const updated = await client.patch(`/api/quotations/${quotation.id}/versions/${revision.id}`, {
      services: [
        {
          serviceType: 'VEHICLE_TRANSFER',
          name: 'Return transfer',
          quantity: 1,
          sellingPrice: 2500,
          sequence: 1,
          vehicleId: m.vehicle.id,
        },
      ],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.services[0].vehicleId).toBe(m.vehicle.id);

    // A partial update that never mentions services must not drop their links.
    const renamed = await client.patch(`/api/quotations/${quotation.id}/versions/${revision.id}`, {
      title: 'Renamed only',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.services[0].vehicleId).toBe(m.vehicle.id);
    expect(renamed.body.data.hotels[0].hotelRoomTypeId).toBe(m.roomType.id);
  });

  it('carries master references through template duplication', async () => {
    const client = await owner();
    const m = await masters(client);
    const template = await client.post('/api/quotation-templates', {
      ...templatePayload('Duplicated template'),
      hotels: linkedVersion(m).hotels,
      services: linkedVersion(m).services,
    });
    const duplicate = await client.post(
      `/api/quotation-templates/${template.body.data.id}/duplicate`,
    );
    expect(duplicate.status).toBe(201);
    const copied = await db.quotationTemplateService.findMany({
      where: { templateId: duplicate.body.data.id },
      orderBy: { sequence: 'asc' },
    });
    expect(copied[0]!.airlineId).toBe(m.airline.id);
    expect(copied[1]!.cruiseRoomTypeId).toBe(m.cruiseRoomType.id);
    expect(
      (
        await db.quotationTemplateHotelOption.findFirstOrThrow({
          where: { templateId: duplicate.body.data.id },
        })
      ).hotelMealPlanId,
    ).toBe(m.mealPlan.id);
  });

  it('persists master references on templates and through template application', async () => {
    const client = await owner();
    const m = await masters(client);
    const template = await client.post('/api/quotation-templates', {
      ...templatePayload('Linked template'),
      hotels: linkedVersion(m).hotels,
      services: linkedVersion(m).services,
    });
    expect(template.status).toBe(201);
    const templateServices = await db.quotationTemplateService.findMany({
      where: { templateId: template.body.data.id },
      orderBy: { sequence: 'asc' },
    });
    expect(templateServices[0]!.airlineId).toBe(m.airline.id);
    expect(templateServices[4]!.addOnServiceId).toBe(m.addOn.id);
    expect(
      (
        await db.quotationTemplateHotelOption.findFirstOrThrow({
          where: { templateId: template.body.data.id },
        })
      ).hotelRoomTypeId,
    ).toBe(m.roomType.id);

    // Update rewrites the child rows — the references must survive that too.
    const updated = await client.patch(`/api/quotation-templates/${template.body.data.id}`, {
      services: [
        {
          serviceType: 'SIGHTSEEING',
          name: 'Old city walk',
          quantity: 1,
          sellingPrice: 1500,
          sequence: 1,
          sightseeingId: m.sightseeing.id,
        },
      ],
    });
    expect(updated.status).toBe(200);
    expect(
      (
        await db.quotationTemplateService.findFirstOrThrow({
          where: { templateId: template.body.data.id },
        })
      ).sightseeingId,
    ).toBe(m.sightseeing.id);

    // Applying the template to a quotation copies the references across.
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', {
        queryId: lead.id,
        templateId: template.body.data.id,
      })
    ).body.data;
    const applied = await db.quotationVersionService.findFirstOrThrow({
      where: { quotationVersionId: quotation.versions[0].id },
    });
    expect(applied.sightseeingId).toBe(m.sightseeing.id);
  });

  it('rejects a master belonging to another company without confirming it exists', async () => {
    const client = await owner();
    const beta = await owner('owner@beta.test', 'Beta Travel');
    const foreign = await masters(beta, ' Beta');
    const lead = (await client.post('/api/queries', leadPayload())).body.data;

    const response = await client.post('/api/quotations', {
      queryId: lead.id,
      version: {
        title: 'Cross tenant',
        services: [
          {
            serviceType: 'VEHICLE_TRANSFER',
            name: 'Transfer',
            quantity: 1,
            sellingPrice: 100,
            sequence: 1,
            vehicleId: foreign.vehicle.id,
          },
        ],
      },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('The selected vehicle is not available.');
    expect(response.body.error.message).not.toContain(foreign.vehicle.id);
  });

  it('rejects a child master that does not belong to the chosen parent', async () => {
    const client = await owner();
    const a = await masters(client);
    const b = await masters(client, ' Two');
    const lead = (await client.post('/api/queries', leadPayload())).body.data;

    const wrongRoomType = await client.post('/api/quotations', {
      queryId: lead.id,
      version: {
        hotels: [
          {
            city: 'Baku',
            hotelName: 'Shah Palace',
            rooms: 1,
            nights: 1,
            sellingPrice: 100,
            sequence: 1,
            hotelId: a.hotel.id,
            hotelRoomTypeId: b.roomType.id,
          },
        ],
      },
    });
    expect(wrongRoomType.status).toBe(400);
    expect(wrongRoomType.body.error.message).toContain('does not belong to the selected hotel');

    const orphanRoomType = await client.post('/api/quotations', {
      queryId: lead.id,
      version: {
        hotels: [
          {
            city: 'Baku',
            hotelName: 'Shah Palace',
            rooms: 1,
            nights: 1,
            sellingPrice: 100,
            sequence: 1,
            hotelRoomTypeId: a.roomType.id,
          },
        ],
      },
    });
    expect(orphanRoomType.status).toBe(400);
    expect(orphanRoomType.body.error.message).toContain('Select a hotel before');

    const wrongCruiseRoom = await client.post('/api/quotations', {
      queryId: lead.id,
      version: {
        services: [
          {
            serviceType: 'CRUISE',
            name: 'Cruise',
            quantity: 1,
            sellingPrice: 100,
            sequence: 1,
            cruiseId: a.cruise.id,
            cruiseRoomTypeId: b.cruiseRoomType.id,
          },
        ],
      },
    });
    expect(wrongCruiseRoom.status).toBe(400);
    expect(wrongCruiseRoom.body.error.message).toContain('does not belong to the selected cruise');
  });

  it('rejects a master linked to an incompatible service type', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const response = await client.post('/api/quotations', {
      queryId: lead.id,
      version: {
        services: [
          {
            serviceType: 'SIGHTSEEING',
            name: 'Mislabelled',
            quantity: 1,
            sellingPrice: 100,
            sequence: 1,
            airlineId: m.airline.id,
          },
        ],
      },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('can only be linked to a flight service');
  });

  it('keeps free-text rows working with no master references at all', async () => {
    const client = await owner();
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const response = await client.post('/api/quotations', {
      queryId: lead.id,
      version: {
        hotels: [
          {
            city: 'Manali',
            hotelName: 'Typed by hand',
            rooms: 1,
            nights: 2,
            sellingPrice: 5000,
            sequence: 1,
          },
        ],
        services: [
          {
            serviceType: 'OTHER_ADD_ON',
            name: 'Typed service',
            quantity: 1,
            sellingPrice: 900,
            sequence: 1,
          },
        ],
      },
    });
    expect(response.status).toBe(201);
    const service = await db.quotationVersionService.findFirstOrThrow({
      where: { quotationVersionId: response.body.data.versions[0].id },
    });
    for (const field of SERVICE_FK) expect(service[field]).toBeNull();
    expect(service.name).toBe('Typed service');
  });

  it('keeps the snapshot readable after the linked master is archived or deleted', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
    ).body.data;

    // Archiving keeps the link intact — historical rows must not change.
    await client.delete(`/api/masters/vehicles/${m.vehicle.id}`);
    const afterArchive = await client.get(`/api/quotations/${quotation.id}`);
    expect(afterArchive.status).toBe(200);
    expect(
      afterArchive.body.data.versions[0].services.find(
        (row: { serviceType: string }) => row.serviceType === 'VEHICLE_TRANSFER',
      ),
    ).toMatchObject({ name: 'Airport transfer', vehicleId: m.vehicle.id });

    // A hard delete nulls the FK but leaves the snapshot text untouched.
    await db.vehicle.delete({ where: { id: m.vehicle.id } });
    const afterDelete = await client.get(`/api/quotations/${quotation.id}`);
    expect(afterDelete.status).toBe(200);
    expect(
      afterDelete.body.data.versions[0].services.find(
        (row: { serviceType: string }) => row.serviceType === 'VEHICLE_TRANSFER',
      ),
    ).toMatchObject({ name: 'Airport transfer', vehicleId: null });
  });

  it('accepts an archived master when editing an existing quotation', async () => {
    const client = await owner();
    const m = await masters(client);
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (
      await client.post('/api/quotations', { queryId: lead.id, version: linkedVersion(m) })
    ).body.data;
    await client.delete(`/api/masters/sightseeing/${m.sightseeing.id}`);

    const updated = await client.patch(
      `/api/quotations/${quotation.id}/versions/${quotation.versions[0].id}`,
      {
        services: [
          {
            serviceType: 'SIGHTSEEING',
            name: 'Gobustan',
            quantity: 2,
            sellingPrice: 3200,
            sequence: 1,
            sightseeingId: m.sightseeing.id,
          },
        ],
      },
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data.services[0].sightseeingId).toBe(m.sightseeing.id);
  });
});

/**
 * Per-activity informational pricing survives the full round-trip: save, reload,
 * edit and Create Revision — and never reaches quotation totals.
 */
describe('Phase 8 quotation activity pricing', () => {
  const sightseeing = (activities: unknown[]) => ({
    include: true,
    sectionTitle: 'Sightseeing & Experiences',
    amount: 0,
    description: null,
    days: [
      {
        dayNumber: 1,
        title: 'Day 1: Singapore highlights',
        city: 'Singapore',
        meals: { breakfast: false, lunch: false, dinner: false },
        mealMode: 'INCLUDE_AT_HOTEL',
        dailyTransfer: 'SHARED',
        activities,
      },
    ],
  });
  const activitiesOf = (version: { sightseeingDetails?: { days?: Array<{ activities?: unknown[] }> } }) =>
    (version.sightseeingDetails?.days?.[0]?.activities ?? []) as Array<{
      name?: string;
      dailyTransfer?: string | null;
      pricingOptions?: Array<{ label: string; price: number }>;
    }>;

  it('saves, reloads and re-edits per-activity pricing without losing it', async () => {
    const { client, lead } = await setup();
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const version = quotation.versions[0];

    const saved = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      sightseeingDetails: sightseeing([
        {
          name: 'Singapore Zoo',
          description: '<p>Meet the animals.</p>',
          dailyTransfer: 'SHARED',
          pricingOptions: [
            { label: 'Adult', price: 3500 },
            // Untouched defaults and blank rows must not persist.
            { label: 'Child', price: '' },
            { label: 'Senior', price: null },
            { label: '  Infant  ', price: 500 },
          ],
        },
        {
          name: 'Gardens by the Bay',
          description: '<p>Evening show.</p>',
          dailyTransfer: 'PRIVATE',
          pricingOptions: [{ label: 'Adult', price: 1200 }],
        },
      ]),
    });
    expect(saved.status).toBe(200);

    // Reload from the API — the snapshot round-trips exactly.
    const reloaded = await client.get(`/api/quotations/${quotation.id}`);
    const [zoo, gardens] = activitiesOf(
      reloaded.body.data.versions.find((v: { id: string }) => v.id === version.id),
    );
    expect(zoo?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
    expect(gardens?.pricingOptions).toEqual([{ label: 'Adult', price: 1200 }]);

    // Editing an unrelated field on the activity leaves pricing untouched.
    const edited = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      sightseeingDetails: sightseeing([
        {
          name: 'Singapore Zoo (Morning)',
          description: '<p>Meet the animals.</p>',
          dailyTransfer: 'NO_TRANSFER',
          pricingOptions: zoo?.pricingOptions,
        },
      ]),
    });
    expect(edited.status).toBe(200);
    const afterEdit = activitiesOf(edited.body.data)[0];
    expect(afterEdit?.name).toBe('Singapore Zoo (Morning)');
    expect(afterEdit?.dailyTransfer).toBe('NO_TRANSFER');
    expect(afterEdit?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('rejects duplicate labels, missing labels and negative prices on save', async () => {
    const { client, lead } = await setup();
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const version = quotation.versions[0];
    const save = (pricingOptions: unknown) =>
      client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
        sightseeingDetails: sightseeing([{ name: 'Singapore Zoo', pricingOptions }]),
      });

    const duplicate = await save([
      { label: 'Adult', price: 3500 },
      { label: 'adult', price: 3600 },
    ]);
    expect(duplicate.status).toBe(400);

    const noLabel = await save([{ label: '   ', price: 500 }]);
    expect(noLabel.status).toBe(400);

    const negative = await save([{ label: 'Adult', price: -1 }]);
    expect(negative.status).toBe(400);
  });

  it('copies activity pricing into the version created by Create Revision', async () => {
    const { client, lead } = await setup();
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const first = quotation.versions[0];
    // Creating a version (including a revision) requires the final day to be a
    // departure day — a pre-existing rule, unrelated to pricing.
    const withDepartureDay = {
      ...sightseeing([
        {
          name: 'Singapore Zoo',
          dailyTransfer: 'SHARED',
          pricingOptions: [
            { label: 'Adult', price: 3500 },
            { label: 'Infant', price: 500 },
          ],
        },
      ]),
      days: [
        sightseeing([
          {
            name: 'Singapore Zoo',
            dailyTransfer: 'SHARED',
            pricingOptions: [
              { label: 'Adult', price: 3500 },
              { label: 'Infant', price: 500 },
            ],
          },
        ]).days[0],
        {
          ...sightseeing([{ name: 'Check Out and Departure', dailyTransfer: 'PRIVATE' }]).days[0],
          dayNumber: 2,
          title: 'Day 2: Departure',
        },
      ],
    };
    await client.patch(`/api/quotations/${quotation.id}/versions/${first.id}`, {
      sightseeingDetails: withDepartureDay,
    });
    await client.post(`/api/quotations/${quotation.id}/versions/${first.id}/finalize`);

    const revision = await client.post(`/api/quotations/${quotation.id}/versions`, {
      sourceVersionId: first.id,
    });
    expect(revision.status).toBe(201);
    expect(revision.body.data.versionNumber).toBe(2);

    // The new version's snapshot carries the pricing across verbatim.
    const copied = activitiesOf(revision.body.data)[0];
    expect(copied?.name).toBe('Singapore Zoo');
    expect(copied?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);

    // And it is persisted, not just echoed.
    const stored = await db.quotationVersion.findUniqueOrThrow({
      where: { id: revision.body.data.id },
      select: { sightseeingDetails: true },
    });
    const storedActivities = (
      stored.sightseeingDetails as { days: Array<{ activities: Array<{ pricingOptions: unknown }> }> }
    ).days[0]?.activities;
    expect(storedActivities?.[0]?.pricingOptions).toEqual([
      { label: 'Adult', price: 3500 },
      { label: 'Infant', price: 500 },
    ]);
  });

  it('keeps a pre-feature quotation working and leaves totals untouched', async () => {
    const { client, lead } = await setup();
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    const version = quotation.versions[0];

    // A snapshot written before this feature has no pricingOptions at all.
    const legacy = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      sightseeingDetails: sightseeing([
        { name: 'Legacy activity', description: '<p>Saved long ago.</p>', dailyTransfer: 'SHARED' },
      ]),
    });
    expect(legacy.status).toBe(200);
    expect(activitiesOf(legacy.body.data)[0]?.pricingOptions).toEqual([]);
    const legacyTotal = legacy.body.data.finalAmount;

    // Adding activity pricing must not move any money field.
    const priced = await client.patch(`/api/quotations/${quotation.id}/versions/${version.id}`, {
      sightseeingDetails: sightseeing([
        {
          name: 'Legacy activity',
          description: '<p>Saved long ago.</p>',
          dailyTransfer: 'SHARED',
          pricingOptions: [
            { label: 'Adult', price: 3500 },
            { label: 'Child', price: 2500 },
          ],
        },
      ]),
    });
    expect(priced.status).toBe(200);
    expect(priced.body.data.finalAmount).toBe(legacyTotal);
    expect(priced.body.data.subtotalSellingPrice).toBe(legacy.body.data.subtotalSellingPrice);
    expect(priced.body.data.totalMarkup).toBe(legacy.body.data.totalMarkup);
    expect(priced.body.data.taxAmount).toBe(legacy.body.data.taxAmount);
  });
});
