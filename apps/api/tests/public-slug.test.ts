import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { normalizePublicSlug, isReservedPublicSlug } from '@interscale/shared';

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
  childrenWithBed: 1,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  currency: 'INR',
  services: ['HOTEL', 'SIGHTSEEING'],
  itinerary: [{ country: 'India', destination: 'Goa', nights: 4, sequence: 1 }],
});

async function finalizedQuotation(client: ReturnType<typeof createAuthClient>) {
  const lead = (await client.post('/api/queries', leadPayload())).body.data;
  const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
  const version = quotation.versions[0];
  await client.post(`/api/quotations/${quotation.id}/versions/${version.id}/finalize`);
  const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {
    quotationVersionId: version.id,
  });
  const token = link.body.data.url.split('/q/')[1];
  return { client, lead, quotation, version, token };
}

describe('public slug normalization', () => {
  it('normalizes names to canonical slugs', () => {
    expect(normalizePublicSlug('Mohan')).toBe('mohan');
    expect(normalizePublicSlug('Mohan Kumar')).toBe('mohan-kumar');
    expect(normalizePublicSlug('  Mohan   Singapore  ')).toBe('mohan-singapore');
    expect(normalizePublicSlug('Mohan--Singapore')).toBe('mohan-singapore');
    expect(normalizePublicSlug('--Mohan--')).toBe('mohan');
    expect(normalizePublicSlug('Mohan & Co.')).toBe('mohan-co');
    expect(normalizePublicSlug('...')).toBe('');
  });

  it('reserves marketing and system top-level paths', () => {
    for (const reserved of [
      'privacy',
      'terms',
      'login',
      'signup',
      'api',
      'q',
      'admin',
      'dashboard',
    ]) {
      expect(isReservedPublicSlug(reserved)).toBe(true);
    }
    expect(isReservedPublicSlug('mohan')).toBe(false);
  });
});

describe('friendly weblink name (publicSlug)', () => {
  it('saves a custom slug and exposes it on the quotation', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('slug-owner@alpha.test'));
    const res = await client.patch(`/api/quotations/${quotation.id}/weblink-name`, {
      publicSlug: 'Mohan Singapore',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.publicSlug).toBe('mohan-singapore');
    const details = (await client.get(`/api/quotations/${quotation.id}`)).body.data;
    expect(details.publicSlug).toBe('mohan-singapore');
  });

  it('rejects a reserved name', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('reserved@alpha.test'));
    const res = await client.patch(`/api/quotations/${quotation.id}/weblink-name`, {
      publicSlug: 'login',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('This Weblink Name is reserved. Choose another name.');
  });

  it('rejects a globally duplicated slug across tenants', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('dup-a@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'mohan' });
    const other = await owner('dup-b@beta.test', 'Beta Travel');
    const otherQuotation = (
      await other.post('/api/quotations', {
        queryId: (await other.post('/api/queries', leadPayload())).body.data.id,
      })
    ).body.data;
    const otherVersion = otherQuotation.versions[0];
    await other.post(`/api/quotations/${otherQuotation.id}/versions/${otherVersion.id}/finalize`);
    const res = await other.patch(`/api/quotations/${otherQuotation.id}/weblink-name`, {
      publicSlug: 'Mohan',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe(
      'This Weblink Name is already in use. Choose another name.',
    );
  });

  it('lets the same quotation keep (and re-save) its own slug', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('same@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const again = await client.patch(`/api/quotations/${quotation.id}/weblink-name`, {
      publicSlug: 'Mohan',
    });
    expect(again.status).toBe(200);
    expect(again.body.data.publicSlug).toBe('mohan');
  });

  it('clears the slug when blank, without touching the public token', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('clear@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const tokenBefore = (await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } }))
      .publicToken;
    const cleared = await client.patch(`/api/quotations/${quotation.id}/weblink-name`, {
      publicSlug: '',
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.publicSlug).toBeNull();
    const row = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(row.publicSlug).toBeNull();
    expect(row.publicToken).toBe(tokenBefore);
  });
});

describe('public slug resolution', () => {
  it('resolves a slug to the same public quotation as the token', async () => {
    const { client, quotation, token } = await finalizedQuotation(
      await owner('resolve@alpha.test'),
    );
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const anon = createAuthClient(app);
    const byToken = await anon.get(`/api/public/quotations/${token}`);
    const bySlug = await anon.get(`/api/public/quotations/by-slug/mohan`);
    expect(byToken.status).toBe(200);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data.quotation.quotationNumber).toBe(
      byToken.body.data.quotation.quotationNumber,
    );
  });

  it('returns 404 for an unknown slug without leaking private data', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('unknown@alpha.test'));
    // The quotation exists but has no slug; a guessed slug must still 404.
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'private' });
    const anon = createAuthClient(app);
    const res = await anon.get(`/api/public/quotations/by-slug/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it('old /q/:token URL keeps working with or without a slug', async () => {
    const { client, quotation, token } = await finalizedQuotation(
      await owner('backcompat@alpha.test'),
    );
    // No slug: token URL works.
    expect((await createAuthClient(app).get(`/api/public/quotations/${token}`)).status).toBe(200);
    // Add a slug: token URL still works.
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    expect((await createAuthClient(app).get(`/api/public/quotations/${token}`)).status).toBe(200);
  });

  it('changing the slug never invalidates or regenerates the token', async () => {
    const { client, quotation, token } = await finalizedQuotation(await owner('change@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const rowBefore = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, {
      publicSlug: 'Mohan Singapore',
    });
    const rowAfter = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(rowAfter.publicSlug).toBe('mohan-singapore');
    expect(rowAfter.publicToken).toBe(rowBefore.publicToken);
    expect(rowAfter.publicToken).toBe(token);
  });
});

describe('friendly URL in weblink actions', () => {
  it('Copy/Open weblink returns the friendly URL when a slug exists', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('copy@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {});
    expect(link.status).toBe(200);
    expect(link.body.data.url).toBe('https://travelagencycrm.in/mohan');
    expect(link.body.data.url).not.toContain('/q/');
  });

  it('returns the token URL when the slug is NULL', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('nulllink@alpha.test'));
    const link = await client.post(`/api/quotations/${quotation.id}/public-link`, {});
    expect(link.status).toBe(200);
    expect(link.body.data.url).toContain('/q/');
  });
});

describe('revision behaviour', () => {
  it('preserves publicSlug and publicToken when creating a revision', async () => {
    const { client, quotation, version, token } = await finalizedQuotation(
      await owner('revision@alpha.test'),
    );
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const rowBefore = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    const rev = await client.post(`/api/quotations/${quotation.id}/versions`, {
      sourceVersionId: version.id,
    });
    expect(rev.status).toBe(201);
    const rowAfter = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(rowAfter.publicSlug).toBe(rowBefore.publicSlug);
    expect(rowAfter.publicToken).toBe(rowBefore.publicToken);
    expect(rowAfter.publicToken).toBe(token);
    expect(rowAfter.publicVersionId).toBe(rowBefore.publicVersionId);
    // No duplicate slug record was created.
    expect(await db.quotation.count({ where: { publicSlug: 'mohan' } })).toBe(1);
  });
});

describe('quotation create/save/edit stays intact', () => {
  it('still updates quotation fields and can add a slug later', async () => {
    const client = await owner('edit@alpha.test');
    const lead = (await client.post('/api/queries', leadPayload())).body.data;
    const quotation = (await client.post('/api/quotations', { queryId: lead.id })).body.data;
    expect(quotation.publicSlug).toBeNull();
    const updated = await client.patch(`/api/quotations/${quotation.id}`, {
      destinationSummary: 'Goa extended',
      rooms: 2,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.destinationSummary).toBe('Goa extended');
    // Add a slug later on an existing quotation.
    const slug = await client.patch(`/api/quotations/${quotation.id}/weblink-name`, {
      publicSlug: 'Mohan Goa',
    });
    expect(slug.status).toBe(200);
    expect(slug.body.data.publicSlug).toBe('mohan-goa');
  });
});

describe('friendly slug actions (track/accept/reject)', () => {
  it('tracks a visit via the slug endpoint', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('track@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const anon = createAuthClient(app);
    const res = await anon.post(`/api/public/quotations/by-slug/mohan/track`, { ctaClicks: 2 });
    expect(res.status).toBe(200);
    const views = await db.quotationWeblinkView.findMany({ where: { quotationId: quotation.id } });
    expect(views).toHaveLength(1);
    expect(views[0]!.ctaClicks).toBe(2);
  });

  it('accepts via the slug endpoint and updates the quotation', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('accept@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const anon = createAuthClient(app);
    const res = await anon.post(`/api/public/quotations/by-slug/mohan/accept`, {
      customerName: 'Aarav Mehta',
      confirmed: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPTED');
    const row = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(row.status).toBe('ACCEPTED');
    expect(row.acceptedVersionId).toBeTruthy();
  });

  it('rejects via the slug endpoint and records the reason', async () => {
    const { client, quotation } = await finalizedQuotation(await owner('reject@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    const anon = createAuthClient(app);
    const res = await anon.post(`/api/public/quotations/by-slug/mohan/reject`, {
      reason: 'Dates no longer work',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    const row = await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(row.status).toBe('REJECTED');
    expect(row.rejectionReason).toBe('Dates no longer work');
  });

  it('returns 404 for accept/reject on an unknown slug', async () => {
    const anon = createAuthClient(app);
    expect(
      (await anon.post('/api/public/quotations/by-slug/nope/reject', { reason: 'x' })).status,
    ).toBe(404);
    expect(
      (
        await anon.post('/api/public/quotations/by-slug/nope/accept', {
          customerName: 'Aarav Mehta',
          confirmed: true,
        })
      ).status,
    ).toBe(404);
  });
});

describe('revocation parity', () => {
  it('revoking the public link invalidates both token and slug URLs', async () => {
    const { client, quotation, token } = await finalizedQuotation(await owner('revoke@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    await client.delete(`/api/quotations/${quotation.id}/public-link`);
    const anon = createAuthClient(app);
    expect((await anon.get(`/api/public/quotations/${token}`)).status).toBe(404);
    expect((await anon.get(`/api/public/quotations/by-slug/mohan`)).status).toBe(404);
  });
});

describe('expiry + publicVersion parity', () => {
  it('token and slug resolve the same current version regardless of expiry', async () => {
    const { client, quotation, token, version } = await finalizedQuotation(
      await owner('parity@alpha.test'),
    );
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'Mohan' });
    // Expiry is presentation-only for both resolvers (identical lookup semantics).
    await db.quotation.update({
      where: { id: quotation.id },
      data: { publicTokenExpiresAt: new Date(Date.now() - 86_400_000) },
    });
    const anon = createAuthClient(app);
    const byToken = await anon.get(`/api/public/quotations/${token}`);
    const bySlug = await anon.get(`/api/public/quotations/by-slug/mohan`);
    expect(byToken.status).toBe(200);
    expect(bySlug.status).toBe(200);
    expect(byToken.body.data.version.id).toBe(version.id);
    expect(bySlug.body.data.version.id).toBe(version.id);
  });
});

describe('Leads list weblink URL', () => {
  it('returns the friendly URL when the linked quotation has a publicSlug', async () => {
    const { client, lead, quotation } = await finalizedQuotation(await owner('leads@alpha.test'));
    await client.patch(`/api/quotations/${quotation.id}/weblink-name`, { publicSlug: 'popsa' });
    const list = await client.get('/api/queries');
    expect(list.status).toBe(200);
    const row = list.body.data.data.find((r: { id: string }) => r.id === lead.id);
    expect(row.weblink.publicUrl).toBe('https://travelagencycrm.in/popsa');
  });

  it('falls back to the token URL when publicSlug is NULL', async () => {
    const { client, lead } = await finalizedQuotation(await owner('leadstoken@alpha.test'));
    const list = await client.get('/api/queries');
    const row = list.body.data.data.find((r: { id: string }) => r.id === lead.id);
    expect(row.weblink.publicUrl).toContain('/q/');
    expect(row.weblink.publicUrl).not.toContain('travelagencycrm.in/');
  });
});
