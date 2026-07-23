import PDFDocument from 'pdfkit';

/**
 * Customer-facing booking documents (Phase 15): invoice, tax invoice and
 * voucher. None of them ever include internal cost, vendor cost, vendor payable,
 * net profit, margin, internal notes, private master ids or bank details — those
 * are stripped by the caller before the data reaches these renderers.
 *
 * Tax labels are shown, but no statutory registration number is invented: a
 * GSTIN/tax id is printed only when the company actually has one on file.
 */

const date = (value: Date | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(value) : '—';

const amount = (currency: string, value: unknown) => `${currency} ${String(value ?? '0.00')}`;

export interface InvoiceCompany {
  name: string;
  email: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  primaryColor: string;
  /** Optional statutory tax registration; only printed when present. */
  taxRegistrationNumber?: string | null;
}

export interface InvoiceService {
  name: string;
  serviceType: string;
  city: string | null;
  startDate: Date | null;
  endDate: Date | null;
  confirmationStatus: string;
  confirmationNumber: string | null;
  supplierReference: string | null;
  customerSellingAmount?: string | null;
}

export interface InvoiceBooking {
  bookingNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  destinationSummary: string;
  travelStartDate: Date | null;
  travelEndDate: Date | null;
  currency: string;
  totalSellingAmount?: string | null;
  gstAmount?: string | null;
  tcsAmount?: string | null;
  totalPayable?: string | null;
  totalCustomerPaid?: string | null;
  totalCustomerOutstanding?: string | null;
  travellers: Array<{
    title: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
  }>;
  services: InvoiceService[];
}

function newDoc(company: InvoiceCompany, title: string, subtitle: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const color = /^#[0-9a-f]{6}$/i.test(company.primaryColor) ? company.primaryColor : '#2563eb';
  doc.rect(0, 0, 595, 108).fill(color);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text(company.name, 48, 35);
  doc
    .font('Helvetica')
    .fontSize(9)
    .text([company.email, company.phone, company.website].filter(Boolean).join(' • '), 48, 70);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text(title, 48, 138);
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text(subtitle);
  const heading = (value: string) => {
    doc.moveDown(0.8).fillColor(color).font('Helvetica-Bold').fontSize(14).text(value);
    doc.moveDown(0.3).fillColor('#0f172a').font('Helvetica').fontSize(10);
  };
  const finish = () => {
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
  };
  return { doc, heading, finish };
}

function customerBlock(
  doc: PDFKit.PDFDocument,
  heading: (v: string) => void,
  booking: InvoiceBooking,
) {
  heading('Customer and travel');
  doc.text(`Customer: ${booking.customerName} • ${booking.customerPhone}`);
  if (booking.customerEmail) doc.text(`Email: ${booking.customerEmail}`);
  doc.text(`Destination: ${booking.destinationSummary}`);
  doc.text(`Travel: ${date(booking.travelStartDate)} – ${date(booking.travelEndDate)}`);
}

function servicesBlock(
  doc: PDFKit.PDFDocument,
  heading: (v: string) => void,
  booking: InvoiceBooking,
  withAmount: boolean,
) {
  if (!booking.services.length) return;
  heading('Services');
  booking.services.forEach((service) => {
    const parts = [
      service.name,
      service.city ? `— ${service.city}` : '',
      withAmount && service.customerSellingAmount != null
        ? `• ${amount(booking.currency, service.customerSellingAmount)}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    doc.text(`• ${parts}`);
  });
}

/** Customer Invoice: amounts due, no taxes breakdown, no internal figures. */
export async function renderBookingInvoicePdf(input: {
  company: InvoiceCompany;
  booking: InvoiceBooking;
}) {
  const { doc, heading, finish } = newDoc(input.company, 'Invoice', input.booking.bookingNumber);
  customerBlock(doc, heading, input.booking);
  servicesBlock(doc, heading, input.booking, true);
  heading('Payment summary');
  doc.text(`Customer amount: ${amount(input.booking.currency, input.booking.totalSellingAmount)}`);
  doc.text(`Paid: ${amount(input.booking.currency, input.booking.totalCustomerPaid)}`);
  doc.text(`Due: ${amount(input.booking.currency, input.booking.totalCustomerOutstanding)}`);
  heading('Agency contact');
  doc.text(
    [input.company.address, input.company.phone, input.company.email].filter(Boolean).join(' • '),
  );
  return finish();
}

/** Tax Invoice: adds the GST/TCS breakdown and total payable. */
export async function renderBookingTaxInvoicePdf(input: {
  company: InvoiceCompany;
  booking: InvoiceBooking;
}) {
  const { doc, heading, finish } = newDoc(
    input.company,
    'Tax Invoice',
    input.booking.bookingNumber,
  );
  heading('Billed by');
  doc.text(input.company.name);
  if (input.company.address) doc.text(input.company.address);
  if (input.company.taxRegistrationNumber)
    doc.text(`Tax registration: ${input.company.taxRegistrationNumber}`);
  else doc.fillColor('#64748b').text('Tax registration: not on file').fillColor('#0f172a');
  customerBlock(doc, heading, input.booking);
  servicesBlock(doc, heading, input.booking, true);
  heading('Tax summary');
  doc.text(`Customer amount: ${amount(input.booking.currency, input.booking.totalSellingAmount)}`);
  doc.text(`GST: ${amount(input.booking.currency, input.booking.gstAmount)}`);
  doc.text(`TCS: ${amount(input.booking.currency, input.booking.tcsAmount)}`);
  doc.font('Helvetica-Bold');
  doc.text(`Total payable: ${amount(input.booking.currency, input.booking.totalPayable)}`);
  doc.font('Helvetica');
  doc.text(`Paid: ${amount(input.booking.currency, input.booking.totalCustomerPaid)}`);
  doc.text(`Due: ${amount(input.booking.currency, input.booking.totalCustomerOutstanding)}`);
  return finish();
}

/** Booking Voucher: operational, customer-safe, no financials at all. */
export async function renderBookingVoucherPdf(input: {
  company: InvoiceCompany;
  booking: InvoiceBooking;
}) {
  const { doc, heading, finish } = newDoc(
    input.company,
    'Booking Voucher',
    input.booking.bookingNumber,
  );
  customerBlock(doc, heading, input.booking);
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
        `• ${service.name}${service.city ? ` — ${service.city}` : ''} • ${service.confirmationStatus.replaceAll('_', ' ')}` +
          `${service.confirmationNumber ? ` • Confirmation ${service.confirmationNumber}` : ''}` +
          `${service.supplierReference ? ` • Ref ${service.supplierReference}` : ''}`,
      ),
    );
  }
  heading('Agency contact');
  doc.text(
    [input.company.address, input.company.phone, input.company.email].filter(Boolean).join(' • '),
  );
  return finish();
}
