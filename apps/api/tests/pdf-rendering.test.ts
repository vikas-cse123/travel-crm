import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  PDF_BOTTOM_MARGIN,
  PDF_FOOTER_HEIGHT,
  PDF_MAX_CONTENT_HEIGHT,
  PDF_MAX_PAGE_HEIGHT,
  PDF_MIN_PAGE_HEIGHT,
  PDF_PAGE_WIDTH,
  PDF_POST_CONTENT_GAP,
  PDF_TOP_MARGIN,
  computePageHeight,
  renderQuotationPdf,
} from '../src/modules/quotations/pdf.service.js';
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

/** Per-page physical dimensions from each /MediaBox. */
const pageMediaBoxes = (buffer: Buffer): Array<{ width: number; height: number }> => {
  const raw = buffer.toString('latin1');
  const re = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g;
  const boxes: Array<{ width: number; height: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    boxes.push({ width: Number(match[1]), height: Number(match[2]) });
  }
  return boxes;
};

/** 1x1 PNG used to prove images (hero/logo) are embedded without crashing. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Visible text extraction via poppler's pdftotext (the DejaVu fonts embed real
 * ToUnicode maps, so this returns searchable text, unlike the raw extractor).
 */
function pdfText(buffer: Buffer): string {
  return execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: buffer,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
}

function pdfTextPage(buffer: Buffer, page: number): string {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', '-', '-'], {
    input: buffer,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8');
}

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
      parts.push(zlib.inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString('latin1'));
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
  operatingSinceYear: 2015,
  tripsSold: 550,
  tan: 'ABC12345E',
  taxRegistrationNumber: '29ABCDE1234F1Z5',
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
      company: { ...company, logo: PNG_1PX },
      consultant: {
        name: 'Vivek Sharma',
        phone: '+91 90000 00001',
        email: 'vivek@interscale.example',
      },
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
      images: { cover: PNG_1PX },
      version: {
        versionNumber: 1,
        title: 'Grand South India Discovery — 15 Nights',
        introduction: LONG_TERMS,
        currency: 'INR',
        finalAmount: '450000.00',
        notes: LONG_TERMS,
        perAdultPrice: '40000.00',
        perChildWithBedPrice: '30000.00',
        perChildWithoutBedPrice: '20000.00',
        perInfantPrice: '5000.00',
        taxNote: 'Inclusive of all taxes, excluding TCS',
        initialPaymentAmount: '50000.00',
        paymentLink: 'https://example.com/pay',
        inclusionsHtml: null,
        exclusionsHtml: null,
        paymentPolicies: `<p>${'Pay early. '.repeat(10)}</p>`,
        cancellationPolicies: '<ul><li>Cancellation applies</li></ul>',
        bookingTerms: null,
        includeVisa: true,
        visaSectionTitle: 'Visa Details',
        visaAmount: '2000.00',
        visaDestination: 'Singapore',
        visaType: 'Tourist',
        visaServiceCharge: '500.00',
        visaGstPercent: '18',
        visaVfsCharge: '300.00',
        sightseeingDetails: {
          include: true,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: Arrival in Singapore',
              city: 'Singapore',
              date: '2026-10-23',
              meals: { breakfast: true, lunch: false, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'SHARED',
              activities: [{ name: 'Airport transfer', description: '<p>Meet and greet.</p>' }],
            },
          ],
        },
        flightDetails: {
          include: true,
          journeyType: 'ROUND_TRIP',
          outbound: {
            fromCity: 'Kolkata',
            toCity: 'Singapore',
            segments: [
              {
                airlineName: 'Indigo',
                flightNumber: '6E1015',
                travelClass: 'Economy',
                from: 'Kolkata',
                to: 'Singapore',
                departureDate: '2026-10-23',
                departureTime: '02:05',
                arrivalDate: '2026-10-23',
                arrivalTime: '09:00',
                duration: '4h 55m',
                cabinLuggage: '7kg',
                checkInLuggage: '30kg',
              },
            ],
          },
          returnJourney: { fromCity: 'Singapore', toCity: 'Kolkata', segments: [] },
        },
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
          unitSellingPrice: '1000',
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

    // --- Populated page-1 content and repeating footer (visible text) ---------
    const visible = pdfText(pdf);
    const raw = pdf.toString('latin1');
    const total = pageCount(pdf);

    // Destination hero image is embedded as an image XObject.
    expect(raw.match(/\/Subtype\s*\/Image/g)?.length ?? 0).toBeGreaterThan(0);
    // Consultant strip values.
    expect(visible).toContain('Consultant: Vivek Sharma');
    expect(visible).toContain('Phone: +91 90000 00001');
    expect(visible).toContain('Email: vivek@interscale.example');
    // Package title is present (uppercased by the renderer).
    expect(visible).toContain('GRAND SOUTH INDIA DISCOVERY');
    // Tax note appears exactly once.
    const taxMatches = visible.match(/Inclusive of all taxes, excluding TCS/g) ?? [];
    expect(taxMatches).toHaveLength(1);
    // Secure Your Booking block + Pay Now button.
    expect(visible).toContain('Secure Your Booking');
    expect(visible).toContain('Pay Now');
    // The raw payment URL is a link annotation, never visible text.
    expect(raw).toContain('/URI');
    expect(visible).not.toContain('https://pay.example.com/secure');
    // Footer columns on every physical page with the correct page counter.
    for (let page = 1; page <= total; page += 1) {
      const pageText = pdfTextPage(pdf, page);
      expect(pageText).toContain('CONTACT US');
      expect(pageText).toContain('OUR ACHIEVEMENTS');
      expect(pageText).toContain('LEGAL INFO');
      expect(pageText).toContain(`Page ${page}/${total}`);
    }
    // Contact / achievements / legal values.
    expect(visible).toContain('Ph: +91 90000 00000');
    expect(visible).toContain('Em: reservations@interscale.example');
    expect(visible).toContain('550 Trips Sold');
    expect(visible).toContain('Est: 2015');
    expect(visible).toContain('TAN: ABC12345E');
    expect(visible).toContain('GSTIN: 29ABCDE1234F1Z5');
    // No junk values anywhere in the visible document.
    expect(visible).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b|\[object Object\]/);

    // Dynamic page heights: every page shares the width, is content-sized
    // (within min/max), and pages are not all forced to one identical height.
    const boxes = pageMediaBoxes(pdf);
    expect(boxes).toHaveLength(total);
    for (const box of boxes) {
      expect(box.width).toBeCloseTo(PDF_PAGE_WIDTH, 0);
      expect(box.height).toBeGreaterThanOrEqual(PDF_MIN_PAGE_HEIGHT - 1);
      expect(box.height).toBeLessThanOrEqual(PDF_MAX_PAGE_HEIGHT + 1);
    }
    const heights = boxes.map((b) => b.height);
    expect(new Set(heights).size).toBeGreaterThan(1);
    // No page may exceed the measured content budget by creating a phantom tall
    // page; a tall page must be paired with proportionally taller content.
    for (const box of boxes) {
      expect(box.height).toBeLessThanOrEqual(
        PDF_TOP_MARGIN + PDF_MAX_CONTENT_HEIGHT + PDF_POST_CONTENT_GAP + PDF_FOOTER_HEIGHT + PDF_BOTTOM_MARGIN + 1,
      );
    }
  });

  it('maps Destination (Malaysia) while keeping city content (Kuala Lumpur) intact', async () => {
    const pdf = await renderQuotationPdf({
      company: { ...company, logo: PNG_1PX },
      quotation: {
        quotationNumber: 'QT-MY-KL-0001',
        customerName: 'Rajesh Kumar',
        customerEmail: 'rajesh@example.com',
        customerPhone: '+91 90000 00002',
        destinationSummary: 'Kuala Lumpur',
        // Destination/Master-country (Malaysia) from the lead itinerary.
        destinations: 'Malaysia',
        travelStartDate: new Date('2026-10-23'),
        travelEndDate: new Date('2026-10-27'),
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: new Date('2026-10-20'),
      },
      version: {
        versionNumber: 1,
        title: 'Kuala Lumpur Package for Rajesh Kumar',
        introduction: null,
        currency: 'INR',
        finalAmount: '80000.00',
        notes: null,
        perAdultPrice: '40000.00',
        perChildWithBedPrice: '0',
        perChildWithoutBedPrice: '0',
        perInfantPrice: '0',
        taxNote: null,
        initialPaymentAmount: '20000.00',
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
        sightseeingDetails: {
          include: true,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: Kuala Lumpur',
              city: 'Kuala Lumpur',
              date: '2026-10-23',
              meals: { breakfast: true, lunch: false, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'SHARED',
              activities: [{ name: 'Batu Caves Tour', description: null }],
            },
          ],
        },
        flightDetails: {
          include: true,
          journeyType: 'ONEWAY_OUTBOUND',
          outbound: {
            fromCity: 'Delhi',
            toCity: 'Kuala Lumpur',
            segments: [
              {
                airlineName: 'AirAsia',
                flightNumber: 'AK101',
                travelClass: 'Economy',
                from: 'Delhi',
                to: 'Kuala Lumpur',
                departureDate: '2026-10-23',
                departureTime: '23:55',
                arrivalDate: '2026-10-24',
                arrivalTime: '05:10',
                duration: '5h 15m',
              },
            ],
          },
          returnJourney: { fromCity: 'Kuala Lumpur', toCity: 'Delhi', segments: [] },
        },
        hotels: [
          {
            city: 'Kuala Lumpur',
            hotelName: 'Grand KL Hotel',
            category: '5 Star',
            roomType: 'Deluxe',
            mealPlan: 'MAP',
            nights: 4,
            selected: true,
            notes: null,
          },
        ],
        itinerary: [
          {
            dayNumber: 1,
            title: 'Day 1: Kuala Lumpur',
            destination: 'Kuala Lumpur',
            description: 'Arrival and city tour.',
            meals: null,
            overnightLocation: 'Kuala Lumpur',
          },
        ],
        services: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
    });
    expect(isPdf(pdf)).toBe(true);
    const visible = pdfText(pdf);
    // The hero/package heading keeps the city (Kuala Lumpur) — may wrap across
    // lines in the extracted layout text, so collapse whitespace before matching.
    expect(visible.replace(/\s+/g, ' ')).toContain('KUALA LUMPUR PACKAGE FOR RAJESH KUMAR');
    // The Destination summary row shows the Master country (Malaysia).
    expect(visible).toContain('Destination: Malaysia');
    // City-specific content stays Kuala Lumpur.
    expect(visible).toContain('Kuala Lumpur');
    expect(visible).toContain('Grand KL Hotel');
    expect(visible.replace(/\s+/g, ' ')).toContain('Day 1: Kuala Lumpur');
  });

  it('renders a quotation PDF with missing optional data without junk or broken blocks', async () => {
    const pdf = await renderQuotationPdf({
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSinceYear: null,
        tripsSold: null,
        tan: null,
        taxRegistrationNumber: null,
        logo: null,
      },
      consultant: { name: 'Only Name', phone: null, email: null },
      quotation: {
        quotationNumber: 'QT-MIN-0001',
        customerName: 'Mira Shah',
        customerEmail: null,
        customerPhone: '+91 90000 00000',
        destinationSummary: 'Kerala',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
      },
      version: {
        versionNumber: 1,
        title: 'Kerala Escape',
        introduction: null,
        currency: 'INR',
        finalAmount: '100',
        notes: null,
        perAdultPrice: '50',
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
      },
    });
    expect(isPdf(pdf)).toBe(true);
    const visible = pdfText(pdf);
    const total = pageCount(pdf);
    // Consultant name renders; missing phone/email leave no empty labels.
    expect(visible).toContain('Consultant: Only Name');
    expect(visible).not.toMatch(/Phone:\s*$/m);
    expect(visible).not.toMatch(/Email:\s*$/m);
    // Contact Us keeps only the email line.
    expect(visible).toContain('CONTACT US');
    expect(visible).toContain('Em: hello@alpha.test');
    expect(visible).not.toContain('Ph:');
    expect(visible).not.toContain('Web:');
    // Achievements / Legal headings still render with their values omitted.
    expect(visible).toContain('OUR ACHIEVEMENTS');
    expect(visible).not.toMatch(/Trips Sold/);
    expect(visible).not.toMatch(/Est:/);
    expect(visible).toContain('LEGAL INFO');
    expect(visible).not.toMatch(/TAN:/);
    expect(visible).not.toMatch(/GSTIN:/);
    // Page number appears on every generated page.
    for (let page = 1; page <= total; page += 1) {
      expect(pdfTextPage(pdf, page)).toContain(`Page ${page}/${total}`);
    }
    // No junk values and no broken-image label.
    expect(visible).not.toMatch(/\bnull\b|\bundefined\b|\bNaN\b|\[object Object\]/);
    expect(visible).not.toMatch(/broken|image placeholder/i);
  });

  it('renders a minimal quotation with exactly the necessary pages', async () => {
    const pdf = await renderQuotationPdf({
      company,
      quotation: {
        quotationNumber: 'QT-MIN-0002',
        customerName: 'Tiny Trip',
        customerEmail: null,
        customerPhone: '+91 90000 00000',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 1,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
      },
      version: {
        versionNumber: 1,
        title: 'Goa Day Trip',
        introduction: null,
        currency: 'INR',
        finalAmount: '5000',
        notes: null,
        perAdultPrice: '5000',
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
      },
    });
    expect(isPdf(pdf)).toBe(true);
    // Page 1 (summary) + final Thank You page; nothing extra.
    const total = pageCount(pdf);
    expect(total).toBe(2);
    // No footer-only or blank page; every page carries the footer + counter.
    for (let page = 1; page <= total; page += 1) {
      const pageText = pdfTextPage(pdf, page);
      expect(pageText).toContain('CONTACT US');
      expect(pageText).toContain(`Page ${page}/${total}`);
    }
    // Both pages share the width and are content-sized.
    const boxes = pageMediaBoxes(pdf);
    expect(boxes).toHaveLength(total);
    for (const box of boxes) {
      expect(box.width).toBeCloseTo(PDF_PAGE_WIDTH, 0);
      expect(box.height).toBeGreaterThanOrEqual(PDF_MIN_PAGE_HEIGHT - 1);
      expect(box.height).toBeLessThanOrEqual(PDF_MAX_PAGE_HEIGHT + 1);
    }
    // Thank You remains the final page.
    expect(pdfTextPage(pdf, total)).toContain('THANK');
  });

  it('measures short and long content into different physical page heights', async () => {
    // Short document: cover + thank-you only.
    const short = await renderQuotationPdf({
      company,
      quotation: {
        quotationNumber: 'QT-SHORT-0001',
        customerName: 'Short Trip',
        customerEmail: null,
        customerPhone: '+91 90000 00000',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 1,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
      },
      version: {
        versionNumber: 1,
        title: 'Goa Day Trip',
        introduction: null,
        currency: 'INR',
        finalAmount: '5000',
        notes: null,
        perAdultPrice: '5000',
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
      },
    });
    // Long document: cover + flights + hotels + itinerary + add-ons + policies.
    const long = await renderQuotationPdf({
      company,
      quotation: {
        quotationNumber: 'QT-LONG-0001',
        customerName: 'Long Trip',
        customerEmail: null,
        customerPhone: '+91 90000 00000',
        destinationSummary: 'Singapore',
        travelStartDate: new Date('2026-11-13'),
        travelEndDate: new Date('2026-11-18'),
        adults: 2,
        childrenWithBed: 1,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
      },
      version: {
        versionNumber: 1,
        title: 'Singapore Long Package',
        introduction: null,
        currency: 'INR',
        finalAmount: '80000',
        notes: null,
        perAdultPrice: '35000',
        perChildWithBedPrice: '10000',
        perChildWithoutBedPrice: '0',
        perInfantPrice: '0',
        taxNote: 'Inclusive of all taxes, excluding TCS',
        initialPaymentAmount: '20000',
        paymentLink: 'https://pay.example.com/secure',
        inclusionsHtml: '<ul><li>Transfers</li><li>Breakfast</li></ul>',
        exclusionsHtml: null,
        paymentPolicies: '<p>Pay early.</p>',
        cancellationPolicies: '<p>Cancellation applies.</p>',
        bookingTerms: null,
        includeVisa: false,
        visaSectionTitle: null,
        visaAmount: '0',
        visaDestination: null,
        visaType: null,
        visaServiceCharge: '0',
        visaGstPercent: '0',
        visaVfsCharge: '0',
        flightDetails: {
          include: true,
          journeyType: 'ROUND_TRIP',
          outbound: {
            fromCity: 'Mumbai',
            toCity: 'Singapore',
            segments: [
              {
                airlineId: null,
                airlineName: 'Singapore Airlines',
                flightNumber: 'SQ423',
                travelClass: 'Economy',
                from: 'Mumbai',
                to: 'Singapore',
                departureDate: '2026-11-13',
                departureTime: '02:05',
                arrivalDate: '2026-11-13',
                arrivalTime: '09:00',
                duration: '4h 55m',
                cabinLuggage: '7kg',
                checkInLuggage: '30kg',
                notes: '<p>Long note that keeps growing. '.repeat(8) + '</p>',
              },
            ],
          },
          returnJourney: {
            fromCity: 'Singapore',
            toCity: 'Mumbai',
            segments: [
              {
                airlineId: null,
                airlineName: 'Singapore Airlines',
                flightNumber: 'SQ422',
                travelClass: 'Economy',
                from: 'Singapore',
                to: 'Mumbai',
                departureDate: '2026-11-18',
                departureTime: '10:00',
                arrivalDate: '2026-11-18',
                arrivalTime: '12:30',
                duration: '5h 30m',
                cabinLuggage: '7kg',
                checkInLuggage: '30kg',
                notes: null,
              },
            ],
          },
        },
        sightseeingDetails: null,
        hotels: [{ city: 'Singapore', hotelName: 'Marina Bay Sands', category: '5 Star', roomType: 'Deluxe', mealPlan: 'BB', nights: 5, selected: true, notes: null }],
        itinerary: [],
        services: [{ serviceType: 'TRAVEL_INSURANCE', name: 'Travel Insurance', description: '<p>Coverage for the whole trip.</p>', city: null, quantity: '1', unitSellingPrice: '3000' }],
        inclusions: [{ content: 'Transfers' }],
        exclusions: [],
        terms: [{ content: 'Standard terms apply.' }],
      },
    });
    const shortBoxes = pageMediaBoxes(short);
    const longBoxes = pageMediaBoxes(long);
    expect(shortBoxes.every((b) => Math.abs(b.width - PDF_PAGE_WIDTH) < 1)).toBe(true);
    expect(longBoxes.every((b) => Math.abs(b.width - PDF_PAGE_WIDTH) < 1)).toBe(true);
    for (const box of [...shortBoxes, ...longBoxes]) {
      expect(box.height).toBeGreaterThanOrEqual(PDF_MIN_PAGE_HEIGHT - 1);
      expect(box.height).toBeLessThanOrEqual(PDF_MAX_PAGE_HEIGHT + 1);
    }
    // The populated document contains a page taller than the short document's
    // tallest page (short pages are physically shorter).
    const shortTallest = Math.max(...shortBoxes.map((b) => b.height));
    const longTallest = Math.max(...longBoxes.map((b) => b.height));
    expect(longTallest).toBeGreaterThan(shortTallest);
    // The long outbound flight card (long notes) grows taller than the return
    // card (no notes): the outbound page is taller than the return page.
    const outboundH = longBoxes[1]?.height ?? 0;
    const returnH = longBoxes[2]?.height ?? 0;
    expect(outboundH).toBeGreaterThan(returnH);
  });

  it('anchors the footer to the physical page bottom with a consistent formula', () => {
    // footerTop is always pageHeight - bottomMargin - footerHeight, so every
    // page type shares the same bottom-anchored footer position.
    for (const contentHeight of [120, 260, 400, 600]) {
      const layout = computePageHeight(contentHeight);
      expect(layout.footerTop).toBeCloseTo(
        layout.pageHeight - PDF_BOTTOM_MARGIN - PDF_FOOTER_HEIGHT,
        4,
      );
      expect(layout.pageHeight).toBeGreaterThanOrEqual(PDF_MIN_PAGE_HEIGHT);
      expect(layout.pageHeight).toBeLessThanOrEqual(PDF_MAX_PAGE_HEIGHT + 1);
    }
    // Below the minimum the page stays at the minimum while the footer remains
    // anchored to the bottom (never floating upward under the content).
    const small = computePageHeight(80);
    expect(small.pageHeight).toBe(PDF_MIN_PAGE_HEIGHT);
    expect(small.footerTop).toBeCloseTo(
      PDF_MIN_PAGE_HEIGHT - PDF_BOTTOM_MARGIN - PDF_FOOTER_HEIGHT,
      4,
    );
    // The footer never overlaps content: it always sits at least POST_GAP below.
    expect(small.footerTop - small.contentBottom).toBeGreaterThanOrEqual(PDF_POST_CONTENT_GAP - 0.001);
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
