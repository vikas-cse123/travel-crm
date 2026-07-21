import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    expect(template.templateCode).toMatch(/^QTP-\d{4}-000001$/);
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
    expect(response.body.data.quotationNumber).toMatch(/^QT-\d{4}-000001$/);
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
    expect((await db.quotationCounter.findFirstOrThrow()).quotationValue).toBe(5);
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
    expect((await db.query.findUniqueOrThrow({ where: { id: lead.id } })).leadStage).toBe(
      'QUOTATION_REQUIRED',
    );
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
