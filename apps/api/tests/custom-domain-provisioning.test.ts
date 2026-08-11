import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { ConflictError, ValidationError } from '../src/utils/errors.js';

const awsMock = vi.hoisted(() => ({
  requestCertificate: vi.fn(),
  describeCertificate: vi.fn(),
  attachCertificate: vi.fn(),
  detachCertificate: vi.fn(),
  deleteCertificate: vi.fn(),
  isCertificateAttached: vi.fn(),
}));

const dnsMock = vi.hoisted(() => ({
  resolveCnameChain: vi.fn(),
  normalizeDnsTarget: (value: string) => value.trim().toLowerCase().replace(/\.$/, ''),
}));

vi.mock('../src/modules/custom-domains/aws-provisioning.service.js', () => awsMock);
vi.mock('../src/modules/custom-domains/dns.service.js', () => dnsMock);

import {
  checkCustomDomain,
  createCustomDomain,
  deleteCustomDomain,
  disableCustomDomain,
  getCustomDomain,
  isValidSubdomainHostname,
  updateCustomDomain,
} from '../src/modules/custom-domains/custom-domain-provisioning.service.js';
import { resolveCustomDomain } from '../src/modules/custom-domains/custom-domain.service.js';

/** Phase 3 provisioning: subdomain rules, ACM request/validation, CNAME check,
 * certificate attach, activation, disable — with AWS/DNS fully mocked. */

let db: PrismaClient;

beforeAll(() => {
  db = createTestPrismaClient();
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await truncateAll(db);
  vi.clearAllMocks();
});

const auth = (companyId: string) => ({ companyId, userId: 'u' }) as never;
const CNAME = 'app.travelagencycrm.in';

async function createCompany(slug: string) {
  return db.company.create({
    data: { name: `Company ${slug}`, slug, email: `contact@${slug}.local`, status: 'ACTIVE' },
  });
}

function issued(arn: string, validation = true) {
  awsMock.describeCertificate.mockResolvedValue({
    status: 'ISSUED',
    validationRecord: validation
      ? { name: `_abc.${arn}.example.com`, type: 'CNAME', value: '_xyz.acm-validations.aws' }
      : null,
  });
}

describe('subdomain validation', () => {
  it('accepts a valid subdomain', () => {
    expect(isValidSubdomainHostname('crm.easytour.com')).toBe(true);
    expect(isValidSubdomainHostname('crm.example.co.in')).toBe(true);
  });

  it('rejects apex/root domains', () => {
    expect(isValidSubdomainHostname('easytour.com')).toBe(false);
    expect(isValidSubdomainHostname('example.co.in')).toBe(false);
  });

  it('rejects a reserved platform hostname on create', async () => {
    const company = await createCompany('easy-tour');
    await expect(
      createCustomDomain(auth(company.id), 'app.travelagencycrm.in'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects an apex hostname on create', async () => {
    const company = await createCompany('easy-tour');
    await expect(createCustomDomain(auth(company.id), 'easytour.com')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('create domain', () => {
  it('requests exactly one ACM certificate and stays PENDING with safe validation data', async () => {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: {
        name: '_abc.crm.easytour.com',
        type: 'CNAME',
        value: '_xyz.acm-validations.aws',
      },
    });

    const info = await createCustomDomain(auth(company.id), 'https://CRM.EASYTOUR.COM/');

    expect(awsMock.requestCertificate).toHaveBeenCalledTimes(1);
    expect(awsMock.requestCertificate).toHaveBeenCalledWith('crm.easytour.com');
    expect(info.hostname).toBe('crm.easytour.com');
    expect(info.status).toBe('PENDING');
    expect(info.validationName).toBe('_abc.crm.easytour.com');
    expect(info.validationValue).toBe('_xyz.acm-validations.aws');
    // AWS internals are never exposed.
    expect(JSON.stringify(info)).not.toContain('arn:cert-1');
    expect(JSON.stringify(info)).not.toContain('certificateArn');
  });

  it('rejects a duplicate hostname belonging to another company', async () => {
    const a = await createCompany('easy-tour');
    const b = await createCompany('masti-travels');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: null,
    });
    await createCustomDomain(auth(a.id), 'crm.easytour.com');
    await expect(createCustomDomain(auth(b.id), 'crm.easytour.com')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('does not silently replace an ACTIVE domain', async () => {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    issued('arn:cert-1');
    awsMock.isCertificateAttached.mockResolvedValue(false);
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);
    await createCustomDomain(auth(company.id), 'crm.easytour.com');
    await checkCustomDomain(auth(company.id));

    await expect(
      createCustomDomain(auth(company.id), 'secure.easytour.com'),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('check domain', () => {
  async function setupPending(hostname = 'crm.easytour.com') {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: null,
    });
    await createCustomDomain(auth(company.id), hostname);
    return company;
  }

  it('stays PENDING when the ACM certificate is still validating', async () => {
    const company = await setupPending();
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: {
        name: '_abc.crm.easytour.com',
        type: 'CNAME',
        value: '_xyz.acm-validations.aws',
      },
    });
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);

    const info = await checkCustomDomain(auth(company.id));
    expect(info.status).toBe('PENDING');
    expect(info.lastError).toContain('SSL validation');
    expect(awsMock.attachCertificate).not.toHaveBeenCalled();
  });

  it('stays PENDING when the CRM CNAME is wrong', async () => {
    const company = await setupPending();
    dnsMock.resolveCnameChain.mockResolvedValue(['wrong.example.com']);

    const info = await checkCustomDomain(auth(company.id));
    expect(info.status).toBe('PENDING');
    expect(info.lastError).toContain('CNAME record');
    expect(awsMock.attachCertificate).not.toHaveBeenCalled();
  });

  it('attaches the certificate and activates when CNAME + ACM ISSUED', async () => {
    const company = await setupPending();
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);
    issued('arn:cert-1');
    awsMock.isCertificateAttached.mockResolvedValue(false);
    awsMock.attachCertificate.mockResolvedValue(undefined);

    const info = await checkCustomDomain(auth(company.id));
    expect(info.status).toBe('ACTIVE');
    expect(info.activatedAt).not.toBeNull();
    expect(info.lastError).toBeNull();
    expect(awsMock.attachCertificate).toHaveBeenCalledWith('arn:cert-1');
  });

  it('is idempotent on repeated checks (one cert, one attach)', async () => {
    const company = await setupPending();
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);
    issued('arn:cert-1');
    awsMock.isCertificateAttached.mockResolvedValueOnce(false).mockResolvedValue(true);
    awsMock.attachCertificate.mockResolvedValue(undefined);

    const first = await checkCustomDomain(auth(company.id));
    const second = await checkCustomDomain(auth(company.id));
    expect(first.status).toBe('ACTIVE');
    expect(second.status).toBe('ACTIVE');
    expect(awsMock.requestCertificate).toHaveBeenCalledTimes(1);
    expect(awsMock.attachCertificate).toHaveBeenCalledTimes(1);
  });
});

describe('activation + resolver', () => {
  it('Phase 1 resolver recognises the hostname after activation', async () => {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    issued('arn:cert-1');
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);
    awsMock.isCertificateAttached.mockResolvedValue(false);
    await createCustomDomain(auth(company.id), 'crm.easytour.com');
    await checkCustomDomain(auth(company.id));

    const resolved = await resolveCustomDomain('crm.easytour.com');
    expect(resolved).toEqual({ hostname: 'crm.easytour.com', companyId: company.id });
  });
});

describe('disable domain', () => {
  it('marks DISABLED, detaches the certificate, and stops resolving', async () => {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    issued('arn:cert-1');
    dnsMock.resolveCnameChain.mockResolvedValue([CNAME]);
    awsMock.isCertificateAttached.mockResolvedValue(false);
    await createCustomDomain(auth(company.id), 'crm.easytour.com');
    await checkCustomDomain(auth(company.id));

    awsMock.detachCertificate.mockResolvedValue(undefined);
    const info = await disableCustomDomain(auth(company.id));
    expect(info.status).toBe('DISABLED');
    expect(awsMock.detachCertificate).toHaveBeenCalledWith('arn:cert-1');

    expect(await resolveCustomDomain('crm.easytour.com')).toBeNull();
    expect(await getCustomDomain(auth(company.id))).toMatchObject({
      status: 'DISABLED',
      hostname: 'crm.easytour.com',
    });
  });
});

describe('edit and delete domain', () => {
  it('replaces the hostname, cleans up the old certificate and resets to PENDING', async () => {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValueOnce('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValueOnce({
      status: 'PENDING_VALIDATION',
      validationRecord: null,
    });
    await createCustomDomain(auth(company.id), 'crm.easytour.com');

    awsMock.detachCertificate.mockResolvedValue(undefined);
    awsMock.deleteCertificate.mockResolvedValue(undefined);
    awsMock.requestCertificate.mockResolvedValueOnce('arn:cert-2');
    awsMock.describeCertificate.mockResolvedValueOnce({
      status: 'PENDING_VALIDATION',
      validationRecord: { name: '_new.quote.easytour.com', type: 'CNAME', value: '_new.acm' },
    });

    const info = await updateCustomDomain(auth(company.id), 'quote.easytour.com');
    expect(info.status).toBe('PENDING');
    expect(info.hostname).toBe('quote.easytour.com');
    expect(info.validationName).toBe('_new.quote.easytour.com');
    expect(awsMock.detachCertificate).toHaveBeenCalledWith('arn:cert-1');
    expect(awsMock.deleteCertificate).toHaveBeenCalledWith('arn:cert-1');
    expect(awsMock.requestCertificate).toHaveBeenCalledWith('quote.easytour.com');
  });

  it('rejects editing a hostname already claimed by another company', async () => {
    const a = await createCompany('alpha-tours');
    const b = await createCompany('beta-tours');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: null,
    });
    await createCustomDomain(auth(a.id), 'crm.easytour.com');
    await createCustomDomain(auth(b.id), 'b.easytour.com');

    await expect(updateCustomDomain(auth(b.id), 'crm.easytour.com')).rejects.toThrow(
      'already in use',
    );
  });

  it('deletes the domain record and its SSL data, returning to NONE', async () => {
    const company = await createCompany('easy-tour');
    awsMock.requestCertificate.mockResolvedValue('arn:cert-1');
    awsMock.describeCertificate.mockResolvedValue({
      status: 'PENDING_VALIDATION',
      validationRecord: null,
    });
    await createCustomDomain(auth(company.id), 'crm.easytour.com');

    awsMock.detachCertificate.mockResolvedValue(undefined);
    awsMock.deleteCertificate.mockResolvedValue(undefined);
    const info = await deleteCustomDomain(auth(company.id));
    expect(info.status).toBe('NONE');
    expect(info.hostname).toBeNull();
    expect(awsMock.detachCertificate).toHaveBeenCalledWith('arn:cert-1');
    expect(awsMock.deleteCertificate).toHaveBeenCalledWith('arn:cert-1');

    expect(await resolveCustomDomain('crm.easytour.com')).toBeNull();
    expect(await getCustomDomain(auth(company.id))).toMatchObject({ status: 'NONE' });
  });
});
