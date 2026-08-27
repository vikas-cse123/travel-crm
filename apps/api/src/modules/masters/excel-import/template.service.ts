import ExcelJS from 'exceljs';
import type { SupportedImportType } from './excel-import.types.js';
import { getAdapter } from './adapters/index.js';

const ENUM_DROPDOWNS: Record<string, { values: string[]; error: string }> = {
  status: {
    values: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
    error: 'Please select ACTIVE, INACTIVE or ARCHIVED',
  },
  destinationType: {
    values: ['DOMESTIC', 'INTERNATIONAL'],
    error: 'Please select DOMESTIC or INTERNATIONAL',
  },
};

type ExcelJsImage = Parameters<ExcelJS.Workbook['addImage']>[0];
type ExcelJsImageBuffer = NonNullable<ExcelJsImage['buffer']>;

/** Insert a sample embedded image next to the example row. */
const SAMPLE_IMAGE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGNQTX5NU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAMMtzEwilX6gAAAAAElFTkSuQmCC',
  'base64',
);

export async function generateTemplate(masterType: SupportedImportType): Promise<Buffer> {
  const adapter = getAdapter(masterType);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Travel CRM';
  workbook.created = new Date();

  // Data sheet
  const dataSheet = workbook.addWorksheet('Data');
  const headers = adapter.columns.map((c) => c.header);
  const headerRow = dataSheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  dataSheet.columns = adapter.columns.map((c) => ({ width: Math.max(18, c.header.length + 6) }));

  // Add example row (light gray, italic)
  const exampleRow = dataSheet.addRow(adapter.columns.map((c) => c.example ?? ''));
  exampleRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: 'FF6B7280' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  });

  // Add data validations for enums (status, destination type, ...)
  adapter.columns.forEach((col, idx) => {
    const dropdown = ENUM_DROPDOWNS[col.field];
    if (!dropdown) return;
    const colLetter = String.fromCharCode(65 + idx);
    for (let r = 3; r <= 200; r++) {
      const cell = dataSheet.getCell(`${colLetter}${r}`);
      (cell as unknown as { dataValidation: unknown }).dataValidation = {
        type: 'list',
        allowBlank: !col.required,
        formulae: [`"${dropdown.values.join(',')}"`],
        showDropDown: false,
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: dropdown.error,
      };
    }
  });

  // Image-capable masters demonstrate the embedded-image workflow: a real image
  // is anchored to the example row (row 2) so the user sees that images go IN
  // the spreadsheet, never as a URL. The example row is skipped on import, and
  // an image anchored to it is ignored because it is not a data row.
  if (adapter.image) {
    const sampleImageId = workbook.addImage({
      buffer: SAMPLE_IMAGE_PNG as unknown as ExcelJsImageBuffer,
      extension: 'png',
    });
    dataSheet.addImage(sampleImageId, 'A2:A2');
  }

  // Instructions sheet
  const instr = workbook.addWorksheet('Instructions');
  instr.columns = [{ width: 24 }, { width: 16 }, { width: 52 }, { width: 26 }];
  const titleRow = instr.addRow([`${adapter.masterType.replaceAll('_', ' ')} Import Template`]);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
  instr.addRow([]);
  instr.addRow(['Field', 'Required', 'Description', 'Example']).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center' };
  });
  for (const col of adapter.columns) {
    const row = instr.addRow([col.header, col.required ? 'Yes' : 'No', col.description, col.example ?? '']);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
  }
  instr.addRow([]);
  instr.addRow(['General Instructions']).eachCell((c) => (c.font = { bold: true }));
  instr.addRow(['1. Fill data in the "Data" sheet starting from row 3 (row 2 is an example, delete it before import).']);
  instr.addRow(['2. Do not change header names or delete the Instructions sheet.']);
  instr.addRow(['3. Required fields must not be empty.']);
  instr.addRow(['4. For duplicate handling, existing records are checked per company.']);
  instr.addRow(['5. Maximum 500 rows per import.']);
  instr.addRow(['6. Save as .xlsx and upload via Masters → Import Excel.']);

  if (adapter.masterType === 'DESTINATION') {
    instr.addRow([]);
    instr.addRow(['Cities']).eachCell((c) => (c.font = { bold: true }));
    instr.addRow([
      'Cities are entered as comma-separated names that must already exist in your Cities master and belong to the destination’s country (e.g. "Jaipur, Jodhpur").',
    ]);
    instr.addRow(['Each destination requires at least one existing city.']);
  }

  if (adapter.masterType === 'CRUISE') {
    instr.addRow([]);
    instr.addRow(['Room Types']).eachCell((c) => (c.font = { bold: true }));
    instr.addRow(['One Cruise = one Excel row. The first 4 columns are the Cruise fields.']);
    instr.addRow([
      'Room Types are added in groups of 4 columns: "Room Type N", "Room N Description", "Room N Price", "Room N Currency".',
    ]);
    instr.addRow([
      'Add more groups yourself when needed — e.g. for a 4th room type add "Room Type 4", "Room 4 Description", "Room 4 Price", "Room 4 Currency". The importer detects any number of groups.',
    ]);
    instr.addRow([
      'If a Cruise has no room types, leave all Room Type columns blank — unused groups are ignored.',
    ]);
    instr.addRow(['Do NOT add a Status column.']);
  }

  if (adapter.masterType === 'SIGHTSEEING') {
    instr.addRow([]);
    instr.addRow(['Pricing']).eachCell((c) => (c.font = { bold: true }));
    instr.addRow(['One Sightseeing = one Excel row. Destination, City, Title and Sequence are required.']);
    instr.addRow([
      'Pricing is optional and uses 3-column groups: "Category N", "Price N", "Currency N".',
    ]);
    instr.addRow([
      'Add more groups yourself when needed — e.g. a 4th category adds "Category 4", "Price 4", "Currency 4". The importer detects any number of groups.',
    ]);
    instr.addRow([
      'Do NOT repeat the sightseeing row for different pricing categories; put all categories in one row.',
    ]);
    instr.addRow(['Blank unused pricing groups are ignored.']);
    instr.addRow(['Do NOT add a Status column.']);
  }

  // Auto filter
  dataSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  // Freeze header
  dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function fileNameForType(masterType: SupportedImportType): string {
  const map: Record<SupportedImportType, string> = {
    CITY: 'Cities.xlsx',
    AIRLINE: 'Airlines.xlsx',
    CRUISE: 'Cruises.xlsx',
    VEHICLE: 'Vehicles.xlsx',
    ADD_ON_SERVICE: 'Add-On-Services.xlsx',
    DESTINATION: 'Destinations.xlsx',
    SIGHTSEEING: 'Sightseeing.xlsx',
  };
  return map[masterType];
}