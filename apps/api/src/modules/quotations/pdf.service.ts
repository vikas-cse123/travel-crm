import PDFDocument from 'pdfkit';
import { drawHeaderLogo } from '../../services/pdf/company-branding.js';

const safe = (value: unknown) => String(value ?? '—');
const date = (value: Date | string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—';

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
  const bullets = (rows: Array<{ content: string }>) =>
    rows.forEach((row) => doc.text(`• ${row.content}`, { indent: 10 }));
  doc.rect(0, 0, 595, 110).fill(color);
  drawHeaderLogo(doc, input.company.logo ?? null, { x: 427, y: 32, width: 120, height: 50 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(input.company.name, 48, 38);
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(
      [input.company.email, input.company.phone, input.company.website]
        .filter(Boolean)
        .join('  •  '),
      48,
      72,
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
  if (input.version.inclusions.length) {
    heading('Inclusions');
    bullets(input.version.inclusions);
  }
  if (input.version.exclusions.length) {
    heading('Exclusions');
    bullets(input.version.exclusions);
  }
  if (input.version.terms.length) {
    heading('Terms and conditions');
    bullets(input.version.terms);
  }
  heading('Quotation total');
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(`${input.version.currency} ${safe(input.version.finalAmount)}`);
  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Valid until: ${date(input.quotation.validUntil)}`);
  if (input.version.notes) {
    heading('Notes');
    doc.text(input.version.notes);
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
