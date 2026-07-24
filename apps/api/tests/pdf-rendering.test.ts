import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderQuotationPdf } from '../src/modules/quotations/pdf.service.js';
import { renderBookingConfirmationPdf } from '../src/modules/bookings/booking-pdf.service.js';
import {
  renderBookingInvoicePdf,
  renderBookingTaxInvoicePdf,
  renderBookingVoucherPdf,
} from '../src/modules/bookings/booking-invoice.service.js';

/**
 * PDF rendering robustness. Exercises every customer-facing document with
 * deliberately long content (long names/addresses, many travellers, many
 * services, long itinerary and terms) and asserts the output is a valid,
 * multi-page PDF that never leaks internal cost. Not a pixel snapshot.
 */

const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-';
const pageCount = (buffer: Buffer) =>
  (buffer.toString('latin1').match(/\/Type\s*\/Page(?![sR])/g) ?? []).length;

/**
 * Best-effort text search: include the raw bytes (pdfkit may leave content
 * streams uncompressed) plus any inflatable FlateDecode streams, so drawn text
 * can be searched regardless of the compression setting.
 */
function extractText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const parts: string[] = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    try {
      parts.push(zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
    } catch {
      /* not a flate stream; skip */
    }
  }
  return parts.join('\n');
}

const LONG_NAME =
  'Interscale Global Luxury Bespoke Holidays and Destination Management Company Pvt Ltd';
const LONG_ADDRESS =
  'Level 14, Tower B, One World Business Park, Sarjapur Outer Ring Road, Bellandur, ' +
  'Bengaluru, Karnataka 560103, India (near the very long landmark name plaza complex)';
const LONG_TERMS = 'Cancellation, refund, force-majeure and liability terms. '.repeat(60);

const company = {
  name: LONG_NAME,
  email: 'reservations@interscale.example',
  phone: '+91 90000 00000',
  website: 'https://interscale.example',
  address: LONG_ADDRESS,
  primaryColor: '#2563eb',
  logo: null,
};
const invoiceCompany = {
  ...company,
  taxRegistrationNumber: '29ABCDE1234F1Z5',
  bank: {
    accountHolderName: LONG_NAME,
    bankName: 'Very Long National Commercial Bank of the Southern Region',
    branchName: 'Outer Ring Road Premium Business Banking Branch',
    ifscCode: 'VLNC0001234',
    accountNumberMasked: '••••6789',
  },
};

const travellers = Array.from({ length: 40 }, (_, index) => ({
  title: 'Mr',
  firstName: `Traveller${index + 1}`,
  middleName: 'Middlename',
  lastName: `Longsurname-${index + 1}`,
}));
const invoiceServices = Array.from({ length: 30 }, (_, index) => ({
  name: `Premium guided experience number ${index + 1} with a rather long descriptive title`,
  serviceType: 'SIGHTSEEING',
  city: `City ${index + 1}`,
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-02'),
  confirmationStatus: 'CONFIRMED',
  confirmationNumber: `CNF-${index + 1}`,
  supplierReference: `REF-${index + 1}`,
  customerSellingAmount: '12500.00',
}));

const invoiceBooking = {
  bookingNumber: 'BK-LONGDOC-0001',
  customerName: 'Aishwarya Venkataraman Subramaniam Longcustomername',
  customerEmail: 'customer@example.com',
  customerPhone: '+91 98888 88888',
  destinationSummary:
    'Bengaluru → Coorg → Ooty → Kodaikanal → Munnar → Alleppey → Kochi (long trip)',
  travelStartDate: new Date('2026-08-01'),
  travelEndDate: new Date('2026-08-15'),
  currency: 'INR',
  totalSellingAmount: '450000.00',
  gstAmount: '22500.00',
  tcsAmount: '4500.00',
  totalPayable: '477000.00',
  totalCustomerPaid: '200000.00',
  totalCustomerOutstanding: '277000.00',
  travellers,
  services: invoiceServices,
};

describe('PDF rendering with long content', () => {
  it('renders a multi-page quotation PDF with a long itinerary and terms', async () => {
    const pdf = await renderQuotationPdf({
      company,
      quotation: {
        quotationNumber: 'QT-LONGDOC-0001',
        customerName: invoiceBooking.customerName,
        customerEmail: 'c@example.com',
        customerPhone: '+91 98888 88888',
        destinationSummary: invoiceBooking.destinationSummary,
        travelStartDate: new Date('2026-08-01'),
        travelEndDate: new Date('2026-08-15'),
        adults: 4,
        childrenWithBed: 2,
        childrenWithoutBed: 1,
        infants: 1,
        rooms: 3,
        validUntil: new Date('2026-07-31'),
      },
      version: {
        versionNumber: 1,
        title: 'Grand South India Discovery — 15 Nights',
        introduction: LONG_TERMS,
        currency: 'INR',
        finalAmount: '450000.00',
        notes: LONG_TERMS,
        hotels: Array.from({ length: 10 }, (_, i) => ({
          city: `City ${i + 1}`,
          hotelName: `Very Grand Heritage Palace Resort and Spa ${i + 1}`,
          category: '5 Star',
          roomType: 'Deluxe',
          mealPlan: 'MAP',
          nights: 2,
          selected: true,
          notes: 'Long note. '.repeat(20),
        })),
        itinerary: Array.from({ length: 15 }, (_, i) => ({
          dayNumber: i + 1,
          title: `Day ${i + 1} — a fairly long descriptive itinerary day title goes here`,
          destination: `City ${i + 1}`,
          description: 'Detailed day description. '.repeat(40),
          meals: 'Breakfast, Lunch, Dinner',
          overnightLocation: `City ${i + 1}`,
        })),
        services: invoiceServices.map((s) => ({
          serviceType: s.serviceType,
          name: s.name,
          description: 'Service description. '.repeat(15),
          city: s.city,
          quantity: '1',
        })),
        inclusions: Array.from({ length: 25 }, (_, i) => ({ content: `Inclusion ${i + 1}` })),
        exclusions: Array.from({ length: 25 }, (_, i) => ({ content: `Exclusion ${i + 1}` })),
        terms: Array.from({ length: 15 }, (_, i) => ({ content: `${LONG_TERMS} (${i + 1})` })),
      },
    });
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pageCount(pdf)).toBeGreaterThan(1);
    const text = extractText(pdf);
    expect(text).not.toMatch(/internal cost|vendor cost|supplier cost|gross profit|net profit/i);
  });

  it('renders a multi-page booking confirmation with many travellers and services', async () => {
    const pdf = await renderBookingConfirmationPdf({
      company,
      booking: {
        ...invoiceBooking,
        sourceTerms: [LONG_TERMS],
        services: invoiceServices,
        itinerary: Array.from({ length: 15 }, (_, i) => ({
          dayNumber: i + 1,
          title: `Day ${i + 1}`,
          destination: `City ${i + 1}`,
          description: 'Day description. '.repeat(30),
          meals: 'B/L/D',
          overnightLocation: `City ${i + 1}`,
        })),
      },
    });
    expect(isPdf(pdf)).toBe(true);
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(extractText(pdf)).not.toMatch(
      /internal cost|vendor cost|gross profit|net profit|profit margin/i,
    );
  });

  it('renders the invoice and keeps it distinct from the tax invoice', async () => {
    const invoice = await renderBookingInvoicePdf({
      company: invoiceCompany,
      booking: invoiceBooking,
    });
    const taxInvoice = await renderBookingTaxInvoicePdf({
      company: invoiceCompany,
      booking: invoiceBooking,
    });
    expect(isPdf(invoice)).toBe(true);
    expect(isPdf(taxInvoice)).toBe(true);
    const invoiceText = extractText(invoice);
    const taxText = extractText(taxInvoice);
    // The tax invoice adds a GST/TCS breakdown and total payable; the plain
    // invoice does not, so it is a genuinely different, larger document.
    expect(invoice.equals(taxInvoice)).toBe(false);
    expect(taxInvoice.length).toBeGreaterThan(invoice.length);
    // Neither customer document leaks internal cost (defense in depth; the
    // render input types structurally exclude cost fields).
    expect(invoiceText).not.toMatch(
      /internal cost|vendor cost|supplier cost|gross profit|net profit/i,
    );
    expect(taxText).not.toMatch(/internal cost|vendor cost|supplier cost|gross profit|net profit/i);
  });

  it('renders the voucher with many travellers and no financials', async () => {
    const pdf = await renderBookingVoucherPdf({ company: invoiceCompany, booking: invoiceBooking });
    expect(isPdf(pdf)).toBe(true);
    expect(pageCount(pdf)).toBeGreaterThan(1);
    const text = extractText(pdf);
    // The voucher is operational only — none of the invoice's financial labels.
    expect(text).not.toMatch(
      /internal cost|vendor cost|net profit|total payable|tax summary|payment summary/i,
    );
  });
});
