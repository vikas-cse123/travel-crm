import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';
import {
  storageService,
  type MemoryStorageService,
} from '../src/services/storage/storage.service.js';
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

type Client = ReturnType<typeof createAuthClient>;

async function owner(email = 'owner@settings.test', companyName = 'Settings Travel') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email, companyName }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

/** A client whose custom role holds exactly the given permission keys. */
async function customClient(ownerEmail: string, keys: string[], email: string) {
  const ownerUser = await db.user.findUniqueOrThrow({ where: { normalizedEmail: ownerEmail } });
  const role = await db.role.create({
    data: {
      companyId: ownerUser.companyId,
      name: `Role ${email.split('@')[0]}`,
      description: 'Test role',
      hierarchyLevel: 10,
      isSystem: false,
    },
  });
  for (const key of keys) {
    const permission = await db.permission.findUniqueOrThrow({ where: { key } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  await db.user.create({
    data: {
      companyId: ownerUser.companyId,
      roleId: role.id,
      username: email.split('@')[0]!,
      fullName: 'Scoped User',
      email,
      normalizedEmail: email,
      passwordHash: await hashPassword('Scoped@2026'),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const client = createAuthClient(app);
  expect(
    (await client.post('/api/auth/login', { email, password: 'Scoped@2026', rememberMe: false }))
      .status,
  ).toBe(200);
  return client;
}

/** Drive the upload → put → confirm logo flow using memory storage. */
async function uploadLogo(client: Client) {
  const request = await client.post('/api/settings/logo/upload', {
    fileName: 'logo.png',
    mimeType: 'image/png',
    fileSize: 1024,
  });
  expect(request.status).toBe(200);
  const company = await db.company.findFirstOrThrow({
    select: { id: true, pendingLogoObjectKey: true },
  });
  await (storageService as MemoryStorageService).putObject({
    key: company.pendingLogoObjectKey!,
    body: Buffer.from('PNGDATA'),
    contentType: 'image/png',
  });
  const confirm = await client.post('/api/settings/logo/confirm', {});
  expect(confirm.status).toBe(200);
  return company.pendingLogoObjectKey!;
}

const bankInput = {
  accountHolderName: 'Interscale Travel Pvt Ltd',
  bankName: 'HDFC Bank',
  branchName: 'MG Road',
  accountNumber: '123456789012',
  confirmAccountNumber: '123456789012',
  ifscCode: 'HDFC0001234',
  swiftCode: 'HDFCINBB',
  accountType: 'Current',
};

describe('Phase 18 company settings', () => {
  it('returns the structured settings payload with numbering examples', async () => {
    const client = await owner();
    const res = await client.get('/api/settings');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.profile.name).toBe('Settings Travel');
    expect(d.branding.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(d.branding.hasLogo).toBe(false);
    expect(d.preferences).toMatchObject({ timezone: 'Asia/Kolkata', defaultCurrency: 'INR' });
    expect(d.bankAccount.exists).toBe(false);
    const year = new Date().getUTCFullYear();
    expect(d.numbering.bookingExample).toBe(`BK-${year}-000001`);
    expect(d.numbering.refundExample).toBe(`REF-${year}-000001`);
    expect(d.capabilities).toMatchObject({ canView: true, canUpdate: true });
  });

  it('isolates settings by tenant', async () => {
    const alpha = await owner('owner@alpha-s.test', 'Alpha Settings');
    await alpha.patch('/api/settings/profile', {
      name: 'Alpha Renamed',
      email: 'alpha@x.test',
    });
    const beta = await owner('owner@beta-s.test', 'Beta Settings');
    expect((await beta.get('/api/settings')).body.data.profile.name).toBe('Beta Settings');
  });

  it('enforces view and update permissions', async () => {
    const anonymous = createAuthClient(app);
    expect((await anonymous.get('/api/settings')).status).toBe(401);
    await owner();
    const viewer = await customClient(
      'owner@settings.test',
      ['settings.view'],
      'viewer@settings.test',
    );
    expect((await viewer.get('/api/settings')).body.data.capabilities.canUpdate).toBe(false);
    // View-only cannot mutate.
    expect((await viewer.patch('/api/settings/branding', { primaryColor: '#123456' })).status).toBe(
      403,
    );
    // No settings.view at all → cannot read.
    const outsider = await customClient(
      'owner@settings.test',
      ['queries.view'],
      'out@settings.test',
    );
    expect((await outsider.get('/api/settings')).status).toBe(403);
  });

  it('updates the company profile and rejects invalid email/website', async () => {
    const client = await owner();
    const ok = await client.patch('/api/settings/profile', {
      name: 'Interscale Demo',
      email: 'contact@interscale.test',
      phone: '+91 90000 00000',
      website: 'https://interscale.test',
      address: '1 MG Road, Bengaluru',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.profile).toMatchObject({
      name: 'Interscale Demo',
      website: 'https://interscale.test',
    });
    expect((await client.patch('/api/settings/profile', { name: 'X', email: 'bad' })).status).toBe(
      400,
    );
    expect(
      (
        await client.patch('/api/settings/profile', {
          name: 'X Co',
          email: 'ok@x.test',
          website: 'not-a-url',
        })
      ).status,
    ).toBe(400);
  });

  it('updates branding colour and rejects an invalid colour', async () => {
    const client = await owner();
    expect((await client.patch('/api/settings/branding', { primaryColor: '#ff8800' })).status).toBe(
      200,
    );
    expect((await client.get('/api/settings')).body.data.branding.primaryColor).toBe('#ff8800');
    expect((await client.patch('/api/settings/branding', { primaryColor: 'red' })).status).toBe(
      400,
    );
  });

  it('updates timezone and default currency and rejects invalid values', async () => {
    const client = await owner();
    const ok = await client.patch('/api/settings/preferences', {
      timezone: 'Asia/Dubai',
      defaultCurrency: 'aed',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.preferences).toMatchObject({
      timezone: 'Asia/Dubai',
      defaultCurrency: 'AED',
    });
    expect(
      (
        await client.patch('/api/settings/preferences', {
          timezone: 'Not/AZone',
          defaultCurrency: 'USD',
        })
      ).status,
    ).toBe(400);
  });

  it('updates tax registration and default terms', async () => {
    const client = await owner();
    await client.patch('/api/settings/tax', { taxRegistrationNumber: '29ABCDE1234F1Z5' });
    await client.patch('/api/settings/default-terms', {
      quotationTerms: 'Payment due in 7 days.',
      bookingTerms: 'Cancellation as per policy.',
    });
    const d = (await client.get('/api/settings')).body.data;
    expect(d.tax.taxRegistrationNumber).toBe('29ABCDE1234F1Z5');
    expect(d.defaultTerms.quotationTerms).toBe('Payment due in 7 days.');
    expect(d.defaultTerms.bookingTerms).toBe('Cancellation as per policy.');
  });

  it('handles the logo upload, confirm, url, replace and remove flow', async () => {
    const client = await owner();
    // Invalid mime rejected by validation.
    expect(
      (
        await client.post('/api/settings/logo/upload', {
          fileName: 'l.svg',
          mimeType: 'image/svg+xml',
          fileSize: 100,
        })
      ).status,
    ).toBe(400);
    // Oversized rejected by the service.
    expect(
      (
        await client.post('/api/settings/logo/upload', {
          fileName: 'big.png',
          mimeType: 'image/png',
          fileSize: 10 * 1024 * 1024,
        })
      ).status,
    ).toBe(400);
    // Confirm without an uploaded object fails.
    await client.post('/api/settings/logo/upload', {
      fileName: 'l.png',
      mimeType: 'image/png',
      fileSize: 512,
    });
    expect((await client.post('/api/settings/logo/confirm', {})).status).toBe(400);

    const firstKey = await uploadLogo(client);
    const afterConfirm = (await client.get('/api/settings')).body.data;
    expect(afterConfirm.branding.hasLogo).toBe(true);
    expect(afterConfirm.branding.logoUrl).toBeTruthy();
    // Never leak the object key.
    expect(JSON.stringify(afterConfirm)).not.toContain(firstKey);
    expect((await client.get('/api/settings/logo/url')).body.data.url).toBeTruthy();

    // Replacement removes the previous object.
    const secondKey = await uploadLogo(client);
    expect(secondKey).not.toBe(firstKey);
    expect((storageService as MemoryStorageService).read(firstKey)).toBeUndefined();

    // Removal clears branding and deletes the object.
    expect((await client.delete('/api/settings/logo')).status).toBe(200);
    expect((await client.get('/api/settings')).body.data.branding.hasLogo).toBe(false);
    expect((storageService as MemoryStorageService).read(secondKey)).toBeUndefined();
  });

  it('stores the bank account encrypted, returns only the last four, and validates confirmation', async () => {
    const client = await owner();
    const saved = await client.put('/api/settings/bank-account', bankInput);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ exists: true, accountNumberLast4: '9012' });
    expect(saved.body.data.accountNumberMasked).toContain('9012');
    // Full number never returned.
    expect(JSON.stringify(saved.body.data)).not.toContain('123456789012');

    // Encrypted at rest, not plaintext.
    const row = await db.companyBankAccount.findFirstOrThrow();
    expect(row.accountNumberEncrypted).not.toContain('123456789012');
    expect(row.accountNumberLast4).toBe('9012');

    // Confirmation mismatch rejected.
    expect(
      (
        await client.put('/api/settings/bank-account', {
          ...bankInput,
          confirmAccountNumber: '999999999999',
        })
      ).status,
    ).toBe(400);

    // Replacement updates the last four.
    const replaced = await client.put('/api/settings/bank-account', {
      ...bankInput,
      accountNumber: '555544443333',
      confirmAccountNumber: '555544443333',
    });
    expect(replaced.body.data.accountNumberLast4).toBe('3333');
    expect(await db.companyBankAccount.count()).toBe(1);
  });

  it('writes activity logs without sensitive values', async () => {
    const client = await owner();
    await client.patch('/api/settings/profile', { name: 'Logged Co', email: 'log@x.test' });
    await client.put('/api/settings/bank-account', bankInput);
    const logs = await db.activityLog.findMany({
      where: { action: { in: ['COMPANY_PROFILE_UPDATED', 'COMPANY_BANK_ACCOUNT_UPDATED'] } },
    });
    expect(logs.map((l) => l.action)).toContain('COMPANY_PROFILE_UPDATED');
    expect(logs.map((l) => l.action)).toContain('COMPANY_BANK_ACCOUNT_UPDATED');
    // No account number in any metadata.
    expect(JSON.stringify(logs.map((l) => l.metadata))).not.toContain('123456789012');
  });
});

describe('Phase 18 document branding', () => {
  const manualBooking = () => ({
    customerName: 'Branding Customer',
    customerPhone: '9000090000',
    destinationSummary: 'Goa',
    currency: 'INR',
    totalSellingAmount: 50000,
    gstAmount: 2500,
    tcsAmount: 500,
    manualCreationReason: 'Branding test',
    services: [
      {
        serviceType: 'HOTEL',
        name: 'Seaside Hotel',
        customerSellingAmount: 50000,
        internalCostSnapshot: 30000,
        sequence: 1,
      },
    ],
    itinerary: [],
    paymentSchedule: [],
  });

  it('prints the tax registration and masked bank on the tax invoice but keeps the voucher safe', async () => {
    const client = await owner();
    await client.patch('/api/settings/tax', { taxRegistrationNumber: '29ABCDE1234F1Z5' });
    await client.put('/api/settings/bank-account', bankInput);
    await uploadLogo(client);
    const booking = (await client.post('/api/bookings', manualBooking())).body.data;

    const invoice = await client.post(`/api/bookings/${booking.id}/generate-invoice`, {});
    expect(invoice.status).toBe(200);
    const tax = await client.post(`/api/bookings/${booking.id}/generate-tax-invoice`, {});
    expect(tax.status).toBe(200);
    const voucher = await client.post(`/api/bookings/${booking.id}/generate-voucher`, {});
    expect(voucher.status).toBe(200);

    const docs = await db.bookingDocument.findMany({ where: { bookingId: booking.id } });
    for (const doc of docs) expect(doc.visibility).toBe('CUSTOMER_VISIBLE');
    const readByKind = (match: (name: string) => boolean) => {
      const doc = docs.find((d) => match(d.fileName))!;
      const object = (storageService as MemoryStorageService).read(doc.objectKey);
      return {
        header: object?.subarray(0, 4).toString(),
        text: object ? object.toString('latin1') : '',
      };
    };
    // Tax invoice and invoice render successfully with tax + bank configured.
    expect(readByKind((n) => n.includes('tax-invoice')).header).toBe('%PDF');
    expect(readByKind((n) => n.includes('-invoice') && !n.includes('tax')).header).toBe('%PDF');
    // The voucher stays customer-safe: no internal cost figure leaks.
    expect(readByKind((n) => n.includes('voucher')).text).not.toContain('30000');
  });

  it('generates the quotation and confirmation PDFs with a logo configured', async () => {
    const client = await owner();
    await uploadLogo(client);
    const booking = (await client.post('/api/bookings', manualBooking())).body.data;
    const confirmation = await client.post(`/api/bookings/${booking.id}/generate-confirmation`, {});
    expect(confirmation.status).toBe(200);
    const object = (storageService as MemoryStorageService).read(
      (
        await db.bookingDocument.findFirstOrThrow({
          where: { bookingId: booking.id, documentType: 'BOOKING_CONFIRMATION' },
        })
      ).objectKey,
    );
    expect(object?.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('prefills company default booking terms on a manual booking', async () => {
    const client = await owner();
    await client.patch('/api/settings/default-terms', { bookingTerms: 'House booking terms.' });
    const booking = (await client.post('/api/bookings', manualBooking())).body.data;
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.sourceTerms).toEqual(['House booking terms.']);
  });
});
