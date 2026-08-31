import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import PDFDocument from 'pdfkit';
import {
  computePageHeight as _computePageHeight,
  fitPackageTotalFontSize,
  renderQuotationPdf,
} from '../src/modules/quotations/pdf.service.js';
import { DEJAVU_SANS, DEJAVU_SANS_BOLD } from '../src/services/pdf/fonts.js';

void _computePageHeight;

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();
const itWithPdftotext = hasPdftotext ? it : it.skip;

function pdfText(buffer: Buffer): string {
  return execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: buffer,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
}

/** A real measurement context with the exact fonts the classic PDF uses. */
function measuringDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: 0, compress: false });
  doc.registerFont('Body', DEJAVU_SANS);
  doc.registerFont('Bold', DEJAVU_SANS_BOLD);
  return doc;
}

// The classic Package Total amount column is `rightW - 118` wide; on an A4
// cover layout that is 132pt.
const AMOUNT_COLUMN_W = 132;

describe('classic Package Total — amount never wraps', () => {
  it('keeps the original 20pt size for amounts that already fit', () => {
    const doc = measuringDoc();
    for (const amount of ['₹3,58,000', '₹10,00,000', '₹1,90,000']) {
      expect(fitPackageTotalFontSize(doc, amount, AMOUNT_COLUMN_W)).toBe(20);
      doc.font('Bold').fontSize(20);
      expect(doc.widthOfString(amount)).toBeLessThanOrEqual(AMOUNT_COLUMN_W);
    }
    doc.end();
  });

  it('shrinks just enough for ₹1,90,00,000 to fit on ONE line', () => {
    const doc = measuringDoc();
    const amount = '₹1,90,00,000';
    doc.font('Bold').fontSize(20);
    // Regression guard: at the original 20pt this amount genuinely overflows.
    expect(doc.widthOfString(amount)).toBeGreaterThan(AMOUNT_COLUMN_W);
    const size = fitPackageTotalFontSize(doc, amount, AMOUNT_COLUMN_W);
    expect(size).toBeLessThan(20);
    expect(size).toBeGreaterThanOrEqual(8);
    doc.font('Bold').fontSize(size);
    expect(doc.widthOfString(amount)).toBeLessThanOrEqual(AMOUNT_COLUMN_W);
    doc.end();
  });

  it('handles very large amounts (₹10,00,00,000 and ₹99,99,99,999) on one line', () => {
    const doc = measuringDoc();
    for (const amount of ['₹10,00,00,000', '₹99,99,99,999', '₹1,00,00,000']) {
      const size = fitPackageTotalFontSize(doc, amount, AMOUNT_COLUMN_W);
      expect(size).toBeGreaterThanOrEqual(8);
      doc.font('Bold').fontSize(size);
      expect(doc.widthOfString(amount)).toBeLessThanOrEqual(AMOUNT_COLUMN_W);
    }
    doc.end();
  });

  const quotation = {
    quotationNumber: 'QT-TOTAL-0001',
    customerName: 'Mira Shah',
    customerEmail: null,
    customerPhone: '+91 90000 00000',
    destinationSummary: 'Singapore',
    travelStartDate: null,
    travelEndDate: null,
    adults: 2,
    childrenWithBed: 0,
    childrenWithoutBed: 0,
    infants: 0,
    rooms: 1,
    validUntil: null,
  };

  const versionWithTotal = (perAdultPrice: string) => ({
    versionNumber: 1,
    title: 'Singapore Escape',
    introduction: null,
    currency: 'INR',
    finalAmount: '0',
    notes: null,
    perAdultPrice,
    perChildWithBedPrice: '0',
    perChildWithoutBedPrice: '0',
    perInfantPrice: '0',
    taxNote: null,
    initialPaymentAmount: '0',
    paymentLink: null,
    inclusionsHtml: null,
    exclusionsHtml: null,
    paymentPolicies: null,
    cancellationPolicies: null,
    bookingTerms: null,
    includeVisa: false,
    visaSectionTitle: null,
    visaAmount: '0',
    visaDestination: null,
    visaType: null,
    visaServiceCharge: '0',
    visaGstPercent: '0',
    visaVfsCharge: '0',
    flightDetails: null,
    sightseeingDetails: null,
    hotels: [],
    itinerary: [],
    services: [],
    inclusions: [],
    exclusions: [],
    terms: [],
  });

  const renderClassic = async (perAdultPrice: string) =>
    renderQuotationPdf({
      company: { name: 'Test Travel Co', address: ' addr ', phone: null, email: null, logoImage: null },
      quotation,
      version: versionWithTotal(perAdultPrice),
      images: { cover: PNG_1PX },
    } as never);

  it('renders classic PDFs with a ₹1,90,00,000 package total without errors', async () => {
    // 2 adults × ₹95,00,000 = ₹1,90,00,000
    const pdf = await renderClassic('95000000');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  itWithPdftotext('prints ₹1,90,00,000 as a single unbroken line', async () => {
    // pdftotext -layout keeps wrapped text on separate lines, so the complete
    // formatted amount (currency symbol + every digit group) can only be found
    // as one contiguous string when it was drawn on a single line.
    const visible = pdfText(await renderClassic('95000000'));
    expect(visible).toContain('₹19,00,00,000');
    expect(visible).not.toMatch(/₹19,00,00,\s*\n\s*000/);
  });
});

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
