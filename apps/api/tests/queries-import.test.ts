import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import { hashPassword } from '../src/utils/crypto.js';

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

async function owner(email: string, companyName: string) {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}
async function employee(
  admin: Awaited<ReturnType<typeof owner>>,
  roleName: string,
  email: string,
  username: string,
  status = 'ACTIVE',
) {
  const lookups = await admin.get('/api/users/lookups');
  const role = lookups.body.data.roles.find((value: { name: string }) => value.name === roleName);
  return admin.post('/api/users', {
    fullName: username.replaceAll('-', ' '),
    username,
    email,
    roleId: role.id,
    permissionTemplateId: null,
    status,
    temporaryPassword: 'Temporary@2026',
    confirmTemporaryPassword: 'Temporary@2026',
    mustChangePassword: false,
  });
}
async function signIn(email: string) {
  const client = createAuthClient(app);
  const response = await client.post('/api/auth/login', {
    email,
    password: 'Temporary@2026',
    rememberMe: false,
    loginMode: 'COMPANY_USER',
  });
  expect(response.status).toBe(200);
  return client;
}

/** Seed an ACTIVE Destination master in the owner's company. */
async function seedDestination(ownerEmail: string, name: string, countryName = 'India') {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const city = await db.city.create({
    data: {
      companyId: ownerUser.companyId,
      countryCode: 'IN',
      countryName: 'India',
      name: `${name} City`,
      normalizedName: `${name.toLowerCase()} city`,
      status: 'ACTIVE',
      createdById: ownerUser.id,
    },
  });
  return db.destination.create({
    data: {
      companyId: ownerUser.companyId,
      countryCode: 'IN',
      countryName,
      name,
      normalizedName: name.toLowerCase(),
      destinationType: 'DOMESTIC',
      status: 'ACTIVE',
      createdById: ownerUser.id,
      cities: { create: { companyId: ownerUser.companyId, cityId: city.id, sequence: 1 } },
    },
  });
}

function importPayload(rows: unknown[], skipDuplicates = false) {
  return { rows, skipDuplicates };
}

describe('CSV lead import', () => {
  it('imports a valid CSV with automatic lead creation and activity logs', async () => {
    const email = 'owner@import1.test';
    const client = await owner(email, 'Import One');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Ravi Kumar',
          phone: '+91 98765 11111',
          email: 'ravi@example.com',
          leadSource: 'Referral',
          travelStartDate: '2026-12-10',
          adults: '2',
        },
        {
          customerName: 'Meera Shah',
          phone: '98222 22222',
          leadSource: 'WEBSITE',
          currency: 'USD',
        },
      ]),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.failed).toBe(0);
    expect(res.body.data.results.map((r: { status: string }) => r.status)).toEqual([
      'IMPORTED',
      'IMPORTED',
    ]);

    const rows = await db.query.findMany({
      where: { companyId: ownerUser.companyId },
      orderBy: { queryNumber: 'asc' },
      include: { assignedTo: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.customerName).toBe('Ravi Kumar');
    expect(rows[0]!.normalizedPhone).toBe('9876511111');
    expect(rows[0]!.assignedToId).toBe(ownerUser.id);
    // Per-lead QUERY_CREATED logs are produced by the reused create logic.
    expect(
      await db.activityLog.count({
        where: { companyId: ownerUser.companyId, action: 'QUERY_CREATED' },
      }),
    ).toBe(2);
  });

  it('marks a missing required field as a failed row without creating a broken lead', async () => {
    const email = 'owner@import2.test';
    const client = await owner(email, 'Import Two');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'No Phone',
          phone: '',
          leadSource: 'REFERRAL',
          ignoredColumnNotes: [{ label: 'Origin City', value: 'Hyderabad' }],
        },
      ]),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(0);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results[0].reason).toMatch(/phone/i);
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(0);
    expect(await db.queryNote.count({ where: { companyId: ownerUser.companyId } })).toBe(0);
  });

  it('creates one consolidated note from opted-in ignored CSV columns', async () => {
    const email = 'owner@import-notes.test';
    const client = await owner(email, 'Import Notes');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Ravi Kumar',
          phone: '98765 11111',
          leadSource: 'REFERRAL',
          ignoredColumnNotes: [
            { label: 'Origin City', value: 'Hyderabad' },
            { label: 'Total Nights', value: '6' },
          ],
        },
      ]),
    );

    expect(res.body.data.imported).toBe(1);
    const note = await db.queryNote.findFirstOrThrow({
      where: { companyId: ownerUser.companyId },
    });
    expect(note.content).toBe('Imported CSV details\n\nOrigin City: Hyderabad\nTotal Nights: 6');
    expect(await db.queryNote.count({ where: { companyId: ownerUser.companyId } })).toBe(1);
  });

  it('rejects invalid email and invalid date per row', async () => {
    const email = 'owner@import3.test';
    const client = await owner(email, 'Import Three');

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Bad Email',
          phone: '98111 11111',
          email: 'not-an-email',
          leadSource: 'OTHER',
        },
        {
          customerName: 'Bad Date',
          phone: '98222 22222',
          leadSource: 'OTHER',
          travelStartDate: '2026/13/99',
        },
        {
          customerName: 'Good Row',
          phone: '98333 33333',
          leadSource: 'OTHER',
          travelStartDate: '2026-12-10',
        },
      ]),
    );

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.failed).toBe(2);
    const reasons = res.body.data.results
      .filter((r: { status: string }) => r.status === 'FAILED')
      .map((r: { reason: string }) => r.reason);
    expect(reasons.join(' ')).toMatch(/email/i);
    expect(reasons.join(' ')).toMatch(/date/i);
  });

  it('detects duplicates by phone/email and skips them when requested', async () => {
    const email = 'owner@import4.test';
    const client = await owner(email, 'Import Four');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    // An existing lead with the same phone.
    await client.post('/api/queries', {
      customerName: 'Existing',
      phone: '+91 98444 44444',
      leadSource: 'REFERRAL',
      services: ['HOTEL'],
    });

    const res = await client.post(
      '/api/queries/import',
      importPayload(
        [
          { customerName: 'Duplicate Phone', phone: '+91 98444 44444', leadSource: 'REFERRAL' },
          { customerName: 'Fresh Lead', phone: '98555 55555', leadSource: 'REFERRAL' },
        ],
        true,
      ),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.results[0].status).toBe('SKIPPED');
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(2);
  });

  it('imports duplicates anyway when skipDuplicates is false', async () => {
    const email = 'owner@import5.test';
    const client = await owner(email, 'Import Five');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    await client.post('/api/queries', {
      customerName: 'Existing',
      phone: '+91 98444 44444',
      leadSource: 'REFERRAL',
      services: ['HOTEL'],
    });

    const res = await client.post(
      '/api/queries/import',
      importPayload(
        [{ customerName: 'Imported Anyway', phone: '+91 98444 44444', leadSource: 'REFERRAL' }],
        false,
      ),
    );

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.skipped).toBe(0);
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(2);
  });

  it('rejects an unknown assignee and never assigns across tenants', async () => {
    const email = 'owner@import6.test';
    const client = await owner(email, 'Import Six');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    // Another company's user must never resolve as an assignee.
    await owner('owner@other-tenant.test', 'Other Tenant');

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Bad Assignee',
          phone: '98666 66666',
          leadSource: 'REFERRAL',
          assignedTo: 'owner@other-tenant.test',
        },
      ]),
    );

    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results[0].reason).toMatch(/assignee/i);
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(0);
  });

  it('resolves an assignee inside the same company', async () => {
    const adminEmail = 'owner@import7.test';
    const admin = await owner(adminEmail, 'Import Seven');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: adminEmail } });
    await employee(admin, 'Sales Executive', 'sales@import7.test', 'sales-exec');

    const res = await admin.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Assigned Lead',
          phone: '98777 77777',
          leadSource: 'REFERRAL',
          assignedTo: 'sales-exec',
        },
      ]),
    );

    expect(res.body.data.imported).toBe(1);
    const row = await db.query.findFirstOrThrow({
      where: { companyId: ownerUser.companyId, customerName: 'Assigned Lead' },
    });
    const salesUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'sales@import7.test' },
    });
    expect(row.assignedToId).toBe(salesUser.id);
  });

  it('blocks a user who cannot create leads from importing', async () => {
    const adminEmail = 'owner@import8.test';
    const admin = await owner(adminEmail, 'Import Eight');
    await employee(admin, 'Sales Executive', 'sales@import8.test', 'sales-exec');
    // Create a role without QUERIES_CREATE.
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: adminEmail } });
    const noCreateRole = await db.role.create({
      data: {
        companyId: ownerUser.companyId,
        name: 'No Create',
        description: 'No create',
        hierarchyLevel: 5,
        isSystem: false,
      },
    });
    await db.user.create({
      data: {
        companyId: ownerUser.companyId,
        roleId: noCreateRole.id,
        username: 'no-create',
        fullName: 'No Create',
        email: 'no-create@import8.test',
        normalizedEmail: 'no-create@import8.test',
        passwordHash: await hashPassword('Temporary@2026'),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const restricted = await signIn('no-create@import8.test');

    const res = await restricted.post(
      '/api/queries/import',
      importPayload([{ customerName: 'Denied', phone: '98888 88888', leadSource: 'REFERRAL' }]),
    );

    expect(res.status).toBe(403);
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(0);
  });

  it('rejects an oversized import cleanly', async () => {
    const email = 'owner@import9.test';
    const client = await owner(email, 'Import Nine');
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      customerName: `Customer ${i}`,
      phone: `98000 00${String(i).padStart(3, '0')}`,
      leadSource: 'REFERRAL',
    }));

    const res = await client.post('/api/queries/import', importPayload(rows));
    expect(res.status).toBe(400);
  });

  it('returns a partial-success summary and an error CSV for failed rows', async () => {
    const email = 'owner@import10.test';
    const client = await owner(email, 'Import Ten');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        { customerName: 'Good Lead', phone: '98911 11111', leadSource: 'REFERRAL' },
        { customerName: 'X', phone: '', leadSource: 'REFERRAL' },
      ]),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.errorCsv.mimeType).toBe('text/csv');
    expect(res.body.data.errorCsv.content).toMatch(/Reason/);
    expect(res.body.data.errorCsv.content).toContain('Row');
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(1);
  });

  it('resolves a destination against company masters and rejects unknown destinations', async () => {
    const email = 'owner@import11.test';
    const client = await owner(email, 'Import Eleven');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });
    await seedDestination(email, 'Goa');

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Known Dest',
          phone: '98922 22222',
          leadSource: 'REFERRAL',
          destination: 'Goa',
        },
        {
          customerName: 'Unknown Dest',
          phone: '98933 33333',
          leadSource: 'REFERRAL',
          destination: 'Atlantis',
        },
      ]),
    );

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results[1].reason).toMatch(/destination/i);

    const known = await db.query.findFirstOrThrow({
      where: { companyId: ownerUser.companyId, customerName: 'Known Dest' },
      include: { itinerary: true },
    });
    expect(known.itinerary[0]!.destination).toBe('Goa');
    // No new destination master was created from arbitrary CSV text.
    expect(await db.destination.count({ where: { companyId: ownerUser.companyId } })).toBe(1);
  });

  it('blocks a row that assigns to another user when the caller lacks assign permission', async () => {
    const adminEmail = 'owner@import12.test';
    const admin = await owner(adminEmail, 'Import Twelve');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: adminEmail } });
    await employee(admin, 'Sales Executive', 'sales@import12.test', 'sales-exec');

    // A role with create but no assign permission.
    const role = await db.role.create({
      data: {
        companyId: ownerUser.companyId,
        name: 'Create Only',
        description: 'Create only',
        hierarchyLevel: 5,
        isSystem: false,
      },
    });
    const createPermission = await db.permission.findUniqueOrThrow({
      where: { key: 'queries.create' },
    });
    await db.rolePermission.create({
      data: { roleId: role.id, permissionId: createPermission.id },
    });
    await db.user.create({
      data: {
        companyId: ownerUser.companyId,
        roleId: role.id,
        username: 'create-only',
        fullName: 'Create Only',
        email: 'create-only@import12.test',
        normalizedEmail: 'create-only@import12.test',
        passwordHash: await hashPassword('Temporary@2026'),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const restricted = await signIn('create-only@import12.test');

    const res = await restricted.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Other Assign',
          phone: '98944 44444',
          leadSource: 'REFERRAL',
          assignedTo: 'Sales Executive',
        },
      ]),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results[0].reason).toMatch(/assign/i);
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(0);
  });

  it('supports quoted values, commas inside quotes and CRLF via the frontend parser path (backend receives mapped rows)', async () => {
    // The backend receives mapped rows, so CSV parsing edge cases are handled by
    // papaparse on the client. This verifies a full pipeline row round-trips.
    const email = 'owner@import13.test';
    const client = await owner(email, 'Import Thirteen');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    const res = await client.post(
      '/api/queries/import',
      importPayload([
        {
          customerName: 'Kumar, Ravi',
          phone: '98955 55555',
          leadSource: 'SOCIAL_MEDIA',
          internalRemarks: 'Line one\nLine two',
        },
      ]),
    );

    expect(res.body.data.imported).toBe(1);
    const row = await db.query.findFirstOrThrow({
      where: { companyId: ownerUser.companyId, customerName: 'Kumar, Ravi' },
    });
    expect(row.internalRemarks).toBe('Line one\nLine two');
  });

  it('handles a realistic 288-row import with valid, invalid and duplicate rows', async () => {
    const email = 'owner@import288.test';
    const client = await owner(email, 'Import Two Eighty Eight');
    const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: email } });

    // A realistic bulk file: 288 data rows. Most are valid; a handful are
    // broken (missing phone, invalid email, bad date, unknown assignee) and a
    // couple duplicate an earlier row's phone so duplicate-skipping is hit.
    const rows: unknown[] = [];
    for (let i = 1; i <= 288; i++) {
      if (i === 5) {
        // Missing phone -> row-level failure, not a request crash.
        rows.push({ customerName: 'No Phone Row', phone: '', leadSource: 'REFERRAL' });
      } else if (i === 12) {
        rows.push({
          customerName: 'Bad Email Row',
          phone: `98111 00${String(i).padStart(3, '0')}`,
          email: 'not-an-email',
          leadSource: 'REFERRAL',
        });
      } else if (i === 40) {
        rows.push({
          customerName: 'Bad Date Row',
          phone: `98111 00${String(i).padStart(3, '0')}`,
          leadSource: 'REFERRAL',
          travelStartDate: '2026/99/99',
        });
      } else if (i === 77) {
        rows.push({
          customerName: 'Unknown Assignee Row',
          phone: `98111 00${String(i).padStart(3, '0')}`,
          leadSource: 'REFERRAL',
          assignedTo: 'nobody-in-this-company',
        });
      } else {
        rows.push({
          customerName: `Customer ${i}`,
          phone: `98111 00${String(i).padStart(3, '0')}`,
          email: `customer${i}@example.com`,
          leadSource: i % 2 === 0 ? 'WEBSITE' : 'REFERRAL',
          travelStartDate: '2026-12-10',
          adults: '2',
        });
      }
    }
    // Two intentional duplicate phones (identical to rows 2 and 3) so the batch
    // duplicate set is exercised.
    rows.push({
      customerName: 'Dup A',
      phone: `98111 00${String(2).padStart(3, '0')}`,
      leadSource: 'REFERRAL',
    });
    rows.push({
      customerName: 'Dup B',
      phone: `98111 00${String(3).padStart(3, '0')}`,
      leadSource: 'REFERRAL',
    });

    const res = await client.post('/api/queries/import', importPayload(rows, true));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(290);
    // 4 broken rows + 2 duplicate rows = 6 not imported; the rest succeed.
    expect(res.body.data.imported).toBe(284);
    expect(res.body.data.skipped).toBe(2);
    expect(res.body.data.failed).toBe(4);
    expect(res.body.data.results).toHaveLength(290);

    const failed = res.body.data.results.filter((r: { status: string }) => r.status === 'FAILED');
    const reasons = failed.map((r: { reason: string }) => r.reason).join(' ');
    expect(reasons).toMatch(/phone/i);
    expect(reasons).toMatch(/email/i);
    expect(reasons).toMatch(/date/i);
    expect(reasons).toMatch(/assignee/i);

    // Every created lead belongs to this company only.
    expect(await db.query.count({ where: { companyId: ownerUser.companyId } })).toBe(284);
    // Per-lead activity logs were still produced by the reused create logic.
    expect(
      await db.activityLog.count({
        where: { companyId: ownerUser.companyId, action: 'QUERY_CREATED' },
      }),
    ).toBe(284);
    // The error CSV only contains the failed rows plus a header.
    const lines = res.body.data.errorCsv.content.trim().split('\n');
    expect(lines.length).toBe(1 + 4);
  });
});
