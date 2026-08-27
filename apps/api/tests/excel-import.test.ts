import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload, TEST_ORIGIN } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';

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

async function owner(email = 'owner@excel.test') {
  const client = createAuthClient(app);
  await client.post('/api/auth/register', registrationPayload({ email }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
  return client;
}

function createWorkbook(rows: Array<Record<string, string>>, headers: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(headers);
  for (const row of rows) {
    ws.addRow(headers.map((h) => row[h] ?? ''));
  }
  return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
}

const PNG_RED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);
const PNG_BLUE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGNgYPgPRmAKABf2A/1+6zfzAAAAAElFTkSuQmCC',
  'base64',
);
const GIF_1PX = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

/**
 * Builds a workbook where each entry in `imagesByRow` embeds a picture anchored
 * to a cell in that exact data row (rowIndex 0 = first data row). This mirrors
 * Excel's "Insert → Picture → Place in Cell" so the import can map each image
 * to its row.
 */
type ExcelJsImage = Parameters<ExcelJS.Workbook['addImage']>[0];
type ExcelJsImageBuffer = NonNullable<ExcelJsImage['buffer']>;

function createWorkbookWithEmbeddedImages(
  rows: Array<Record<string, string>>,
  headers: string[],
  imagesByRow: Array<{ rowIndex: number; buffer: Buffer; extension: 'png' | 'jpeg' | 'gif' }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(headers);
  rows.forEach((row) => ws.addRow(headers.map((h) => row[h] ?? '')));
  for (const img of imagesByRow) {
    const id = wb.addImage({
      buffer: img.buffer as unknown as ExcelJsImageBuffer,
      extension: img.extension,
    });
    const cell = `A${img.rowIndex + 2}:A${img.rowIndex + 2}`;
    ws.addImage(id, cell);
  }
  return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
}

async function memoryStorageRead(key: string): Promise<Buffer | undefined> {
  const { storageService } = await import('../src/services/storage/storage.service.js');
  // The test runner always uses the in-memory provider; `read` is its test-only
  // inspection method, not part of the StorageService interface.
  const memory = storageService as unknown as { read(key: string): Buffer | undefined };
  return memory.read(key);
}

/** Minimal AuthContext used by previewImport/executeImport in tests. */
function authOf(user: { companyId: string; id: string }) {
  return { companyId: user.companyId, userId: user.id } as never;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colName(n: number): string {
  let s = '';
  let v = n + 1;
  while (v > 0) {
    const r = (v - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

/**
 * Builds a real XLSX package the way Apple Numbers exports one: images live in
 * `xl/media/*` and are referenced from a worksheet drawing that uses
 * `xdr:twoCellAnchor` anchors (floating/`oneCell` drawings) instead of Excel's
 * in-cell anchors. The importer must still map each image to the row given by
 * its anchor `from` cell.
 */
async function createNumbersStyleWorkbook(options: {
  headers: string[];
  rows: Array<Array<string | null>>;
  images: Array<{ buffer: Buffer; excelRow: number; col: number; ext: string }>;
}): Promise<Buffer> {
  const zip = new JSZip();
  const { headers, rows, images } = options;

  const sheetRows: string[] = [];
  const headerCells = headers
    .map((h, i) => `<c r="${colName(i)}1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`)
    .join('');
  sheetRows.push(`<row r="1">${headerCells}</row>`);
  rows.forEach((row, idx) => {
    const r = idx + 2;
    const cells = row
      .map((value, i) => {
        if (value === null || value === '') return '';
        return `<c r="${colName(i)}${r}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
      })
      .join('');
    sheetRows.push(`<row r="${r}">${cells}</row>`);
  });

  const mediaRels: string[] = [];
  const pics: string[] = [];
  images.forEach((img, i) => {
    const rId = `rId${i + 1}`;
    const mediaName = `image${i + 1}.${img.ext}`;
    mediaRels.push(
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`,
    );
    zip.file(`xl/media/${mediaName}`, img.buffer);
    pics.push(`
      <xdr:twoCellAnchor editAs="oneCell">
        <xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${img.excelRow - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>${img.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${img.excelRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="${i + 2}" name="Picture ${i + 1}"/>
            <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>
            <a:stretch><a:fillRect/></a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="76200" cy="76200"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:twoCellAnchor>`);
  });

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <drawing r:id="rId1"/>
  <sheetData>${sheetRows.join('')}</sheetData>
</worksheet>`,
  );
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
  );
  zip.file(
    'xl/drawings/drawing1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${pics.join('')}
</xdr:wsDr>`,
  );
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${mediaRels.join('')}
</Relationships>`,
  );

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('excel import', () => {
  it('downloads template for each supported master', async () => {
    const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
    for (const type of ['CITY', 'AIRLINE', 'CRUISE', 'VEHICLE', 'ADD_ON_SERVICE', 'DESTINATION'] as const) {
      const buf = await generateTemplate(type);
      expect(buf.length).toBeGreaterThan(1000);
      // Verify it's a zip (xlsx is zip)
      expect(buf[0]).toBe(0x50);
      expect(buf[1]).toBe(0x4b);
    }
  });

  it('previews valid cities and blocks invalid', async () => {
    await owner('city-preview@test.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'city-preview@test.test' } });
    const headers = ['Country', 'City Name', 'Airport Code'];
    const validRows = [
      { 'City Name': 'Jaipur', 'Country': 'India', 'Airport Code': 'JAI'},
      { 'City Name': 'Udaipur', 'Country': 'India', 'Airport Code': 'UDR'},
    ];
    const buf = await createWorkbook(validRows, headers);
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.totalRows).toBe(2);
    expect(preview.validCount).toBe(2);
    expect(preview.invalidCount).toBe(0);
  });

  it('validates required fields and shows errors', async () => {
    await owner('city-invalid@test.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'city-invalid@test.test' } });
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name', 'Airport Code'];
    const rows = [
      { 'City Name': '', 'Country': 'India', 'Airport Code': ''}, // missing city name
      { 'City Name': 'Goa', 'Country': 'Atlantis', 'Airport Code': ''}, // invalid country
    ];
    const buf = await createWorkbook(rows, headers);
    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.invalidCount).toBe(2);
    expect(preview.rows[0]!.errors.length).toBeGreaterThan(0);
  });

  it('imports valid rows and skips invalid rows (partial import)', async () => {
    await owner('owner2@excel.test');
    const headers = ['Country', 'City Name', 'Airport Code'];
    const rows = [
      { 'City Name': 'ValidCity', 'Country': 'India', 'Airport Code': ''},
      { 'City Name': '', 'Country': 'India', 'Airport Code': ''}, // invalid
    ];
    const buf = await createWorkbook(rows, headers);
    const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    // Need to get auth context for executeImport
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner2@excel.test' } });
    if (!user) throw new Error('user not found');
    const result = await executeImport(buf, 'CITY', { companyId: user.companyId, userId: user.id } as never, { ipAddress: null, userAgent: null });
    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    const count = await db.city.count({ where: { companyId: user.companyId } });
    expect(count).toBe(1);
  });

  it('imports valid airlines with only the name and the normal default status', async () => {
    await owner('owner3@excel.test');
    const headers = ['Airline Name'];
    const rows = [{ 'Airline Name': 'TestAir' }];
    const buf = await createWorkbook(rows, headers);
    const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner3@excel.test' } });
    const result = await executeImport(buf, 'AIRLINE', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });
    expect(result.createdCount).toBe(1);
    const air = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'TestAir' } });
    expect(air!.status).toBe('ACTIVE');
  });

  it('rejects a blank or too-short airline name', async () => {
    await owner('airline-blank@excel.test');
    const headers = ['Airline Name'];
    const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'airline-blank@excel.test' } });
    // A too-short name fails validation; a fully blank row is an empty row and is skipped.
    const buf = await createWorkbook([{ 'Airline Name': 'A' }, { 'Airline Name': '' }], headers);
    const preview = await previewImport(buf, 'AIRLINE', authOf(user!));
    expect(preview.totalRows).toBe(1);
    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[0]!.errors.some((e) => e.field === 'name')).toBe(true);
    const result = await executeImport(buf, 'AIRLINE', authOf(user!), { ipAddress: null, userAgent: null });
    expect(result.createdCount).toBe(0);
  });

  it('imports cruises, vehicles and add-on services', async () => {
    await owner('owner-all@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-all@excel.test' } });
    const auth = { companyId: user!.companyId, userId: user!.id } as never;
    const context = { ipAddress: null, userAgent: null };
    const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');

    const cruise = await createWorkbook([{ 'Cruise Name': 'Mediterranean', Description: 'Nice', Price: '50000', Currency: 'INR' }], ['Cruise Name', 'Description', 'Price', 'Currency']);
    const cruiseResult = await executeImport(cruise, 'CRUISE', auth, context);
    expect(cruiseResult.createdCount).toBe(1);

    const vehicle = await createWorkbook([{ 'Vehicle Name': 'Luxury Coach', 'Vehicle Type': 'AC Coach', Capacity: '45', Price: '12000' }], ['Vehicle Name', 'Vehicle Type', 'Capacity', 'Price']);
    const vehicleResult = await executeImport(vehicle, 'VEHICLE', auth, context);
    expect(vehicleResult.createdCount).toBe(1);

    const addon = await createWorkbook([{ 'Service Name': 'Travel Insurance', Description: 'Full', Price: '1500' }], ['Service Name', 'Description', 'Price']);
    const addonResult = await executeImport(addon, 'ADD_ON_SERVICE', auth, context);
    expect(addonResult.createdCount).toBe(1);

    expect(await db.cruise.count({ where: { companyId: user!.companyId } })).toBe(1);
    expect(await db.vehicle.count({ where: { companyId: user!.companyId } })).toBe(1);
    expect(await db.addOnService.count({ where: { companyId: user!.companyId } })).toBe(1);
  });

  it('blocks duplicate rows inside the Excel file', async () => {
    await owner('owner-dup@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-dup@excel.test' } });
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name'];
    const rows = [
      { 'City Name': 'Chennai', 'Country': 'India' },
      { 'City Name': 'Chennai', 'Country': 'India' },
    ];
    const buf = await createWorkbook(rows, headers);
    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[1]!.errors.some((e) => /Duplicate/i.test(e.message))).toBe(true);
  });

  it('blocks records that already exist in the database', async () => {
    await owner('owner-existing@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-existing@excel.test' } });
    const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name'];
    const buf = await createWorkbook([{ 'City Name': 'Hyderabad', 'Country': 'India' }], headers);
    const first = await executeImport(buf, 'CITY', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });
    expect(first.createdCount).toBe(1);

    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[0]!.errors.some((e) => /Already exists/i.test(e.message))).toBe(true);
  });

  it('skips existing DB duplicates while importing new rows', async () => {
    await owner('owner-existing-partial@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-existing-partial@excel.test' } });
    const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name'];
    const existing = await createWorkbook([{ 'City Name': 'Jaipur', 'Country': 'India' }], headers);
    await executeImport(existing, 'CITY', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });

    // Existing "Jaipur" + two new cities
    const buf = await createWorkbook(
      [
        { 'City Name': 'Jaipur', 'Country': 'India' },
        { 'City Name': 'Indore', 'Country': 'India' },
        { 'City Name': 'Bhopal', 'Country': 'India' },
      ],
      headers,
    );
    const result = await executeImport(buf, 'CITY', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });
    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(await db.city.count({ where: { companyId: user!.companyId } })).toBe(3);
  });

  it('isolates tenants so the same name can be imported by different companies', async () => {
    await owner('tenant-a@excel.test');
    await owner('tenant-b@excel.test');
    const userA = await db.user.findFirst({ where: { normalizedEmail: 'tenant-a@excel.test' } });
    const userB = await db.user.findFirst({ where: { normalizedEmail: 'tenant-b@excel.test' } });
    const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name'];
    const buf = await createWorkbook([{ 'City Name': 'Dubai', 'Country': 'United Arab Emirates' }], headers);
    const a = await executeImport(buf, 'CITY', { companyId: userA!.companyId, userId: userA!.id } as never, { ipAddress: null, userAgent: null });
    const b = await executeImport(buf, 'CITY', { companyId: userB!.companyId, userId: userB!.id } as never, { ipAddress: null, userAgent: null });
    expect(a.createdCount).toBe(1);
    expect(b.createdCount).toBe(1);
  });

  it('generates an error report workbook with the failing rows', async () => {
    await owner('owner-report@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-report@excel.test' } });
    const { previewImport, generateErrorReport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name'];
    const rows = [
      { 'City Name': '', 'Country': 'India' },
      { 'City Name': 'Goa', 'Country': 'India' },
    ];
    const buf = await createWorkbook(rows, headers);
    const preview = await previewImport(buf, 'CITY', authOf(user!));
    const report = await generateErrorReport(preview);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(report.buffer.slice(report.byteOffset, report.byteOffset + report.byteLength) as ArrayBuffer);
    const sheet = wb.getWorksheet('Errors');
    // Header row + one error row (the blank city name)
    expect(sheet!.rowCount).toBe(2);
  });

  it('rejects malformed Excel files', async () => {
    await owner('owner-malformed@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-malformed@excel.test' } });
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    await expect(previewImport(Buffer.from('this is not an xlsx file'), 'CITY', authOf(user!))).rejects.toThrow();
  });

  it('reports unknown columns but still previews valid rows', async () => {
    await owner('owner-unknown@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-unknown@excel.test' } });
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name', 'Unexpected Column'];
    const rows = [{ 'City Name': 'Kochi', 'Country': 'India', 'Unexpected Column': 'x' }];
    const buf = await createWorkbook(rows, headers);
    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.unmappedColumns).toContain('Unexpected Column');
    expect(preview.validCount).toBe(1);
  });

  it('skips the template example row', async () => {
    await owner('owner-example@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-example@excel.test' } });
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name', 'Airport Code'];
    const rows = [
      { 'City Name': 'Mumbai', 'Country': 'India', 'Airport Code': 'BOM'}, // example row
      { 'City Name': 'Pune', 'Country': 'India', 'Airport Code': 'PNQ'},
    ];
    const buf = await createWorkbook(rows, headers);
    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.totalRows).toBe(1);
    expect(preview.rows[0]!.raw['City Name']).toBe('Pune');
  });

  it('blocks duplicate airline names inside the Excel file', async () => {
    await owner('owner-iata@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-iata@excel.test' } });
    const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Airline Name'];
    const rows = [
      { 'Airline Name': 'Alpha Air' },
      { 'Airline Name': 'Alpha Air' },
    ];
    const buf = await createWorkbook(rows, headers);
    const preview = await previewImport(buf, 'AIRLINE', authOf(user!));
    expect(preview.invalidCount).toBe(1);
    expect(preview.rows[1]!.errors.some((e) => /Duplicate/i.test(e.message))).toBe(true);
  });

  it('allows re-importing a city whose active record was archived', async () => {
    await owner('owner-archive@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-archive@excel.test' } });
    const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
    const headers = ['Country', 'City Name'];
    const buf = await createWorkbook([{ 'City Name': 'Agra', 'Country': 'India' }], headers);
    await executeImport(buf, 'CITY', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });
    await db.city.updateMany({ where: { companyId: user!.companyId }, data: { status: 'ARCHIVED', deletedAt: new Date() } });

    const preview = await previewImport(buf, 'CITY', authOf(user!));
    expect(preview.invalidCount).toBe(0);
  });

  it('previews and partially imports a file upload over HTTP', async () => {
    const client = await owner('owner-http@excel.test');
    const headers = ['Country', 'City Name'];
    const buf = await createWorkbook(
      [
        { 'City Name': 'Mysore', 'Country': 'India' },
        { 'City Name': '', 'Country': 'India' }, // invalid
      ],
      headers,
    );

    const upload = (path: string) =>
      request(app)
        .post(path)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', `interscale_sid=${client.cookies.session ?? ''}; interscale_csrf=${client.cookies.csrf ?? ''}`)
        .set('X-CSRF-Token', client.cookies.csrf ?? '')
        .field('masterType', 'CITY')
        .attach('file', buf, 'cities.xlsx');

    const previewRes = await upload('/api/masters/import/preview');
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.totalRows).toBe(2);
    expect(previewRes.body.data.validCount).toBe(1);
    expect(previewRes.body.data.invalidCount).toBe(1);
    expect(previewRes.body.data.rows[0].raw['City Name']).toBe('Mysore');

    const execRes = await upload('/api/masters/import/execute');
    expect(execRes.status).toBe(200);
    expect(execRes.body.data.createdCount).toBe(1);
    expect(execRes.body.data.skippedCount).toBe(1);
    expect(await db.city.count({ where: { name: 'Mysore' } })).toBe(1);
  });

  describe('partial import across masters', () => {
    const fixtures: Array<{
      masterType: 'CITY' | 'AIRLINE' | 'CRUISE' | 'VEHICLE' | 'ADD_ON_SERVICE';
      email: string;
      headers: string[];
      valid: Array<Record<string, string>>;
      dup: Record<string, string>;
      invalid: Record<string, string>;
      count: (companyId: string) => Promise<number>;
    }> = [
      {
        masterType: 'CITY',
        email: 'partial-city@excel.test',
        headers: ['Country', 'City Name'],
        valid: [
          { 'City Name': 'Partial City A', 'Country': 'India' },
          { 'City Name': 'Partial City B', 'Country': 'India' },
        ],
        dup: { 'City Name': 'Partial City A', 'Country': 'India' },
        invalid: { 'City Name': '', 'Country': 'India' },
        count: (companyId) => db.city.count({ where: { companyId } }),
      },
      {
        masterType: 'AIRLINE',
        email: 'partial-airline@excel.test',
        headers: ['Airline Name'],
        valid: [{ 'Airline Name': 'Partial Air A' }, { 'Airline Name': 'Partial Air B' }],
        dup: { 'Airline Name': 'Partial Air A' },
        invalid: { 'Airline Name': 'A' },
        count: (companyId) => db.airline.count({ where: { companyId } }),
      },
      {
        masterType: 'CRUISE',
        email: 'partial-cruise@excel.test',
        headers: ['Cruise Name'],
        valid: [{ 'Cruise Name': 'Partial Cruise A' }, { 'Cruise Name': 'Partial Cruise B' }],
        dup: { 'Cruise Name': 'Partial Cruise A' },
        invalid: { 'Cruise Name': 'A' },
        count: (companyId) => db.cruise.count({ where: { companyId } }),
      },
      {
        masterType: 'VEHICLE',
        email: 'partial-vehicle@excel.test',
        headers: ['Vehicle Name', 'Vehicle Type'],
        valid: [
          { 'Vehicle Name': 'Partial Vehicle A', 'Vehicle Type': 'SUV' },
          { 'Vehicle Name': 'Partial Vehicle B', 'Vehicle Type': 'Bus' },
        ],
        dup: { 'Vehicle Name': 'Partial Vehicle A', 'Vehicle Type': 'SUV' },
        invalid: { 'Vehicle Name': '', 'Vehicle Type': 'SUV' },
        count: (companyId) => db.vehicle.count({ where: { companyId } }),
      },
      {
        masterType: 'ADD_ON_SERVICE',
        email: 'partial-addon@excel.test',
        headers: ['Service Name'],
        valid: [{ 'Service Name': 'Partial Addon A' }, { 'Service Name': 'Partial Addon B' }],
        dup: { 'Service Name': 'Partial Addon A' },
        invalid: { 'Service Name': 'A' },
        count: (companyId) => db.addOnService.count({ where: { companyId } }),
      },
    ];

    for (const fixture of fixtures) {
      it(`imports only valid ${fixture.masterType} rows and skips the rest`, async () => {
        await owner(fixture.email);
        const user = await db.user.findFirst({ where: { normalizedEmail: fixture.email } });
        const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
        const rows = [fixture.valid[0]!, fixture.valid[1]!, fixture.dup, fixture.invalid];
        const buf = await createWorkbook(rows, fixture.headers);
        const auth = { companyId: user!.companyId, userId: user!.id } as never;
        const context = { ipAddress: null, userAgent: null };

        const preview = await previewImport(buf, fixture.masterType, authOf(user!));
        expect(preview.totalRows).toBe(4);
        expect(preview.validCount).toBe(2);
        expect(preview.invalidCount).toBe(2);

        // Original Excel row numbers preserved: header=1, data=2..5, dup=4, invalid=5.
        const invalidRows = preview.rows.filter((r) => !r.isValid);
        expect(invalidRows.map((r) => r.rowNumber).sort((a, b) => a - b)).toEqual([4, 5]);
        expect(invalidRows[0]!.errors.some((e) => /Duplicate/i.test(e.message))).toBe(true);
        expect(invalidRows[1]!.errors.length).toBeGreaterThan(0);

        const result = await executeImport(buf, fixture.masterType, auth, context);
        expect(result.createdCount).toBe(2);
        expect(result.skippedCount).toBe(2);
        expect(await fixture.count(user!.companyId)).toBe(2);
      });
    }

    it('imports nothing when every row is invalid', async () => {
      await owner('all-invalid@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'all-invalid@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { 'City Name': '', 'Country': 'India' },
          { 'City Name': '', 'Country': 'India' },
        ],
        ['Country', 'City Name'],
      );
      const result = await executeImport(buf, 'CITY', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(0);
      expect(result.skippedCount).toBe(2);
      expect(await db.city.count({ where: { companyId: user!.companyId } })).toBe(0);
    });
  });

  it('rejects import for users without the create permission', async () => {
    const client = await owner('owner-noperm@excel.test');
    const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-noperm@excel.test' } });
    const viewOnly = await db.role.findFirst({ where: { companyId: user!.companyId, name: 'View Only' } });
    await db.user.update({ where: { id: user!.id }, data: { roleId: viewOnly!.id } });

    const res = await client.get('/api/masters/import/template/CITY');
    expect(res.status).toBe(403);
  });

  describe('template integrity', () => {
    const FORBIDDEN = [
      'id',
      'companyid',
      'tenantid',
      'accountid',
      'createdbyid',
      'createdby',
      'createdat',
      'updatedat',
      'deletedat',
    ];

    it('generates templates with exactly the supported columns and no internal fields', async () => {
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { adapterList } = await import('../src/modules/masters/excel-import/adapters/index.js');
      for (const adapter of adapterList) {
        const buf = await generateTemplate(adapter.masterType);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        const sheet = wb.getWorksheet('Data');
        expect(sheet).toBeTruthy();
        const values = (sheet!.getRow(1).values as unknown[]) as unknown[];
        const headers = values.slice(1).map((v) => String(v));
        expect(headers).toEqual(adapter.columns.map((c) => c.header));
        for (const header of headers) {
          const normalized = header.toLowerCase();
          for (const forbidden of FORBIDDEN) expect(normalized).not.toContain(forbidden);
        }
        // Instructions sheet exists and documents image support when present.
        expect(wb.getWorksheet('Instructions')).toBeTruthy();
      }
    });

    it('never teaches image URLs and only advertises images where supported', async () => {
      const { adapterList } = await import('../src/modules/masters/excel-import/adapters/index.js');
      const byType = (type: (typeof adapterList)[number]['masterType']) =>
        adapterList.find((a) => a.masterType === type)!;
      // No adapter exposes a URL column any more.
      for (const adapter of adapterList) {
        expect(adapter.columns.some((c) => /url|logo url|image url/i.test(c.header))).toBe(false);
      }
      expect(byType('CITY').image).toBeUndefined();
      expect(byType('ADD_ON_SERVICE').image).toBeUndefined();
      expect(byType('DESTINATION').image).toBeUndefined();
      expect(byType('AIRLINE').image).toBeTruthy();
      expect(byType('CRUISE').image).toBeTruthy();
      expect(byType('VEHICLE').image).toBeTruthy();
    });
  });

  describe('city excel structure', () => {
    it('uses exactly Country, City Name, Airport Code and never exposes Status or Country Code', async () => {
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { cityAdapter } = await import('../src/modules/masters/excel-import/adapters/city.adapter.js');
      expect(cityAdapter.columns.map((c) => c.header)).toEqual(['Country', 'City Name', 'Airport Code']);
      expect(cityAdapter.columns.some((c) => /country code/i.test(c.header))).toBe(false);
      expect(cityAdapter.columns.some((c) => /status/i.test(c.header))).toBe(false);

      const buf = await generateTemplate('CITY');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const sheet = wb.getWorksheet('Data');
      const values = (sheet!.getRow(1).values as unknown[]) as unknown[];
      const headers = values.slice(1).map((v) => String(v));
      expect(headers).toEqual(['Country', 'City Name', 'Airport Code']);
    });

    it('resolves country names and imports every city as ACTIVE (no status column)', async () => {
      await owner('city-structure@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'city-structure@excel.test' } });
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: 'India', 'City Name': 'Chennai', 'Airport Code': 'MAA' },
          { Country: 'India', 'City Name': 'Delhi', 'Airport Code': 'DEL' },
          { Country: 'India', 'City Name': 'Bangalore', 'Airport Code': 'BLR' },
        ],
        ['Country', 'City Name', 'Airport Code'],
      );
      const preview = await previewImport(buf, 'CITY', authOf(user!));
      expect(preview.validCount).toBe(3);
      expect(preview.invalidCount).toBe(0);

      const result = await executeImport(buf, 'CITY', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(3);
      const chennai = await db.city.findFirst({ where: { companyId: user!.companyId, name: 'Chennai' } });
      const delhi = await db.city.findFirst({ where: { companyId: user!.companyId, name: 'Delhi' } });
      const bangalore = await db.city.findFirst({ where: { companyId: user!.companyId, name: 'Bangalore' } });
      expect(chennai).toMatchObject({ countryCode: 'IN', countryName: 'India', status: 'ACTIVE' });
      expect(delhi).toMatchObject({ countryCode: 'IN', status: 'ACTIVE' });
      expect(bangalore).toMatchObject({ countryCode: 'IN', status: 'ACTIVE' });
    });

    it('rejects an unknown country name', async () => {
      await owner('city-bad-country@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'city-bad-country@excel.test' } });
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ Country: 'Atlantis', 'City Name': 'Lost City' }],
        ['Country', 'City Name'],
      );
      const preview = await previewImport(buf, 'CITY', authOf(user!));
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[0]!.errors.some((e) => /country/i.test(e.message))).toBe(true);
    });
  });

  describe('airline excel structure', () => {
    it('has exactly one column: Airline Name — no logo/image/url/status/other fields', async () => {
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { airlineAdapter } = await import('../src/modules/masters/excel-import/adapters/airline.adapter.js');
      expect(airlineAdapter.columns.map((c) => c.header)).toEqual(['Airline Name']);
      expect(airlineAdapter.image).toBeTruthy(); // embedded logo is still supported

      const buf = await generateTemplate('AIRLINE');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const sheet = wb.getWorksheet('Data');
      const values = (sheet!.getRow(1).values as unknown[]) as unknown[];
      const headers = values.slice(1).map((v) => String(v));
      expect(headers).toEqual(['Airline Name']);

      // The template demonstrates the image workflow with a real embedded
      // sample logo (an anchored image), never a logo/image/URL column.
      expect((wb as unknown as { media: ExcelJS.Media[] }).media.length).toBe(1);
    });
  });

  describe('image import', () => {
    it('imports embedded airline logos anchored per row and stores the exact image', async () => {
      await owner('airline-img@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'airline-img@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const headers = ['Airline Name'];
      const rows = [
        { 'Airline Name': 'Alpha Air' },
        { 'Airline Name': 'Beta Air' },
      ];
      const buf = await createWorkbookWithEmbeddedImages(rows, headers, [
        { rowIndex: 0, buffer: PNG_RED, extension: 'png' },
        { rowIndex: 1, buffer: PNG_BLUE, extension: 'png' },
      ]);
      const result = await executeImport(buf, 'AIRLINE', { companyId: user!.companyId, userId: user!.id } as never, { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(2);

      const emirates = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'Alpha Air' } });
      const indigo = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'Beta Air' } });
      expect(emirates!.logoObjectKey).toBeTruthy();
      expect(indigo!.logoObjectKey).toBeTruthy();
      // Row-specific association: each airline keeps its own object and bytes.
      expect(emirates!.logoObjectKey).not.toBe(indigo!.logoObjectKey);
      expect(emirates!.logoObjectKey).toContain(emirates!.id);
      expect(indigo!.logoObjectKey).toContain(indigo!.id);
      expect(emirates!.logoStorageProvider).toBe('MEMORY');
      expect(emirates!.logoMimeType).toBe('image/png');
      expect(emirates!.logoConfirmedAt).toBeTruthy();
      expect(await memoryStorageRead(emirates!.logoObjectKey!)).toEqual(PNG_RED);
      expect(await memoryStorageRead(indigo!.logoObjectKey!)).toEqual(PNG_BLUE);

      // The image surfaces through the same API the listing/view/edit use.
      const { airlinesService } = await import('../src/modules/masters/airlines.service.js');
      const details = await airlinesService.details({ companyId: user!.companyId, userId: user!.id } as never, emirates!.id);
      expect(details.hasLogo).toBe(true);
    });

    it('attaches multiple embedded images to one cruise in order and keeps rows separate', async () => {
      await owner('multi-cruise@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'multi-cruise@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const auth = authOf(user!);
      const context = { ipAddress: null, userAgent: null };
      const buf = await createWorkbookWithEmbeddedImages(
        [
          { 'Cruise Name': 'Med Explorer' },
          { 'Cruise Name': 'Other Cruise' },
        ],
        ['Cruise Name'],
        [
          { rowIndex: 0, buffer: PNG_RED, extension: 'png' },
          { rowIndex: 0, buffer: PNG_BLUE, extension: 'png' },
          { rowIndex: 1, buffer: GIF_1PX, extension: 'gif' },
        ],
      );
      const result = await executeImport(buf, 'CRUISE', auth, context);
      expect(result.createdCount).toBe(2);

      const med = await db.cruise.findFirst({ where: { companyId: user!.companyId, name: 'Med Explorer' } });
      const other = await db.cruise.findFirst({ where: { companyId: user!.companyId, name: 'Other Cruise' } });
      const medImages = med!.images as Array<{ objectKey: string; mimeType: string }>;
      const otherImages = other!.images as Array<{ objectKey: string; mimeType: string }>;
      expect(medImages).toHaveLength(2);
      expect(otherImages).toHaveLength(1);
      // Row 2's two images belong to Med Explorer (both, in order, distinct).
      expect(medImages[0]!.mimeType).toBe('image/png');
      expect(medImages[1]!.mimeType).toBe('image/png');
      expect(otherImages[0]!.mimeType).toBe('image/gif');
      expect(medImages[0]!.objectKey).not.toBe(medImages[1]!.objectKey);
      expect(medImages[0]!.objectKey).toContain(med!.id);
      expect(medImages[1]!.objectKey).toContain(med!.id);
      expect(otherImages[0]!.objectKey).toContain(other!.id);
      expect(await memoryStorageRead(medImages[0]!.objectKey)).toEqual(PNG_RED);
      expect(await memoryStorageRead(medImages[1]!.objectKey)).toEqual(PNG_BLUE);
      expect(await memoryStorageRead(otherImages[0]!.objectKey)).toEqual(GIF_1PX);
      // The gallery order is preserved and the first image is the primary one.
      expect(med!.imageObjectKey).toBe(medImages[0]!.objectKey);
    });

    it('maps images by row anchor even when blank rows exist and columns differ', async () => {
      await owner('blank-rows@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'blank-rows@excel.test' } });
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const auth = authOf(user!);
      const context = { ipAddress: null, userAgent: null };
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Data');
      ws.addRow(['Airline Name']);
      ws.addRow(['Alpha Air']); // row 2
      ws.addRow([]); // blank row 3
      ws.addRow(['Beta Air']); // row 4
      const idA = wb.addImage({ buffer: PNG_RED as unknown as ExcelJsImageBuffer, extension: 'png' });
      ws.addImage(idA, 'B2:B2'); // anchored to row 2, column B
      const idB = wb.addImage({ buffer: PNG_BLUE as unknown as ExcelJsImageBuffer, extension: 'png' });
      ws.addImage(idB, 'F4:F4'); // anchored to row 4, column F
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const preview = await previewImport(buf, 'AIRLINE', auth);
      expect(preview.totalRows).toBe(2);
      expect(preview.rows[0]!.rowNumber).toBe(2);
      expect(preview.rows[1]!.rowNumber).toBe(4);
      expect(preview.rows[0]!.embeddedImageCount).toBe(1);
      expect(preview.rows[1]!.embeddedImageCount).toBe(1);
      expect(preview.rows[0]!.imageStatus).toBe('ok');
      expect(preview.rows[1]!.imageStatus).toBe('ok');

      const result = await executeImport(buf, 'AIRLINE', auth, context);
      expect(result.createdCount).toBe(2);
      const emirates = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'Alpha Air' } });
      const indigo = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'Beta Air' } });
      expect(emirates!.logoObjectKey).toBeTruthy();
      expect(indigo!.logoObjectKey).toBeTruthy();
      expect(await memoryStorageRead(emirates!.logoObjectKey!)).toEqual(PNG_RED);
      expect(await memoryStorageRead(indigo!.logoObjectKey!)).toEqual(PNG_BLUE);
    });

    it('reads embedded images from a Numbers-style two-cell-anchor XLSX', async () => {
      await owner('numbers-xlsx@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'numbers-xlsx@excel.test' } });
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const auth = authOf(user!);
      const context = { ipAddress: null, userAgent: null };
      const buf = await createNumbersStyleWorkbook({
        headers: ['Airline Name'],
        rows: [
          ['Alpha Air'],
          [null], // blank row 3
          ['Beta Air'],
        ],
        images: [
          { buffer: PNG_RED, excelRow: 2, col: 1, ext: 'png' },
          { buffer: PNG_BLUE, excelRow: 4, col: 5, ext: 'png' },
        ],
      });

      const preview = await previewImport(buf, 'AIRLINE', auth);
      expect(preview.totalRows).toBe(2);
      expect(preview.rows[0]!.rowNumber).toBe(2);
      expect(preview.rows[1]!.rowNumber).toBe(4);
      expect(preview.rows[0]!.embeddedImageCount).toBe(1);
      expect(preview.rows[1]!.embeddedImageCount).toBe(1);

      const result = await executeImport(buf, 'AIRLINE', auth, context);
      expect(result.createdCount).toBe(2);
      const emirates = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'Alpha Air' } });
      const indigo = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'Beta Air' } });
      expect(await memoryStorageRead(emirates!.logoObjectKey!)).toEqual(PNG_RED);
      expect(await memoryStorageRead(indigo!.logoObjectKey!)).toEqual(PNG_BLUE);
    });

    it('rejects an airline row carrying more than one embedded logo', async () => {
      await owner('multi-logo@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'multi-logo@excel.test' } });
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbookWithEmbeddedImages(
        [{ 'Airline Name': 'Two Logo Air' }],
        ['Airline Name'],
        [
          { rowIndex: 0, buffer: PNG_RED, extension: 'png' },
          { rowIndex: 0, buffer: PNG_BLUE, extension: 'png' },
        ],
      );
      const preview = await previewImport(buf, 'AIRLINE', authOf(user!));
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[0]!.imageStatus).toBe('invalid');
      const result = await executeImport(buf, 'AIRLINE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(0);
    });

    it('skips the template example row and its sample image when real rows follow', async () => {
      await owner('template-flow@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'template-flow@excel.test' } });
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const template = await generateTemplate('AIRLINE');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) as ArrayBuffer);
      const ws = wb.getWorksheet('Data')!;
      // Set rows 3 and 4 explicitly (the template pre-creates validation rows).
      ws.getRow(3).values = ['IndiGo'];
      ws.getRow(4).values = ['Air India'];
      const id1 = wb.addImage({ buffer: PNG_BLUE as unknown as ExcelJsImageBuffer, extension: 'png' });
      ws.addImage(id1, 'A3:A3');
      const id2 = wb.addImage({ buffer: PNG_RED as unknown as ExcelJsImageBuffer, extension: 'png' });
      ws.addImage(id2, 'A4:A4');
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const preview = await previewImport(buf, 'AIRLINE', authOf(user!));
      expect(preview.totalRows).toBe(2);
      expect(preview.rows[0]!.rowNumber).toBe(3);
      expect(preview.rows[0]!.embeddedImageCount).toBe(1);
      expect(preview.rows[1]!.embeddedImageCount).toBe(1);

      const result = await executeImport(buf, 'AIRLINE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(2);
      // The sample Emirates example row (and its sample image) were not imported.
      expect(await db.airline.count({ where: { companyId: user!.companyId, name: 'Emirates' } })).toBe(0);
      const indigo = await db.airline.findFirst({ where: { companyId: user!.companyId, name: 'IndiGo' } });
      expect(await memoryStorageRead(indigo!.logoObjectKey!)).toEqual(PNG_BLUE);
    });

    it('imports embedded cruise and vehicle images through the master image store', async () => {
      await owner('cruise-vehicle-img@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-vehicle-img@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const auth = { companyId: user!.companyId, userId: user!.id } as never;
      const context = { ipAddress: null, userAgent: null };

      const cruiseBuf = await createWorkbookWithEmbeddedImages(
        [{ 'Cruise Name': 'Island Princess' }],
        ['Cruise Name'],
        [{ rowIndex: 0, buffer: PNG_BLUE, extension: 'png' }],
      );
      const cruiseResult = await executeImport(cruiseBuf, 'CRUISE', auth, context);
      expect(cruiseResult.createdCount).toBe(1);
      const cruise = await db.cruise.findFirst({ where: { companyId: user!.companyId, name: 'Island Princess' } });
      expect(cruise!.imageObjectKey).toBeTruthy();
      expect(cruise!.imageObjectKey).toContain(cruise!.id);
      expect(cruise!.imageMimeType).toBe('image/png');
      expect(cruise!.imageConfirmedAt).toBeTruthy();
      const cruiseImages = cruise!.images as Array<{ objectKey: string }>;
      expect(cruiseImages).toHaveLength(1);
      expect(cruiseImages[0]!.objectKey).toBe(cruise!.imageObjectKey);
      expect(await memoryStorageRead(cruise!.imageObjectKey!)).toEqual(PNG_BLUE);

      const vehicleBuf = await createWorkbookWithEmbeddedImages(
        [{ 'Vehicle Name': 'City Cab', 'Vehicle Type': 'SUV' }],
        ['Vehicle Name', 'Vehicle Type'],
        [{ rowIndex: 0, buffer: GIF_1PX, extension: 'gif' }],
      );
      const vehicleResult = await executeImport(vehicleBuf, 'VEHICLE', auth, context);
      expect(vehicleResult.createdCount).toBe(1);
      const vehicle = await db.vehicle.findFirst({ where: { companyId: user!.companyId, name: 'City Cab' } });
      expect(vehicle!.imageObjectKey).toBeTruthy();
      expect(vehicle!.imageMimeType).toBe('image/gif');
      expect(vehicle!.imageConfirmedAt).toBeTruthy();
      expect(await memoryStorageRead(vehicle!.imageObjectKey!)).toEqual(GIF_1PX);

      // Images surface through the same details API the pages use.
      const { cruisesService } = await import('../src/modules/masters/cruises.service.js');
      const { vehiclesService } = await import('../src/modules/masters/vehicles.service.js');
      const cruiseDetails = await cruisesService.details(auth, cruise!.id);
      expect(cruiseDetails.hasImage).toBe(true);
      expect(cruiseDetails.images).toHaveLength(1);
      const vehicleDetails = await vehiclesService.details(auth, vehicle!.id);
      expect(vehicleDetails.hasImage).toBe(true);
      expect(vehicleDetails.images).toHaveLength(1);
    });

    it('flags a row invalid when its embedded image is not a valid image', async () => {
      await owner('bad-img@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'bad-img@excel.test' } });
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbookWithEmbeddedImages(
        [{ 'Airline Name': 'Bad Image Air' }],
        ['Airline Name'],
        [{ rowIndex: 0, buffer: Buffer.from('this is definitely not an image'), extension: 'png' }],
      );
      const preview = await previewImport(buf, 'AIRLINE', authOf(user!));
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[0]!.errors.some((e) => /image/i.test(e.message))).toBe(true);
    });

    it('attaches multiple embedded images to one vehicle in order', async () => {
      await owner('multi-vehicle@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'multi-vehicle@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const auth = authOf(user!);
      const context = { ipAddress: null, userAgent: null };
      const buf = await createWorkbookWithEmbeddedImages(
        [{ 'Vehicle Name': 'Luxury Coach', 'Vehicle Type': 'AC Coach' }],
        ['Vehicle Name', 'Vehicle Type'],
        [
          { rowIndex: 0, buffer: PNG_RED, extension: 'png' },
          { rowIndex: 0, buffer: PNG_BLUE, extension: 'png' },
        ],
      );
      const result = await executeImport(buf, 'VEHICLE', auth, context);
      expect(result.createdCount).toBe(1);
      const vehicle = await db.vehicle.findFirst({ where: { companyId: user!.companyId, name: 'Luxury Coach' } });
      const images = vehicle!.images as Array<{ objectKey: string; mimeType: string }>;
      expect(images).toHaveLength(2);
      expect(images[0]!.mimeType).toBe('image/png');
      expect(images[1]!.mimeType).toBe('image/png');
      expect(vehicle!.imageObjectKey).toBe(images[0]!.objectKey);
      expect(await memoryStorageRead(images[0]!.objectKey)).toEqual(PNG_RED);
      expect(await memoryStorageRead(images[1]!.objectKey)).toEqual(PNG_BLUE);
    });
  });

  describe('destination import', () => {
    const DEST_HEADERS = [
      'Country',
      'Destination Name',
      'Destination Type',
      'Cities',
      'Inclusions',
      'Exclusions',
      'Payment Policies',
      'Cancellation Policies',
      'Booking Terms & Conditions',
    ];

    async function makeCities(email: string, companyId: string) {
      const { citiesService } = await import('../src/modules/masters/masters.service.js');
      const user = await db.user.findFirst({ where: { normalizedEmail: email } });
      const auth = { companyId, userId: user!.id } as never;
      const context = { ipAddress: null, userAgent: null };
      const createCity = async (name: string, countryCode: string, airportCode: string) =>
        citiesService.create(auth, { name, countryCode, airportCode, status: 'ACTIVE' }, context);
      await createCity('Jaipur', 'IN', 'JAI');
      await createCity('Jodhpur', 'IN', 'JDH');
      await createCity('Goa', 'IN', 'GOI');
      await createCity('New York', 'US', 'JFK');
    }

    it('generates a template with exactly the nine destination columns and no image/internal columns', async () => {
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { destinationAdapter } = await import('../src/modules/masters/excel-import/adapters/destination.adapter.js');
      expect(destinationAdapter.columns.map((c) => c.header)).toEqual(DEST_HEADERS);
      const adapterImage = destinationAdapter as unknown as { image?: unknown; applyImage?: unknown };
      expect(adapterImage.image).toBeUndefined();
      expect(adapterImage.applyImage).toBeUndefined();

      const buf = await generateTemplate('DESTINATION');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const sheet = wb.getWorksheet('Data');
      const values = (sheet!.getRow(1).values as unknown[]) as unknown[];
      const headers = values.slice(1).map((v) => String(v));
      expect(headers).toEqual(DEST_HEADERS);
      for (const header of headers) {
        const lower = header.toLowerCase();
        expect(lower).not.toContain('image');
        expect(lower).not.toContain('logo');
        expect(lower).not.toContain('country code');
        expect(lower).not.toContain('id');
      }
      // Template must not carry an embedded sample image either.
      const loadedWb = new ExcelJS.Workbook();
      await loadedWb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      expect((loadedWb as unknown as { media: ExcelJS.Media[] }).media.length).toBe(0);
    });

    it('does not process embedded images for destination import', async () => {
      await owner('dest-noimg@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-noimg@excel.test' } });
      await makeCities('dest-noimg@excel.test', user!.companyId);
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbookWithEmbeddedImages(
        [{ Country: 'India', 'Destination Name': 'Rajasthan Highlights', 'Destination Type': 'DOMESTIC', Cities: 'Jaipur, Jodhpur' }],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
        [{ rowIndex: 0, buffer: PNG_RED, extension: 'png' }],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.validCount).toBe(1);
      expect(preview.rows[0]!.embeddedImageCount).toBe(1); // image is present in the file
      expect(preview.rows[0]!.imageStatus).toBe('none'); // but ignored for destination
      const result = await executeImport(buf, 'DESTINATION', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const dest = await db.destination.findFirst({ where: { companyId: user!.companyId, name: 'Rajasthan Highlights' } });
      expect(dest!.imageObjectKey).toBeNull();
      expect(dest!.images).toBeNull();
    });

    it('imports a valid destination and defaults blank destination type to DOMESTIC', async () => {
      await owner('dest-valid@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-valid@excel.test' } });
      await makeCities('dest-valid@excel.test', user!.companyId);
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ Country: 'India', 'Destination Name': 'Goa', 'Destination Type': '', Cities: 'Goa' }],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.validCount).toBe(1);
      expect(preview.rows[0]!.data.destinationType).toBe('DOMESTIC');
      const result = await executeImport(buf, 'DESTINATION', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const dest = await db.destination.findFirst({ where: { companyId: user!.companyId, name: 'Goa' } });
      expect(dest!.destinationType).toBe('DOMESTIC');
      expect(dest!.countryCode).toBe('IN');
      expect(dest!.countryName).toBe('India');
    });

    it('supports explicit DOMESTIC and INTERNATIONAL and rejects an invalid type', async () => {
      await owner('dest-types@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-types@excel.test' } });
      await makeCities('dest-types@excel.test', user!.companyId);
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: 'India', 'Destination Name': 'Domestic One', 'Destination Type': 'DOMESTIC', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'International One', 'Destination Type': 'INTERNATIONAL', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'Bad Type', 'Destination Type': 'SPACE', Cities: 'Goa' },
        ],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.validCount).toBe(2);
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[2]!.errors.some((e) => e.field === 'destinationType')).toBe(true);
    });

    it('requires country, destination name and at least one city', async () => {
      await owner('dest-required@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-required@excel.test' } });
      await makeCities('dest-required@excel.test', user!.companyId);
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: '', 'Destination Name': 'No Country', 'Destination Type': 'DOMESTIC', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': '', 'Destination Type': 'DOMESTIC', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'No Cities', 'Destination Type': 'DOMESTIC', Cities: '' },
        ],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.invalidCount).toBe(3);
      expect(preview.rows[0]!.errors.some((e) => e.field === 'country')).toBe(true);
      expect(preview.rows[1]!.errors.some((e) => e.field === 'name')).toBe(true);
      expect(preview.rows[2]!.errors.some((e) => e.field === 'cities')).toBe(true);
    });

    it('reports unknown or cross-country cities per row', async () => {
      await owner('dest-cities@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-cities@excel.test' } });
      await makeCities('dest-cities@excel.test', user!.companyId);
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: 'India', 'Destination Name': 'Unknown City', 'Destination Type': '', Cities: 'MumbaiXYZ' },
          { Country: 'India', 'Destination Name': 'Mixed Cities', 'Destination Type': '', Cities: 'Jaipur, MumbaiXYZ' },
          { Country: 'India', 'Destination Name': 'Wrong Country', 'Destination Type': '', Cities: 'New York' },
        ],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.invalidCount).toBe(3);
      expect(preview.rows[0]!.errors.some((e) => /could not be found/i.test(e.message))).toBe(true);
      expect(preview.rows[1]!.errors.some((e) => /MumbaiXYZ/i.test(e.message))).toBe(true);
      expect(preview.rows[2]!.errors.some((e) => /New York/i.test(e.message))).toBe(true);
    });

    it('rejects an unknown country name', async () => {
      await owner('dest-bad-country@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-bad-country@excel.test' } });
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ Country: 'Atlantis', 'Destination Name': 'Lost', 'Destination Type': '', Cities: 'Goa' }],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[0]!.errors.some((e) => /could not be found/i.test(e.message))).toBe(true);
    });

    it('allows all optional text fields to be blank', async () => {
      await owner('dest-blank-optional@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-blank-optional@excel.test' } });
      await makeCities('dest-blank-optional@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ Country: 'India', 'Destination Name': 'Minimal', 'Destination Type': '', Cities: 'Goa' }],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const result = await executeImport(buf, 'DESTINATION', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const dest = await db.destination.findFirst({ where: { companyId: user!.companyId, name: 'Minimal' } });
      expect(dest!.inclusions).toBeNull();
      expect(dest!.exclusions).toBeNull();
      expect(dest!.paymentPolicies).toBeNull();
      expect(dest!.cancellationPolicies).toBeNull();
      expect(dest!.bookingTerms).toBeNull();
      expect(dest!.destinationType).toBe('DOMESTIC');
    });

    it('preserves optional text fields and resolves the full sample', async () => {
      await owner('dest-full@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-full@excel.test' } });
      await makeCities('dest-full@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          {
            Country: 'India',
            'Destination Name': 'Rajasthan Highlights',
            'Destination Type': 'DOMESTIC',
            Cities: 'Jaipur, Jodhpur',
            Inclusions: 'Hotels and sightseeing',
            Exclusions: 'Flights',
            'Payment Policies': '50% advance',
            'Cancellation Policies': 'Non-refundable within 7 days',
            'Booking Terms & Conditions': 'Standard booking terms',
          },
        ],
        DEST_HEADERS,
      );
      const result = await executeImport(buf, 'DESTINATION', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const dest = await db.destination.findFirst({ where: { companyId: user!.companyId, name: 'Rajasthan Highlights' } });
      expect(dest!.inclusions).toContain('Hotels and sightseeing');
      expect(dest!.exclusions).toContain('Flights');
      expect(dest!.paymentPolicies).toContain('50% advance');
      expect(dest!.cancellationPolicies).toContain('Non-refundable');
      expect(dest!.bookingTerms).toContain('Standard booking terms');
      const links = await db.destinationCity.findMany({ where: { destinationId: dest!.id }, orderBy: { sequence: 'asc' } });
      expect(links).toHaveLength(2);
    });

    it('partially imports valid rows and skips invalid rows', async () => {
      await owner('dest-partial@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-partial@excel.test' } });
      await makeCities('dest-partial@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: 'India', 'Destination Name': 'Alpha', 'Destination Type': '', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'Beta', 'Destination Type': '', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'Gamma', 'Destination Type': '', Cities: 'MumbaiXYZ' },
        ],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const result = await executeImport(buf, 'DESTINATION', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(await db.destination.count({ where: { companyId: user!.companyId } })).toBe(2);
    });

    it('detects duplicate destination names inside the same file', async () => {
      await owner('dest-file-dup@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-file-dup@excel.test' } });
      await makeCities('dest-file-dup@excel.test', user!.companyId);
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: 'India', 'Destination Name': 'Goa Beaches', 'Destination Type': '', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'Goa Beaches', 'Destination Type': '', Cities: 'Goa' },
        ],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const preview = await previewImport(buf, 'DESTINATION', authOf(user!));
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[1]!.errors.some((e) => /Duplicate/i.test(e.message))).toBe(true);
    });

    it('blocks duplicate destination names already in the database', async () => {
      await owner('dest-dup@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-dup@excel.test' } });
      await makeCities('dest-dup@excel.test', user!.companyId);
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const headers = ['Country', 'Destination Name', 'Destination Type', 'Cities'];
      const buf = await createWorkbook([{ Country: 'India', 'Destination Name': 'Goa Beaches', 'Destination Type': '', Cities: 'Goa' }], headers);
      const auth = authOf(user!);
      const first = await executeImport(buf, 'DESTINATION', auth, { ipAddress: null, userAgent: null });
      expect(first.createdCount).toBe(1);
      const preview = await previewImport(buf, 'DESTINATION', auth);
      expect(preview.invalidCount).toBe(1);
      expect(preview.rows[0]!.errors.some((e) => /already exists/i.test(e.message))).toBe(true);
      const second = await executeImport(buf, 'DESTINATION', auth, { ipAddress: null, userAgent: null });
      expect(second.createdCount).toBe(0);
    });

    it('isolates tenants so city resolution only sees the caller company', async () => {
      await owner('dest-tenant-a@excel.test');
      await owner('dest-tenant-b@excel.test');
      const userA = await db.user.findFirst({ where: { normalizedEmail: 'dest-tenant-a@excel.test' } });
      const userB = await db.user.findFirst({ where: { normalizedEmail: 'dest-tenant-b@excel.test' } });
      await makeCities('dest-tenant-a@excel.test', userA!.companyId);
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ Country: 'India', 'Destination Name': 'Shared', 'Destination Type': '', Cities: 'Jaipur' }],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const previewA = await previewImport(buf, 'DESTINATION', authOf(userA!));
      expect(previewA.validCount).toBe(1);
      const previewB = await previewImport(buf, 'DESTINATION', authOf(userB!));
      expect(previewB.invalidCount).toBe(1);
      const resultA = await executeImport(buf, 'DESTINATION', authOf(userA!), { ipAddress: null, userAgent: null });
      expect(resultA.createdCount).toBe(1);
      const resultB = await executeImport(buf, 'DESTINATION', authOf(userB!), { ipAddress: null, userAgent: null });
      expect(resultB.createdCount).toBe(0);
      expect(await db.destination.count({ where: { companyId: userB!.companyId } })).toBe(0);
    });

    it('creates nothing when every destination row is invalid', async () => {
      await owner('dest-zero@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-zero@excel.test' } });
      await makeCities('dest-zero@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Country: 'India', 'Destination Name': '', 'Destination Type': '', Cities: 'Goa' },
          { Country: 'India', 'Destination Name': 'X', 'Destination Type': '', Cities: '' },
        ],
        ['Country', 'Destination Name', 'Destination Type', 'Cities'],
      );
      const result = await executeImport(buf, 'DESTINATION', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(0);
      expect(result.skippedCount).toBe(2);
      expect(await db.destination.count({ where: { companyId: user!.companyId } })).toBe(0);
    });

    it('denies destination import for users without the create permission', async () => {
      const client = await owner('dest-noperm@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'dest-noperm@excel.test' } });
      const viewOnly = await db.role.findFirst({ where: { companyId: user!.companyId, name: 'View Only' } });
      await db.user.update({ where: { id: user!.id }, data: { roleId: viewOnly!.id } });
      const res = await client.get('/api/masters/import/template/DESTINATION');
      expect(res.status).toBe(403);
    });
  });

  describe('cruise room types', () => {
    function cruiseHeaders(maxRooms: number): string[] {
      const headers = ['Cruise Name', 'Description', 'Price', 'Currency'];
      for (let n = 1; n <= maxRooms; n++) {
        headers.push(`Room Type ${n}`, `Room ${n} Description`, `Room ${n} Price`, `Room ${n} Currency`);
      }
      return headers;
    }

    function roomRow(
      base: Record<string, string>,
      rooms: Array<{ type?: string; description?: string; price?: string; currency?: string }>,
    ): Record<string, string> {
      const row = { ...base };
      rooms.forEach((room, i) => {
        const n = i + 1;
        if (room.type !== undefined) row[`Room Type ${n}`] = room.type;
        if (room.description !== undefined) row[`Room ${n} Description`] = room.description;
        if (room.price !== undefined) row[`Room ${n} Price`] = room.price;
        if (room.currency !== undefined) row[`Room ${n} Currency`] = room.currency;
      });
      return row;
    }

    async function importedRooms(companyId: string, cruiseName: string) {
      const cruise = await db.cruise.findFirst({ where: { companyId, name: cruiseName } });
      return {
        cruise,
        roomTypes: await db.cruiseRoomType.findMany({
          where: { cruiseId: cruise!.id },
          orderBy: { sortOrder: 'asc' },
        }),
      };
    }

    it('generates a cruise template with the four base columns plus room-type groups and no status/image columns', async () => {
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { cruiseAdapter } = await import('../src/modules/masters/excel-import/adapters/cruise.adapter.js');
      const headers = cruiseAdapter.columns.map((c) => c.header);
      expect(headers.slice(0, 4)).toEqual(['Cruise Name', 'Description', 'Price', 'Currency']);
      expect(headers).toContain('Room Type 1');
      expect(headers).toContain('Room 1 Description');
      expect(headers).toContain('Room 1 Price');
      expect(headers).toContain('Room 1 Currency');
      expect(headers).toContain('Room Type 3');
      for (const header of headers) {
        expect(header.toLowerCase()).not.toContain('status');
        expect(header.toLowerCase()).not.toContain('image');
        expect(header.toLowerCase()).not.toContain('logo');
        expect(header.toLowerCase()).not.toContain('url');
      }
      const buf = await generateTemplate('CRUISE');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const sheet = wb.getWorksheet('Data');
      const values = (sheet!.getRow(1).values as unknown[]) as unknown[];
      const actual = values.slice(1).map((v) => String(v));
      expect(actual).toEqual(headers);
      expect(wb.getWorksheet('Instructions')).toBeTruthy();
    });

    it('imports a cruise with no room types', async () => {
      await owner('cruise-no-rooms@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-no-rooms@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ 'Cruise Name': 'Disney Cruise', Description: 'Luxury cruise', Price: '50000', Currency: 'INR' }],
        ['Cruise Name', 'Description', 'Price', 'Currency'],
      );
      const result = await executeImport(buf, 'CRUISE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const { cruise, roomTypes } = await importedRooms(user!.companyId, 'Disney Cruise');
      expect(cruise).toMatchObject({ status: 'ACTIVE', currency: 'INR' });
      expect(Number(cruise!.price)).toBe(50000);
      expect(roomTypes).toHaveLength(0);
    });

    it('imports a cruise with 1, 2 and 3 room types', async () => {
      await owner('cruise-rooms@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-rooms@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          roomRow({ 'Cruise Name': 'One Room', Price: '100' }, [
            { type: 'Inside', description: 'Interior', price: '50000', currency: 'INR' },
          ]),
          roomRow({ 'Cruise Name': 'Two Rooms', Price: '200' }, [
            { type: 'Inside', price: '50000', currency: 'INR' },
            { type: 'Ocean View', price: '65000', currency: 'INR' },
          ]),
          roomRow({ 'Cruise Name': 'Three Rooms', Price: '300' }, [
            { type: 'Inside', description: 'A', price: '50000', currency: 'INR' },
            { type: 'Ocean View', description: 'B', price: '65000', currency: 'INR' },
            { type: 'Suite', description: 'C', price: '80000', currency: 'INR' },
          ]),
        ],
        cruiseHeaders(3),
      );
      const result = await executeImport(buf, 'CRUISE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(3);

      const one = await importedRooms(user!.companyId, 'One Room');
      expect(one.roomTypes).toHaveLength(1);
      expect(one.roomTypes[0]).toMatchObject({ name: 'Inside', description: 'Interior', currency: 'INR', sortOrder: 0 });
      expect(Number(one.roomTypes[0]!.price)).toBe(50000);

      const two = await importedRooms(user!.companyId, 'Two Rooms');
      expect(two.roomTypes).toHaveLength(2);
      expect(two.roomTypes[0]).toMatchObject({ name: 'Inside', currency: 'INR' });
      expect(two.roomTypes[1]).toMatchObject({ name: 'Ocean View', currency: 'INR' });
      expect(Number(two.roomTypes[0]!.price)).toBe(50000);
      expect(Number(two.roomTypes[1]!.price)).toBe(65000);

      const three = await importedRooms(user!.companyId, 'Three Rooms');
      expect(three.roomTypes).toHaveLength(3);
      expect(three.roomTypes.map((r) => r.name)).toEqual(['Inside', 'Ocean View', 'Suite']);
      // Only one cruise record per row.
      expect(await db.cruise.count({ where: { companyId: user!.companyId } })).toBe(3);
    });

    it('dynamically detects user-added room type groups beyond the template (5+ groups)', async () => {
      await owner('cruise-5rooms@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-5rooms@excel.test' } });
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const headers = cruiseHeaders(5);
      const buf = await createWorkbook(
        [
          roomRow({ 'Cruise Name': 'Grand Voyage', Price: '500' }, [
            { type: 'R1', price: '1', currency: 'INR' },
            { type: 'R2', price: '2', currency: 'INR' },
            { type: 'R3', price: '3', currency: 'INR' },
            { type: 'R4', price: '4', currency: 'INR' },
            { type: 'R5', price: '5', currency: 'INR' },
          ]),
        ],
        headers,
      );
      const preview = await previewImport(buf, 'CRUISE', authOf(user!));
      expect(preview.validCount).toBe(1);
      const result = await executeImport(buf, 'CRUISE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const { roomTypes } = await importedRooms(user!.companyId, 'Grand Voyage');
      expect(roomTypes).toHaveLength(5);
      expect(roomTypes.map((r) => r.name)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
    });

    it('ignores blank unused room type groups', async () => {
      await owner('cruise-blank-rooms@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-blank-rooms@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      // Only Room Type 1 is filled; Room Types 2-5 are blank.
      const buf = await createWorkbook(
        [roomRow({ 'Cruise Name': 'Sparse', Price: '10' }, [{ type: 'Only One', price: '100', currency: 'INR' }])],
        cruiseHeaders(5),
      );
      const result = await executeImport(buf, 'CRUISE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const { roomTypes } = await importedRooms(user!.companyId, 'Sparse');
      expect(roomTypes).toHaveLength(1);
      expect(roomTypes[0]!.name).toBe('Only One');
    });

    it('reports a missing room type name in a used group and an invalid room price', async () => {
      await owner('cruise-bad-rooms@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-bad-rooms@excel.test' } });
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          roomRow({ 'Cruise Name': 'Missing Name', Price: '1' }, [{ description: 'no name', price: '100', currency: 'INR' }]),
          roomRow({ 'Cruise Name': 'Bad Price', Price: '1' }, [{ type: 'X', price: 'not-a-number', currency: 'INR' }]),
        ],
        cruiseHeaders(1),
      );
      const preview = await previewImport(buf, 'CRUISE', authOf(user!));
      expect(preview.invalidCount).toBe(2);
      expect(preview.rows[0]!.errors.some((e) => /requires a name/i.test(e.message))).toBe(true);
      expect(preview.rows[1]!.errors.some((e) => /non-negative number/i.test(e.message))).toBe(true);
      const result = await executeImport(buf, 'CRUISE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(0);
    });

    it('still imports multiple embedded cruise images alongside room types', async () => {
      await owner('cruise-img-rooms@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'cruise-img-rooms@excel.test' } });
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbookWithEmbeddedImages(
        [roomRow({ 'Cruise Name': 'Pictured Cruise', Price: '1' }, [{ type: 'Suite', price: '2', currency: 'INR' }])],
        cruiseHeaders(1),
        [
          { rowIndex: 0, buffer: PNG_RED, extension: 'png' },
          { rowIndex: 0, buffer: PNG_BLUE, extension: 'png' },
        ],
      );
      const result = await executeImport(buf, 'CRUISE', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const { cruise, roomTypes } = await importedRooms(user!.companyId, 'Pictured Cruise');
      const images = cruise!.images as Array<{ objectKey: string }>;
      expect(images).toHaveLength(2);
      expect(cruise!.imageObjectKey).toBe(images[0]!.objectKey);
      expect(await memoryStorageRead(images[0]!.objectKey)).toEqual(PNG_RED);
      expect(await memoryStorageRead(images[1]!.objectKey)).toEqual(PNG_BLUE);
      expect(roomTypes).toHaveLength(1);
      expect(roomTypes[0]!.name).toBe('Suite');
    });
  });

  describe('sightseeing import', () => {
    const SIGHTSEEING_BASE = [
      'Destination',
      'City',
      'Title',
      'Sequence',
      'Estimated Hours',
      'Suggested Start Time',
      'Description',
      'Remarks',
    ];

    function sightseeingHeaders(maxPricing: number): string[] {
      const headers = [...SIGHTSEEING_BASE];
      for (let n = 1; n <= maxPricing; n++) {
        headers.push(`Category ${n}`, `Price ${n}`, `Currency ${n}`);
      }
      return headers;
    }

    function sightseeingRow(
      base: Record<string, string>,
      pricing: Array<{ category?: string; price?: string; currency?: string }> = [],
    ): Record<string, string> {
      const row = { ...base };
      pricing.forEach((p, i) => {
        const n = i + 1;
        if (p.category !== undefined) row[`Category ${n}`] = p.category;
        if (p.price !== undefined) row[`Price ${n}`] = p.price;
        if (p.currency !== undefined) row[`Currency ${n}`] = p.currency;
      });
      return row;
    }

    async function makeSightseeingBase(email: string, companyId: string) {
      const { citiesService, destinationsService } = await import('../src/modules/masters/masters.service.js');
      const user = await db.user.findFirst({ where: { normalizedEmail: email } });
      const auth = { companyId, userId: user!.id } as never;
      const context = { ipAddress: null, userAgent: null };
      const createCity = (name: string, countryCode: string, airportCode: string) =>
        citiesService.create(auth, { name, countryCode, airportCode, status: 'ACTIVE' }, context);
      const singapore = await createCity('Singapore', 'SG', 'SIN');
      const sentosa = await createCity('Sentosa', 'SG', '');
      const bali = await createCity('Bali', 'ID', 'DPS');
      const destination = await destinationsService.create(
        auth,
        {
          countryCode: 'SG',
          name: 'Singapore',
          destinationType: 'INTERNATIONAL',
          cityIds: [String(singapore.id), String(sentosa.id)],
          status: 'ACTIVE',
        },
        context,
      );
      return { singaporeId: String(singapore.id), sentosaId: String(sentosa.id), baliId: String(bali.id), destinationId: String(destination.id) };
    }

    async function importedSightseeing(companyId: string, title: string) {
      return db.sightseeing.findFirst({ where: { companyId, title } });
    }

    it('generates a sightseeing template with eight base columns plus pricing groups and no status/image/internal columns', async () => {
      const { generateTemplate } = await import('../src/modules/masters/excel-import/template.service.js');
      const { sightseeingAdapter } = await import('../src/modules/masters/excel-import/adapters/sightseeing.adapter.js');
      const headers = sightseeingAdapter.columns.map((c) => c.header);
      expect(headers.slice(0, 8)).toEqual(SIGHTSEEING_BASE);
      expect(headers).toContain('Category 1');
      expect(headers).toContain('Price 1');
      expect(headers).toContain('Currency 1');
      expect(headers).toContain('Category 3');
      for (const header of headers) {
        const lower = header.toLowerCase();
        expect(lower).not.toContain('status');
        expect(lower).not.toContain('image');
        expect(lower).not.toContain('logo');
        expect(lower).not.toContain('url');
      }
      const buf = await generateTemplate('SIGHTSEEING');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const sheet = wb.getWorksheet('Data');
      const values = (sheet!.getRow(1).values as unknown[]) as unknown[];
      expect(values.slice(1).map((v) => String(v))).toEqual(headers);
      expect(wb.getWorksheet('Instructions')).toBeTruthy();
    });

    it('imports a sightseeing with only the mandatory fields', async () => {
      await owner('sightseeing-min@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-min@excel.test' } });
      await makeSightseeingBase('sightseeing-min@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [{ Destination: 'Singapore', City: 'Singapore', Title: 'Marina Bay Walk', Sequence: '1' }],
        SIGHTSEEING_BASE,
      );
      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const row = await importedSightseeing(user!.companyId, 'Marina Bay Walk');
      expect(row).toMatchObject({ status: 'ACTIVE', sequence: 1, estimatedHours: null, suggestedStartTime: null });
    });

    it('maps pricing categories onto one sightseeing record and preserves the sequence', async () => {
      await owner('sightseeing-pricing@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-pricing@excel.test' } });
      await makeSightseeingBase('sightseeing-pricing@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          sightseeingRow(
            { Destination: 'Singapore', City: 'Singapore', Title: 'Marina Bay Tour', Sequence: '7', 'Estimated Hours': '2.5', 'Suggested Start Time': '10:00', Description: 'City highlights', Remarks: 'Bring ID' },
            [
              { category: 'Adult', price: '5000', currency: 'INR' },
              { category: 'Child', price: '3000', currency: 'INR' },
              { category: 'Senior', price: '4000', currency: 'INR' },
            ],
          ),
        ],
        sightseeingHeaders(3),
      );
      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      expect(await db.sightseeing.count({ where: { companyId: user!.companyId } })).toBe(1);

      const row = await importedSightseeing(user!.companyId, 'Marina Bay Tour');
      expect(row!.sequence).toBe(7); // preserved, not auto-renumbered
      expect(Number(row!.estimatedHours)).toBe(2.5);
      expect(row!.suggestedStartTime).toBe('10:00');
      expect(row!.description).toBe('City highlights');
      expect(row!.remarks).toBe('Bring ID');
      const pricing = row!.pricing as Array<{ label: string; price: number; currency: string }>;
      expect(pricing).toHaveLength(3);
      expect(pricing[0]).toEqual({ label: 'Adult', price: 5000, currency: 'INR' });
      expect(pricing[1]).toEqual({ label: 'Child', price: 3000, currency: 'INR' });
      expect(pricing[2]).toEqual({ label: 'Senior', price: 4000, currency: 'INR' });
    });

    it('dynamically detects user-added pricing groups (5+ categories)', async () => {
      await owner('sightseeing-5p@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-5p@excel.test' } });
      await makeSightseeingBase('sightseeing-5p@excel.test', user!.companyId);
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          sightseeingRow(
            { Destination: 'Singapore', City: 'Singapore', Title: 'Five Categories', Sequence: '1' },
            [
              { category: 'A', price: '1' },
              { category: 'B', price: '2' },
              { category: 'C', price: '3' },
              { category: 'D', price: '4' },
              { category: 'E', price: '5' },
            ],
          ),
        ],
        sightseeingHeaders(5),
      );
      const preview = await previewImport(buf, 'SIGHTSEEING', authOf(user!));
      expect(preview.validCount).toBe(1);
      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const row = await importedSightseeing(user!.companyId, 'Five Categories');
      const pricing = row!.pricing as Array<{ label: string }>;
      expect(pricing).toHaveLength(5);
      expect(pricing.map((p) => p.label)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('ignores blank unused pricing groups and imports a sightseeing with no pricing', async () => {
      await owner('sightseeing-blank-p@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-blank-p@excel.test' } });
      await makeSightseeingBase('sightseeing-blank-p@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          sightseeingRow({ Destination: 'Singapore', City: 'Singapore', Title: 'No Pricing', Sequence: '2' }, [
            { category: 'Adult', price: '100', currency: 'INR' },
          ]),
        ],
        sightseeingHeaders(5),
      );
      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(1);
      const row = await importedSightseeing(user!.companyId, 'No Pricing');
      const pricing = row!.pricing as Array<{ label: string }>;
      expect(pricing).toHaveLength(1);
      expect(pricing[0]!.label).toBe('Adult');
    });

    it('rejects destination/city resolution failures and missing required fields', async () => {
      await owner('sightseeing-bad@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-bad@excel.test' } });
      await makeSightseeingBase('sightseeing-bad@excel.test', user!.companyId);
      const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Destination: 'Atlantis', City: 'Singapore', Title: 'Bad Dest', Sequence: '1' },
          { Destination: 'Singapore', City: 'Bali', Title: 'Bad City', Sequence: '1' },
          { Destination: 'Singapore', City: 'Singapore', Title: '', Sequence: '1' },
          { Destination: 'Singapore', City: 'Singapore', Title: 'No Seq', Sequence: '' },
        ],
        SIGHTSEEING_BASE,
      );
      const preview = await previewImport(buf, 'SIGHTSEEING', authOf(user!));
      expect(preview.invalidCount).toBe(4);
      expect(preview.rows[0]!.errors.some((e) => /destination/i.test(e.message))).toBe(true);
      expect(preview.rows[1]!.errors.some((e) => /city/i.test(e.message))).toBe(true);
      expect(preview.rows[2]!.errors.some((e) => e.field === 'title')).toBe(true);
      expect(preview.rows[3]!.errors.some((e) => e.field === 'sequence')).toBe(true);
      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(0);
    });

    it('reports invalid pricing values and detects duplicate titles in the same city', async () => {
      await owner('sightseeing-dup@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-dup@excel.test' } });
      await makeSightseeingBase('sightseeing-dup@excel.test', user!.companyId);
      const { previewImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const headers = sightseeingHeaders(1);
      const buf = await createWorkbook(
        [
          sightseeingRow({ Destination: 'Singapore', City: 'Singapore', Title: 'Bad Price', Sequence: '1' }, [{ category: 'Adult', price: 'abc' }]),
          sightseeingRow({ Destination: 'Singapore', City: 'Singapore', Title: 'Dup Title', Sequence: '1' }, []),
          sightseeingRow({ Destination: 'Singapore', City: 'Singapore', Title: 'Dup Title', Sequence: '2' }, []),
        ],
        headers,
      );
      const preview = await previewImport(buf, 'SIGHTSEEING', authOf(user!));
      expect(preview.invalidCount).toBe(2);
      expect(preview.rows[0]!.errors.some((e) => /non-negative number/i.test(e.message))).toBe(true);
      expect(preview.rows[2]!.errors.some((e) => /Duplicate/i.test(e.message))).toBe(true);
    });

    it('partially imports valid sightseeing rows and skips invalid ones', async () => {
      await owner('sightseeing-partial@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-partial@excel.test' } });
      await makeSightseeingBase('sightseeing-partial@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const buf = await createWorkbook(
        [
          { Destination: 'Singapore', City: 'Singapore', Title: 'Good One', Sequence: '1' },
          { Destination: 'Singapore', City: 'Singapore', Title: 'Good Two', Sequence: '2' },
          { Destination: 'Singapore', City: 'Bali', Title: 'Bad Three', Sequence: '3' },
        ],
        SIGHTSEEING_BASE,
      );
      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(await db.sightseeing.count({ where: { companyId: user!.companyId } })).toBe(2);
    });

    it('imports multiple embedded sightseeing images anchored to the row', async () => {
      await owner('sightseeing-img@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'sightseeing-img@excel.test' } });
      await makeSightseeingBase('sightseeing-img@excel.test', user!.companyId);
      const { executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Data');
      ws.addRow(SIGHTSEEING_BASE);
      ws.addRow(['Singapore', 'Singapore', 'Pictured Tour', '1']);
      ws.addRow([]); // blank row 3
      ws.addRow(['Singapore', 'Singapore', 'Other Tour', '2']);
      const idA = wb.addImage({ buffer: PNG_RED as unknown as ExcelJsImageBuffer, extension: 'png' });
      ws.addImage(idA, 'B2:B2');
      const idB = wb.addImage({ buffer: PNG_BLUE as unknown as ExcelJsImageBuffer, extension: 'png' });
      ws.addImage(idB, 'H2:H2'); // different column, same row 2
      const idC = wb.addImage({ buffer: GIF_1PX as unknown as ExcelJsImageBuffer, extension: 'gif' });
      ws.addImage(idC, 'F4:F4'); // row 4
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const result = await executeImport(buf, 'SIGHTSEEING', authOf(user!), { ipAddress: null, userAgent: null });
      expect(result.createdCount).toBe(2);
      const pictured = await importedSightseeing(user!.companyId, 'Pictured Tour');
      const other = await importedSightseeing(user!.companyId, 'Other Tour');
      const picturedImages = pictured!.images as Array<{ objectKey: string; mimeType: string }>;
      const otherImages = other!.images as Array<{ objectKey: string; mimeType: string }>;
      expect(picturedImages).toHaveLength(2);
      expect(otherImages).toHaveLength(1);
      expect(pictured!.imageObjectKey).toBe(picturedImages[0]!.objectKey);
      expect(picturedImages[0]!.mimeType).toBe('image/png');
      expect(picturedImages[1]!.mimeType).toBe('image/png');
      expect(otherImages[0]!.mimeType).toBe('image/gif');
      expect(await memoryStorageRead(picturedImages[0]!.objectKey)).toEqual(PNG_RED);
      expect(await memoryStorageRead(picturedImages[1]!.objectKey)).toEqual(PNG_BLUE);
      expect(await memoryStorageRead(otherImages[0]!.objectKey)).toEqual(GIF_1PX);
    });
  });

  describe('soft-deleted duplicates', () => {
    // Cruise/Vehicle/AddOnService enforce @@unique([companyId, normalizedName])
    // across soft-deleted rows (archiving keeps the record), so an archived name
    // still blocks a re-import — the same rule the manual create flow obeys.
    // Cities have no such constraint and are covered by the re-import test above.
    const fixtures = [
      {
        masterType: 'CRUISE' as const,
        email: 'soft-cruise@excel.test',
        headers: ['Cruise Name'],
        rows: [{ 'Cruise Name': 'Soft Cruise' }],
        update: (companyId: string) =>
          db.cruise.updateMany({ where: { companyId }, data: { status: 'ARCHIVED', deletedAt: new Date() } }),
        count: (companyId: string) => db.cruise.count({ where: { companyId, deletedAt: null } }),
      },
      {
        masterType: 'VEHICLE' as const,
        email: 'soft-vehicle@excel.test',
        headers: ['Vehicle Name', 'Vehicle Type'],
        rows: [{ 'Vehicle Name': 'Soft Van', 'Vehicle Type': 'Van' }],
        update: (companyId: string) =>
          db.vehicle.updateMany({ where: { companyId }, data: { status: 'ARCHIVED', deletedAt: new Date() } }),
        count: (companyId: string) => db.vehicle.count({ where: { companyId, deletedAt: null } }),
      },
      {
        masterType: 'ADD_ON_SERVICE' as const,
        email: 'soft-addon@excel.test',
        headers: ['Service Name'],
        rows: [{ 'Service Name': 'Soft Addon' }],
        update: (companyId: string) =>
          db.addOnService.updateMany({ where: { companyId }, data: { status: 'ARCHIVED', deletedAt: new Date() } }),
        count: (companyId: string) => db.addOnService.count({ where: { companyId, deletedAt: null } }),
      },
    ];

    for (const fixture of fixtures) {
      it(`still blocks a re-import of an archived ${fixture.masterType}`, async () => {
        await owner(fixture.email);
        const user = await db.user.findFirst({ where: { normalizedEmail: fixture.email } });
        const { previewImport, executeImport } = await import('../src/modules/masters/excel-import/excel-import.service.js');
        const buf = await createWorkbook(fixture.rows, fixture.headers);
        const auth = { companyId: user!.companyId, userId: user!.id } as never;
        await executeImport(buf, fixture.masterType, auth, { ipAddress: null, userAgent: null });
        await fixture.update(user!.companyId);

        const preview = await previewImport(buf, fixture.masterType, authOf(user!));
        expect(preview.invalidCount).toBe(1);
        expect(preview.rows[0]!.errors.some((e) => /already exists/i.test(e.message))).toBe(true);
        const result = await executeImport(buf, fixture.masterType, auth, { ipAddress: null, userAgent: null });
        expect(result.createdCount).toBe(0);
        expect(result.skippedCount).toBe(1);
        expect(await fixture.count(user!.companyId)).toBe(0);
      });
    }
  });

  describe('permission and endpoint guards', () => {
    it('denies preview, execute and error-report for users without create permission', async () => {
      const client = await owner('owner-noperm2@excel.test');
      const user = await db.user.findFirst({ where: { normalizedEmail: 'owner-noperm2@excel.test' } });
      const viewOnly = await db.role.findFirst({ where: { companyId: user!.companyId, name: 'View Only' } });
      await db.user.update({ where: { id: user!.id }, data: { roleId: viewOnly!.id } });

      const buf = await createWorkbook([{ 'City Name': 'Kanpur', 'Country': 'India' }], ['Country', 'City Name']);
      for (const path of ['/api/masters/import/preview', '/api/masters/import/execute', '/api/masters/import/error-report']) {
        const res = await request(app)
          .post(path)
          .set('Origin', TEST_ORIGIN)
          .set('Cookie', `interscale_sid=${client.cookies.session ?? ''}; interscale_csrf=${client.cookies.csrf ?? ''}`)
          .set('X-CSRF-Token', client.cookies.csrf ?? '')
          .field('masterType', 'CITY')
          .attach('file', buf, 'cities.xlsx');
        expect(res.status).toBe(403);
      }
    });

    it('reports zero valid rows over HTTP without importing anything', async () => {
      const client = await owner('zero-valid-http@excel.test');
      const buf = await createWorkbook(
        [
          { 'City Name': '', 'Country': 'India' },
          { 'City Name': '', 'Country': 'India' },
        ],
        ['Country', 'City Name'],
      );
      const upload = (path: string) =>
        request(app)
          .post(path)
          .set('Origin', TEST_ORIGIN)
          .set('Cookie', `interscale_sid=${client.cookies.session ?? ''}; interscale_csrf=${client.cookies.csrf ?? ''}`)
          .set('X-CSRF-Token', client.cookies.csrf ?? '')
          .field('masterType', 'CITY')
          .attach('file', buf, 'cities.xlsx');

      const previewRes = await upload('/api/masters/import/preview');
      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.validCount).toBe(0);

      const execRes = await upload('/api/masters/import/execute');
      expect(execRes.status).toBe(200);
      expect(execRes.body.data.createdCount).toBe(0);
      expect(execRes.body.data.skippedCount).toBe(2);
      const user = await db.user.findFirst({ where: { normalizedEmail: 'zero-valid-http@excel.test' } });
      expect(await db.city.count({ where: { companyId: user!.companyId } })).toBe(0);
    });
  });
});
