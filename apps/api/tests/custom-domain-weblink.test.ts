import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient } from './helpers/auth-client.js';
import { createCompanyFixture } from './helpers/fixtures.js';

let app: Express;
let db: PrismaClient;

beforeAll(async () => {
  db = createTestPrismaClient();
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
});

const leadPayload = () => ({
  customerName: 'Aarav Mehta',
  phone: '+91 98765 43210',
  email: 'aarav@example.test',
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'QUALIFIED',
  priority: 'HIGH',
  travelStartDate: '2026-09-10',
  travelEndDate: '2026-09-14',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
});

async function ownerWithCompany(slug: string) {
  const seeded = await createCompanyFixture(db, slug);
  const client = createAuthClient(app);
  await client.post('/api/auth/login', {
    email: `owner@${slug}.local`,
    password: 'Fixture@2026',
  });
  return { client, companyId: seeded.companyId, seeded };
}

async function createFinalizedQuotationWithSlug(
  client: ReturnType<typeof createAuthClient>,
  slug: string,
) {
  const lead = (await client.post('/api/queries', leadPayload())).body.data;
  const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
  const version = quotation.versions[0];
  await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
  const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
    quotationVersionId: version.id,
  });
  const tokenRaw: string = link.body.data.url as string;
  const token = tokenRaw.includes('/q/') ? tokenRaw.split('/q/')[1] : tokenRaw.split('/').pop()!;
  await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: slug });
  return { quotationId: quotation.id, token, slug };
}

describe('custom-domain weblink routing', () => {
  it('resolves the same quotation via custom domain slug and via platform token (quotation.travelenfield.in scenario)', async () => {
    const { client, companyId } = await ownerWithCompany('travelenfield');
    const customHostname = 'quotation.travelenfield.in';
    await db.customDomain.create({
      data: { companyId, hostname: customHostname, status: 'ACTIVE' },
    });
    const { token, slug } = await createFinalizedQuotationWithSlug(client, 'random12345');

    const byTokenPlatform = await request(app)
      .get(`/api/public/quotations/${token}`)
      .set('Host', 'app.travelagencycrm.in');
    expect(byTokenPlatform.status).toBe(200);

    const bySlugCustom = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', customHostname);
    expect(bySlugCustom.status).toBe(200);
    expect(bySlugCustom.body.data.quotation.quotationNumber).toBe(
      byTokenPlatform.body.data.quotation.quotationNumber,
    );

    const bySlugPlatform = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'travelagencycrm.in');
    expect(bySlugPlatform.status).toBe(200);
  });

  it('keeps custom domain isolation - does not expose other tenant quotation', async () => {
    const { client: clientA, companyId: companyA } = await ownerWithCompany('alpha-travel');
    const { client: clientB, companyId: companyB } = await ownerWithCompany('beta-travel');
    await db.customDomain.create({
      data: { companyId: companyA, hostname: 'quotation.alpha.test', status: 'ACTIVE' },
    });
    await db.customDomain.create({
      data: { companyId: companyB, hostname: 'quotation.beta.test', status: 'ACTIVE' },
    });

    const { slug: slugA } = await createFinalizedQuotationWithSlug(clientA, 'alpha-slug');
    await createFinalizedQuotationWithSlug(clientB, 'beta-slug');

    const cross = await request(app)
      .get(`/api/public/quotations/by-slug/beta-slug`)
      .set('Host', 'quotation.alpha.test');
    expect(cross.status).toBe(404);

    const own = await request(app)
      .get(`/api/public/quotations/by-slug/${slugA}`)
      .set('Host', 'quotation.alpha.test');
    expect(own.status).toBe(200);
  });

  it('returns proper 404 for unknown custom domain host', async () => {
    const { client } = await ownerWithCompany('unknown-host');
    const { slug } = await createFinalizedQuotationWithSlug(client, 'known-slug');
    const res = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'unknown-custom.example.com');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/host/i);
  });

  it('returns quotation-not-found for unknown slug on a valid custom domain', async () => {
    const { client, companyId } = await ownerWithCompany('valid-custom');
    await db.customDomain.create({
      data: { companyId, hostname: 'quotation.validcustom.test', status: 'ACTIVE' },
    });
    await createFinalizedQuotationWithSlug(client, 'existing-slug');
    const res = await request(app)
      .get(`/api/public/quotations/by-slug/does-not-exist-xyz`)
      .set('Host', 'quotation.validcustom.test');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/quotation/i);
  });

  it('supports www alias for custom domain without requiring separate record', async () => {
    const { client, companyId } = await ownerWithCompany('www-alias');
    await db.customDomain.create({
      data: { companyId, hostname: 'quotation.wwwalias.test', status: 'ACTIVE' },
    });
    const { slug } = await createFinalizedQuotationWithSlug(client, 'www-slug');
    const viaWww = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'www.quotation.wwwalias.test');
    expect(viaWww.status).toBe(200);
  });

  it('handles Host header with port and case variations', async () => {
    const { client, companyId } = await ownerWithCompany('case-port');
    await db.customDomain.create({
      data: { companyId, hostname: 'quotation.caseport.test', status: 'ACTIVE' },
    });
    const { slug } = await createFinalizedQuotationWithSlug(client, 'case-slug');
    const res = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'QUOTATION.CASEPORT.TEST:443');
    expect(res.status).toBe(200);
  });

  it('handles X-Forwarded-Host header (ALB forwarding)', async () => {
    const { client, companyId } = await ownerWithCompany('forwarded-host');
    await db.customDomain.create({
      data: { companyId, hostname: 'quotation.forwarded.test', status: 'ACTIVE' },
    });
    const { slug } = await createFinalizedQuotationWithSlug(client, 'forwarded-slug');
    const res2 = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'quotation.forwarded.test')
      .set('X-Forwarded-Host', 'quotation.forwarded.test');
    expect(res2.status).toBe(200);
  });

  it('token weblink is also isolated by custom domain (safe 404 for wrong tenant)', async () => {
    const { client, companyId } = await ownerWithCompany('token-iso');
    await db.customDomain.create({
      data: { companyId, hostname: 'quotation.tokeniso.test', status: 'ACTIVE' },
    });
    const { token } = await createFinalizedQuotationWithSlug(client, 'token-iso-slug');
    const other = await createCompanyFixture(db, 'other-iso');
    await db.customDomain.create({
      data: { companyId: other.companyId, hostname: 'quotation.otheriso.test', status: 'ACTIVE' },
    });
    const cross = await request(app)
      .get(`/api/public/quotations/${token}`)
      .set('Host', 'quotation.otheriso.test');
    expect(cross.status).toBe(404);
    const own = await request(app).get(`/api/public/quotations/${token}`).set('Host', 'quotation.tokeniso.test');
    expect(own.status).toBe(200);
  });

  it('PENDING custom domain is rejected (unknown host)', async () => {
    const { client, companyId } = await ownerWithCompany('pending-co');
    await db.customDomain.create({
      data: { companyId, hostname: 'quotation.pending.test', status: 'PENDING' },
    });
    const { slug } = await createFinalizedQuotationWithSlug(client, 'pending-slug');
    const res = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'quotation.pending.test');
    expect(res.status).toBe(404);
  });

  it('existing normal weblinks continue working (platform host)', async () => {
    const { client } = await ownerWithCompany('normal-weblink');
    const { token, slug } = await createFinalizedQuotationWithSlug(client, 'normal-slug');
    const bySlugApex = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'travelagencycrm.in');
    expect(bySlugApex.status).toBe(200);
    const byTokenApp = await request(app)
      .get(`/api/public/quotations/${token}`)
      .set('Host', 'app.travelagencycrm.in');
    expect(byTokenApp.status).toBe(200);
    const bySlugLocal = await request(app)
      .get(`/api/public/quotations/by-slug/${slug}`)
      .set('Host', 'localhost');
    expect(bySlugLocal.status).toBe(200);
  });
});
