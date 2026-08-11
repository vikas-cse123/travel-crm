import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { hashToken } from '../src/utils/crypto.js';
import { preferredPublicAppBaseUrl } from '../src/modules/custom-domains/custom-domain.service.js';
import { quotationsService } from '../src/modules/quotations/quotations.service.js';
import { env } from '../src/config/env.js';

/**
 * Phase 4 public links: ACTIVE custom domain becomes the preferred base URL
 * for new quotation links, with platform fallback, old-link compatibility and
 * cross-tenant public-token protection.
 */

let db: PrismaClient;
const REQUEST_CONTEXT = { ipAddress: null, userAgent: null } as const;

beforeAll(() => {
  db = createTestPrismaClient();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function seedQuotation(
  slug: string,
  domain?: { hostname: string; status: 'PENDING' | 'ACTIVE' | 'DISABLED' },
) {
  const company = await db.company.create({
    data: { name: `Company ${slug}`, slug, email: `contact@${slug}.local`, status: 'ACTIVE' },
  });
  const role = await db.role.create({
    data: {
      companyId: company.id,
      name: 'Owner',
      description: 'Owner',
      hierarchyLevel: 100,
      isSystem: true,
    },
  });
  const user = await db.user.create({
    data: {
      companyId: company.id,
      roleId: role.id,
      username: 'owner',
      fullName: 'Owner',
      email: `owner@${slug}.local`,
      normalizedEmail: `owner@${slug}.local`,
      passwordHash: 'x',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const query = await db.query.create({
    data: {
      companyId: company.id,
      queryNumber: 'QRY-1',
      customerName: 'Customer',
      phone: '+911111111111',
      normalizedPhone: '911111111111',
      leadSource: 'GOOGLE_ADS',
      travellerSummary: '2 Adults',
      createdById: user.id,
    },
  });
  const quotation = await db.quotation.create({
    data: {
      companyId: company.id,
      quotationNumber: 'QT-1',
      queryId: query.id,
      createdById: user.id,
      customerName: 'Customer',
      customerPhone: '+911111111111',
      destinationSummary: 'Kerala',
    },
  });
  const version = await db.quotationVersion.create({
    data: {
      companyId: company.id,
      quotationId: quotation.id,
      versionNumber: 1,
      title: 'Package',
      destinationSummary: 'Kerala',
      currency: 'INR',
      createdById: user.id,
      status: 'FINALIZED',
    },
  });
  if (domain) {
    await db.customDomain.create({ data: { companyId: company.id, ...domain } });
  }
  return {
    companyId: company.id,
    userId: user.id,
    quotationId: quotation.id,
    versionId: version.id,
  };
}

const auth = (companyId: string, userId: string) => ({ companyId, userId }) as never;

describe('preferredPublicAppBaseUrl', () => {
  it('uses the ACTIVE custom domain hostname', async () => {
    const { companyId } = await seedQuotation('easy-tour', {
      hostname: 'crm.easytour.com',
      status: 'ACTIVE',
    });
    expect(await preferredPublicAppBaseUrl(companyId)).toBe('https://crm.easytour.com');
  });

  it('falls back to the platform URL for a PENDING domain', async () => {
    const { companyId } = await seedQuotation('pending-customer', {
      hostname: 'crm.pendingcustomer.com',
      status: 'PENDING',
    });
    expect(await preferredPublicAppBaseUrl(companyId)).toBe(env.WEB_URL.replace(/\/$/, ''));
  });

  it('falls back to the platform URL for a DISABLED domain', async () => {
    const { companyId } = await seedQuotation('disabled-customer', {
      hostname: 'crm.disabledcustomer.com',
      status: 'DISABLED',
    });
    expect(await preferredPublicAppBaseUrl(companyId)).toBe(env.WEB_URL.replace(/\/$/, ''));
  });

  it('falls back to the platform URL when no custom domain exists', async () => {
    const { companyId } = await seedQuotation('no-domain');
    expect(await preferredPublicAppBaseUrl(companyId)).toBe(env.WEB_URL.replace(/\/$/, ''));
  });
});

describe('createPublicLink', () => {
  it('returns a custom-domain URL for an ACTIVE custom domain', async () => {
    const { companyId, userId, quotationId, versionId } = await seedQuotation('easy-tour', {
      hostname: 'crm.easytour.com',
      status: 'ACTIVE',
    });
    const result = await quotationsService.createPublicLink(
      auth(companyId, userId),
      quotationId,
      versionId,
      null,
      REQUEST_CONTEXT,
    );
    expect(result.url).toMatch(/^https:\/\/crm\.easytour\.com\/q\/[A-Za-z0-9_-]{32,}$/);
  });

  it('returns a platform URL when no custom domain exists', async () => {
    const { companyId, userId, quotationId, versionId } = await seedQuotation('no-domain');
    const result = await quotationsService.createPublicLink(
      auth(companyId, userId),
      quotationId,
      versionId,
      null,
      REQUEST_CONTEXT,
    );
    expect(result.url).toMatch(
      new RegExp(`^${env.WEB_URL.replace(/\/$/, '')}/q/[A-Za-z0-9_-]{32,}$`),
    );
  });
});

describe('publicView cross-tenant protection', () => {
  it('resolves the token on the platform host (no custom-domain context)', async () => {
    const { companyId, userId, quotationId, versionId } = await seedQuotation('easy-tour');
    await quotationsService.createPublicLink(
      auth(companyId, userId),
      quotationId,
      versionId,
      null,
      REQUEST_CONTEXT,
    );
    const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    const result = await quotationsService.publicView(quotation.publicToken!, {});
    expect(result.quotation.quotationNumber).toBe('QT-1');
  });

  it('resolves the token when the custom domain matches the quotation company', async () => {
    const { companyId, userId, quotationId, versionId } = await seedQuotation('easy-tour', {
      hostname: 'crm.easytour.com',
      status: 'ACTIVE',
    });
    await quotationsService.createPublicLink(
      auth(companyId, userId),
      quotationId,
      versionId,
      null,
      REQUEST_CONTEXT,
    );
    const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    const result = await quotationsService.publicView(quotation.publicToken!, {
      customDomainCompanyId: companyId,
    });
    expect(result.quotation.quotationNumber).toBe('QT-1');
  });

  it('rejects a token through another company custom domain (safe not-found)', async () => {
    const { companyId, userId, quotationId, versionId } = await seedQuotation('easy-tour', {
      hostname: 'crm.easytour.com',
      status: 'ACTIVE',
    });
    await quotationsService.createPublicLink(
      auth(companyId, userId),
      quotationId,
      versionId,
      null,
      REQUEST_CONTEXT,
    );
    const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });

    const other = await db.company.create({
      data: { name: 'Other Co', slug: 'other-co', email: 'other@co.local', status: 'ACTIVE' },
    });
    await expect(
      quotationsService.publicView(quotation.publicToken!, { customDomainCompanyId: other.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

/** Ensure a public token's hash is stable for the resolver. */
describe('token hash stability', () => {
  it('hashes a token deterministically for lookup', () => {
    const token = 'a'.repeat(32);
    expect(hashToken(token)).toBe(hashToken(token));
  });
});
