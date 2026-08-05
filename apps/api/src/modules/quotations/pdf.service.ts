import PDFDocument from 'pdfkit';
import { cabinLuggageLabel, hotelStayNights, isPublicTaxNote } from '@interscale/shared';
import { DEJAVU_SANS, DEJAVU_SANS_BOLD } from '../../services/pdf/fonts.js';

/**
 * Quotation PDF renderer.
 *
 * Deliberately brand-free: no company name, logo, contact, achievements or legal
 * footer ever appears. The document uses a single fixed green visual theme and a
 * graphical, reference-matching layout (destination cover, flight timeline cards,
 * hotel cards, one-day-per-page alternating itinerary, vehicle/cruise/add-on
 * sections, coloured policies, and a Thank You page). Page numbering is applied
 * to already-buffered pages with the bottom margin disabled, so it can never add
 * extra blank pages.
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

// ---- A4 geometry (points) --------------------------------------------------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40; // left / right margin
const TOP = 46;
const BOTTOM = 58; // reserved footer band
const CONTENT_W = PAGE_W - M * 2;
const Y_LIMIT = PAGE_H - BOTTOM;

const num = (value: unknown) => Number(value ?? 0) || 0;
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

export interface QuotationPdfInput {
  company?: unknown; // intentionally ignored — the PDF is brand-free.
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
  };
}

type FlightSegment = {
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
type SightActivity = { sightseeingId?: string | null; name?: string | null; description?: string | null; startTime?: string | null };
type SightDay = {
  dayNumber?: number;
  title?: string | null;
  city?: string | null;
  date?: string | null;
  meals?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean };
  dailyTransfer?: string | null;
  activities?: SightActivity[];
};

export async function renderQuotationPdf(input: QuotationPdfInput): Promise<Buffer> {
  const q = input.quotation;
  const v = input.version;
  const currency = v.currency;
  const images = input.images ?? {};

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: TOP, bottom: BOTTOM, left: M, right: M },
    info: { Title: v.title },
  });
  // Embedded Unicode fonts so ₹ (and other non-WinAnsi glyphs) render on any host.
  doc.registerFont('Body', DEJAVU_SANS);
  doc.registerFont('Bold', DEJAVU_SANS_BOLD);
  doc.font('Body');
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = TOP;
  const addPage = () => {
    doc.addPage();
    y = TOP;
  };
  const need = (h: number) => {
    if (y + h > Y_LIMIT) addPage();
  };

  // --- primitives -----------------------------------------------------------
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

  const sectionHeader = (title: string) => {
    need(52);
    checkCircle(M + 15, y + 15, 15);
    doc.fillColor(DARK).font('Bold').fontSize(21).text(title.toUpperCase(), M + 42, y + 4);
    doc
      .save()
      .lineWidth(1)
      .strokeColor(BORDER)
      .moveTo(M + 42, y + 34)
      .lineTo(PAGE_W - M, y + 34)
      .stroke()
      .restore();
    doc.fillColor(DARK).font('Body').fontSize(11);
    y += 52;
  };

  const badge = (text: string, x: number, by: number, bg: string, fg: string) => {
    doc.font('Bold').fontSize(10);
    const w = doc.widthOfString(text) + 18;
    doc.save().roundedRect(x, by, w, 20, 4).fill(bg).restore();
    doc.fillColor(fg).text(text, x + 9, by + 5.5);
    doc.fillColor(DARK);
    return w;
  };

  // Flow paragraphs/lists; auto-paginates within the content band. Returns end y.
  const flow = (lines: string[], x: number, width: number, size = 10.5, gap = 2) => {
    doc.font('Body').fontSize(size).fillColor('#333');
    for (const line of lines) {
      const h = doc.heightOfString(line, { width });
      need(Math.min(h, 60));
      doc.text(line, x, y, { width });
      y = doc.y + gap;
    }
    doc.fillColor(DARK);
  };

  // ==========================================================================
  // PAGE 1 — cover, summary, pricing, secure booking, services include
  // ==========================================================================
  const primaryDestination =
    (q.destinationSummary || '').split(/[•(→>,/]/)[0]?.trim() || q.destinationSummary || 'Your Trip';
  const coverH = 188;
  drawImage(images.cover, M, y, CONTENT_W, coverH, 'Destination');
  // Dark gradient overlay at the bottom for title contrast.
  doc.save();
  doc.roundedRect(M, y, CONTENT_W, coverH, 6).clip();
  doc.fillOpacity(0.42).rect(M, y + coverH - 78, CONTENT_W, 78).fill('#000000');
  doc.restore();
  doc.fillOpacity(1).fillColor('#ffffff').font('Bold').fontSize(34).text(
    primaryDestination.toUpperCase(),
    M + 18,
    y + coverH - 52,
    { width: CONTENT_W - 36, align: 'left', ellipsis: true, height: 42 },
  );
  doc.fillColor(DARK);
  y += coverH + 16;

  // Quotation title
  need(30);
  doc.font('Bold').fontSize(19).fillColor(DARK).text(v.title.toUpperCase(), M, y, {
    width: CONTENT_W,
  });
  y = doc.y + 10;

  // Two columns: summary (left) + pricing (right)
  const colGap = 20;
  const leftW = (CONTENT_W - colGap) * 0.52;
  const rightW = CONTENT_W - colGap - leftW;
  const rightX = M + leftW + colGap;
  const summaryTop = y;

  const nights =
    q.travelStartDate && q.travelEndDate
      ? Math.max(
          0,
          Math.round(
            (new Date(q.travelEndDate).getTime() - new Date(q.travelStartDate).getTime()) /
              86_400_000,
          ),
        )
      : v.hotels.reduce((s, h) => s + (hotelStayNights(h.checkInDate, h.checkOutDate) ?? h.nights ?? 0), 0);
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

  let ly = summaryTop;
  for (const [label, val] of summaryRows) {
    doc.font('Bold').fontSize(10).fillColor(MUTED).text(`${label}: `, M, ly, {
      continued: true,
    });
    doc.font('Body').fillColor(DARK).text(val, { width: leftW });
    ly = doc.y + 4;
  }

  // Pricing (right)
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

  let ry = summaryTop;
  for (const [label, count, price] of priceRows) {
    doc.font('Body').fontSize(10).fillColor(MUTED).text(`${label} (x${count})`, rightX, ry, {
      width: rightW * 0.55,
      continued: false,
    });
    doc
      .font('Bold')
      .fillColor(DARK)
      .text(money(num(price)), rightX, ry, { width: rightW, align: 'right' });
    ry = doc.y + 4;
  }
  ry += 4;
  // Green total block
  const totalH = 50;
  doc.save().roundedRect(rightX, ry, rightW, totalH, 6).fill(GREEN).restore();
  doc.fillColor('#ffffff').font('Bold').fontSize(9).text('TOTAL PACKAGE PRICE', rightX + 12, ry + 9, {
    width: rightW - 24,
  });
  doc.fontSize(20).text(money(finalTotal), rightX + 12, ry + 22, { width: rightW - 24 });
  doc.fillColor(DARK);
  ry += totalH + 6;
  if (isPublicTaxNote(v.taxNote)) {
    doc.font('Body').fontSize(9).fillColor(MUTED).text(v.taxNote.trim(), rightX, ry, {
      width: rightW,
    });
    ry = doc.y;
    doc.fillColor(DARK).font('Body');
  }

  y = Math.max(ly, ry) + 16;

  // Secure Your Booking — conditional, single occurrence, clickable Pay Now.
  const payUrl = validPaymentUrl(v.paymentLink);
  if (num(v.initialPaymentAmount) > 0 && payUrl) {
    const boxH = 66;
    need(boxH + 8);
    doc.save().roundedRect(M, y, CONTENT_W, boxH, 6).fillAndStroke(LGREEN, BORDER).restore();
    doc.fillColor(DGREEN).font('Bold').fontSize(13).text('Secure Your Booking Now', M + 16, y + 12);
    doc
      .fillColor(DARK)
      .font('Body')
      .fontSize(10)
      .text(
        `Make an initial payment of ${money(v.initialPaymentAmount, 2)} to confirm your booking.`,
        M + 16,
        y + 32,
        { width: CONTENT_W - 160 },
      );
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text('The remaining balance can be paid as per the payment policy.', M + 16, y + 46, {
        width: CONTENT_W - 160,
      });
    // Pay Now button (real hyperlink over the rect).
    const btnW = 108;
    const btnH = 30;
    const btnX = PAGE_W - M - btnW - 14;
    const btnY = y + boxH / 2 - btnH / 2;
    doc.save().roundedRect(btnX, btnY, btnW, btnH, 5).fill(GREEN).restore();
    doc
      .fillColor('#ffffff')
      .font('Bold')
      .fontSize(12)
      .text('Pay Now', btnX, btnY + 9, { width: btnW, align: 'center' });
    doc.link(btnX, btnY, btnW, btnH, payUrl);
    doc.fillColor(DARK);
    y += boxH + 16;
  }

  // Services Include
  const flightData = v.flightDetails as FlightDetails | null | undefined;
  const sightData = v.sightseeingDetails as { include?: boolean; days?: SightDay[] } | null | undefined;
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
    need(90);
    doc.font('Bold').fontSize(15).fillColor(DARK).text('SERVICES INCLUDE', M, y, {
      width: CONTENT_W,
      align: 'center',
    });
    doc.save().lineWidth(1).strokeColor(BORDER).moveTo(M, y + 24).lineTo(PAGE_W - M, y + 24).stroke().restore();
    const cy = y + 52;
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
    y = cy + 44;
  }

  // ==========================================================================
  // FLIGHTS — one journey per page
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
  drawableLegs.forEach((leg, legIndex) => {
    addPage();
    if (legIndex === 0) sectionHeader('Flight Details');
    // Coloured journey bar
    const barH = 46;
    doc.save().roundedRect(M, y, CONTENT_W, barH, 6).fill(leg.color).restore();
    doc.fillColor('#ffffff').font('Bold').fontSize(16).text(leg.title, M + 16, y + 8);
    const route = [leg.journey?.fromCity, leg.journey?.toCity].filter(Boolean).join(' > ');
    if (route) doc.font('Body').fontSize(10).text(route, M + 16, y + 28);
    doc.fillColor(DARK);
    y += barH + 12;

    const segs = (leg.journey?.segments ?? []).filter(segHasData);
    segs.forEach((s, i) => {
      const noteLines = htmlToLines(s.notes);
      const cardH = 150 + (noteLines.length ? 14 + noteLines.length * 13 : 0);
      need(cardH);
      const top = y;
      doc.save().roundedRect(M, top, CONTENT_W, cardH, 6).stroke(BORDER).restore();
      badge(`Segment ${i + 1}`, M + 16, top + 16, GREEN, '#ffffff');
      if (s.travelClass) {
        doc.font('Body').fontSize(10);
        const w = doc.widthOfString(`${s.travelClass} Class`) + 20;
        doc.save().roundedRect(PAGE_W - M - 16 - w, top + 16, w, 20, 4).fill('#F2F3F5').restore();
        doc.fillColor(DARK).text(`${s.travelClass} Class`, PAGE_W - M - 16 - w + 10, top + 21.5);
      }
      // airline image + name (neutral slot — airline logos are not snapshotted)
      drawImage(undefined, M + 16, top + 44, 120, 66, 'Airline');
      doc.fillColor(DARK).font('Body').fontSize(11).text(s.airlineName || 'Airline', M + 16, top + 116, {
        width: 130,
      });
      doc.fillColor(MUTED).fontSize(10).text(s.flightNumber || '', M + 16, top + 130, { width: 130 });
      // timeline
      const tlY = top + 62;
      const depX = M + 170;
      const arrX = PAGE_W - M - 90;
      doc.fillColor(DARK).font('Bold').fontSize(16).text(s.departureTime || '--:--', depX, tlY, { width: 80 });
      doc.font('Body').fontSize(9).fillColor(MUTED).text(dateFmt(s.departureDate), depX, tlY + 20, { width: 90 });
      doc.text((s.from || '').toUpperCase(), depX, tlY + 32, { width: 90 });
      doc.fillColor(DARK).font('Bold').fontSize(16).text(s.arrivalTime || '--:--', arrX, tlY, { width: 80, align: 'right' });
      doc.font('Body').fontSize(9).fillColor(MUTED).text(dateFmt(s.arrivalDate), arrX - 10, tlY + 20, { width: 90, align: 'right' });
      doc.text((s.to || '').toUpperCase(), arrX - 10, tlY + 32, { width: 90, align: 'right' });
      // connector line
      const lineY = tlY + 10;
      const lx1 = depX + 92;
      const lx2 = arrX - 18;
      doc.save().lineWidth(2).strokeColor(BORDER).moveTo(lx1, lineY).lineTo(lx2, lineY).stroke().restore();
      doc.save().circle(lx1, lineY, 4).fill(GREEN).restore();
      doc.save().circle(lx2, lineY, 4).fill(GREEN).restore();
      if (s.duration)
        doc.fillColor(MUTED).font('Body').fontSize(9).text(s.duration, lx1, lineY + 6, { width: lx2 - lx1, align: 'center' });
      // divider + baggage + note
      doc.save().lineWidth(0.7).strokeColor(BORDER).moveTo(M + 16, top + 118).lineTo(PAGE_W - M - 16, top + 118).stroke().restore();
      const bag = [
        s.cabinLuggage && `Cabin: ${cabinLuggageLabel(s.cabinLuggage) ?? s.cabinLuggage}`,
        s.checkInLuggage && `Check-in: ${s.checkInLuggage}`,
      ]
        .filter(Boolean)
        .join('  •  ');
      doc.fillColor(DARK).font('Body').fontSize(10).text(`Baggage: ${bag || '—'}`, M + 150, top + 126, {
        width: CONTENT_W - 170,
      });
      if (noteLines.length) {
        doc.fillColor(MUTED).font('Bold').fontSize(10).text('Note:', M + 150, top + 142);
        doc.font('Body').fillColor('#333');
        let ny = top + 156;
        noteLines.forEach((l) => {
          doc.text(l, M + 150, ny, { width: CONTENT_W - 170 });
          ny = doc.y + 1;
        });
        doc.fillColor(DARK);
      }
      y = top + cardH + 12;
    });
  });

  // ==========================================================================
  // HOTELS
  // ==========================================================================
  if (v.hotels.length) {
    addPage();
    sectionHeader('Hotels');
    v.hotels.forEach((hotel, i) => {
      const cardH = 150;
      need(cardH + 12);
      const top = y;
      doc.save().roundedRect(M, top, CONTENT_W, cardH, 6).stroke(BORDER).restore();
      drawImage(images.hotels?.[i], M + 14, top + 14, 150, cardH - 28, 'Hotel');
      const tx = M + 180;
      const tw = PAGE_W - M - 14 - tx;
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
      y = top + cardH + 12;
    });
  }

  // ==========================================================================
  // TOUR ITINERARY — one day per page, alternating image side
  // ==========================================================================
  if (sightDays.length) {
    sightDays.forEach((day, i) => {
      addPage();
      if (i === 0) sectionHeader('Tour Itinerary');
      const imgLeft = i % 2 === 0; // Day 1 image left, Day 2 image right, ...
      const imgW = 190;
      const gap = 22;
      const imgX = imgLeft ? M : PAGE_W - M - imgW;
      const contentX = imgLeft ? M + imgW + gap : M;
      const contentW = CONTENT_W - imgW - gap;
      const top = y;

      const firstActivity = (day.activities ?? []).find((a) => a.name || a.description);
      const sightId = firstActivity?.sightseeingId ?? '';
      const dayImg = sightId ? images.sightseeing?.[sightId] : undefined;
      drawImage(dayImg, imgX, top, imgW, imgW, 'Activity');

      // metadata bar under image
      const meta = [
        firstActivity?.startTime && `STARTS: ${firstActivity.startTime}`,
      ].filter(Boolean).join('  |  ');
      let underY = top + imgW + 8;
      if (meta) {
        doc.save().roundedRect(imgX, underY, imgW, 22, 4).fill('#F2F3F5').restore();
        doc.fillColor(DARK).font('Bold').fontSize(10).text(meta, imgX, underY + 6, { width: imgW, align: 'center' });
        underY += 30;
      }
      const meals = [
        day.meals?.breakfast && '(B) Breakfast (Hotel)',
        day.meals?.lunch && '(L) Lunch',
        day.meals?.dinner && '(D) Dinner',
      ].filter(Boolean) as string[];
      if (meals.length) {
        doc.fillColor(DARK).font('Bold').fontSize(12).text('Meals Included:', imgX, underY);
        doc.font('Body').fontSize(10.5).fillColor('#333');
        meals.forEach((m) => doc.text(m, imgX + 10, doc.y + 3, { width: imgW - 10 }));
        doc.fillColor(DARK);
      }

      // content column
      const title = (day.title || `Day ${day.dayNumber ?? i + 1}`).trim();
      const dayTitle = /^day\s*\d/i.test(title) ? title : `DAY ${day.dayNumber ?? i + 1}: ${title}`;
      doc.fillColor(DARK).font('Bold').fontSize(15).text(dayTitle, contentX, top, { width: contentW });
      if (day.date) {
        doc.font('Body').fontSize(10).fillColor(MUTED).text(dateFmt(day.date, true), contentX, doc.y + 2, { width: contentW });
      }
      doc.fillColor(DARK);
      y = doc.y + 8;

      const validActivities = (day.activities ?? []).filter((a) => a.name || a.description);
      validActivities.forEach((a, ai) => {
        if (ai > 0) {
          need(14);
          doc.save().lineWidth(0.6).strokeColor(BORDER).moveTo(contentX, y).lineTo(contentX + contentW, y).stroke().restore();
          y += 8;
        }
        if (a.name) {
          need(16);
          doc.font('Bold').fontSize(12).fillColor(DARK).text(a.name, contentX, y, { width: contentW });
          y = doc.y + 3;
        }
        flow(htmlToLines(a.description), contentX, contentW, 10.5, 2);
      });

      // transfer badge
      const transferLabel =
        day.dailyTransfer === 'PRIVATE'
          ? 'Private Transfer'
          : day.dailyTransfer === 'SHARED'
            ? 'Shared Transfer'
            : day.dailyTransfer === 'NO_TRANSFER'
              ? null
              : null;
      if (transferLabel) {
        need(28);
        y += 6;
        badge(transferLabel, contentX, y, AMBER, DARK);
        y += 26;
      }
      y = Math.max(y, top); // keep cursor past content
    });
  }

  // ==========================================================================
  // VEHICLE / CRUISE / ADD-ONS
  // ==========================================================================
  const serviceIndex = (row: (typeof v.services)[number]) => v.services.indexOf(row);
  const drawServiceCard = (
    row: (typeof v.services)[number],
    fields: Array<[string, string | null | undefined]>,
    imgLabel: string,
  ) => {
    const desc = htmlToLines(row.description);
    const baseH = 150;
    need(baseH + 12);
    const top = y;
    doc.save().roundedRect(M, top, CONTENT_W, baseH, 6).stroke(BORDER).restore();
    drawImage(images.services?.[serviceIndex(row)], M + 14, top + 14, 150, baseH - 28, imgLabel);
    const tx = M + 180;
    const tw = PAGE_W - M - 14 - tx;
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
    y = top + baseH + 8;
    if (desc.length) flow(desc, M, CONTENT_W, 10.5, 2);
    y += 6;
  };

  if (vehicleServices.length) {
    addPage();
    sectionHeader('Vehicle Details');
    vehicleServices.forEach((row) =>
      drawServiceCard(row, [['Type', row.city], ['Usage', row.notes]], 'Vehicle'),
    );
  }
  if (cruiseServices.length) {
    if (!vehicleServices.length) addPage();
    else need(60);
    sectionHeader('Cruise Details');
    cruiseServices.forEach((row) =>
      drawServiceCard(row, [['Duration', row.notes], ['Cabin', row.city]], 'Cruise'),
    );
  }
  const hasAddonSection = addonServices.length > 0 || hasVisa;
  if (hasAddonSection) {
    if (!vehicleServices.length && !cruiseServices.length) addPage();
    else need(80);
    sectionHeader('Add-on Services');
    addonServices.forEach((row) => {
      need(30);
      doc.font('Bold').fontSize(12).fillColor(DARK).text(row.name, M, y, { width: CONTENT_W });
      y = doc.y + 3;
      flow(htmlToLines(row.description), M, CONTENT_W, 10.5, 2);
      y += 8;
    });
    if (hasVisa) {
      need(30);
      doc.font('Bold').fontSize(12).fillColor(DARK).text(
        v.visaSectionTitle || `${v.visaDestination ?? ''} Visa`.trim(),
        M,
        y,
        { width: CONTENT_W },
      );
      y = doc.y + 3;
      const visaLines = [
        v.visaType && `Visa type: ${v.visaType}`,
        v.visaDestination && `Destination: ${v.visaDestination}`,
        num(v.visaAmount) > 0 && `Amount: ${money(v.visaAmount, 2)}`,
      ].filter(Boolean) as string[];
      flow(visaLines, M, CONTENT_W, 10.5, 2);
      y += 8;
    }
  }

  // ==========================================================================
  // POLICIES
  // ==========================================================================
  const policyBlocks: Array<[string, string, string[]]> = [
    ['Inclusions', GREEN, v.inclusionsHtml ? htmlToLines(v.inclusionsHtml) : v.inclusions.map((r) => `• ${r.content}`)],
    ['Exclusions', RED, v.exclusionsHtml ? htmlToLines(v.exclusionsHtml) : v.exclusions.map((r) => `• ${r.content}`)],
    ['Payment Policies', AMBER, htmlToLines(v.paymentPolicies)],
    ['Cancellation Policies', RED, htmlToLines(v.cancellationPolicies)],
    ['Booking Terms', BLUE, v.bookingTerms ? htmlToLines(v.bookingTerms) : v.terms.map((r) => `• ${r.content}`)],
  ].filter((block) => (block[2] ?? []).length) as Array<[string, string, string[]]>;
  if (policyBlocks.length) {
    addPage();
    doc.font('Bold').fontSize(22).fillColor(DARK).text('Policies', M, y, {
      width: CONTENT_W,
      align: 'center',
    });
    y = doc.y + 14;
    policyBlocks.forEach(([title, col, lines]) => {
      need(30);
      doc.font('Bold').fontSize(14).fillColor(col).text(title.toUpperCase(), M, y, { width: CONTENT_W });
      y = doc.y + 4;
      flow(lines, M, CONTENT_W, 10.5, 2);
      y += 10;
    });
  }

  // ==========================================================================
  // THANK YOU — brand-free
  // ==========================================================================
  addPage();
  {
    const boxW = 300;
    const boxH = 150;
    const bx = (PAGE_W - boxW) / 2;
    const by = TOP + 30;
    doc.save().rect(bx, by, boxW, boxH).fill(TEAL).restore();
    doc
      .fillColor('#ffffff')
      .font('Bold')
      .fontSize(40)
      .text('THANK', bx, by + 30, { width: boxW, align: 'center' });
    doc.text('YOU', bx, by + 82, { width: boxW, align: 'center' });
    doc.fillColor(DARK);
  }

  // ==========================================================================
  // FOOTER PASS — page numbers only, never adds a page
  // ==========================================================================
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // critical: prevents auto-pagination
    doc
      .save()
      .lineWidth(0.7)
      .strokeColor(BORDER)
      .moveTo(M, PAGE_H - 44)
      .lineTo(PAGE_W - M, PAGE_H - 44)
      .stroke()
      .restore();
    const label = `Page ${i + 1}/${total}`;
    doc.font('Bold').fontSize(9);
    const w = doc.widthOfString(label) + 22;
    const bx = PAGE_W - M - w;
    const by = PAGE_H - 38;
    doc.save().roundedRect(bx, by, w, 22, 4).fill(GREEN).restore();
    doc.fillColor('#ffffff').text(label, bx, by + 6.5, { width: w, align: 'center', lineBreak: false });
  }

  doc.end();
  return done;
}
