import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';

/**
 * Host validation: with dynamic ALB routing, only platform hosts and ACTIVE
 * custom domains may reach the application. Unknown/PENDING/DISABLED hosts and
 * spoofed hostnames are rejected before any route handling; internal health
 * checks stay exempt.
 */

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

/** GET /api/settings/custom-domain — host validation runs before auth, so an
 * allowed host returns 401 (no session) and a rejected host returns 404. */
function probe(host: string) {
  return request(app).get('/api/settings/custom-domain').set('Host', host);
}

async function company(slug: string) {
  return db.company.create({
    data: { name: `Company ${slug}`, slug, email: `contact@${slug}.local`, status: 'ACTIVE' },
  });
}

async function domainFor(
  companyId: string,
  hostname: string,
  status: 'PENDING' | 'ACTIVE' | 'DISABLED',
) {
  return db.customDomain.create({ data: { companyId, hostname, status } });
}

describe('host validation', () => {
  it('allows the reserved production platform hostname', async () => {
    expect((await probe('app.travelagencycrm.in')).status).toBe(401);
  });

  it('allows the configured platform WEB_URL hostname', async () => {
    // WEB_URL resolves to localhost in the test environment.
    expect((await probe('localhost')).status).toBe(401);
  });

  it('allows an ACTIVE custom domain hostname', async () => {
    const c = await company('easy-tour');
    await domainFor(c.id, 'crm.easytour.com', 'ACTIVE');
    expect((await probe('crm.easytour.com')).status).toBe(401);
  });

  it('allows a case-normalized ACTIVE custom domain hostname', async () => {
    const c = await company('easy-tour');
    await domainFor(c.id, 'crm.easytour.com', 'ACTIVE');
    expect((await probe('CRM.EASYTOUR.COM')).status).toBe(401);
  });

  it('rejects a PENDING custom domain hostname', async () => {
    const c = await company('pending-customer');
    await domainFor(c.id, 'crm.pendingcustomer.com', 'PENDING');
    expect((await probe('crm.pendingcustomer.com')).status).toBe(404);
  });

  it('rejects a DISABLED custom domain hostname', async () => {
    const c = await company('disabled-customer');
    await domainFor(c.id, 'crm.disabledcustomer.com', 'DISABLED');
    expect((await probe('crm.disabledcustomer.com')).status).toBe(404);
  });

  it('rejects a totally unknown hostname', async () => {
    expect((await probe('attacker-example.com')).status).toBe(404);
  });

  it('rejects a spoofed hostname that merely contains a valid one', async () => {
    const c = await company('easy-tour');
    await domainFor(c.id, 'crm.easytour.com', 'ACTIVE');
    expect((await probe('crm.easytour.com.attacker.com')).status).toBe(404);
  });

  it('does not reveal PENDING/DISABLED state in the rejection', async () => {
    const c = await company('pending-customer');
    await domainFor(c.id, 'crm.pendingcustomer.com', 'PENDING');
    const response = await probe('crm.pendingcustomer.com');
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('PENDING');
    expect(JSON.stringify(response.body)).not.toContain('pendingcustomer');
  });
});

describe('internal health checks', () => {
  it('keeps the API health-check path working under an internal/arbitrary Host', async () => {
    // ALB/ECS probes can carry an internal host (IP/ELB) rather than a public
    // hostname; the health paths are exempt from host validation.
    const dbHealth = await request(app).get('/api/health/db').set('Host', '10.0.0.5');
    expect(dbHealth.status).toBe(200);
    expect(dbHealth.body.data.database).toBe('up');

    const health = await request(app).get('/api/health').set('Host', 'internal-elb');
    expect(health.status).toBe(200);
  });
});
