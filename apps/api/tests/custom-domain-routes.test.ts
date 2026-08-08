import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createCompanyFixture, createUserFixture, seedPermissionCatalog } from './helpers/fixtures.js';
import { createAuthClient } from './helpers/auth-client.js';

const awsMock = vi.hoisted(() => ({
  requestCertificate: vi.fn(),
  describeCertificate: vi.fn(),
  attachCertificate: vi.fn(),
  detachCertificate: vi.fn(),
  isCertificateAttached: vi.fn(),
}));

const dnsMock = vi.hoisted(() => ({
  resolveCnameChain: vi.fn(),
  normalizeDnsTarget: (value: string) => value.trim().toLowerCase().replace(/\.$/, ''),
}));

vi.mock('../src/modules/custom-domains/aws-provisioning.service.js', () => awsMock);
vi.mock('../src/modules/custom-domains/dns.service.js', () => dnsMock);

/**
 * Phase 3 domain-management routes: permission gating, tenant scoping and safe
 * responses (no AWS internals), with ACM/ELBv2/DNS fully mocked.
 */

let app: Express;
let db: PrismaClient;
const CNAME = 'app.travelagencycrm.in';

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
  await seedPermissionCatalog(db);
  vi.clearAllMocks();
});

async function grant(roleId: string, key: string) {
  const permission = await db.permission.findUnique({ where: { key } });
  if (permission) {
    await db.rolePermission.create({ data: { roleId, permissionId: permission.id } });
  }
}

async function ownerClient(slug: string) {
  const company = await createCompanyFixture(db, slug);
  await grant(company.ownerRoleId, 'settings.view');
  await grant(company.ownerRoleId, 'settings.update');
  const client = createAuthClient(app);
  await client.post('/api/auth/login', {
    email: `owner@${slug}.local`,
    password: 'Fixture@2026',
  });
  return { company, client };
}

describe('custom domain routes', () => {
  it('rejects management by a user without SETTINGS_UPDATE', async () => {
    const company = await createCompanyFixture(db, 'easy-tour');
    await grant(company.ownerRoleId, 'settings.view');
    await createUserFixture(db, company, {
      username: 'manager',
      email: 'manager@easy-tour.local',
    });
    const client = createAuthClient(app);
    await client.post('/api/auth/login', {
      email: 'manager@easy-tour.local',
      password: 'Fixture@2026',
    });

    const response = await client.post('/api/settings/custom-domain', {
      hostname: 'crm.easytour.com',
    });
    expect(response.status).toBe(403);
  });

  it('owner can set up a domain; AWS internals are never exposed', async () => {
    const { client } = await ownerClient('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: {
        name: '_abc.crm.easytour.com',
        type: 'CNAME',
        value: '_xyz.acm-validations.aws',
      },
    });

    const created = await client.post('/api/settings/custom-domain', {
      hostname: 'https://CRM.EASYTOUR.COM/',
    });
    expect(created.status).toBe(200);
    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.hostname).toBe('crm.easytour.com');
    const serialised = JSON.stringify(created.body);
    expect(serialised).not.toContain('arn:cert-1');
    expect(serialised).not.toContain('certificateArn');
    expect(serialised).not.toContain('listener');

    const fetched = await client.get('/api/settings/custom-domain');
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.validationName).toBe('_abc.crm.easytour.com');
    expect(JSON.stringify(fetched.body)).not.toContain('certificateArn');
  });

  it('check activates the domain, disable marks it DISABLED', async () => {
    const { client } = await ownerClient('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({ status: 'ISSUED', validationRecord: null });
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);
    awsMock.isCertificateAttached.mockResolvedValue(false);
    awsMock.attachCertificate.mockResolvedValue(undefined);
    awsMock.detachCertificate.mockResolvedValue(undefined);

    await client.post('/api/settings/custom-domain', { hostname: 'crm.easytour.com' });
    const checked = await client.post('/api/settings/custom-domain/check');
    expect(checked.status).toBe(200);
    expect(checked.body.data.status).toBe('ACTIVE');

    const disabled = await client.post('/api/settings/custom-domain/disable');
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.status).toBe('DISABLED');
  });

  it('another tenant cannot see or manage the first tenant domain', async () => {
    const { client: clientA } = await ownerClient('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: null,
    });
    await clientA.post('/api/settings/custom-domain', { hostname: 'crm.easytour.com' });

    const companyB = await createCompanyFixture(db, 'masti-travels');
    await grant(companyB.ownerRoleId, 'settings.view');
    const clientB = createAuthClient(app);
    await clientB.post('/api/auth/login', {
      email: 'owner@masti-travels.local',
      password: 'Fixture@2026',
    });

    const fetchedB = await clientB.get('/api/settings/custom-domain');
    expect(fetchedB.status).toBe(200);
    expect(fetchedB.body.data.status).toBe('NONE');
    expect(fetchedB.body.data.hostname).toBeNull();
  });
});
