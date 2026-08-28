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

  if (adapter.masterType === 'HOTEL') {
    instr.addRow([]);
    instr.addRow(['Hotels, Room Types & Meal Plans']).eachCell((c) => (c.font = { bold: true }));
    instr.addRow(['One Excel row = ONE hotel. Do NOT repeat the hotel row for additional rooms, meals, months or seasons.']);
    instr.addRow(['The first 9 columns are the hotel fields (Hotel Name, Destination, City, Address, Star Category, Star Rating, Review Link, Description, Amenities).']);
    instr.addRow(['Room Types are added in groups of 6 columns: "Room Type N", "Room Type N Description", "Room Type N Base Price", "Room Type N Currency", "Room Type N Extra Bed Price", "Room Type N Child Without Bed Price".']);
    instr.addRow(['The template shows Room Type 1 and Room Type 2. Add Room Type 3, 4, 5, ... by copying the complete Room Type column group and renumbering it — the importer detects ANY number of groups.']);
    instr.addRow(['Each Room Type N also has its own Monthly Rate and Seasonal Rate groups as separate columns. The template shows one of each; copy the group and renumber for more rates (e.g. "Room Type 1 Seasonal Rate 2 Season Name").']);
    instr.addRow(['Room Type N Monthly Rate M Month accepts a month name (Jan–Dec) or a number (1–12).']);
    instr.addRow(['Seasonal rate dates use DD-MM-YYYY (or YYYY-MM-DD) and the end date must be on or after the start date.']);
    instr.addRow(['Meal Plans are added in groups of 4 columns: "Meal Plan N", "Meal Plan N Description", "Meal Plan N Base Price", "Meal Plan N Currency", plus their own Monthly Rate and Seasonal Rate groups.']);
    instr.addRow(['The template shows Meal Plan 1 and Meal Plan 2; add Meal Plan 3, 4, 5, ... the same way by copying the column group.']);
    instr.addRow(['A completely blank Room Type or Meal Plan group is ignored. A partially filled group is validated and reported in the preview.']);
    instr.addRow(['Required: Hotel Name, Destination, City. All other columns are optional.']);
    instr.addRow(['Do NOT add an Image/Image URL column.']);
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
    HOTEL: 'Hotels.xlsx',
  };
  return map[masterType];
}