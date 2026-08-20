import PDFDocument from 'pdfkit';
import { stripItineraryDayPrefixes } from '@interscale/shared';
import { colorEmojiPng } from '../../services/pdf/color-emojis.js';
import { DEJAVU_SANS, DEJAVU_SANS_BOLD } from '../../services/pdf/fonts.js';
import {
  htmlToRichTextLines,
  pdfActivityImageOrCover,
  type PdfRichTextLine,
  type QuotationPdfInput,
} from './pdf.service.js';

const W = 595.28;
const H = 841.89;
const M = 42;
const CONTENT_W = W - M * 2;
const BODY_BOTTOM = 756;
const NAVY = '#17386f';
const NAVY_DARK = '#10254d';
const NAVY_CARD = '#1d3c72';
const GOLD = '#fdbb16';
const TEAL = '#0a6f98';
const GREEN = '#0ea36d';
const RED = '#d93045';
const INK = '#161b22';
const MUTED = '#687487';
const LINE = '#d7e0ec';
const PALE = '#f3f6fa';
const PALE_BLUE = '#eaf0f8';

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

type FlightJourney = {
  fromCity?: string | null;
  toCity?: string | null;
  segments?: FlightSegment[];
};

type FlightDetails = {
  include?: boolean;
  sectionTitle?: string | null;
  entryMode?: 'MANUAL' | 'IMAGE';
  imageDocumentId?: string | null;
  imageFileName?: string | null;
  images?: Array<{
    documentId: string;
    fileName?: string | null;
    description?: string | null;
    heading?: string | null;
  }>;
  outbound?: FlightJourney;
  returnJourney?: FlightJourney;
};

const formatClock12Hour = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  if (hour < 0 || hour > 23) return value;
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
};

type SightActivity = {
  sightseeingId?: string | null;
  imageDocumentId?: string | null;
  /** True when the quotation owns this gallery, including an intentional empty one. */
  imageSnapshotPresent?: boolean;
  name?: string | null;
  description?: string | null;
  startTime?: string | null;
  showTime?: boolean;
  duration?: string | null;
  imageUrl?: string | null;
  dailyTransfer?: string | null;
};

type SightDay = {
  dayNumber?: number;
  title?: string | null;
  city?: string | null;
  date?: string | null;
  dailyTransfer?: string | null;
  meals?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean };
  mealMode?: string | null;
  mealsText?: string | null;
  activities?: SightActivity[];
};

type PdfImage = Buffer | null | undefined;

const clean = (value: unknown): string => String(value ?? '').trim();

const asNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown, currency: string, digits = 0): string => {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(asNumber(value));
  } catch {
    return `${currency} ${asNumber(value).toLocaleString('en-IN')}`;
  }
};

const date = (value: Date | string | null | undefined, withWeekday = false): string => {
  if (!value) return 'As advised';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return clean(value);
  return parsed.toLocaleDateString('en-GB', {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const durationLabel = (
  itineraryNights: number | null | undefined,
  start: Date | null,
  end: Date | null,
): string => {
  const nights =
    itineraryNights && itineraryNights > 0
      ? itineraryNights
      : start && end
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
        : null;
  if (nights === null) return 'As advised';
  return `${nights} Nights / ${nights + 1} Days`;
};

const transferLabel = (value: string | null | undefined): string | null => {
  if (value === 'PRIVATE') return 'Private Transfer';
  if (value === 'SHARED') return 'Shared Transfer';
  if (value === 'NO_TRANSFER') return 'No Transfer';
  return null;
};

const serviceLabel = (value: string): string =>
  ({
    FLIGHT: 'Flights',
    HOTEL: 'Hotels',
    SIGHTSEEING: 'Tours',
    TRANSFER: 'Transport',
    VEHICLE: 'Vehicle',
    CRUISE: 'Cruise',
    VISA: 'Visa',
    ADD_ON: 'Add-ons',
    OTHER_ADD_ON: 'Add-ons',
    TRAVEL_INSURANCE: 'Insurance',
  })[value] ?? value.replaceAll('_', ' ');

/**
 * TravelEnfield-style quotation renderer. Its geometry intentionally follows
 * the supplied TCPDF references: scrapbook headers, compact navy information
 * cards, one itinerary activity per page, legal footer grid and dark closing
 * page. It remains data-driven so every CRM quotation can use the same design.
 */
export async function renderStylishQuotationPdf(input: QuotationPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    margin: 0,
    info: {
      Title: input.version.title,
      Author: input.company?.name ?? 'Travel CRM',
      Creator: input.company?.name ?? 'Travel CRM',
    },
  });
  doc.registerFont('Body', DEJAVU_SANS);
  doc.registerFont('Bold', DEJAVU_SANS_BOLD);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const company = input.company;
  const consultant = input.consultant;
  const numberedPages: number[] = [];
  let y = 0;

  const drawImage = (
    value: PdfImage,
    x: number,
    top: number,
    width: number,
    height: number,
    mode: 'cover' | 'contain' = 'cover',
  ): boolean => {
    if (!value) return false;
    let saved = false;
    try {
      if (mode === 'cover') {
        doc.save().rect(x, top, width, height).clip();
        saved = true;
      }
      doc.image(value, x, top, {
        ...(mode === 'cover' ? { cover: [width, height] } : { fit: [width, height] }),
        align: 'center',
        valign: 'center',
      });
      if (saved) doc.restore();
      return true;
    } catch {
      if (saved) doc.restore();
      return false;
    }
  };

  const rounded = (
    x: number,
    top: number,
    width: number,
    height: number,
    fill = '#ffffff',
    stroke = LINE,
    radius = 9,
  ) => {
    doc.save().roundedRect(x, top, width, height, radius).fillAndStroke(fill, stroke).restore();
  };

  const pill = (
    label: string,
    x: number,
    top: number,
    options: {
      fill?: string;
      color?: string;
      minWidth?: number;
      height?: number;
      size?: number;
    } = {},
  ): number => {
    const height = options.height ?? 18;
    const size = options.size ?? 6.2;
    doc.font('Bold').fontSize(size);
    const width = Math.max(options.minWidth ?? 50, doc.widthOfString(label) + 18);
    doc
      .save()
      .roundedRect(x, top, width, height, height / 2)
      .fill(options.fill ?? PALE_BLUE)
      .restore();
    doc.fillColor(options.color ?? NAVY).text(label, x, top + (height - size) / 2 - 0.7, {
      width,
      align: 'center',
      lineBreak: false,
    });
    return width;
  };

  const drawDiamond = (x: number, top: number, size = 5, color = NAVY) => {
    doc
      .save()
      .moveTo(x, top - size)
      .lineTo(x + size, top)
      .lineTo(x, top + size)
      .lineTo(x - size, top)
      .closePath()
      .fill(color)
      .restore();
  };

  const topRule = (top: number, color = NAVY) => {
    doc
      .moveTo(M, top)
      .lineTo(W - M, top)
      .lineWidth(2)
      .strokeColor(color)
      .stroke();
    drawDiamond(W - M, top, 5, color);
  };

  const decorativeImages: Buffer[] = [
    input.images?.cover,
    ...(input.images?.hotels ?? []),
    ...(input.images?.services ?? []),
    ...Object.values(input.images?.itinerary ?? {}),
    ...Object.values(input.images?.sightseeing ?? {}),
  ].filter((value): value is Buffer => Buffer.isBuffer(value));

  const drawPolaroid = (
    value: PdfImage,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    angle: number,
    fallback: string,
  ) => {
    doc.save().translate(centerX, centerY).rotate(angle);
    doc.rect(-width / 2, -height / 2, width, height).fill('#ffffff');
    if (!drawImage(value, -width / 2 + 3, -height / 2 + 3, width - 6, height - 10, 'contain')) {
      doc.rect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 10).fill('#d5e4ee');
      doc
        .font('Bold')
        .fontSize(12)
        .fillColor(NAVY)
        .text(fallback, -width / 2 + 3, -2, {
          width: width - 6,
          align: 'center',
        });
    }
    doc.restore();
  };

  const drawSprig = (x: number, top: number, direction = 1) => {
    doc.save().lineWidth(0.7).strokeColor('#caa52b');
    doc
      .moveTo(x, top + 24)
      .lineTo(x + direction * 10, top)
      .stroke();
    for (let index = 0; index < 4; index += 1) {
      const yy = top + 5 + index * 5;
      const xx = x + direction * (8 - index * 1.6);
      doc.circle(xx, yy, 1.8).fill('#e3b624');
    }
    doc.restore();
  };

  const pageHeader = () => {
    doc.rect(0, 0, W, 70).fill('#f7f1e7');
    doc.save().fillColor('#76b1c1').fillOpacity(0.95);
    doc.path('M0 28 C34 22 44 42 83 46 C115 50 140 57 177 70 L0 70 Z').fill();
    doc
      .path(
        `M${W} 0 L${W} 70 L${W - 170} 70 C${W - 135} 50 ${W - 95} 51 ${W - 72} 29 C${W - 47} 6 ${W - 22} 12 ${W} 0 Z`,
      )
      .fill();
    doc.restore();
    drawSprig(30, 30, 1);
    drawSprig(W - 30, 30, -1);
    drawPolaroid(decorativeImages[1] ?? decorativeImages[0], 76, 32, 39, 48, -7, '✈');
    drawPolaroid(decorativeImages[2] ?? decorativeImages[0], 112, 42, 36, 43, 4, '▣');
    drawPolaroid(decorativeImages[3] ?? decorativeImages[0], W - 102, 40, 38, 44, -5, '◆');
    drawPolaroid(decorativeImages[4] ?? decorativeImages[0], W - 65, 31, 39, 48, 6, '★');
    doc
      .font('Times-Roman')
      .fontSize(11)
      .fillColor('#1c58bc')
      .text((company?.name ?? 'TRAVEL COMPANY').toUpperCase(), 155, 31, {
        width: W - 310,
        align: 'center',
        characterSpacing: 2.1,
        lineBreak: false,
      });
  };

  const pageFooter = (pageIndex: number, pageCount: number) => {
    const top = 769;
    doc
      .moveTo(M, top)
      .lineTo(W - M, top)
      .lineWidth(0.7)
      .strokeColor('#8ebdff')
      .stroke();
    if (company?.logo) drawImage(company.logo, 46, top + 12, 42, 38, 'contain');
    else {
      doc
        .font('Bold')
        .fontSize(6)
        .fillColor(GOLD)
        .text('TRAVEL', 47, top + 22, { width: 40, align: 'center' });
      doc
        .font('Bold')
        .fontSize(5)
        .fillColor(NAVY)
        .text('HOLIDAYS', 47, top + 30, { width: 40, align: 'center' });
    }
    const columns = [
      {
        x: 105,
        title: 'CONTACT US',
        rows: [
          company?.phone ? `Ph: ${company.phone}` : null,
          company?.email ? `Em: ${company.email}` : null,
          company?.website ? `Web: ${company.website}` : null,
        ],
      },
      {
        x: 254,
        title: 'OUR ACHIEVEMENTS',
        rows: [
          company?.tripsSold != null ? `${company.tripsSold} Trip Sold` : null,
          company?.operatingSinceYear ? `Est: ${company.operatingSinceYear}` : null,
        ],
      },
      {
        x: 404,
        title: 'LEGAL INFO',
        rows: [
          company?.tan ? `TAN: ${company.tan}` : null,
          company?.taxRegistrationNumber ? `GST: ${company.taxRegistrationNumber}` : null,
        ],
      },
    ];
    for (const column of columns) {
      doc
        .font('Body')
        .fontSize(5.5)
        .fillColor(TEAL)
        .text(column.title, column.x, top + 13, {
          width: 130,
          lineBreak: false,
        });
      doc
        .font('Body')
        .fontSize(4.9)
        .fillColor(INK)
        .text(column.rows.filter(Boolean).join('\n'), column.x, top + 26, {
          width: 135,
          lineGap: 1.1,
        });
    }
    doc
      .font('Body')
      .fontSize(4.8)
      .fillColor(MUTED)
      .text(`Page ${pageIndex + 1} of ${pageCount}`, W - M - 70, 823, {
        width: 70,
        align: 'right',
        lineBreak: false,
      });
  };

  const sectionHeading = (title: string, top: number) => {
    doc
      .font('Bold')
      .fontSize(13)
      .fillColor(NAVY)
      .text(title.toUpperCase(), M + 3, top, {
        width: CONTENT_W,
        lineBreak: false,
      });
    doc
      .moveTo(M, top + 25)
      .lineTo(M + 85, top + 25)
      .lineWidth(1.5)
      .strokeColor(GOLD)
      .stroke();
  };

  const addContentPage = (title?: string): number => {
    doc.addPage({ size: [W, H], margin: 0 });
    const range = doc.bufferedPageRange();
    const pageIndex = range.start + range.count - 1;
    numberedPages.push(pageIndex);
    pageHeader();
    y = title ? 90 : 86;
    if (title) {
      sectionHeading(title, y);
      y += 43;
    }
    return pageIndex;
  };

  const drawEmoji = (emoji: string, x: number, top: number, size: number): boolean => {
    const png = colorEmojiPng(emoji);
    return png ? drawImage(png, x, top, size, size, 'contain') : false;
  };

  const drawRichLines = (
    lines: PdfRichTextLine[],
    x: number,
    top: number,
    width: number,
    size = 7.2,
    color = INK,
    lineFactor = 1.42,
  ): number => {
    let yy = top;
    const lineHeight = size * lineFactor;
    for (const line of lines) {
      let xx = x;
      for (const run of line) {
        const parts = run.text
          .split(/(\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?)/gu)
          .filter(Boolean);
        for (const part of parts) {
          const emoji = colorEmojiPng(part);
          if (emoji) {
            if (xx + lineHeight > x + width) {
              yy += lineHeight;
              xx = x;
            }
            drawImage(emoji, xx, yy + 0.2, lineHeight * 0.88, lineHeight * 0.88, 'contain');
            xx += lineHeight;
            continue;
          }
          doc.font(run.bold ? 'Bold' : 'Body').fontSize(size);
          for (const word of part.split(/(\s+)/).filter(Boolean)) {
            const wordWidth = doc.widthOfString(word);
            if (!/^\s+$/.test(word) && xx > x && xx + wordWidth > x + width) {
              yy += lineHeight;
              xx = x;
            }
            if (xx !== x || !/^\s+$/.test(word)) {
              doc.fillColor(color).text(word, xx, yy, { lineBreak: false });
              xx += wordWidth;
            }
          }
        }
      }
      yy += lineHeight;
    }
    return yy;
  };

  const estimatedRichHeight = (
    lines: PdfRichTextLine[],
    width: number,
    size: number,
    lineFactor = 1.42,
  ): number => {
    const charsPerLine = Math.max(24, Math.floor(width / (size * 0.53)));
    return lines.reduce((total, line) => {
      const length = line.reduce((count, run) => count + run.text.length, 0);
      return total + Math.max(1, Math.ceil(length / charsPerLine)) * size * lineFactor;
    }, 0);
  };

  // Cover ------------------------------------------------------------------
  doc.addPage({ size: [W, H], margin: 0 });
  if (!drawImage(input.images?.cover, 0, 0, W, H)) doc.rect(0, 0, W, H).fill(NAVY_DARK);
  doc.save().rect(0, 0, W, H).fillOpacity(0.15).fill(NAVY_DARK).restore();
  if (company?.logo) drawImage(company.logo, W / 2 - 45, 36, 90, 82, 'contain');
  else {
    doc
      .font('Bold')
      .fontSize(10)
      .fillColor(GOLD)
      .text((company?.name ?? 'TRAVEL COMPANY').toUpperCase(), M, 66, {
        width: CONTENT_W,
        align: 'center',
      });
  }
  doc.font('Body').fontSize(15).fillColor('#ffffff').text(input.version.title, M, 319, {
    width: CONTENT_W,
    align: 'center',
  });
  doc
    .font('Body')
    .fontSize(7)
    .fillColor('#ffffff')
    .text(
      (input.quotation.destinations || input.quotation.destinationSummary).toUpperCase(),
      M,
      356,
      { width: CONTENT_W, align: 'center', characterSpacing: 0.9 },
    );
  doc
    .moveTo(W / 2 - 112, 386)
    .lineTo(W / 2 + 112, 386)
    .lineWidth(0.7)
    .strokeColor('#ffffff')
    .stroke();
  doc.font('Bold').fontSize(5.2).fillColor('#ffffff').text('SERVICES INCLUDE', M, 407, {
    width: CONTENT_W,
    align: 'center',
    characterSpacing: 2,
  });
  const selectedServices = [
    ...new Set([
      ...((input.version.flightDetails as FlightDetails | null)?.include ? ['Flights'] : []),
      ...(input.version.hotels.some((hotel) => hotel.selected) ? ['Hotels'] : []),
      ...(input.version.sightseeingDetails ? ['Tours'] : []),
      ...input.version.services.map((service) => serviceLabel(service.serviceType)),
    ]),
  ].slice(0, 5);
  const coverIcons = ['✈️', '🏨', '🌍', '🚌', '⭐'];
  const iconSpace = 68;
  const iconStart = (W - selectedServices.length * iconSpace) / 2 + iconSpace / 2;
  selectedServices.forEach((label, index) => {
    const center = iconStart + index * iconSpace;
    doc
      .save()
      .circle(center, 455, 18)
      .lineWidth(0.8)
      .dash(2, { space: 2 })
      .strokeColor('#ffffff')
      .stroke()
      .restore();
    if (!drawEmoji(coverIcons[index] ?? '⭐', center - 9, 446, 18)) {
      doc
        .font('Bold')
        .fontSize(12)
        .fillColor(index % 2 ? '#45c7e8' : GOLD)
        .text('◆', center - 12, 447, {
          width: 24,
          align: 'center',
        });
    }
    doc
      .font('Body')
      .fontSize(5.2)
      .fillColor('#ffffff')
      .text(label, center - 30, 481, {
        width: 60,
        align: 'center',
      });
  });
  doc
    .save()
    .rect(0, H - 39, W, 39)
    .fillOpacity(0.86)
    .fill('#ffffff')
    .restore();
  doc.font('Bold').fontSize(4.8).fillColor(INK);
  doc.text(`Consultant: ${consultant?.name ?? company?.name ?? '-'}`, 18, H - 23, { width: 180 });
  doc.text(`Phone: ${consultant?.phone ?? company?.phone ?? '-'}`, 208, H - 23, {
    width: 175,
    align: 'center',
  });
  doc.text(`Email: ${consultant?.email ?? company?.email ?? '-'}`, 390, H - 23, {
    width: 185,
    align: 'right',
    ellipsis: true,
  });

  // Overview ---------------------------------------------------------------
  addContentPage();
  doc
    .font('Times-Roman')
    .fontSize(11)
    .fillColor(NAVY)
    .text(
      `A personalized travel experience exclusively designed for ${input.quotation.customerName}`,
      M,
      86,
      { width: CONTENT_W, align: 'center' },
    );
  doc.save().lineWidth(1).strokeColor('#7aa7ff');
  doc.moveTo(2, 107).lineTo(2, 215).stroke();
  doc.moveTo(2, 107).lineTo(7, 109).stroke();
  doc.moveTo(2, 215).lineTo(7, 213).stroke();
  doc.restore();
  doc
    .font('Body')
    .fontSize(7.6)
    .fillColor(INK)
    .text(
      `Dear ${input.quotation.customerName},\n\nGreetings from ${company?.name ?? 'our travel team'}.\n\nOur sales team has prepared this quotation regarding your upcoming trip. Please go through it and let us know if you need any changes in the provided services. You can reach out to us using the contacts below.`,
      25,
      129,
      { width: W - 50, lineGap: 3.2 },
    );

  const overviewTop = 250;
  rounded(M, overviewTop, CONTENT_W, 170, '#ffffff', LINE, 10);
  topRule(overviewTop, TEAL);
  doc
    .font('Body')
    .fontSize(12)
    .fillColor(INK)
    .text('Trip Overview', M + 31, overviewTop + 20);
  pill(
    `#${input.quotation.quotationNumber.replace(/\D/g, '').slice(-5) || input.quotation.quotationNumber}`,
    W - M - 108,
    overviewTop + 15,
    {
      fill: TEAL,
      color: '#ffffff',
      minWidth: 84,
      height: 24,
      size: 6,
    },
  );
  const overviewRows = [
    ['🌍', 'DESTINATION', input.quotation.destinations || input.quotation.destinationSummary, TEAL],
    ['👥', 'GUEST', input.quotation.customerName, GREEN],
    [
      '🕘',
      'DURATION',
      durationLabel(
        input.quotation.durationNights,
        input.quotation.travelStartDate,
        input.quotation.travelEndDate,
      ),
      TEAL,
    ],
    ['📅', 'TRAVEL DATE', date(input.quotation.travelStartDate), '#f29e2e'],
    [
      '🧳',
      'TRAVELERS',
      [
        `${input.quotation.adults} Adults`,
        input.quotation.childrenWithBed ? `${input.quotation.childrenWithBed} CWB` : null,
        input.quotation.childrenWithoutBed ? `${input.quotation.childrenWithoutBed} CWOB` : null,
        input.quotation.infants ? `${input.quotation.infants} Inf` : null,
      ]
        .filter(Boolean)
        .join(', '),
      RED,
    ],
  ] as const;
  const drawOverviewIcon = (kind: string, left: number, top: number, color: string) => {
    const x = left + 10;
    const yy = top + 10;
    doc.save().lineWidth(1.15).strokeColor(color).fillColor(color);
    if (kind === 'destination') {
      doc.circle(x, yy, 9).stroke();
      doc.ellipse(x, yy, 4.2, 9).stroke();
      doc
        .moveTo(x - 8, yy - 3)
        .lineTo(x + 8, yy - 3)
        .stroke();
      doc
        .moveTo(x - 8, yy + 3)
        .lineTo(x + 8, yy + 3)
        .stroke();
    } else if (kind === 'guest') {
      doc.circle(x, yy - 4, 3.2).fill();
      doc.roundedRect(x - 6, yy + 1, 12, 7, 3).fill();
    } else if (kind === 'duration') {
      doc.circle(x, yy, 9).stroke();
      doc
        .moveTo(x, yy)
        .lineTo(x, yy - 5)
        .stroke();
      doc
        .moveTo(x, yy)
        .lineTo(x + 4, yy + 2)
        .stroke();
    } else if (kind === 'date') {
      doc.roundedRect(x - 9, yy - 7, 18, 16, 2).stroke();
      doc.rect(x - 9, yy - 7, 18, 5).fill(color);
      doc
        .moveTo(x - 4, yy + 2)
        .lineTo(x + 5, yy + 2)
        .stroke();
      doc
        .moveTo(x - 4, yy + 5)
        .lineTo(x + 3, yy + 5)
        .stroke();
    } else {
      doc.roundedRect(x - 8, yy - 5, 16, 13, 2).stroke();
      doc.roundedRect(x - 4, yy - 9, 8, 5, 2).stroke();
      doc
        .moveTo(x - 8, yy)
        .lineTo(x + 8, yy)
        .stroke();
    }
    doc.restore();
  };
  overviewRows.forEach(([, label, value, color], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const left = M + 31 + column * 160;
    const top = overviewTop + 63 + row * 57;
    drawOverviewIcon(
      ['destination', 'guest', 'duration', 'date', 'travelers'][index] ?? 'travelers',
      left,
      top,
      color,
    );
    doc
      .font('Body')
      .fontSize(5.2)
      .fillColor(color)
      .text(label, left + 32, top + 1, { width: 118 });
    doc
      .font('Body')
      .fontSize(7.1)
      .fillColor(INK)
      .text(value, left + 32, top + 17, { width: 118, height: 27 });
  });

  const investmentTop = 435;
  rounded(M, investmentTop, CONTENT_W, 194, '#ffffff', LINE, 10);
  topRule(investmentTop, TEAL);
  doc
    .font('Body')
    .fontSize(12)
    .fillColor(INK)
    .text('Investment Summary', M + 31, investmentTop + 21);
  pill(input.version.currency, W - M - 91, investmentTop + 15, {
    fill: TEAL,
    color: '#ffffff',
    minWidth: 67,
    height: 23,
    size: 6,
  });
  doc
    .moveTo(M + 29, investmentTop + 54)
    .lineTo(W - M - 195, investmentTop + 54)
    .lineWidth(0.6)
    .strokeColor(LINE)
    .stroke();
  const priceRows = [
    ['Per Adult', input.quotation.adults, input.version.perAdultPrice],
    ['CWB', input.quotation.childrenWithBed, input.version.perChildWithBedPrice],
    ['CWOB', input.quotation.childrenWithoutBed, input.version.perChildWithoutBedPrice],
    ['Infant', input.quotation.infants, input.version.perInfantPrice],
  ].filter(([, count]) => asNumber(count) > 0);
  priceRows.forEach(([label, count, value], index) => {
    const rowTop = investmentTop + 65 + index * 25;
    if (!drawEmoji('👥', M + 29, rowTop - 2, 14)) doc.circle(M + 35, rowTop + 5, 5).fill(TEAL);
    doc
      .font('Body')
      .fontSize(7)
      .fillColor(MUTED)
      .text(`${label} (x${count})`, M + 51, rowTop, { width: 175 });
    doc
      .font('Body')
      .fontSize(7)
      .fillColor(INK)
      .text(money(value, input.version.currency), M + 225, rowTop, { width: 70, align: 'right' });
    doc
      .moveTo(M + 29, rowTop + 15)
      .lineTo(M + 300, rowTop + 15)
      .lineWidth(0.45)
      .strokeColor(LINE)
      .stroke();
  });
  rounded(W - M - 176, investmentTop + 56, 153, 121, TEAL, TEAL, 17);
  doc
    .font('Body')
    .fontSize(5.5)
    .fillColor('#b9dbe9')
    .text('TOTAL PACKAGE', W - M - 166, investmentTop + 77, { width: 133, align: 'center' });
  doc
    .font('Body')
    .fontSize(15)
    .fillColor('#ffffff')
    .text(
      money(input.version.finalAmount, input.version.currency),
      W - M - 166,
      investmentTop + 103,
      { width: 133, align: 'center' },
    );
  doc
    .font('Body')
    .fontSize(4.8)
    .fillColor('#b9dbe9')
    .text(
      input.version.taxNote || 'Inclusive of all taxes, excluding TCS',
      W - M - 166,
      investmentTop + 151,
      { width: 133, align: 'center' },
    );

  if (asNumber(input.version.initialPaymentAmount) > 0) {
    const bookingTop = 654;
    rounded(M, bookingTop, CONTENT_W, 64, '#ffffff', LINE, 10);
    topRule(bookingTop, GREEN);
    drawEmoji('💳', M + 27, bookingTop + 18, 17);
    doc
      .font('Body')
      .fontSize(9.3)
      .fillColor(INK)
      .text('Secure Your Booking', M + 53, bookingTop + 17);
    doc
      .font('Body')
      .fontSize(6)
      .fillColor(MUTED)
      .text(
        `Pay ${money(input.version.initialPaymentAmount, input.version.currency, 2)} to confirm your booking.`,
        M + 31,
        bookingTop + 41,
      );
    pill('Pay Now', W - M - 137, bookingTop + 20, {
      fill: GREEN,
      color: '#ffffff',
      minWidth: 108,
      height: 31,
      size: 7.5,
    });
  }

  // Flights ----------------------------------------------------------------
  const flightDetails = input.version.flightDetails as FlightDetails | null;
  const journeys: Array<{ label: string; journey: FlightJourney }> = [];
  if (flightDetails?.outbound?.segments?.length)
    journeys.push({ label: 'OUTBOUND', journey: flightDetails.outbound });
  if (flightDetails?.returnJourney?.segments?.length)
    journeys.push({ label: 'RETURN', journey: flightDetails.returnJourney });
  let flightPage = 0;
  if (flightDetails?.include) {
    if (flightDetails.entryMode === 'IMAGE') {
      const flightImages = input.images?.flights?.length
        ? input.images.flights
        : input.images?.flight
          ? [{ description: null, image: input.images.flight }]
          : [];
      flightImages.forEach((item) => {
        const description = item.description?.trim() || '';
        addContentPage(flightDetails.sectionTitle || 'Flight Itinerary');
        const metaTop = y;
        if (description)
          doc
            .font('Body')
            .fontSize(9)
            .fillColor(INK)
            .text(description, M, metaTop, { width: CONTENT_W - 105, height: 34, ellipsis: true });
        if (item.url) {
          const buttonW = 74;
          const buttonH = 26;
          const buttonX = M + CONTENT_W - buttonW;
          const buttonY = metaTop - 4;
          rounded(buttonX, buttonY, buttonW, buttonH, '#f8fafc', LINE, 6);
          doc
            .font('Bold')
            .fontSize(7.5)
            .fillColor(NAVY)
            .text('Preview', buttonX + 10, buttonY + 9, { width: 42 });
          doc
            .moveTo(buttonX + 56, buttonY + 16)
            .lineTo(buttonX + 64, buttonY + 8)
            .strokeColor(NAVY)
            .lineWidth(1)
            .stroke();
          doc
            .moveTo(buttonX + 59, buttonY + 8)
            .lineTo(buttonX + 64, buttonY + 8)
            .lineTo(buttonX + 64, buttonY + 13)
            .stroke();
          doc.link(buttonX, buttonY, buttonW, buttonH, item.url);
        }
        const imageTop = description || item.url ? metaTop + 38 : metaTop;
        rounded(M, imageTop, CONTENT_W, 504, '#ffffff', LINE, 8);
        drawImage(item.image, M + 12, imageTop + 12, CONTENT_W - 24, 480, 'contain');
      });
    }
    if (flightDetails.entryMode !== 'IMAGE') {
      for (const { label, journey } of journeys) {
        for (const segment of journey.segments ?? []) {
          addContentPage(flightPage === 0 ? 'Flight Itinerary' : undefined);
          const top = flightPage === 0 ? 130 : 85;
          rounded(M, top, CONTENT_W, 27, PALE, NAVY, 4);
          doc.roundedRect(M, top, 80, 27, 4).fill(NAVY);
          doc
            .font('Bold')
            .fontSize(5.8)
            .fillColor('#ffffff')
            .text(label, M, top + 10, { width: 80, align: 'center' });
          doc
            .font('Body')
            .fontSize(6.2)
            .fillColor(NAVY)
            .text(
              `${journey.fromCity || segment.from || '-'}  >  ${journey.toCity || segment.to || '-'}`,
              M + 96,
              top + 10,
              { width: CONTENT_W - 110, lineBreak: false },
            );

          const cardTop = top + 38;
          const sideWidth = 102;
          const cardHeight = 160;
          rounded(M, cardTop, sideWidth, cardHeight, '#ffffff', LINE, 5);
          doc
            .moveTo(M + 1, cardTop)
            .lineTo(M + 1, cardTop + cardHeight)
            .lineWidth(2)
            .strokeColor(NAVY)
            .stroke();
          const airlineLogo = segment.airlineId
            ? input.images?.airlines?.[segment.airlineId]
            : null;
          if (!drawImage(airlineLogo, M + 18, cardTop + 11, 66, 41, 'contain')) {
            doc.rect(M + 19, cardTop + 12, 64, 39).fill('#f7f7f7');
            doc
              .font('Bold')
              .fontSize(7)
              .fillColor(RED)
              .text(clean(segment.airlineName) || 'AIRLINE', M + 19, cardTop + 26, {
                width: 64,
                align: 'center',
              });
          }
          doc
            .font('Bold')
            .fontSize(6)
            .fillColor(INK)
            .text(clean(segment.airlineName) || 'Airline', M + 9, cardTop + 61, {
              width: sideWidth - 18,
              align: 'center',
            });
          doc
            .font('Body')
            .fontSize(5)
            .fillColor(MUTED)
            .text(clean(segment.flightNumber), M + 9, cardTop + 76, {
              width: sideWidth - 18,
              align: 'center',
            });
          pill(clean(segment.travelClass) || 'ECONOMY', M + 11, cardTop + cardHeight - 27, {
            fill: NAVY,
            color: '#ffffff',
            minWidth: sideWidth - 22,
            height: 18,
            size: 5,
          });

          const mainX = M + sideWidth;
          const mainW = CONTENT_W - sideWidth;
          rounded(mainX, cardTop, mainW, cardHeight, '#ffffff', LINE, 5);
          const departureX = mainX + 44;
          const arrivalX = mainX + mainW - 132;
          doc
            .font('Body')
            .fontSize(5)
            .fillColor(MUTED)
            .text('DEPARTURE', departureX, cardTop + 11, { width: 78, align: 'center' });
          doc
            .font('Bold')
            .fontSize(7)
            .fillColor(NAVY)
            .text(clean(segment.from) || clean(journey.fromCity) || '-', departureX, cardTop + 22, {
              width: 78,
              align: 'center',
            });
          doc
            .font('Body')
            .fontSize(5)
            .fillColor(MUTED)
            .text('ARRIVAL', arrivalX, cardTop + 11, { width: 78, align: 'center' });
          doc
            .font('Bold')
            .fontSize(7)
            .fillColor(NAVY)
            .text(clean(segment.to) || clean(journey.toCity) || '-', arrivalX, cardTop + 22, {
              width: 78,
              align: 'center',
            });
          const arcLeft = mainX + 139;
          const arcRight = mainX + mainW - 139;
          const arcTop = cardTop + 17;
          doc
            .moveTo(arcLeft, arcTop + 15)
            .bezierCurveTo(
              arcLeft + 42,
              arcTop - 2,
              arcRight - 42,
              arcTop - 2,
              arcRight,
              arcTop + 15,
            )
            .lineWidth(1.4)
            .strokeColor(NAVY)
            .stroke();
          doc
            .circle(arcLeft, arcTop + 15, 3)
            .fill(NAVY)
            .circle(arcRight, arcTop + 15, 3)
            .fill(NAVY);
          doc
            .font('Body')
            .fontSize(7)
            .fillColor(NAVY)
            .text('✈', (arcLeft + arcRight) / 2 - 8, arcTop - 1, { width: 16, align: 'center' });
          doc
            .font('Bold')
            .fontSize(4.5)
            .fillColor(NAVY)
            .text(clean(segment.duration), (arcLeft + arcRight) / 2 - 30, arcTop + 15, {
              width: 60,
              align: 'center',
            });
          doc
            .moveTo(mainX + 15, cardTop + 54)
            .lineTo(mainX + mainW - 12, cardTop + 54)
            .lineWidth(0.5)
            .strokeColor(LINE)
            .stroke();
          const timing = [
            ['DATE', date(segment.departureDate, true), false],
            [
              'DEPARTS',
              segment.departureTime ? formatClock12Hour(segment.departureTime) : '-',
              true,
            ],
            ['DATE', date(segment.arrivalDate, true), false],
            ['ARRIVES', segment.arrivalTime ? formatClock12Hour(segment.arrivalTime) : '-', true],
          ] as const;
          timing.forEach(([key, value, emphasized], index) => {
            const left = mainX + 17 + index * 92;
            if (index > 0)
              doc
                .moveTo(left - 5, cardTop + 62)
                .lineTo(left - 5, cardTop + 94)
                .lineWidth(0.45)
                .strokeColor(LINE)
                .stroke();
            doc
              .font('Body')
              .fontSize(4.7)
              .fillColor(MUTED)
              .text(key, left, cardTop + 63, { width: 82, align: 'center' });
            doc
              .font(emphasized ? 'Bold' : 'Body')
              .fontSize(emphasized ? 10 : 5.7)
              .fillColor(emphasized ? NAVY : INK)
              .text(value, left, cardTop + 76, { width: 82, align: 'center' });
          });
          let baggageX = mainX + 31;
          if (segment.cabinLuggage) {
            doc
              .font('Body')
              .fontSize(6)
              .fillColor(MUTED)
              .text('▥', baggageX - 15, cardTop + 104);
            baggageX +=
              pill(`Cabin ${segment.cabinLuggage}`, baggageX, cardTop + 100, {
                minWidth: 55,
                height: 17,
                size: 5.2,
              }) + 10;
          }
          if (segment.checkInLuggage)
            pill(`Check-in ${segment.checkInLuggage}`, baggageX, cardTop + 100, {
              minWidth: 67,
              height: 17,
              size: 5.2,
            });
          if (segment.notes)
            doc
              .font('Body')
              .fontSize(5.2)
              .fillColor(MUTED)
              .text(`Note: ${clean(segment.notes)}`, mainX + 15, cardTop + 128, {
                width: mainW - 30,
                height: 22,
                ellipsis: true,
              });
          flightPage += 1;
        }
      }
    }
  }

  // Hotels -----------------------------------------------------------------
  const selectedHotels = input.version.hotels
    .map((hotel, index) => ({ hotel, index }))
    .filter(({ hotel }) => hotel.selected);
  if (selectedHotels.length) {
    addContentPage('Hotel Accommodations');
    for (const { hotel, index } of selectedHotels) {
      if (y + 132 > BODY_BOTTOM) addContentPage('Hotel Accommodations');
      const top = y;
      rounded(M, top, CONTENT_W, 126, '#ffffff', LINE, 8);
      doc
        .moveTo(M + 1, top)
        .lineTo(M + 1, top + 126)
        .lineWidth(2)
        .strokeColor(NAVY)
        .stroke();
      if (!drawImage(input.images?.hotels?.[index], M + 17, top + 11, 106, 95)) {
        doc.roundedRect(M + 17, top + 11, 106, 95, 7).fill('#e7edf4');
        drawEmoji('🏨', M + 53, top + 42, 34);
      }
      const infoX = M + 136;
      doc
        .font('Bold')
        .fontSize(8)
        .fillColor(NAVY)
        .text(hotel.hotelName, infoX, top + 13, { width: 360 });
      pill(hotel.city || 'Destination', infoX, top + 32, {
        fill: NAVY,
        color: '#ffffff',
        minWidth: 58,
        height: 17,
        size: 5,
      });
      const hotelFacts: Array<[string, string, string]> = [
        [
          'CHECK-IN',
          date(hotel.checkInDate),
          hotel.checkInTime && hotel.showCheckInTime !== false
            ? formatClock12Hour(hotel.checkInTime)
            : '',
        ],
        [
          'CHECK-OUT',
          date(hotel.checkOutDate),
          hotel.checkOutTime && hotel.showCheckOutTime !== false
            ? formatClock12Hour(hotel.checkOutTime)
            : '',
        ],
      ];
      // Room type / meal plan are optional: an empty value renders no fact
      // box at all (no "-", "N/A" or other placeholder). Remaining boxes
      // reflow into the vacated columns.
      const roomType = hotel.roomType?.trim();
      if (roomType) {
        hotelFacts.push([
          'ROOM TYPE',
          roomType,
          hotel.rooms != null ? `${hotel.rooms} Room${hotel.rooms === 1 ? '' : 's'}` : '',
        ]);
      }
      const mealPlan = hotel.mealPlan?.trim();
      if (mealPlan) {
        hotelFacts.push(['MEAL PLAN', mealPlan, `${hotel.nights} Nights`]);
      }
      hotelFacts.forEach(([label, value, sub], factIndex) => {
        const left = infoX + factIndex * 88;
        rounded(left, top + 55, 82, 54, PALE_BLUE, PALE_BLUE, 6);
        doc
          .font('Body')
          .fontSize(4.5)
          .fillColor(MUTED)
          .text(label, left + 8, top + 64, { width: 66 });
        doc
          .font('Bold')
          .fontSize(5.7)
          .fillColor(NAVY)
          .text(value, left + 8, top + 80, { width: 66, height: 14 });
        doc
          .font('Body')
          .fontSize(4.7)
          .fillColor(MUTED)
          .text(sub, left + 8, top + 98, { width: 66 });
      });
      y += 141;
    }
  }

  // Day-wise itinerary -----------------------------------------------------
  const sightseeing = input.version.sightseeingDetails as {
    include?: boolean;
    days?: SightDay[];
  } | null;
  const days: SightDay[] =
    sightseeing?.include && sightseeing.days?.length
      ? sightseeing.days
      : input.version.itinerary.map((day) => ({
          dayNumber: day.dayNumber,
          title: day.title,
          city: day.destination,
          mealsText: day.meals,
          activities: [{ name: day.title, description: day.description }],
        }));
  let activityPage = 0;
  for (const [dayIndex, day] of days.entries()) {
    const activities = day.activities?.length
      ? day.activities
      : [{ name: day.title ?? `Day ${day.dayNumber}`, description: '' }];
    for (const activity of activities) {
      addContentPage(activityPage === 0 ? 'Day Wise Itinerary' : undefined);
      const top = activityPage === 0 ? 132 : 85;
      topRule(top, NAVY);
      const activityImage =
        (activity.imageDocumentId
          ? input.images?.itineraryDocuments?.[activity.imageDocumentId]
          : null) ??
        (activity.imageUrl ? input.images?.itinerary?.[activity.imageUrl] : null) ??
        (activity.sightseeingId ? input.images?.sightseeing?.[activity.sightseeingId] : null);
      const imageValue = pdfActivityImageOrCover(activity, activityImage, input.images?.cover);
      if (!drawImage(imageValue, M + 11, top + 17, 165, 145)) {
        doc.roundedRect(M + 11, top + 17, 165, 145, 9).fill('#e3ebf3');
        drawEmoji('🌍', M + 73, top + 66, 42);
      }
      const dayX = M + 195;
      doc
        .font('Body')
        .fontSize(5)
        .fillColor(MUTED)
        .text('DAY', dayX, top + 18);
      doc
        .font('Bold')
        .fontSize(22)
        .fillColor(NAVY)
        .text(String(day.dayNumber ?? dayIndex + 1).padStart(2, '0'), dayX, top + 31);
      doc
        .moveTo(dayX + 51, top + 17)
        .lineTo(dayX + 51, top + 75)
        .lineWidth(0.7)
        .strokeColor('#b8c8dc')
        .stroke();
      const displayTitle =
        clean(activity.name) || stripItineraryDayPrefixes(day.title) || `Day ${day.dayNumber}`;
      doc
        .font('Bold')
        .fontSize(8.5)
        .fillColor(INK)
        .text(displayTitle, dayX + 66, top + 19, { width: 244, height: 35 });
      doc
        .font('Body')
        .fontSize(5.7)
        .fillColor(MUTED)
        .text(`${date(day.date, true)}${day.city ? `  ·  ${day.city}` : ''}`, dayX + 66, top + 52, {
          width: 244,
        });
      doc
        .moveTo(dayX, top + 75)
        .lineTo(W - M - 12, top + 75)
        .lineWidth(0.5)
        .strokeColor(LINE)
        .stroke();
      let metaTop = top + 88;
      if (activity.showTime !== false && activity.startTime) {
        doc.font('Bold').fontSize(5.8).fillColor(NAVY).text('Time', dayX, metaTop);
        doc
          .font('Body')
          .fontSize(6)
          .fillColor(INK)
          .text(
            `${formatClock12Hour(activity.startTime)}${activity.duration ? `  |  ${activity.duration}` : ''}`,
            dayX + 38,
            metaTop,
          );
        metaTop += 20;
      }
      const mealText =
        day.mealsText ||
        (day.meals?.breakfast
          ? `Breakfast (${day.mealMode === 'NO_TRANSFER' ? 'No Transfer' : 'Hotel'})`
          : null) ||
        (day.meals?.lunch ? 'Lunch' : null) ||
        (day.meals?.dinner ? 'Dinner' : null);
      if (mealText) {
        doc.font('Bold').fontSize(5.8).fillColor(NAVY).text('Meals', dayX, metaTop);
        doc.circle(dayX + 42, metaTop + 4, 4).fill(GOLD);
        doc
          .font('Body')
          .fontSize(5.8)
          .fillColor(INK)
          .text(mealText, dayX + 54, metaTop, { width: 185 });
        metaTop += 20;
      }
      const transfer = transferLabel(activity.dailyTransfer ?? day.dailyTransfer);
      if (transfer) pill(transfer, dayX, metaTop, { minWidth: 92, height: 18, size: 5.4 });

      const descriptionTop = top + 190;
      const richDescription = htmlToRichTextLines(activity.description);
      const descriptionTitle = displayTitle;
      const availableHeight = BODY_BOTTOM - descriptionTop - 11;
      let bodySize = 7.2;
      if (estimatedRichHeight(richDescription, CONTENT_W - 83, bodySize) + 48 > availableHeight)
        bodySize = 6.3;
      const bodyHeight = Math.min(
        availableHeight,
        Math.max(74, estimatedRichHeight(richDescription, CONTENT_W - 83, bodySize) + 47),
      );
      doc
        .moveTo(M + 1, descriptionTop)
        .lineTo(M + 1, descriptionTop + bodyHeight)
        .lineWidth(2)
        .strokeColor(NAVY)
        .stroke();
      doc
        .circle(M + 23, descriptionTop + 20, 6)
        .lineWidth(3)
        .strokeColor(NAVY)
        .stroke();
      doc
        .font('Bold')
        .fontSize(8)
        .fillColor(INK)
        .text(descriptionTitle, M + 48, descriptionTop + 13, { width: CONTENT_W - 60 });
      drawRichLines(
        richDescription,
        M + 48,
        descriptionTop + 36,
        CONTENT_W - 65,
        bodySize,
        INK,
        1.38,
      );
      doc
        .moveTo(M, descriptionTop + bodyHeight)
        .lineTo(W - M, descriptionTop + bodyHeight)
        .lineWidth(0.7)
        .strokeColor('#b7c5d8')
        .stroke();
      activityPage += 1;
    }
  }

  // Travel services and add-ons -------------------------------------------
  const serviceRows = input.version.services
    .map((service, index) => ({ service, index }))
    .filter(({ service }) => !service.addOnServiceId && service.serviceType !== 'OTHER_ADD_ON');
  const addOns = input.version.services
    .map((service, index) => ({ service, index }))
    .filter(({ service }) => Boolean(service.addOnServiceId));
  if (serviceRows.length || addOns.length || input.version.includeVisa) {
    addContentPage('Travel Services');
    for (const [rowIndex, { service, index }] of serviceRows.entries()) {
      const rowHeight = 138;
      if (y + rowHeight > BODY_BOTTOM) addContentPage('Travel Services');
      const top = y;
      rounded(M, top, CONTENT_W, rowHeight - 8, '#ffffff', LINE, 9);
      const imageLeft = rowIndex % 2 === 0;
      const imageX = imageLeft ? M + 11 : W - M - 168;
      const imageW = 157;
      if (!drawImage(input.images?.services?.[index], imageX, top + 12, imageW, 112)) {
        doc.roundedRect(imageX, top + 12, imageW, 112, 8).fill('#e5edf4');
        drawEmoji(service.serviceType === 'CRUISE' ? '🚢' : '🚌', imageX + 58, top + 45, 40);
      }
      const tabWidth = 92;
      const tabX = imageLeft ? M : W - M - tabWidth;
      doc.roundedRect(tabX, top, tabWidth, 25, 4).fill(NAVY);
      doc
        .font('Bold')
        .fontSize(4.8)
        .fillColor('#ffffff')
        .text(serviceLabel(service.serviceType).toUpperCase(), tabX, top + 10, {
          width: tabWidth,
          align: 'center',
        });
      const textX = imageLeft ? M + 188 : M + 20;
      const textW = CONTENT_W - 210;
      doc
        .font('Bold')
        .fontSize(10)
        .fillColor(NAVY)
        .text(service.name, textX, top + 31, { width: textW });
      let tagX = textX;
      if (service.city)
        tagX += pill(service.city, tagX, top + 53, { minWidth: 64, height: 18, size: 5 }) + 8;
      if (asNumber(service.quantity) > 0)
        pill(`${clean(service.quantity)}`, tagX, top + 53, {
          fill: '#fff2d2',
          color: '#a16a00',
          minWidth: 40,
          height: 18,
          size: 5,
        });
      doc
        .font('Body')
        .fontSize(6.1)
        .fillColor(MUTED)
        .text(clean(service.description) || clean(service.notes), textX, top + 92, {
          width: textW,
          height: 28,
          ellipsis: true,
        });
      y += rowHeight + 9;
    }

    const hasVisaCard =
      input.version.includeVisa && !addOns.some(({ service }) => /visa/i.test(service.name));
    if (addOns.length || hasVisaCard) {
      if (y + 135 > BODY_BOTTOM) addContentPage();
      sectionHeading('Add-On Services', y);
      y += 42;
      const cards: Array<{
        name: string;
        description: string;
        amount: unknown;
        index: number | null;
      }> = [
        ...addOns.map(({ service, index }) => ({
          name: service.name,
          description: clean(service.description) || clean(service.notes),
          amount: asNumber(service.quantity) * asNumber(service.unitSellingPrice),
          index,
        })),
        ...(hasVisaCard
          ? [
              {
                name: input.version.visaSectionTitle || 'Visa',
                description: [input.version.visaDestination, input.version.visaType]
                  .filter(Boolean)
                  .join(' · '),
                amount: input.version.visaAmount,
                index: null,
              },
            ]
          : []),
      ];
      for (const [cardIndex, card] of cards.entries()) {
        if (y + 103 > BODY_BOTTOM) addContentPage('Add-On Services');
        rounded(M, y, CONTENT_W, 94, PALE, PALE, 7);
        doc.circle(M + 20, y + 17, 9).fill(NAVY);
        doc
          .font('Bold')
          .fontSize(5.5)
          .fillColor('#ffffff')
          .text(String(cardIndex + 1), M + 13, y + 13, { width: 14, align: 'center' });
        doc
          .font('Bold')
          .fontSize(7)
          .fillColor(NAVY)
          .text(card.name, M + 43, y + 13, { width: 340 });
        pill(money(card.amount, input.version.currency), W - M - 62, y + 8, {
          minWidth: 50,
          height: 18,
          size: 5.2,
        });
        const lines = htmlToRichTextLines(card.description);
        drawRichLines(lines, M + 43, y + 50, CONTENT_W - 72, 5.9, MUTED, 1.32);
        y += 103;
      }
    }
  }

  // Policies ---------------------------------------------------------------
  const policies = [
    ['INCLUSIONS', GREEN, input.version.inclusionsHtml, input.version.inclusions],
    ['EXCLUSIONS', RED, input.version.exclusionsHtml, input.version.exclusions],
    ['PAYMENT POLICIES', NAVY, input.version.paymentPolicies, []],
    ['CANCELLATION POLICIES', NAVY, input.version.cancellationPolicies, []],
    ['BOOKING TERMS & CONDITIONS', NAVY, input.version.bookingTerms, input.version.terms],
  ] as const;
  const visiblePolicies = policies
    .map(([title, color, html, rows]) => ({
      title,
      color,
      lines: html
        ? htmlToRichTextLines(html)
        : rows.map((row) => [{ text: `• ${row.content}`, bold: false }]),
    }))
    .filter((policy) => policy.lines.length);
  if (visiblePolicies.length) {
    addContentPage('Policies');
    const measuredPolicyHeight = (size: number, lineFactor: number) =>
      visiblePolicies.reduce(
        (total, policy) =>
          total + 46 + estimatedRichHeight(policy.lines, CONTENT_W - 64, size, lineFactor),
        0,
      );
    let policySize = 5.65;
    let policyLineFactor = 1.2;
    const availablePolicyHeight = BODY_BOTTOM - y;
    if (measuredPolicyHeight(policySize, policyLineFactor) > availablePolicyHeight) {
      policySize = 5.05;
      policyLineFactor = 1.13;
    }
    for (const [policyIndex, policy] of visiblePolicies.entries()) {
      const bodyHeight = estimatedRichHeight(
        policy.lines,
        CONTENT_W - 64,
        policySize,
        policyLineFactor,
      );
      const sectionHeight = 46 + bodyHeight;
      if (y + sectionHeight > BODY_BOTTOM) addContentPage('Policies');
      const top = y;
      doc
        .save()
        .fillOpacity(0.08)
        .roundedRect(M, top, CONTENT_W, 34, 8)
        .fill(policy.color)
        .restore();
      doc.circle(M + 31, top + 17, 12).fill(policy.color);
      doc
        .font('Bold')
        .fontSize(6.5)
        .fillColor('#ffffff')
        .text(String(policyIndex + 1), M + 23, top + 13, { width: 16, align: 'center' });
      doc
        .font('Bold')
        .fontSize(8.3)
        .fillColor(policy.color)
        .text(policy.title, M + 53, top + 12, { width: CONTENT_W - 74 });
      doc
        .moveTo(M + 1, top)
        .lineTo(M + 1, top + sectionHeight - 6)
        .lineWidth(2)
        .strokeColor(policy.color)
        .stroke();
      const end = drawRichLines(
        policy.lines,
        M + 31,
        top + 40,
        CONTENT_W - 62,
        policySize,
        INK,
        policyLineFactor,
      );
      doc
        .moveTo(M + 29, end + 4)
        .lineTo(M + 170, end + 4)
        .lineWidth(0.7)
        .strokeColor(policy.color)
        .stroke();
      y = Math.max(top + sectionHeight, end + 10);
    }
  }

  // Thank-you page ---------------------------------------------------------
  doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill(NAVY_DARK);
  doc.save().fillColor('#ffffff').fillOpacity(0.045);
  [368, 405, 442, 479, 516, 553].forEach((left) => doc.rect(left, 0, 21, H).fill());
  doc.circle(80, 135, 110).fill();
  doc.circle(410, 505, 64).fill();
  doc.circle(525, 670, 86).fill();
  doc.restore();
  doc.rect(127, 85, 341, 4).fill(GOLD);
  doc
    .font('Bold')
    .fontSize(30)
    .fillColor(GOLD)
    .text('THANK YOU', M, 132, { width: CONTENT_W, align: 'center' });
  doc
    .font('Body')
    .fontSize(9.5)
    .fillColor('#b7c5df')
    .text('for choosing us as your travel partner', M, 176, { width: CONTENT_W, align: 'center' });
  doc.moveTo(227, 203).lineTo(368, 203).lineWidth(2).strokeColor(GOLD).stroke();
  drawDiamond(W / 2, 203, 7, GOLD);
  doc
    .font('Body')
    .fontSize(7.1)
    .fillColor('#aebbd1')
    .text(
      `Dear ${input.quotation.customerName}, we truly appreciate your trust in us. Our team is committed to crafting an unforgettable travel experience for you. Should you have any questions, feel free to reach out anytime.`,
      95,
      235,
      { width: W - 190, align: 'center', lineGap: 1.5 },
    );
  const contactCards = [
    ['☎', 'CALL US', company?.phone, '#45b7f0'],
    ['◉', 'WHATSAPP', company?.phone, '#21df6f'],
    ['✉', 'EMAIL US', company?.email, '#ff4b4b'],
    ['⌘', 'VISIT US', company?.website, '#b85ac8'],
  ] as const;
  contactCards.forEach(([icon, label, value, color], index) => {
    const left = index % 2 === 0 ? M : W / 2 + 10;
    const top = 285 + Math.floor(index / 2) * 64;
    const width = W / 2 - 62;
    doc.roundedRect(left, top, width, 52, 8).fill(NAVY_CARD);
    doc.rect(left, top, 8, 52).fill(color);
    doc
      .font('Bold')
      .fontSize(10)
      .fillColor(color)
      .text(icon, left + 25, top + 16, { width: 18, align: 'center' });
    doc
      .font('Bold')
      .fontSize(5.3)
      .fillColor(color)
      .text(label, left + 51, top + 12);
    doc
      .font('Body')
      .fontSize(6.5)
      .fillColor('#d4deed')
      .text(value || '-', left + 51, top + 31, { width: width - 65, ellipsis: true });
  });
  drawDiamond(M + 12, 430, 4, GOLD);
  if (company?.address)
    doc
      .font('Body')
      .fontSize(6)
      .fillColor('#aebbd1')
      .text(company.address, 220, 420, { width: 185, align: 'center' });
  doc
    .roundedRect(56, 472, W - 112, 63, 10)
    .lineWidth(1.5)
    .strokeColor(GOLD)
    .stroke();
  const achievements = [
    [company?.tripsSold ?? '-', 'Trips Completed'],
    [
      company?.operatingSinceYear
        ? `${new Date().getFullYear() - company.operatingSinceYear}+`
        : '-',
      'Years Experience',
    ],
    ['GST', 'Registered Company'],
  ];
  achievements.forEach(([value, label], index) => {
    const left = 67 + index * 160;
    if (index > 0)
      doc
        .moveTo(left - 6, 483)
        .lineTo(left - 6, 524)
        .lineWidth(0.7)
        .strokeColor('#aebbd1')
        .stroke();
    doc
      .font('Bold')
      .fontSize(14)
      .fillColor(GOLD)
      .text(String(value), left, 484, { width: 145, align: 'center' });
    doc
      .font('Body')
      .fontSize(5.2)
      .fillColor('#9fb0ce')
      .text(String(label), left, 512, { width: 145, align: 'center' });
  });
  doc
    .font('Body')
    .fontSize(4.8)
    .fillColor('#647799')
    .text(
      [
        company?.tan ? `TAN: ${company.tan}` : null,
        company?.taxRegistrationNumber ? `GST: ${company.taxRegistrationNumber}` : null,
      ]
        .filter(Boolean)
        .join('  |  '),
      M,
      568,
      { width: CONTENT_W, align: 'center' },
    );
  doc.rect(127, 583, 341, 3).fill(GOLD);
  doc
    .font('Bold')
    .fontSize(8.5)
    .fillColor(GOLD)
    .text((company?.name ?? 'TRAVEL COMPANY').toUpperCase(), M, 604, {
      width: CONTENT_W,
      align: 'center',
    });
  doc
    .font('Body')
    .fontSize(5.5)
    .fillColor('#8192b1')
    .text('Your Trusted Travel Partner', M, 623, { width: CONTENT_W, align: 'center' });

  const range = doc.bufferedPageRange();
  for (const pageIndex of numberedPages) {
    doc.switchToPage(pageIndex);
    pageFooter(pageIndex, range.count);
  }
  doc.end();
  return complete;
}
