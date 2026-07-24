import PDFDocument from 'pdfkit';
import { drawHeaderLogo } from '../../services/pdf/company-branding.js';

const date = (value: Date | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(value) : '—';

export async function renderBookingConfirmationPdf(input: {
  company: {
    name: string;
    email: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    primaryColor: string;
    logo?: Buffer | null;
  };
  booking: {
    bookingNumber: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string;
    destinationSummary: string;
    travelStartDate: Date | null;
    travelEndDate: Date | null;
    currency: string;
    totalSellingAmount: unknown;
    totalCustomerPaid: unknown;
    totalCustomerOutstanding: unknown;
    sourceTerms: unknown;
    travellers: Array<{
      title: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
    }>;
    services: Array<{
      name: string;
      serviceType: string;
      city: string | null;
      startDate: Date | null;
      endDate: Date | null;
      confirmationStatus: string;
      confirmationNumber: string | null;
    }>;
    itinerary: Array<{
      dayNumber: number;
      title: string;
      destination: string;
      description: string;
      meals: string | null;
      overnightLocation: string | null;
    }>;
  };
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
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
    doc.moveDown(0.8).fillColor(color).font('Helvetica-Bold').fontSize(14).text(value);
    doc.moveDown(0.3).fillColor('#0f172a').font('Helvetica').fontSize(10);
  };
  doc.rect(0, 0, 595, 108).fill(color);
  drawHeaderLogo(doc, input.company.logo ?? null, { x: 427, y: 30, width: 120, height: 48 });
  // Clip an overlong company name to the header band so it cannot overflow.
  doc
    .fillColor('#fff')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(input.company.name, 48, 35, { width: 360, height: 44, ellipsis: true });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(
      [input.company.email, input.company.phone, input.company.website].filter(Boolean).join(' • '),
      48,
      82,
      { width: 360, height: 20, ellipsis: true },
    );
  doc
    .fillColor('#0f172a')
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('Booking Confirmation', 48, 138);
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text(input.booking.bookingNumber);

  heading('Customer and travel');
  doc.text(`Customer: ${input.booking.customerName} • ${input.booking.customerPhone}`);
  if (input.booking.customerEmail) doc.text(`Email: ${input.booking.customerEmail}`);
  doc.text(`Destination: ${input.booking.destinationSummary}`);
  doc.text(`Travel: ${date(input.booking.travelStartDate)} – ${date(input.booking.travelEndDate)}`);

  if (input.booking.travellers.length) {
    heading('Travellers');
    input.booking.travellers.forEach((traveller, index) =>
      doc.text(
        `${index + 1}. ${[traveller.title, traveller.firstName, traveller.middleName, traveller.lastName].filter(Boolean).join(' ')}`,
      ),
    );
  }
  if (input.booking.services.length) {
    heading('Confirmed services');
    input.booking.services.forEach((service) =>
      doc.text(
        `• ${service.name}${service.city ? ` — ${service.city}` : ''} • ${service.confirmationStatus.replaceAll('_', ' ')}${service.confirmationNumber ? ` • Confirmation ${service.confirmationNumber}` : ''}`,
      ),
    );
  }
  if (input.booking.itinerary.length) {
    heading('Itinerary');
    input.booking.itinerary.forEach((day) => {
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
      doc.moveDown(0.3);
    });
  }
  heading('Payment summary');
  doc.text(`Booking value: ${input.booking.currency} ${String(input.booking.totalSellingAmount)}`);
  doc.text(`Paid: ${input.booking.currency} ${String(input.booking.totalCustomerPaid)}`);
  doc.text(
    `Outstanding: ${input.booking.currency} ${String(input.booking.totalCustomerOutstanding)}`,
  );
  if (Array.isArray(input.booking.sourceTerms) && input.booking.sourceTerms.length) {
    heading('Terms');
    input.booking.sourceTerms.forEach((term) => doc.text(`• ${String(term)}`));
  }
  heading('Agency contact');
  doc.text(
    [input.company.address, input.company.phone, input.company.email].filter(Boolean).join(' • '),
  );

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
