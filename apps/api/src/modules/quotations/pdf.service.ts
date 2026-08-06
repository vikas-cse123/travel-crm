import PDFDocument from 'pdfkit';
import { cabinLuggageLabel, hotelStayNights, isPublicTaxNote } from '@interscale/shared';
import { DEJAVU_SANS, DEJAVU_SANS_BOLD } from '../../services/pdf/fonts.js';

/**
 * Quotation PDF renderer — content-based page heights.
 *
 * Every physical page height is derived from its measured content:
 *
 *   pageHeight = topMargin + measuredContentHeight + postContentGap
 *              + footerHeight + bottomMargin
 *
 * The renderer works in two phases:
 *   1. MEASURE + PLAN — every section builds measured blocks; a page planner
 *      packs them into pages (continuation pages when a page would exceed the
 *      maximum content height).
 *   2. RENDER — each planned page is added with its calculated size and its
 *      blocks are drawn, then the complete footer is drawn on every buffered
 *      page using that page's own height.
 *
 * All visual features are preserved: destination hero image + overlay, the
 * consultant strip, package title, summary + traveller-pricing columns, yellow
 * Total Cost box, the `Inclusive of all taxes, excluding TCS` note, Secure Your
 * Booking (no filled background, clickable Pay Now), Services Include, flight
 * timeline cards with padding and wrapping notes, hotel cards, one-day-per-page
 * alternating itinerary, vehicle/cruise/add-on sections, coloured policies, the
 * final Thank You page, and the complete repeating footer.
 */

// ---- Fixed palette (never derived from tenant branding) -------------------
const GREEN = '#22B14C';
const DGREEN = '#159447';
const LGREEN = '#EAF8EF';
const BLUE = '#1677F3';
const AMBER = '#FFB500';
const RED = '#E53935';
const TEAL = '#0FAAA5';
const DARK = '#171717';
const MUTED = '#5F6670';
const BORDER = '#D8DDE3';

// ---- Global page geometry (PDF points) ------------------------------------
export const PDF_PAGE_WIDTH = 595.28;
export const PDF_TOP_MARGIN = 46;
export const PDF_SIDE_MARGIN = 40;
export const PDF_BOTTOM_MARGIN = 30;
export const PDF_FOOTER_HEIGHT = 100;
export const PDF_POST_CONTENT_GAP = 20;
export const PDF_MIN_PAGE_HEIGHT = 456;
export const PDF_MAX_PAGE_HEIGHT = 836;
const M = PDF_SIDE_MARGIN;
const TOP = PDF_TOP_MARGIN;
const BOTTOM_M = PDF_BOTTOM_MARGIN;
const FOOTER_H = PDF_FOOTER_HEIGHT;
const POST_GAP = PDF_POST_CONTENT_GAP;
const CONTENT_W = PDF_PAGE_WIDTH - M * 2; // 515.28
/** Max content height on a page before the planner starts a continuation page. */
export const PDF_MAX_CONTENT_HEIGHT = 640;

// Flight-card padding (points), shared by measurement and rendering.
const FLIGHT_CARD_PADDING_X = 16;
const FLIGHT_CARD_PADDING_TOP = 14;
const FLIGHT_CARD_PADDING_BOTTOM = 12;
const FLIGHT_CARD_SECTION_GAP = 8;
const FLIGHT_CARD_SEGMENT_GAP = 12;

const num = (value: unknown) => Number(value ?? 0) || 0;

/** Normalize an optional text value: null/undefined/whitespace/literal junk → ''. */
const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined' || s === 'NaN' || s === '[object Object]') return '';
  return s;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** e.g. "22 Aug 2026" (or "Sat, 22 Aug 2026" with the weekday). */
const dateFmt = (value: Date | string | null | undefined, withDow = false) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const core = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withDow ? `${DOW[d.getUTCDay()]}, ${core}` : core;
};

const moneyFmt = (currency: string, value: unknown, digits = 0) => {
  const code = (currency || 'INR').toUpperCase();
  const n = num(value);
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${code} ${n.toFixed(digits)}`;
  }
};

/** A payment link is clickable only when it is an absolute http(s) URL. */
const validPaymentUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
};

/** Flatten sanitised rich text into lines (block tags → breaks, <li> → bullets). */
const htmlToLines = (html: string | null | undefined): string[] => {
  if (!html) return [];
  return html
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|li)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|ul|ol)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const ADDON_SERVICE_TYPES = new Set([
  'TRAVEL_INSURANCE',
  'RAIL',
  'PASSPORT_ASSISTANCE',
  'MEAL',
  'GUIDE',
  'OTHER_ADD_ON',
  'GENERAL_ENQUIRY',
]);

type Img = Buffer | null | undefined;

/** Company data for the repeating footer and page-1 consultant fallback. */
export interface QuotationPdfCompany {
  name: string;
  email: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  primaryColor: string;
  operatingSinceYear: number | null;
  tripsSold: number | null;
  tan: string | null;
  taxRegistrationNumber: string | null;
  /** Server-resolved logo bytes (optional; contain-fit in the footer). */
  logo: Img;
}

/** Page-1 consultant strip: name/phone/email resolved server-side. */
export interface QuotationPdfConsultant {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface QuotationPdfInput {
  company?: QuotationPdfCompany | null;
  consultant?: QuotationPdfConsultant | null;
  quotation: {
    quotationNumber: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string;
    destinationSummary: string;
    travelStartDate: Date | null;
    travelEndDate: Date | null;
    adults: number;
    childrenWithBed: number;
    childrenWithoutBed: number;
    infants: number;
    rooms: number;
    validUntil: Date | null;
  };
  version: {
    versionNumber: number;
    title: string;
    introduction: string | null;
    currency: string;
    finalAmount: unknown;
    notes: string | null;
    perAdultPrice: unknown;
    perChildWithBedPrice: unknown;
    perChildWithoutBedPrice: unknown;
    perInfantPrice: unknown;
    taxNote: string | null;
    initialPaymentAmount: unknown;
    paymentLink: string | null;
    inclusionsHtml: string | null;
    exclusionsHtml: string | null;
    paymentPolicies: string | null;
    cancellationPolicies: string | null;
    bookingTerms: string | null;
    includeVisa: boolean;
    visaSectionTitle: string | null;
    visaAmount: unknown;
    visaDestination: string | null;
    visaType: string | null;
    visaServiceCharge: unknown;
    visaGstPercent: unknown;
    visaVfsCharge: unknown;
    flightDetails: unknown;
    sightseeingDetails: unknown;
    hotels: Array<{
      city: string;
      hotelName: string;
      category: string | null;
      roomType: string | null;
      mealPlan: string | null;
      nights: number;
      selected: boolean;
      notes: string | null;
      checkInDate?: Date | string | null;
      checkOutDate?: Date | string | null;
    }>;
    itinerary: Array<{
      dayNumber: number;
      title: string;
      destination: string;
      description: string;
      meals: string | null;
      overnightLocation: string | null;
    }>;
    services: Array<{
      serviceType: string;
      name: string;
      description: string | null;
      city: string | null;
      notes?: string | null;
      quantity: unknown;
      unitSellingPrice: unknown;
    }>;
    inclusions: Array<{ content: string }>;
    exclusions: Array<{ content: string }>;
    terms: Array<{ content: string }>;
  };
  /** Server-resolved image bytes; every slot is optional and falls back cleanly. */
  images?: {
    cover?: Img;
    hotels?: Img[]; // aligned to version.hotels
    services?: Img[]; // aligned to version.services
    sightseeing?: Record<string, Img>; // keyed by sightseeingId
    airlines?: Record<string, Img>; // keyed by flight-segment airlineId
  };
}

type FlightSegment = {
  airlineId?: string | null;
  airlineName?: string | null;
  flightNumber?: string | null;
  travelClass?: string | null;
  from?: string | null;
  to?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  duration?: string | null;
  cabinLuggage?: string | null;
  checkInLuggage?: string | null;
  notes?: string | null;
};
type FlightJourney = { fromCity?: string | null; toCity?: string | null; segments?: FlightSegment[] };
type FlightDetails = {
  include?: boolean;
  journeyType?: string;
  outbound?: FlightJourney;
  returnJourney?: FlightJourney;
};
type SightActivity = {
  sightseeingId?: string | null;
  name?: string | null;
  description?: string | null;
  startTime?: string | null;
};
type SightDay = {
  dayNumber?: number;
  title?: string | null;
  city?: string | null;
  date?: string | null;
  meals?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean };
  dailyTransfer?: string | null;
  activities?: SightActivity[];
};

// ---- Page layout helpers (pure; exported for tests) -----------------------
export interface PdfPageLayout {
  pageHeight: number;
  contentBottom: number;
  footerTop: number;
}

/**
 * Single shared page-height formula:
 *   pageHeight = max(minimumHeight, topMargin + contentHeight + postContentGap
 *                    + footerHeight + bottomMargin)
 * The footer always begins exactly `postContentGap` after the last content
 * block; any extra space required to reach the minimum height is added below
 * the footer (as a larger bottom margin), never between content and footer.
 */
export function computePageHeight(contentHeight: number): PdfPageLayout {
  const contentBottom = TOP + contentHeight;
  const footerTop = contentBottom + POST_GAP;
  const required = footerTop + FOOTER_H + BOTTOM_M;
  const pageHeight = Math.max(required, PDF_MIN_PAGE_HEIGHT);
  return { pageHeight, contentBottom, footerTop };
}

/** A measured, renderable block. render(y0) draws and returns the next y. */
interface PdfBlock {
  height: number;
  /** Keep this block with the following content (e.g. a section heading). */
  keepWithNext?: boolean;
  render: (y0: number) => number;
}

/** Packs measured blocks into pages, splitting only at block boundaries. */
class PagePlanner {
  private pages: Array<{ blocks: PdfBlock[]; height: number }> = [];
  private current: PdfBlock[] = [];
  private currentHeight = 0;

  add(block: PdfBlock | null | undefined): void {
    if (!block || block.height <= 0) return;
    if (this.currentHeight + block.height > PDF_MAX_CONTENT_HEIGHT && this.current.length > 0) {
      const kept: PdfBlock[] = [];
      while (this.current.length > 0) {
        const last = this.current[this.current.length - 1];
        if (!last?.keepWithNext) break;
        kept.unshift(last);
        this.current.pop();
      }
      const keptHeight = kept.reduce((sum, b) => sum + b.height, 0);
      if (keptHeight + block.height > PDF_MAX_CONTENT_HEIGHT) {
        this.current.push(...kept);
      } else {
        this.flush();
        this.current = kept;
        this.currentHeight = keptHeight;
      }
    }
    this.current.push(block);
    this.currentHeight += block.height;
  }

  flush(): void {
    if (!this.current.length) return;
    this.pages.push({ blocks: this.current, height: this.currentHeight });
    this.current = [];
    this.currentHeight = 0;
  }

  /** Force the next block onto a fresh measured page (section/page break). */
  pageBreak(): void {
    this.flush();
  }

  getPages(): Array<{ blocks: PdfBlock[]; height: number }> {
    this.flush();
    return this.pages;
  }
}

/** Draw one footer body line as `Label: value` with correct fonts. */
function drawFooterTextLine(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc.font('Bold').fontSize(7.5).fillColor(DARK).text(`${label}: `, x, y, { continued: true });
  doc.font('Body').fillColor(MUTED).text(value, { width });
}

/**
 * Draw the complete repeating company footer on one buffered physical page.
 * `footerTop` is the divider Y for that page (contentBottom + POST_GAP), so the
 * footer always sits the same distance below the content regardless of the
 * page's physical height.
 */
function drawPageFooter(
  doc: PDFKit.PDFDocument,
  company: QuotationPdfCompany | null | undefined,
  pageNumber: number,
  totalPages: number,
  footerTop: number,
) {
  doc.save();
  doc
    .lineWidth(0.7)
    .strokeColor(BORDER)
    .moveTo(M, footerTop)
    .lineTo(PDF_PAGE_WIDTH - M, footerTop)
    .stroke();
  const top = footerTop + 10;

  // Company logo (contain/fit, aspect preserved; invalid/missing → omitted).
  if (company?.logo) {
    try {
      // @types/pdfkit omits the runtime-valid 'left'/'top' values; keep them via
      // a cast so the logo is top-left aligned and never stretched.
      doc.image(company.logo, M + 4, top, {
        fit: [64, 44],
        align: 'left',
        valign: 'top',
      } as unknown as PDFKit.Mixins.ImageOption);
    } catch {
      // A broken logo never breaks the footer or shifts the page number.
    }
  }

  // Contact Us
  const contactX = M + 92;
  doc.fillColor(GREEN).font('Bold').fontSize(7.5).text('CONTACT US', contactX, top, { width: 122 });
  let cy = top + 11;
  const cPhone = company ? toText(company.phone) : '';
  const cEmail = company ? toText(company.email) : '';
  const cWeb = company ? toText(company.website) : '';
  const contactLines: Array<[string, string]> = [];
  if (cPhone) contactLines.push(['Ph', cPhone]);
  if (cEmail) contactLines.push(['Em', cEmail]);
  if (cWeb) contactLines.push(['Web', cWeb]);
  for (const [label, value] of contactLines) {
    drawFooterTextLine(doc, label, value, contactX, cy, 122);
    cy = doc.y + 2;
  }

  // Our Achievements
  const achX = M + 228;
  doc.fillColor(GREEN).font('Bold').fontSize(7.5).text('OUR ACHIEVEMENTS', achX, top, { width: 122 });
  let ay = top + 11;
  const achLines: string[] = [];
  if (company?.tripsSold != null) achLines.push(`${toText(company.tripsSold)} Trips Sold`);
  if (company?.operatingSinceYear != null) achLines.push(`Est: ${toText(company.operatingSinceYear)}`);
  for (const line of achLines) {
    doc.font('Body').fontSize(7.5).fillColor(MUTED).text(line, achX, ay, { width: 122 });
    ay = doc.y + 2;
  }

  // Legal Info
  const legalX = M + 366;
  doc.fillColor(GREEN).font('Bold').fontSize(7.5).text('LEGAL INFO', legalX, top, { width: 118 });
  let lly = top + 11;
  const tan = company ? toText(company.tan) : '';
  const gstin = company ? toText(company.taxRegistrationNumber) : '';
  const legalLines: Array<[string, string]> = [];
  if (tan) legalLines.push(['TAN', tan]);
  if (gstin) legalLines.push(['GSTIN', gstin]);
  for (const [label, value] of legalLines) {
    drawFooterTextLine(doc, label, value, legalX, lly, 118);
    lly = doc.y + 2;
  }

  // Page number badge (bottom-right of the footer zone).
  const label = `Page ${pageNumber}/${totalPages}`;
  doc.font('Bold').fontSize(8);
  const w = doc.widthOfString(label) + 18;
  const bx = PDF_PAGE_WIDTH - M - w;
  const by = footerTop + FOOTER_H - 27;
  doc.save().roundedRect(bx, by, w, 20, 4).fill(GREEN).restore();
  doc.fillColor('#ffffff').text(label, bx, by + 5.5, { width: w, align: 'center', lineBreak: false });
  doc.restore();
}

export async function renderQuotationPdf(input: QuotationPdfInput): Promise<Buffer> {
  const q = input.quotation;
  const v = input.version;
  const company = input.company;
  const consultant = input.consultant;
  const currency = v.currency;
  const images = input.images ?? {};

  // No automatic first page — every physical page is created by the measured
  // page helper below with its own content-based height.
  const doc = new PDFDocument({
    size: [PDF_PAGE_WIDTH, PDF_MAX_PAGE_HEIGHT],
    bufferPages: true,
    autoFirstPage: false,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    info: { Title: v.title },
  });
  doc.registerFont('Body', DEJAVU_SANS);
  doc.registerFont('Bold', DEJAVU_SANS_BOLD);
  doc.font('Body');
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Measured page creation. Records footerTop per page so the footer pass uses
  // each page's real geometry instead of a fixed A4 position.
  const pageMetrics: Array<{ pageHeight: number; footerTop: number }> = [];
  const addMeasuredPage = (contentHeight: number): void => {
    const layout = computePageHeight(contentHeight);
    doc.addPage({
      size: [PDF_PAGE_WIDTH, layout.pageHeight],
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    pageMetrics.push({ pageHeight: layout.pageHeight, footerTop: layout.footerTop });
  };

  // --- measurement primitives -------------------------------------------------
  const hOf = (text: string, size: number, width: number, font: 'Body' | 'Bold' = 'Body'): number => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text, { width });
  };

  /** A block that renders wrapped lines; measured with the exact font/size/width. */
  const flowBlock = (
    lines: string[],
    x: number,
    width: number,
    size: number,
    gap: number,
    color = '#333',
  ): PdfBlock => {
    doc.font('Body').fontSize(size);
    const heights = lines.map((line) => doc.heightOfString(line, { width }));
    const height = heights.reduce((sum, h) => sum + h + gap, 0);
    return {
      height,
      render: (y0) => {
        doc.font('Body').fontSize(size).fillColor(color);
        let yy = y0;
        for (const line of lines) {
          doc.text(line, x, yy, { width });
          yy = doc.y + gap;
        }
        doc.fillColor(DARK);
        return yy;
      },
    };
  };

  /** Split wrapped lines into page-safe flow blocks. */
  const flowBlocks = (
    lines: string[],
    x: number,
    width: number,
    size: number,
    gap: number,
  ): PdfBlock[] => {
    if (!lines.length) return [];
    doc.font('Body').fontSize(size);
    const chunks: string[][] = [];
    let current: string[] = [];
    let currentHeight = 0;
    for (const line of lines) {
      const lineHeight = doc.heightOfString(line, { width }) + gap;
      if (current.length && currentHeight + lineHeight > PDF_MAX_CONTENT_HEIGHT) {
        chunks.push(current);
        current = [];
        currentHeight = 0;
      }
      current.push(line);
      currentHeight += lineHeight;
    }
    if (current.length) chunks.push(current);
    return chunks.map((chunk) => flowBlock(chunk, x, width, size, gap));
  };

  // --- drawing primitives ----------------------------------------------------
  const money = (value: unknown, digits = 0) => moneyFmt(currency, value, digits);

  const drawImage = (buf: Img, x: number, iy: number, w: number, h: number, label = 'Image') => {
    if (buf) {
      try {
        doc.save();
        doc.roundedRect(x, iy, w, h, 6).clip();
        doc.image(buf, x, iy, { cover: [w, h], align: 'center', valign: 'center' });
        doc.restore();
        return;
      } catch {
        doc.restore();
      }
    }
    doc.save().roundedRect(x, iy, w, h, 6).fill(LGREEN).restore();
    doc
      .fillColor(GREEN)
      .font('Bold')
      .fontSize(9)
      .text(label, x, iy + h / 2 - 5, { width: w, align: 'center' });
    doc.fillColor(DARK);
  };

  /** Contain-fit image (used for logos) with a clean fallback. */
  const drawImageFit = (buf: Img, x: number, iy: number, w: number, h: number, label = 'Image') => {
    if (buf) {
      try {
        doc.save();
        doc.roundedRect(x, iy, w, h, 6).clip();
        doc.image(buf, x, iy, {
          fit: [w, h],
          align: 'center',
          valign: 'center',
        } as unknown as PDFKit.Mixins.ImageOption);
        doc.restore();
        return;
      } catch {
        doc.restore();
      }
    }
    drawImage(undefined, x, iy, w, h, label);
  };

  const checkCircle = (cx: number, cy: number, r: number) => {
    doc.save().circle(cx, cy, r).fill(GREEN).restore();
    doc
      .save()
      .lineWidth(2.2)
      .strokeColor('#ffffff')
      .moveTo(cx - r * 0.42, cy + r * 0.02)
      .lineTo(cx - r * 0.1, cy + r * 0.36)
      .lineTo(cx + r * 0.46, cy - r * 0.32)
      .stroke()
      .restore();
  };

  const badge = (text: string, x: number, by: number, bg: string, fg: string) => {
    doc.font('Bold').fontSize(10);
    const w = doc.widthOfString(text) + 18;
    doc.save().roundedRect(x, by, w, 20, 4).fill(bg).restore();
    doc.fillColor(fg).text(text, x + 9, by + 5.5);
    doc.fillColor(DARK);
    return w;
  };

  /** Section heading block (kept with following content). */
  const sectionHeaderBlock = (title: string): PdfBlock => {
    const h = 52;
    return {
      height: h,
      keepWithNext: true,
      render: (y0) => {
        checkCircle(M + 15, y0 + 15, 15);
        doc.fillColor(DARK).font('Bold').fontSize(21).text(title.toUpperCase(), M + 42, y0 + 4);
        doc
          .save()
          .lineWidth(1)
          .strokeColor(BORDER)
          .moveTo(M + 42, y0 + 34)
          .lineTo(PDF_PAGE_WIDTH - M, y0 + 34)
          .stroke()
          .restore();
        doc.fillColor(DARK).font('Body').fontSize(11);
        return y0 + h;
      },
    };
  };

  const planner = new PagePlanner();

  // ==========================================================================
  // PAGE 1 — cover: hero, consultant, title, summary + pricing, yellow total,
  //          tax note, secure booking, services include (one measured page)
  // ==========================================================================
  const primaryDestination =
    (q.destinationSummary || '').split(/[•(→>,/]/)[0]?.trim() || q.destinationSummary || 'Your Trip';

  const coverParts: PdfBlock[] = [];

  // 1. Hero image + overlay + destination name.
  {
    const heroH = 190;
    coverParts.push({
      height: heroH + 14,
      render: (y0) => {
        if (images.cover) {
          try {
            doc.save().roundedRect(M, y0, CONTENT_W, heroH, 6).clip();
            doc.image(images.cover, M, y0, {
              cover: [CONTENT_W, heroH],
              align: 'center',
              valign: 'center',
            });
            doc.restore();
          } catch {
            doc.restore();
            doc.save().roundedRect(M, y0, CONTENT_W, heroH, 6).clip();
            const grad = doc.linearGradient(M, y0, M + CONTENT_W, y0);
            grad.stop(0, DGREEN).stop(1, GREEN);
            doc.rect(M, y0, CONTENT_W, heroH).fill(grad);
            doc.restore();
          }
        } else {
          doc.save().roundedRect(M, y0, CONTENT_W, heroH, 6).clip();
          const grad = doc.linearGradient(M, y0, M + CONTENT_W, y0);
          grad.stop(0, DGREEN).stop(1, GREEN);
          doc.rect(M, y0, CONTENT_W, heroH).fill(grad);
          doc.restore();
        }
        doc.save().roundedRect(M, y0, CONTENT_W, heroH, 6).clip();
        doc.fillOpacity(0.55).rect(M, y0 + heroH - 58, CONTENT_W, 58).fill('#0A2033');
        doc.restore();
        doc.fillOpacity(1);
        doc
          .fillColor('#ffffff')
          .font('Bold')
          .fontSize(34)
          .text(primaryDestination.toUpperCase(), M + 18, y0 + heroH - 42, {
            width: CONTENT_W - 36,
            ellipsis: true,
            height: 30,
          });
        doc.fillColor(DARK);
        return y0 + heroH + 14;
      },
    });
  }

  // 2. Consultant / phone / email strip (missing values are omitted).
  const consultantItems: Array<[string, string]> = [];
  const cName = consultant ? toText(consultant.name) : '';
  const cPhone = consultant ? toText(consultant.phone) : '';
  const cEmail = consultant ? toText(consultant.email) : '';
  if (cName) consultantItems.push(['Consultant', cName]);
  if (cPhone) consultantItems.push(['Phone', cPhone]);
  if (cEmail) consultantItems.push(['Email', cEmail]);
  if (consultantItems.length) {
    const stripH = 32;
    coverParts.push({
      height: stripH + 12,
      render: (y0) => {
        doc.save().rect(M, y0, CONTENT_W, stripH).fill('#F2F3F5').restore();
        const itemW = CONTENT_W / consultantItems.length;
        consultantItems.forEach(([label, value], i) => {
          const ix = M + itemW * i + 12;
          doc.font('Bold').fontSize(9).fillColor(MUTED).text(`${label}: `, ix, y0 + 11, {
            continued: true,
          });
          doc.font('Body').fillColor(DARK).text(value, { width: itemW - 24 });
        });
        doc.fillColor(DARK);
        return y0 + stripH + 12;
      },
    });
  }

  // 3. Package title.
  {
    const titleH = hOf(v.title.toUpperCase(), 20, CONTENT_W, 'Bold') + 14;
    coverParts.push({
      height: titleH,
      render: (y0) => {
        doc.font('Bold').fontSize(20).fillColor(DARK).text(v.title.toUpperCase(), M, y0, {
          width: CONTENT_W,
        });
        return y0 + titleH;
      },
    });
  }

  // 4. Two columns: summary (left) + pricing breakdown (right).
  const nights =
    q.travelStartDate && q.travelEndDate
      ? Math.max(
          0,
          Math.round(
            (new Date(q.travelEndDate).getTime() - new Date(q.travelStartDate).getTime()) /
              86_400_000,
          ),
        )
      : v.hotels.reduce(
          (sum, h) => sum + (hotelStayNights(h.checkInDate, h.checkOutDate) ?? h.nights ?? 0),
          0,
        );
  const duration = nights > 0 ? `${nights} Nights / ${nights + 1} Days` : '';
  const pax = [
    q.adults > 0 && `${q.adults} Adult${q.adults > 1 ? 's' : ''}`,
    q.childrenWithBed > 0 && `${q.childrenWithBed} CWB`,
    q.childrenWithoutBed > 0 && `${q.childrenWithoutBed} CWOB`,
    q.infants > 0 && `${q.infants} Infant${q.infants > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(', ');

  const summaryRows: Array<[string, string]> = [
    ['Name', q.customerName],
    ['Destination', q.destinationSummary],
    ['Duration', duration],
    ['Travel Date', dateFmt(q.travelStartDate)],
    ['Pax', pax],
    ['Rooms', q.rooms > 0 ? `${q.rooms} Room${q.rooms > 1 ? 's' : ''}` : ''],
    ['Quotation ID', q.quotationNumber],
  ].filter(([, val]) => Boolean(val)) as Array<[string, string]>;

  const colGap = 20;
  const leftW = (CONTENT_W - colGap) * 0.52;
  const rightW = CONTENT_W - colGap - leftW;
  const rightX = M + leftW + colGap;

  // Measure summary rows.
  const summaryRowHeights = summaryRows.map(([label, val]) =>
    hOf(`${label}: ${val}`, 10, leftW, 'Bold'),
  );
  const leftColumnH = summaryRowHeights.reduce((sum, h) => sum + h + 4, 0);

  // Measure pricing rows + yellow total box + tax note.
  const priceRows = (
    [
      ['Per Adult', q.adults, v.perAdultPrice],
      ['CWB', q.childrenWithBed, v.perChildWithBedPrice],
      ['CWOB', q.childrenWithoutBed, v.perChildWithoutBedPrice],
      ['Infant', q.infants, v.perInfantPrice],
    ] as const
  ).filter(([, count, price]) => count > 0 && num(price) > 0);
  const packageTotal =
    num(v.perAdultPrice) * q.adults +
    num(v.perChildWithBedPrice) * q.childrenWithBed +
    num(v.perChildWithoutBedPrice) * q.childrenWithoutBed +
    num(v.perInfantPrice) * q.infants;
  const finalTotal = packageTotal > 0 ? packageTotal : num(v.finalAmount);

  const priceRowHeights = priceRows.map(
    ([label, count, price]) =>
      Math.max(
        hOf(`${label} (x${count})`, 10, rightW * 0.55, 'Body'),
        hOf(money(num(price)), 10, rightW * 0.4, 'Bold'),
      ) + 4,
  );
  const totalBoxH = 58;
  const taxH = isPublicTaxNote(v.taxNote) ? hOf(v.taxNote.trim(), 8.5, rightW, 'Body') : 0;
  const rightColumnH =
    priceRowHeights.reduce((sum, h) => sum + h, 0) + 4 + totalBoxH + 6 + taxH;
  const columnsH = Math.max(leftColumnH, rightColumnH);

  coverParts.push({
    height: columnsH,
    render: (y0) => {
      let ly = y0;
      summaryRows.forEach(([label, val], i) => {
        doc.font('Bold').fontSize(10).fillColor(MUTED).text(`${label}: `, M, ly, {
          continued: true,
        });
        doc.font('Body').fillColor(DARK).text(val, { width: leftW });
        ly = doc.y + 4;
        void summaryRowHeights[i];
      });
      let ry = y0;
      priceRows.forEach(([label, count, price]) => {
        doc.font('Body').fontSize(10).fillColor(MUTED).text(`${label} (x${count})`, rightX, ry, {
          width: rightW * 0.55,
          continued: false,
        });
        doc.font('Bold').fillColor(DARK).text(money(num(price)), rightX, ry, {
          width: rightW,
          align: 'right',
        });
        ry = doc.y + 4;
      });
      ry += 4;
      // Yellow Total Cost box (amount right-aligned).
      doc.save().roundedRect(rightX, ry, rightW, totalBoxH, 8).fill(AMBER).restore();
      doc.fillColor(DARK).font('Bold').fontSize(9.5).text('TOTAL COST', rightX + 14, ry + 11, {
        width: rightW - 28,
      });
      doc.fontSize(22).text(money(finalTotal), rightX + 14, ry + 25, {
        width: rightW - 28,
        align: 'right',
      });
      doc.fillColor(DARK);
      ry += totalBoxH + 6;
      if (isPublicTaxNote(v.taxNote)) {
        doc.font('Body').fontSize(8.5).fillColor(MUTED).text(v.taxNote.trim(), rightX, ry, {
          width: rightW,
        });
        ry = doc.y;
        doc.fillColor(DARK).font('Body');
      }
      return y0 + columnsH;
    },
  });

  // 5. Secure Your Booking (no filled background, clickable Pay Now).
  const payUrl = validPaymentUrl(v.paymentLink);
  if (num(v.initialPaymentAmount) > 0 && payUrl) {
    const boxH = 66;
    coverParts.push({
      height: boxH + 16,
      render: (y0) => {
        doc.save().roundedRect(M, y0, CONTENT_W, boxH, 6).stroke(BORDER).restore();
        doc.fillColor(DGREEN).font('Bold').fontSize(13).text('Secure Your Booking', M + 16, y0 + 12);
        doc
          .fillColor(DARK)
          .font('Body')
          .fontSize(10)
          .text(
            `Make an initial payment of ${money(v.initialPaymentAmount, 2)} to confirm your booking.`,
            M + 16,
            y0 + 32,
            { width: CONTENT_W - 160 },
          );
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .text('The remaining balance can be paid as per the payment policy.', M + 16, y0 + 46, {
            width: CONTENT_W - 160,
          });
        const btnW = 108;
        const btnH = 30;
        const btnX = PDF_PAGE_WIDTH - M - btnW - 14;
        const btnY = y0 + boxH / 2 - btnH / 2;
        doc.save().roundedRect(btnX, btnY, btnW, btnH, 5).fill(GREEN).restore();
        doc
          .fillColor('#ffffff')
          .font('Bold')
          .fontSize(12)
          .text('Pay Now', btnX, btnY + 9, { width: btnW, align: 'center' });
        doc.link(btnX, btnY, btnW, btnH, payUrl);
        doc.fillColor(DARK);
        return y0 + boxH + 16;
      },
    });
  }

  // 6. Services Include.
  const flightData = v.flightDetails as FlightDetails | null | undefined;
  const sightData =
    v.sightseeingDetails as { include?: boolean; days?: SightDay[] } | null | undefined;
  const hasFlights =
    !!flightData?.include &&
    ((flightData.outbound?.segments?.length ?? 0) > 0 ||
      (flightData.returnJourney?.segments?.length ?? 0) > 0);
  const sightDays = (sightData?.include !== false ? sightData?.days ?? [] : []).filter(
    (d) => d.title || (d.activities ?? []).some((a) => a.name || a.description),
  );
  const vehicleServices = v.services.filter((s) => s.serviceType === 'VEHICLE_TRANSFER');
  const cruiseServices = v.services.filter((s) => s.serviceType === 'CRUISE');
  const addonServices = v.services.filter((s) => ADDON_SERVICE_TYPES.has(s.serviceType));
  const hasVisa =
    v.includeVisa &&
    (num(v.visaAmount) > 0 || num(v.visaServiceCharge) > 0 || !!v.visaType || !!v.visaDestination);

  const serviceChips = [
    hasFlights && 'Flights',
    v.hotels.length > 0 && 'Hotels',
    (sightDays.length > 0 || v.itinerary.length > 0) && 'Tours',
    vehicleServices.length > 0 && 'Transport',
    cruiseServices.length > 0 && 'Cruise',
    addonServices.length > 0 && 'Add-ons',
    hasVisa && 'Visa',
  ].filter(Boolean) as string[];
  if (serviceChips.length) {
    coverParts.push({
      height: 90,
      render: (y0) => {
        doc.font('Bold').fontSize(15).fillColor(DARK).text('SERVICES INCLUDE', M, y0, {
          width: CONTENT_W,
          align: 'center',
        });
        doc
          .save()
          .lineWidth(1)
          .strokeColor(BORDER)
          .moveTo(M, y0 + 24)
          .lineTo(PDF_PAGE_WIDTH - M, y0 + 24)
          .stroke()
          .restore();
        const cy = y0 + 52;
        const cols = serviceChips.length;
        const colW = CONTENT_W / cols;
        serviceChips.forEach((chip, i) => {
          const cx = M + colW * i + colW / 2;
          checkCircle(cx, cy, 13);
          doc.fillColor(DARK).font('Bold').fontSize(10).text(chip, M + colW * i, cy + 22, {
            width: colW,
            align: 'center',
          });
        });
        return y0 + 90;
      },
    });
  }

  // The cover is one atomic page (never split mid-hero).
  {
    const coverH = coverParts.reduce((sum, b) => sum + b.height, 0);
    const coverBlock: PdfBlock = {
      height: coverH,
      render: (y0) => {
        let yy = y0;
        for (const part of coverParts) yy = part.render(yy);
        return yy;
      },
    };
    planner.add(coverBlock);
  }

  // ==========================================================================
  // FLIGHTS — one journey, measured segment cards, continuation at boundaries
  // ==========================================================================
  const segHasData = (s: FlightSegment) => Boolean(s.airlineName || s.from || s.to || s.flightNumber);
  const legs = hasFlights
    ? (
        [
          flightData?.journeyType === 'ONEWAY_RETURN'
            ? null
            : { title: 'Outbound Journey', journey: flightData?.outbound, color: BLUE },
          flightData?.journeyType === 'ONEWAY_OUTBOUND'
            ? null
            : { title: 'Return Journey', journey: flightData?.returnJourney, color: GREEN },
        ] as Array<{ title: string; journey?: FlightJourney; color: string } | null>
      ).filter((l): l is { title: string; journey?: FlightJourney; color: string } => Boolean(l))
    : [];
  const drawableLegs = legs.filter((l) => (l.journey?.segments ?? []).some(segHasData));

  const buildSegmentCard = (s: FlightSegment, index: number): PdfBlock => {
    const noteLines = htmlToLines(s.notes);
    const padX = FLIGHT_CARD_PADDING_X;
    const padTop = FLIGHT_CARD_PADDING_TOP;
    const padBottom = FLIGHT_CARD_PADDING_BOTTOM;
    const badgeRowH = 20;
    const imageW = 120;
    const imageH = 64;
    const tlH = 64;
    const nameH = hOf(s.airlineName || 'Airline', 11, imageW + 4, 'Body');
    const numH = s.flightNumber ? hOf(s.flightNumber, 10, imageW + 4, 'Body') : 0;
    const leftColH = imageH + 6 + nameH + (numH ? 2 + numH : 0);
    const mainRowH = Math.max(leftColH, tlH);
    const baggageH = 14;
    const notesLabelH = noteLines.length ? 12 : 0;
    const notesWidth = CONTENT_W - padX * 2;
    const notesH = noteLines.length
      ? flowBlock(noteLines, M + padX, notesWidth, 10, 1).height
      : 0;
    const cardH =
      padTop +
      badgeRowH +
      FLIGHT_CARD_SECTION_GAP +
      mainRowH +
      FLIGHT_CARD_SECTION_GAP +
      1 + // divider
      FLIGHT_CARD_SECTION_GAP +
      baggageH +
      (noteLines.length ? FLIGHT_CARD_SECTION_GAP + notesLabelH + notesH + FLIGHT_CARD_SECTION_GAP : 0) +
      padBottom;

    return {
      height: cardH + FLIGHT_CARD_SEGMENT_GAP,
      render: (y0) => {
        const top = y0;
        doc.save().roundedRect(M, top, CONTENT_W, cardH, 6).stroke(BORDER).restore();
        badge(`Segment ${index + 1}`, M + padX, top + padTop, GREEN, '#ffffff');
        if (s.travelClass) {
          doc.font('Body').fontSize(10);
          const w = doc.widthOfString(`${s.travelClass} Class`) + 20;
          doc
            .save()
            .roundedRect(PDF_PAGE_WIDTH - M - 16 - w, top + padTop, w, 20, 4)
            .fill('#F2F3F5')
            .restore();
          doc.fillColor(DARK).text(`${s.travelClass} Class`, PDF_PAGE_WIDTH - M - 16 - w + 10, top + padTop + 5.5);
        }
        const mainY = top + padTop + badgeRowH + FLIGHT_CARD_SECTION_GAP;
        // Airline logo / placeholder (contain-fit).
        const logo = s.airlineId ? images.airlines?.[s.airlineId] : undefined;
        drawImageFit(logo, M + padX, mainY, imageW, imageH, 'Airline');
        doc.fillColor(DARK).font('Body').fontSize(11).text(s.airlineName || 'Airline', M + padX, mainY + imageH + 6, {
          width: imageW + 4,
        });
        if (s.flightNumber) {
          doc.fillColor(MUTED).fontSize(10).text(s.flightNumber, M + padX, doc.y + 2, {
            width: imageW + 4,
          });
        }
        // timeline
        const tlY = mainY;
        const depX = M + padX + imageW + 34;
        const arrX = PDF_PAGE_WIDTH - M - 90;
        doc.fillColor(DARK).font('Bold').fontSize(16).text(s.departureTime || '--:--', depX, tlY, { width: 80 });
        doc.font('Body').fontSize(9).fillColor(MUTED).text(dateFmt(s.departureDate), depX, tlY + 20, { width: 90 });
        doc.text((s.from || '').toUpperCase(), depX, tlY + 32, { width: 90 });
        doc.fillColor(DARK).font('Bold').fontSize(16).text(s.arrivalTime || '--:--', arrX, tlY, { width: 80, align: 'right' });
        doc.font('Body').fontSize(9).fillColor(MUTED).text(dateFmt(s.arrivalDate), arrX - 10, tlY + 20, { width: 90, align: 'right' });
        doc.text((s.to || '').toUpperCase(), arrX - 10, tlY + 32, { width: 90, align: 'right' });
        const lineY = tlY + 10;
        const lx1 = depX + 92;
        const lx2 = arrX - 18;
        doc.save().lineWidth(2).strokeColor(BORDER).moveTo(lx1, lineY).lineTo(lx2, lineY).stroke().restore();
        doc.save().circle(lx1, lineY, 4).fill(GREEN).restore();
        doc.save().circle(lx2, lineY, 4).fill(GREEN).restore();
        if (s.duration)
          doc.fillColor(MUTED).font('Body').fontSize(9).text(s.duration, lx1, lineY + 6, { width: lx2 - lx1, align: 'center' });
        // divider
        const dividerY = mainY + mainRowH + FLIGHT_CARD_SECTION_GAP;
        doc
          .save()
          .lineWidth(0.7)
          .strokeColor(BORDER)
          .moveTo(M + padX, dividerY)
          .lineTo(PDF_PAGE_WIDTH - M - padX, dividerY)
          .stroke()
          .restore();
        // baggage
        const bagY = dividerY + FLIGHT_CARD_SECTION_GAP;
        const bag = [
          s.cabinLuggage && `Cabin: ${cabinLuggageLabel(s.cabinLuggage) ?? s.cabinLuggage}`,
          s.checkInLuggage && `Check-in: ${s.checkInLuggage}`,
        ]
          .filter(Boolean)
          .join('  •  ');
        doc.fillColor(DARK).font('Body').fontSize(10).text(`Baggage: ${bag || '—'}`, M + padX, bagY, {
          width: CONTENT_W - padX * 2,
        });
        // notes
        if (noteLines.length) {
          const noteY = bagY + baggageH + FLIGHT_CARD_SECTION_GAP;
          doc.fillColor(MUTED).font('Bold').fontSize(10).text('Note:', M + padX, noteY);
          const noteBlock = flowBlock(noteLines, M + padX, notesWidth, 10, 1);
          noteBlock.render(noteY + notesLabelH);
        }
        doc.fillColor(DARK);
        return y0 + cardH + FLIGHT_CARD_SEGMENT_GAP;
      },
    };
  };

  drawableLegs.forEach((leg, legIndex) => {
    planner.pageBreak();
    if (legIndex === 0) planner.add(sectionHeaderBlock('Flight Details'));
    // Coloured journey bar.
    planner.add({
      height: 46 + 12,
      render: (y0) => {
        doc.save().roundedRect(M, y0, CONTENT_W, 46, 6).fill(leg.color).restore();
        doc.fillColor('#ffffff').font('Bold').fontSize(16).text(leg.title, M + 16, y0 + 8);
        const route = [leg.journey?.fromCity, leg.journey?.toCity].filter(Boolean).join(' > ');
        if (route) doc.font('Body').fontSize(10).text(route, M + 16, y0 + 28);
        doc.fillColor(DARK);
        return y0 + 46 + 12;
      },
    });
    const segs = (leg.journey?.segments ?? []).filter(segHasData);
    segs.forEach((s, i) => planner.add(buildSegmentCard(s, i)));
  });

  // ==========================================================================
  // HOTELS — measured cards, continuation at card boundaries
  // ==========================================================================
  if (v.hotels.length) {
    planner.pageBreak();
    planner.add(sectionHeaderBlock('Hotels'));
    const imageW = 150;
    v.hotels.forEach((hotel, i) => {
      const cardH = 150;
      planner.add({
        height: cardH + 12,
        render: (y0) => {
          const top = y0;
          doc.save().roundedRect(M, top, CONTENT_W, cardH, 6).stroke(BORDER).restore();
          drawImage(images.hotels?.[i], M + 14, top + 14, imageW, cardH - 28, 'Hotel');
          const tx = M + 180;
          const tw = PDF_PAGE_WIDTH - M - 14 - tx;
          const stayNights = hotelStayNights(hotel.checkInDate, hotel.checkOutDate) ?? hotel.nights;
          badge(`Nights: ${stayNights}`, tx, top + 14, GREEN, '#ffffff');
          doc.fillColor(DARK).font('Bold').fontSize(15).text(hotel.hotelName, tx, top + 42, { width: tw });
          const stars = Number((hotel.category || '').match(/\d+/)?.[0] ?? 0);
          if (stars > 0) {
            doc.fillColor(AMBER).font('Bold').fontSize(12).text('★'.repeat(Math.min(5, stars)), tx, doc.y + 2);
          }
          doc.fillColor(MUTED).font('Body').fontSize(10);
          const rows = [
            hotel.city && `City: ${hotel.city}`,
            hotel.roomType && `Room Type: ${hotel.roomType}`,
            hotel.mealPlan && `Meal Plan: ${hotel.mealPlan}`,
            hotel.checkInDate && `Check-in: ${dateFmt(hotel.checkInDate)}`,
            hotel.checkOutDate && `Check-out: ${dateFmt(hotel.checkOutDate)}`,
          ].filter(Boolean) as string[];
          let hy = doc.y + 6;
          rows.forEach((r) => {
            doc.fillColor(MUTED).text(r, tx, hy, { width: tw });
            hy = doc.y + 2;
          });
          doc.fillColor(DARK);
          return y0 + cardH + 12;
        },
      });
    });
  }

  // ==========================================================================
  // TOUR ITINERARY — one day per page, alternating image side, measured
  // ==========================================================================
  if (sightDays.length) {
    sightDays.forEach((day, i) => {
      const imgLeft = i % 2 === 0; // Day 1 image left, Day 2 image right, ...
      const imgW = 190;
      const gap = 22;
      const imgX = imgLeft ? M : PDF_PAGE_WIDTH - M - imgW;
      const contentX = imgLeft ? M + imgW + gap : M;
      const contentW = CONTENT_W - imgW - gap;

      const firstActivity = (day.activities ?? []).find((a) => a.name || a.description);
      const sightId = firstActivity?.sightseeingId ?? '';
      const dayImg = sightId ? images.sightseeing?.[sightId] : undefined;

      // Measure the day content (image column + text column).
      const title = (day.title || `Day ${day.dayNumber ?? i + 1}`).trim();
      const dayTitle = /^day\s*\d/i.test(title) ? title : `DAY ${day.dayNumber ?? i + 1}: ${title}`;
      const meta = [firstActivity?.startTime && `STARTS: ${firstActivity.startTime}`]
        .filter(Boolean)
        .join('  |  ');
      const meals = [
        day.meals?.breakfast && '(B) Breakfast (Hotel)',
        day.meals?.lunch && '(L) Lunch',
        day.meals?.dinner && '(D) Dinner',
      ].filter(Boolean) as string[];
      const validActivities = (day.activities ?? []).filter((a) => a.name || a.description);

      // Image column height.
      let imgColH = imgW + 8;
      if (meta) imgColH += 22 + 8;
      if (meals.length) {
        doc.font('Bold').fontSize(12);
        imgColH += 14 + meals.length * (hOf('x', 10.5, imgW - 10, 'Body') + 3);
      }

      // Text column height.
      let textColH = hOf(dayTitle, 15, contentW, 'Bold');
      if (day.date) textColH += hOf(dateFmt(day.date, true), 10, contentW, 'Body') + 4;
      textColH += 8;
      validActivities.forEach((a, ai) => {
        if (ai > 0) textColH += 8;
        if (a.name) textColH += hOf(a.name, 12, contentW, 'Bold') + 3;
        const descLines = htmlToLines(a.description);
        if (descLines.length) {
          doc.font('Body').fontSize(10.5);
          descLines.forEach((line) => {
            textColH += doc.heightOfString(line, { width: contentW }) + 2;
          });
        }
      });
      const transferLabel =
        day.dailyTransfer === 'PRIVATE'
          ? 'Private Transfer'
          : day.dailyTransfer === 'SHARED'
            ? 'Shared Transfer'
            : null;
      if (transferLabel) textColH += 6 + 20 + 6;

      const dayBlockH = Math.max(imgColH, textColH);

      planner.pageBreak();
      if (i === 0) planner.add(sectionHeaderBlock('Tour Itinerary'));
      planner.add({
        height: dayBlockH + 10,
        render: (y0) => {
          const top = y0;
          drawImage(dayImg, imgX, top, imgW, imgW, 'Activity');
          let underY = top + imgW + 8;
          if (meta) {
            doc.save().roundedRect(imgX, underY, imgW, 22, 4).fill('#F2F3F5').restore();
            doc.fillColor(DARK).font('Bold').fontSize(10).text(meta, imgX, underY + 6, {
              width: imgW,
              align: 'center',
            });
            underY += 30;
          }
          if (meals.length) {
            doc.fillColor(DARK).font('Bold').fontSize(12).text('Meals Included:', imgX, underY);
            doc.font('Body').fontSize(10.5).fillColor('#333');
            meals.forEach((m) => doc.text(m, imgX + 10, doc.y + 3, { width: imgW - 10 }));
            doc.fillColor(DARK);
          }
          doc.fillColor(DARK).font('Bold').fontSize(15).text(dayTitle, contentX, top, { width: contentW });
          if (day.date) {
            doc.font('Body').fontSize(10).fillColor(MUTED).text(dateFmt(day.date, true), contentX, doc.y + 2, {
              width: contentW,
            });
          }
          doc.fillColor(DARK);
          let yy = doc.y + 8;
          validActivities.forEach((a, ai) => {
            if (ai > 0) {
              doc
                .save()
                .lineWidth(0.6)
                .strokeColor(BORDER)
                .moveTo(contentX, yy)
                .lineTo(contentX + contentW, yy)
                .stroke()
                .restore();
              yy += 8;
            }
            if (a.name) {
              doc.font('Bold').fontSize(12).fillColor(DARK).text(a.name, contentX, yy, { width: contentW });
              yy = doc.y + 3;
            }
            const lines = htmlToLines(a.description);
            if (lines.length) {
              const block = flowBlock(lines, contentX, contentW, 10.5, 2);
              yy = block.render(yy);
            }
          });
          if (transferLabel) {
            yy += 6;
            badge(transferLabel, contentX, yy, AMBER, DARK);
            yy += 26;
          }
          return y0 + dayBlockH + 10;
        },
      });
    });
  }

  // ==========================================================================
  // VEHICLE / CRUISE / ADD-ONS
  // ==========================================================================
  const serviceIndex = (row: (typeof v.services)[number]) => v.services.indexOf(row);
  const buildServiceCard = (
    row: (typeof v.services)[number],
    fields: Array<[string, string | null | undefined]>,
    imgLabel: string,
  ): PdfBlock => {
    const baseH = 150;
    return {
      height: baseH + 8 + 6,
      render: (y0) => {
        const top = y0;
        doc.save().roundedRect(M, top, CONTENT_W, baseH, 6).stroke(BORDER).restore();
        drawImage(images.services?.[serviceIndex(row)], M + 14, top + 14, 150, baseH - 28, imgLabel);
        const tx = M + 180;
        const tw = PDF_PAGE_WIDTH - M - 14 - tx;
        doc.fillColor(DARK).font('Bold').fontSize(15).text(row.name, tx, top + 16, { width: tw });
        doc.font('Body').fontSize(10).fillColor(MUTED);
        let fy = doc.y + 4;
        fields
          .filter(([, val]) => Boolean(val))
          .forEach(([label, val]) => {
            doc.fillColor(MUTED).text(`${label}: `, tx, fy, { continued: true });
            doc.fillColor(DARK).text(String(val), { width: tw });
            fy = doc.y + 2;
          });
        doc.fillColor(DARK);
        return y0 + baseH + 8;
      },
    };
  };

  if (vehicleServices.length) {
    planner.pageBreak();
    planner.add(sectionHeaderBlock('Vehicle Details'));
    vehicleServices.forEach((row) => planner.add(buildServiceCard(row, [['Type', row.city], ['Usage', row.notes]], 'Vehicle')));
  }
  if (cruiseServices.length) {
    planner.pageBreak();
    planner.add(sectionHeaderBlock('Cruise Details'));
    cruiseServices.forEach((row) => planner.add(buildServiceCard(row, [['Duration', row.notes], ['Cabin', row.city]], 'Cruise')));
  }
  const hasAddonSection = addonServices.length > 0 || hasVisa;
  if (hasAddonSection) {
    planner.pageBreak();
    planner.add(sectionHeaderBlock('Add-on Services'));
    addonServices.forEach((row) => {
      const descLines = htmlToLines(row.description);
      const nameH = hOf(row.name, 12, CONTENT_W, 'Bold') + 3;
      planner.add({
        height: nameH,
        render: (y0) => {
          doc.font('Bold').fontSize(12).fillColor(DARK).text(row.name, M, y0, { width: CONTENT_W });
          return y0 + nameH;
        },
      });
      flowBlocks(descLines, M, CONTENT_W, 10.5, 2).forEach((block) => planner.add(block));
    });
    if (hasVisa) {
      const visaLines = [
        v.visaType && `Visa type: ${v.visaType}`,
        v.visaDestination && `Destination: ${v.visaDestination}`,
        num(v.visaAmount) > 0 && `Amount: ${money(v.visaAmount, 2)}`,
      ].filter(Boolean) as string[];
      const visaTitleH = hOf(v.visaSectionTitle || `${v.visaDestination ?? ''} Visa`.trim(), 12, CONTENT_W, 'Bold') + 3;
      planner.add({
        height: visaTitleH,
        render: (y0) => {
          doc.font('Bold').fontSize(12).fillColor(DARK).text(
            v.visaSectionTitle || `${v.visaDestination ?? ''} Visa`.trim(),
            M,
            y0,
            { width: CONTENT_W },
          );
          return y0 + visaTitleH;
        },
      });
      flowBlocks(visaLines, M, CONTENT_W, 10.5, 2).forEach((block) => planner.add(block));
    }
  }

  // ==========================================================================
  // POLICIES — measured blocks split between list items
  // ==========================================================================
  const policyBlocks: Array<[string, string, string[]]> = [
    ['Inclusions', GREEN, v.inclusionsHtml ? htmlToLines(v.inclusionsHtml) : v.inclusions.map((r) => `• ${r.content}`)],
    ['Exclusions', RED, v.exclusionsHtml ? htmlToLines(v.exclusionsHtml) : v.exclusions.map((r) => `• ${r.content}`)],
    ['Payment Policies', AMBER, htmlToLines(v.paymentPolicies)],
    ['Cancellation Policies', RED, htmlToLines(v.cancellationPolicies)],
    ['Booking Terms', BLUE, v.bookingTerms ? htmlToLines(v.bookingTerms) : v.terms.map((r) => `• ${r.content}`)],
  ].filter((block) => (block[2] ?? []).length) as Array<[string, string, string[]]>;
  if (policyBlocks.length) {
    planner.pageBreak();
    planner.add({
      height: hOf('Policies', 22, CONTENT_W, 'Bold') + 14,
      keepWithNext: true,
      render: (y0) => {
        doc.font('Bold').fontSize(22).fillColor(DARK).text('Policies', M, y0, {
          width: CONTENT_W,
          align: 'center',
        });
        return y0 + hOf('Policies', 22, CONTENT_W, 'Bold') + 14;
      },
    });
    policyBlocks.forEach(([title, col, lines]) => {
      planner.add({
        height: hOf(title.toUpperCase(), 14, CONTENT_W, 'Bold') + 4,
        keepWithNext: true,
        render: (y0) => {
          doc.font('Bold').fontSize(14).fillColor(col).text(title.toUpperCase(), M, y0, {
            width: CONTENT_W,
          });
          return y0 + hOf(title.toUpperCase(), 14, CONTENT_W, 'Bold') + 4;
        },
      });
      flowBlocks(lines, M, CONTENT_W, 10.5, 2).forEach((block) => planner.add(block));
    });
  }

  // ==========================================================================
  // THANK YOU — content-sized final page
  // ==========================================================================
  {
    const boxW = 300;
    const boxH = 150;
    planner.pageBreak();
    const thankBlock: PdfBlock = {
      height: 30 + boxH + 20,
      render: (y0) => {
        const bx = (PDF_PAGE_WIDTH - boxW) / 2;
        const by = y0 + 30;
        doc.save().rect(bx, by, boxW, boxH).fill(TEAL).restore();
        doc
          .fillColor('#ffffff')
          .font('Bold')
          .fontSize(40)
          .text('THANK', bx, by + 30, { width: boxW, align: 'center' });
        doc.text('YOU', bx, by + 82, { width: boxW, align: 'center' });
        doc.fillColor(DARK);
        return y0 + 30 + boxH + 20;
      },
    };
    planner.add(thankBlock);
  }

  // ==========================================================================
  // RENDER — create each planned page with its measured height, draw blocks
  // ==========================================================================
  const planPages = planner.getPages();
  for (const page of planPages) {
    addMeasuredPage(page.height);
    let yy = TOP;
    for (const block of page.blocks) yy = block.render(yy);
  }

  // ==========================================================================
  // FOOTER PASS — complete footer on every physical page using its real height
  // ==========================================================================
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // critical: prevents auto-pagination
    const footerTop = pageMetrics[i]?.footerTop ?? doc.page.height - BOTTOM_M - FOOTER_H;
    drawPageFooter(doc, company, i + 1, total, footerTop);
  }

  doc.end();
  return done;
}
