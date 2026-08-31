import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { formatAgeList } from '@interscale/shared';

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

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();
const itWithPdftotext = hasPdftotext ? it : it.skip;

function pdfText(buffer: Buffer): string {
  return execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: buffer,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
}

async function owner(email = 'owner@ages.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

const leadPayload = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Aarav Mehta',
  phone: '+91 98765 43210',
  email: 'aarav@example.test',
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'QUALIFIED',
  priority: 'HIGH',
  travelStartDate: '2026-09-05',
  travelEndDate: '2026-09-09',
  rooms: 1,
  adults: 2,
  childrenWithBed: 2,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
  ...overrides,
});

const templatePayload = () => ({
  name: 'Child ages template',
  description: 'Template for child-age flow tests.',
  destinationSummary: 'Goa • Calangute',
  durationDays: 5,
  durationNights: 4,
  baseCurrency: 'INR',
  status: 'ACTIVE',
  itinerary: [
    {
      dayNumber: 1,
      title: 'Arrival',
      destination: 'Calangute',
      description: 'Transfer.',
      meals: null,
      overnightLocation: 'Calangute',
      sequence: 1,
    },
  ],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
});

async function setup(leadOverrides: Record<string, unknown> = {}) {
  const client = await owner();
  const lead = await client.post('/api/queries', leadPayload(leadOverrides));
  expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  const template = await client.post('/api/quotation-templates', templatePayload());
  expect(template.status).toBe(201);
  const quotation = (
    await client.post('/api/quotations', {
      queryId: lead.body.data.id,
      templateId: template.body.data.id,
    })
  ).body.data;
  return { client, lead: lead.body.data, quotation, version: quotation.versions[0] };
}

describe('child ages: lead → quotation → PDF + weblink', () => {
  it('TEST 1: stores CWB ages on the lead and carries them into the quotation', async () => {
    const { client, lead, quotation } = await setup({
      childrenWithBedAges: [8, 10],
    });
    // Lead round-trip.
    const reloadedLead = (await client.get(`/api/queries/${lead.id}`)).body.data;
    expect(reloadedLead.childrenWithBedAges).toEqual([8, 10]);

    // Quotation retains the lead ages.
    const reloaded = (await client.get(`/api/quotations/${quotation.id}`)).body.data;
    expect(reloaded.childrenWithBedAges).toEqual([8, 10]);
    expect(reloaded.childrenWithoutBedAges).toEqual(null);
    expect(reloaded.infantAges).toEqual(null);
  });

  it('TEST 1 (weblink): the public view exposes the ages for the Travelers section', async () => {
    const { client, quotation, version } = await setup({ childrenWithBedAges: [8, 10] });
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const token = link.body.data.url.split('/q/')[1];
    const publicView = await createAuthClient(app).get(`/api/public/quotations/${token}`);
    expect(publicView.status, JSON.stringify(publicView.body)).toBe(200);
    expect(publicView.body.data.quotation.childrenWithBedAges).toEqual([8, 10]);
  });

  it('TEST 2: partial ages keep only the provided values', async () => {
    const { client, lead, quotation } = await setup({ childrenWithBedAges: [8] });
    expect(lead.childrenWithBedAges).toEqual([8]);
    const reloaded = (await client.get(`/api/quotations/${quotation.id}`)).body.data;
    expect(reloaded.childrenWithBedAges).toEqual([8]);
  });

  it('TEST 3+4: no ages anywhere — outputs omit the age line entirely', async () => {
    const { client, quotation, version } = await setup();
    const reloaded = (await client.get(`/api/quotations/${quotation.id}`)).body.data;
    expect(reloaded.childrenWithBedAges).toEqual(null);
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    expect(link.status).toBe(200);
    const token = link.body.data.url.split('/q/')[1];
    const publicView = await createAuthClient(app).get(`/api/public/quotations/${token}`);
    expect(publicView.body.data.quotation.childrenWithBedAges).toEqual(null);
    // The renderer omits the age line for null data (formatAgeList → null), so
    // no "CWB Ages: null/undefined" text can ever be displayed.
    expect(formatAgeList(null)).toBeNull();
    expect(formatAgeList([8, null, 10])).toBe('8, 10');
    expect(formatAgeList([8, 10])).toBe('8, 10');
  });

  it('TEST 5: editing the quotation updates the ages used by both outputs', async () => {
    const { client, quotation, version } = await setup({ childrenWithBedAges: [8] });
    const patched = await client.patch(`/api/quotations/${quotation.id}`, {
      childrenWithBedAges: [9, 12],
    });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.data.childrenWithBedAges).toEqual([9, 12]);

    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
      quotationVersionId: version.id,
    });
    const token = link.body.data.url.split('/q/')[1];
    const publicView = await createAuthClient(app).get(`/api/public/quotations/${token}`);
    expect(publicView.body.data.quotation.childrenWithBedAges).toEqual([9, 12]);
  });

  /** Latest generated PDF bytes for a quotation (tests use the in-memory storage). */
  async function latestQuotationPdfBytes(quotationId: string): Promise<Buffer> {
    const document = await db.quotationDocument.findFirst({
      where: { quotationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(document).toBeTruthy();
    const { storageService } = await import('../src/services/storage/storage.service.js');
    const memory = storageService as unknown as { read(key: string): Buffer | undefined };
    const bytes = memory.read(document!.objectKey);
    expect(bytes).toBeTruthy();
    return bytes as Buffer;
  }

  it('generates a classic PDF with the ages on the cover (CWB Ages: 8, 10)', async () => {
    const { client, quotation, version } = await setup({ childrenWithBedAges: [8, 10] });
    await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
    const pdf = await client.post(
      `/api/quotations/${quotation.id}/versions/${version.id}/generate-pdf`,
      { force: true, style: 'CLASSIC' },
    );
    expect(pdf.status, JSON.stringify(pdf.body)).toBe(200);
    const bytes = await latestQuotationPdfBytes(quotation.id);
    expect(bytes.length).toBeGreaterThan(1000);
    if (hasPdftotext) {
      const visible = pdfText(bytes);
      expect(visible).toContain('CWB Ages');
      expect(visible).toContain('8, 10');
    }
  });

  itWithPdftotext(
    'classic PDF prints "CWB Ages: 8, 10" on the cover summary',
    async () => {
      const { client, quotation, version } = await setup({ childrenWithBedAges: [8, 10] });
      await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
      const pdf = await client.post(
        `/api/quotations/${quotation.id}/versions/${version.id}/generate-pdf`,
        { force: true, style: 'CLASSIC' },
      );
      expect(pdf.status).toBe(200);
      const bytes = await latestQuotationPdfBytes(quotation.id);
      const visible = pdfText(bytes);
      expect(visible).toContain('CWB Ages');
      expect(visible).toContain('8, 10');
    },
  );
});
