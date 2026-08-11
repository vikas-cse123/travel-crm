import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CompanyStatus, PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { isReservedHostname, normalizeHostname } from '../src/utils/hostname.js';
import { resolveCustomDomain } from '../src/modules/custom-domains/custom-domain.service.js';
import { assertCustomDomainTenant } from '../src/middleware/custom-domain.js';
import { ForbiddenError } from '../src/utils/errors.js';

/**
 * Phase 1 Custom Domain: hostname normalization, reserved-platform protection,
 * ACTIVE-domain → tenant resolution and the authenticated tenant-match guard.
 */

let db: PrismaClient;

beforeAll(() => {
  db = createTestPrismaClient();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
});

const UNIQUE_VIOLATION = 'P2002';

async function createCompany(db: PrismaClient, slug: string, status: CompanyStatus = 'ACTIVE') {
  return db.company.create({
    data: { name: `Company ${slug}`, slug, email: `contact@${slug}.local`, status },
  });
}

describe('normalizeHostname', () => {
  it('normalizes the hostname to lowercase', () => {
    expect(normalizeHostname('CRM.EASYTOUR.COM')).toBe('crm.easytour.com');
  });

  it('removes the protocol and a trailing slash', () => {
    expect(normalizeHostname('https://crm.easytour.com/')).toBe('crm.easytour.com');
    expect(normalizeHostname('http://crm.easytour.com')).toBe('crm.easytour.com');
  });

  it('rejects invalid hostnames', () => {
    expect(normalizeHostname('')).toBeNull();
    expect(normalizeHostname('   ')).toBeNull();
    expect(normalizeHostname('crm.easytour.com/login')).toBeNull();
    expect(normalizeHostname('crm.easytour.com?x=1')).toBeNull();
    expect(normalizeHostname('crm.easytour.com#frag')).toBeNull();
    expect(normalizeHostname('crm')).toBeNull();
    expect(normalizeHostname('not a host')).toBeNull();
    expect(normalizeHostname('*easytour.com')).toBeNull();
    expect(normalizeHostname('localhost')).toBeNull();
    expect(normalizeHostname('crm.localhost')).toBeNull();
  });

  it('rejects IP addresses', () => {
    expect(normalizeHostname('192.168.1.1')).toBeNull();
    expect(normalizeHostname('::1')).toBeNull();
    expect(normalizeHostname('2001:db8::1')).toBeNull();
  });

  it('rejects hostnames with ports', () => {
    expect(normalizeHostname('crm.easytour.com:443')).toBeNull();
    expect(normalizeHostname('https://crm.easytour.com:443/')).toBeNull();
  });
});

describe('isReservedHostname', () => {
  it('marks the production platform domain as reserved', () => {
    expect(isReservedHostname('app.travelagencycrm.in')).toBe(true);
    expect(isReservedHostname('APP.TRAVELAGENCYCRM.IN')).toBe(true);
  });

  it('does not mark a customer hostname as reserved', () => {
    expect(isReservedHostname('crm.easytour.com')).toBe(false);
  });
});

describe('CustomDomain resolution', () => {
  it('resolves an ACTIVE domain to its company', async () => {
    const company = await createCompany(db, 'easy-tour');
    await db.customDomain.create({
      data: { companyId: company.id, hostname: 'crm.easytour.com', status: 'ACTIVE' },
    });
    const resolved = await resolveCustomDomain('https://CRM.EASYTOUR.COM/');
    expect(resolved).toEqual({ hostname: 'crm.easytour.com', companyId: company.id });
  });

  it('does not resolve a PENDING domain', async () => {
    const company = await createCompany(db, 'easy-tour');
    await db.customDomain.create({
      data: { companyId: company.id, hostname: 'crm.easytour.com', status: 'PENDING' },
    });
    expect(await resolveCustomDomain('crm.easytour.com')).toBeNull();
  });

  it('does not resolve a DISABLED domain', async () => {
    const company = await createCompany(db, 'easy-tour');
    await db.customDomain.create({
      data: { companyId: company.id, hostname: 'crm.easytour.com', status: 'DISABLED' },
    });
    expect(await resolveCustomDomain('crm.easytour.com')).toBeNull();
  });

  it('does not resolve an unknown hostname', async () => {
    expect(await resolveCustomDomain('random-example.com')).toBeNull();
  });

  it('never resolves a reserved platform hostname', async () => {
    expect(await resolveCustomDomain('app.travelagencycrm.in')).toBeNull();
    expect(await resolveCustomDomain('https://app.travelagencycrm.in/')).toBeNull();
  });

  it('rejects a duplicate hostname belonging to two companies', async () => {
    const a = await createCompany(db, 'easy-tour');
    const b = await createCompany(db, 'masti-travels');
    await db.customDomain.create({
      data: { companyId: a.id, hostname: 'crm.easytour.com', status: 'ACTIVE' },
    });
    await expect(
      db.customDomain.create({
        data: { companyId: b.id, hostname: 'crm.easytour.com', status: 'ACTIVE' },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('allows at most one custom-domain record per company', async () => {
    const a = await createCompany(db, 'easy-tour');
    await db.customDomain.create({
      data: { companyId: a.id, hostname: 'crm.easytour.com', status: 'ACTIVE' },
    });
    await expect(
      db.customDomain.create({
        data: { companyId: a.id, hostname: 'secure.easytour.com', status: 'PENDING' },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('does not resolve a domain whose company is not ACTIVE', async () => {
    const company = await createCompany(db, 'suspended-travels', 'SUSPENDED');
    await db.customDomain.create({
      data: { companyId: company.id, hostname: 'crm.easytour.com', status: 'ACTIVE' },
    });
    expect(await resolveCustomDomain('crm.easytour.com')).toBeNull();
  });
});

describe('authenticated tenant match', () => {
  it('allows a session company matching the custom-domain tenant', () => {
    expect(() =>
      assertCustomDomainTenant(
        { customDomain: { hostname: 'crm.easytour.com', companyId: 'company-a' } } as never,
        'company-a',
      ),
    ).not.toThrow();
  });

  it('rejects a session company that does not match the custom-domain tenant', () => {
    expect(() =>
      assertCustomDomainTenant(
        { customDomain: { hostname: 'crm.easytour.com', companyId: 'company-a' } } as never,
        'company-b',
      ),
    ).toThrow(ForbiddenError);
  });

  it('does nothing when no custom-domain context exists', () => {
    expect(() =>
      assertCustomDomainTenant({ customDomain: undefined } as never, 'company-a'),
    ).not.toThrow();
  });
});
