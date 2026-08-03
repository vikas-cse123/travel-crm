import PDFDocument from 'pdfkit';
import { drawHeaderLogo } from '../../services/pdf/company-branding.js';

const safe = (value: unknown) => String(value ?? '—');
const num = (value: unknown) => Number(value ?? 0) || 0;
const money = (currency: string, value: unknown) => `${currency} ${num(value).toFixed(2)}`;
const date = (value: Date | string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—';

/**
 * PDFKit renders plain text, so rich-text/HTML blocks are flattened: block tags
 * become line breaks, list items become bullets, and a few entities are decoded.
 */
const htmlToLines = (html: string | null | undefined): string[] => {
  if (!html) return [];
  return html
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
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

export async function renderQuotationPdf(input: {
  company: {
    name: string;
    email: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    primaryColor: string;
    logo?: Buffer | null;
  };
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
    // Reference "Summary & Pricing" — per-passenger package pricing.
    perAdultPrice: unknown;
    perChildWithBedPrice: unknown;
    perChildWithoutBedPrice: unknown;
    perInfantPrice: unknown;
    taxNote: string | null;
    initialPaymentAmount: unknown;
    paymentLink: string | null;
    // Reference "Inclusions & Exclusions" — rich-text blocks.
    inclusionsHtml: string | null;
    exclusionsHtml: string | null;
    paymentPolicies: string | null;
    cancellationPolicies: string | null;
    bookingTerms: string | null;
    // Reference "Visa" — single dedicated section.
    includeVisa: boolean;
    visaSectionTitle: string | null;
    visaAmount: unknown;
    visaDestination: string | null;
    visaType: string | null;
    visaServiceCharge: unknown;
    visaGstPercent: unknown;
    visaVfsCharge: unknown;
    // Reference "Flight" — structured journeys/segments (JSON).
    flightDetails: unknown;
    // Reference "Sightseeing" — day-wise activity itinerary (JSON).
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
      quantity: unknown;
      unitSellingPrice: unknown;
    }>;
    inclusions: Array<{ content: string }>;
    exclusions: Array<{ content: string }>;
    terms: Array<{ content: string }>;
  };
}) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
    info: { Title: input.version.title },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const color = /^#[0-9a-f]{6}$/i.test(input.company.primaryColor)
    ? input.company.primaryColor
    : '#2563eb';
  const heading = (value: string) => {
    doc
      .moveDown(0.7)
      .fontSize(14)
      .fillColor(color)
      .font('Helvetica-Bold')
      .text(value)
      .moveDown(0.35);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
  };
  doc.rect(0, 0, 595, 110).fill(color);
  drawHeaderLogo(doc, input.company.logo ?? null, { x: 427, y: 32, width: 120, height: 50 });
  // Clip an overlong company name to the header band so it cannot overflow.
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(input.company.name, 48, 38, { width: 360, height: 44, ellipsis: true });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(
      [input.company.email, input.company.phone, input.company.website]
        .filter(Boolean)
        .join('  •  '),
      48,
      86,
      { width: 360, height: 18, ellipsis: true },
    );
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text(input.version.title, 48, 140);
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#475569')
    .text(
      `${input.quotation.quotationNumber}  •  Version ${input.version.versionNumber}  •  Generated ${date(new Date())}`,
    );
  heading('Customer & travel summary');
  doc.text(
    `Customer: ${input.quotation.customerName}  |  ${safe(input.quotation.customerEmail)}  |  ${input.quotation.customerPhone}`,
  );
  doc.text(`Destination: ${input.quotation.destinationSummary}`);
  doc.text(
    `Travel: ${date(input.quotation.travelStartDate)} – ${date(input.quotation.travelEndDate)}`,
  );
  doc.text(
    `Travellers: ${input.quotation.adults} adults, ${input.quotation.childrenWithBed} children with bed, ${input.quotation.childrenWithoutBed} children without bed, ${input.quotation.infants} infants • ${input.quotation.rooms} rooms`,
  );
  if (input.version.introduction) doc.moveDown().text(input.version.introduction);
  if (input.version.hotels.length) {
    heading('Hotels');
    input.version.hotels.forEach((hotel) =>
      doc
        .font('Helvetica-Bold')
        .text(`${hotel.hotelName}${hotel.category ? ` • ${hotel.category}` : ''}`)
        .font('Helvetica')
        .text(
          `${hotel.city} • ${hotel.nights} nights • ${safe(hotel.roomType)} • ${safe(hotel.mealPlan)}${hotel.selected ? ' • Selected' : ' • Alternative'}`,
        ),
    );
  }
  if (input.version.itinerary.length) {
    heading('Day-wise itinerary');
    input.version.itinerary.forEach((day) => {
      doc.font('Helvetica-Bold').text(`Day ${day.dayNumber}: ${day.title} — ${day.destination}`);
      doc.font('Helvetica').text(day.description);
      if (day.meals || day.overnightLocation)
        doc
          .fillColor('#475569')
          .text(
            [
              day.meals && `Meals: ${day.meals}`,
              day.overnightLocation && `Overnight: ${day.overnightLocation}`,
            ]
              .filter(Boolean)
              .join(' • '),
          )
          .fillColor('#0f172a');
      doc.moveDown(0.4);
    });
  }
  if (input.version.services.length) {
    heading('Services and experiences');
    input.version.services.forEach((row) =>
      doc.text(
        `• ${row.name} (${row.serviceType.replaceAll('_', ' ').toLowerCase()})${row.city ? ` — ${row.city}` : ''}`,
      ),
    );
  }
  const v = input.version;
  const q = input.quotation;
  const currency = v.currency;
  const textLines = (lines: string[]) => lines.forEach((line) => doc.text(line, { indent: 10 }));

  // Flight — structured journeys/segments.
  type PdfFlightSegment = {
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
  type PdfFlightJourney = {
    fromCity?: string | null;
    toCity?: string | null;
    segments?: PdfFlightSegment[];
  };
  type PdfFlightDetails = {
    include?: boolean;
    journeyType?: string;
    outbound?: PdfFlightJourney;
    returnJourney?: PdfFlightJourney;
  };
  const fd = v.flightDetails as PdfFlightDetails | null | undefined;
  const flightLegs =
    fd && fd.include
      ? (
          [
            fd.journeyType === 'ONEWAY_RETURN'
              ? null
              : { title: 'Outbound Journey', journey: fd.outbound },
            fd.journeyType === 'ONEWAY_OUTBOUND'
              ? null
              : { title: 'Return Journey', journey: fd.returnJourney },
          ] as Array<{ title: string; journey?: PdfFlightJourney } | null>
        ).filter((leg): leg is { title: string; journey?: PdfFlightJourney } => Boolean(leg))
      : [];
  const segHasData = (s: PdfFlightSegment) => Boolean(s.airlineName || s.from || s.to || s.flightNumber);
  if (flightLegs.some((leg) => (leg.journey?.segments ?? []).some(segHasData))) {
    heading('Flight details');
    for (const leg of flightLegs) {
      const segs = (leg.journey?.segments ?? []).filter(segHasData);
      if (!segs.length) continue;
      const route = [leg.journey?.fromCity, leg.journey?.toCity].filter(Boolean).join(' -> ');
      doc.font('Helvetica-Bold').text(`${leg.title}${route ? `: ${route}` : ''}`).font('Helvetica');
      segs.forEach((s, index) => {
        const airline = [s.airlineName, s.flightNumber].filter(Boolean).join(' ');
        doc.text(`Segment ${index + 1}: ${airline || 'Airline'}${s.travelClass ? ` • ${s.travelClass}` : ''}`, {
          indent: 10,
        });
        doc
          .fillColor('#475569')
          .text(
            `${safe(s.departureTime)} ${safe(s.from)} (${date(s.departureDate)}) -> ${safe(s.arrivalTime)} ${safe(s.to)} (${date(s.arrivalDate)})${s.duration ? ` • ${s.duration}` : ''}`,
            { indent: 20 },
          )
          .fillColor('#0f172a');
        if (s.cabinLuggage || s.checkInLuggage)
          doc
            .fillColor('#475569')
            .text(`Baggage: Cabin ${s.cabinLuggage ?? '-'} / Check-in ${s.checkInLuggage ?? '-'}`, {
              indent: 20,
            })
            .fillColor('#0f172a');
        const noteLines = htmlToLines(s.notes);
        if (noteLines.length) {
          doc.fillColor('#475569').text('Notes:', { indent: 20 });
          noteLines.forEach((line) => doc.text(line, { indent: 30 }));
          doc.fillColor('#0f172a');
        }
      });
      doc.moveDown(0.3);
    }
  }

  // Sightseeing — day-wise activity itinerary.
  type PdfSightActivity = { name?: string | null; description?: string | null };
  type PdfSightDay = {
    dayNumber?: number;
    title?: string | null;
    city?: string | null;
    date?: string | null;
    meals?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean };
    dailyTransfer?: string | null;
    activities?: PdfSightActivity[];
  };
  const sd = v.sightseeingDetails as { include?: boolean; days?: PdfSightDay[] } | null | undefined;
  const sightDays = (sd && sd.include !== false ? (sd.days ?? []) : []).filter(
    (day) => day.title || (day.activities ?? []).some((a) => a.name || a.description),
  );
  if (sightDays.length) {
    heading('Your itinerary');
    for (const day of sightDays) {
      const place = [day.city, day.date ? date(day.date) : ''].filter(Boolean).join(' • ');
      doc
        .font('Helvetica-Bold')
        .text(`${day.title || `Day ${day.dayNumber ?? ''}`}${place ? ` (${place})` : ''}`)
        .font('Helvetica');
      for (const activity of (day.activities ?? []).filter((a) => a.name || a.description)) {
        if (activity.name) doc.text(`• ${activity.name}`, { indent: 10 });
        htmlToLines(activity.description).forEach((line) => doc.text(line, { indent: 20 }));
      }
      const meals = [
        day.meals?.breakfast && 'Breakfast',
        day.meals?.lunch && 'Lunch',
        day.meals?.dinner && 'Dinner',
      ]
        .filter(Boolean)
        .join(', ');
      if (meals || day.dailyTransfer)
        doc
          .fillColor('#475569')
          .text(
            [meals && `Meals: ${meals}`, day.dailyTransfer && `Transfer: ${day.dailyTransfer}`]
              .filter(Boolean)
              .join(' • '),
            { indent: 10 },
          )
          .fillColor('#0f172a');
      doc.moveDown(0.3);
    }
  }

  // Visa — single dedicated section.
  const visaConsolidated =
    num(v.visaServiceCharge) +
    (num(v.visaServiceCharge) * num(v.visaGstPercent)) / 100 +
    num(v.visaVfsCharge);
  if (
    v.includeVisa &&
    (num(v.visaAmount) || num(v.visaServiceCharge) || v.visaType || v.visaDestination)
  ) {
    heading(v.visaSectionTitle || 'Visa');
    if (v.visaDestination) doc.text(`Destination: ${v.visaDestination}`);
    if (v.visaType) doc.text(`Visa type: ${v.visaType}`);
    if (num(v.visaAmount)) doc.text(`Amount: ${money(currency, v.visaAmount)}`);
    if (num(v.visaServiceCharge) || num(v.visaVfsCharge)) {
      doc.text(
        `Service charge: ${money(currency, v.visaServiceCharge)} • GST ${num(v.visaGstPercent)}% • VFS: ${money(currency, v.visaVfsCharge)}`,
      );
      doc.text(`Consolidated total: ${money(currency, visaConsolidated)}`);
    }
  }

  // Inclusions / Exclusions — prefer the rich-text block, fall back to the list.
  const inclusionLines = v.inclusionsHtml
    ? htmlToLines(v.inclusionsHtml)
    : input.version.inclusions.map((row) => `• ${row.content}`);
  if (inclusionLines.length) {
    heading('Inclusions');
    textLines(inclusionLines);
  }
  const exclusionLines = v.exclusionsHtml
    ? htmlToLines(v.exclusionsHtml)
    : input.version.exclusions.map((row) => `• ${row.content}`);
  if (exclusionLines.length) {
    heading('Exclusions');
    textLines(exclusionLines);
  }

  const paymentLines = htmlToLines(v.paymentPolicies);
  if (paymentLines.length) {
    heading('Payment policies');
    textLines(paymentLines);
  }
  const cancellationLines = htmlToLines(v.cancellationPolicies);
  if (cancellationLines.length) {
    heading('Cancellation policies');
    textLines(cancellationLines);
  }

  const termLines = v.bookingTerms
    ? htmlToLines(v.bookingTerms)
    : input.version.terms.map((row) => `• ${row.content}`);
  if (termLines.length) {
    heading('Terms and conditions');
    textLines(termLines);
  }

  // Package pricing — per-passenger total (add-ons are quoted separately).
  const packageTotal =
    num(v.perAdultPrice) * q.adults +
    num(v.perChildWithBedPrice) * q.childrenWithBed +
    num(v.perChildWithoutBedPrice) * q.childrenWithoutBed +
    num(v.perInfantPrice) * q.infants;
  const addonTotal = input.version.services
    .filter((service) => ADDON_SERVICE_TYPES.has(service.serviceType))
    .reduce((sum, service) => sum + num(service.unitSellingPrice) * num(service.quantity), 0);
  const finalTotal = packageTotal > 0 ? packageTotal : num(v.finalAmount);
  heading('Package pricing');
  if (packageTotal > 0) {
    (
      [
        ['Adult', q.adults, v.perAdultPrice],
        ['Child with bed', q.childrenWithBed, v.perChildWithBedPrice],
        ['Child without bed', q.childrenWithoutBed, v.perChildWithoutBedPrice],
        ['Infant', q.infants, v.perInfantPrice],
      ] as const
    ).forEach(([label, count, price]) => {
      if (count && num(price))
        doc.text(
          `${label} × ${count} @ ${money(currency, price)} = ${money(currency, num(price) * count)}`,
        );
    });
  }
  doc
    .moveDown(0.3)
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(`Total: ${money(currency, finalTotal)}`);
  doc.fontSize(10).font('Helvetica');
  if (v.taxNote) doc.fillColor('#475569').text(v.taxNote).fillColor('#0f172a');
  if (addonTotal > 0)
    doc.text(
      `Add-on services (quoted separately, not in package total): ${money(currency, addonTotal)}`,
    );
  doc.text(`Valid until: ${date(q.validUntil)}`);
  if (num(v.initialPaymentAmount) || v.paymentLink) {
    heading('Initial payment');
    if (num(v.initialPaymentAmount))
      doc.text(`Amount to confirm booking: ${money(currency, v.initialPaymentAmount)}`);
    if (v.paymentLink) doc.text(`Payment link: ${v.paymentLink}`);
  }
  if (v.notes) {
    heading('Notes');
    doc.text(v.notes);
  }
  const pages = doc.bufferedPageRange();
  for (let page = 0; page < pages.count; page += 1) {
    doc.switchToPage(page);
    doc
      .fontSize(8)
      .fillColor('#64748b')
      .text(`Page ${page + 1} of ${pages.count}`, 48, 800, { align: 'right', width: 499 });
  }
  doc.end();
  return done;
}
