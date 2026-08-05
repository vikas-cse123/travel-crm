import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { CreateBookingFromLeadPage } from './CreateBookingFromLeadPage';

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const previewData = {
  lead: {
    id: 'lead-1',
    customerName: 'Aarav Mehta',
    phone: '+91 98765 43210',
    email: 'aarav@example.test',
    travelStartDate: '2026-10-10',
    travelEndDate: '2026-10-14',
    adults: 2,
    childrenWithBed: 1,
    childrenWithoutBed: 0,
    infants: 0,
    rooms: 1,
    travellerSummary: '2A, 1 CWB',
    assignedToId: 'me',
    assignedToName: 'Owner',
  },
  quotation: {
    id: 'quote-1',
    quotationNumber: 'QT-2026-000001',
    versionId: 'ver-1',
    versionNumber: 1,
    title: 'Singapore Package for Aarav Mehta',
    currency: 'INR',
    finalAmount: '3500.00',
    destinationSummary: 'Singapore',
    servicesCount: 2,
    itineraryCount: 1,
  },
  customer: null,
  company: { timezone: 'Asia/Kolkata', defaultGstRate: 0, defaultGstMode: 'ADDITIVE' },
};

const existingCustomerPreview = {
  ...previewData,
  customer: { customerId: 'cust-1', customerNumber: 'CUS-000010', displayName: 'Aarav Mehta' },
};

function stubPreview(customerMatch: unknown, lookups?: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (url.includes('/bookings/from-lead/preview')) {
      return response({ ...previewData, customer: customerMatch });
    }
    if (url.includes('/bookings/lookups')) return response(lookups ?? { users: [] });
    if (options?.method === 'POST' && url.includes('/bookings/from-lead')) {
      const body = JSON.parse(String(options.body));
      calls.push({ url, body });
      return response({ id: 'booking-1', bookingNumber: 'BK-1' });
    }
    return response({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  });
  vi.stubGlobal('fetch', mock);
  return calls;
}

describe('Create Booking from Lead page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the main heading and blue strip with the lead name', async () => {
    stubPreview(null);
    renderWithProviders(
      <CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />,
    );
    await screen.findByText('Create Booking from Lead: Aarav Mehta');
    expect(screen.getByRole('heading', { name: 'Create Booking' })).toBeInTheDocument();
  });

  it('shows the Lead Information panel with phone, email, duration and traveller summary', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByText('aarav@example.test')).toBeInTheDocument();
    expect(screen.getByText(/4 Nights \/ 5 Days/)).toBeInTheDocument();
    expect(screen.getByText('2A, 1 CWB')).toBeInTheDocument();
    expect(screen.getByText('Booking Confirmed')).toBeInTheDocument();
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    expect(screen.getByText(/₹3,500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Services will be imported with profit tracking\./)).toBeInTheDocument();
  });

  it('shows the New Customer card when no customer match exists', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.getByRole('heading', { name: 'New Customer' })).toBeInTheDocument();
    expect(
      screen.getByText(/A new customer will be created when the booking is created/),
    ).toBeInTheDocument();
  });

  it('shows the Existing Customer card when a customer matches', async () => {
    stubPreview(existingCustomerPreview.customer);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.getByText(/Existing Customer/)).toBeInTheDocument();
    expect(screen.getByText(/CUS-000010/)).toBeInTheDocument();
    expect(screen.getByText(/linked to the existing customer/)).toBeInTheDocument();
  });

  it('prefills the booking title and total customer amount from the finalized quotation', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.getByLabelText(/Booking Title/)).toHaveValue('Aarav Mehta - Singapore Package for Aarav Mehta');
    expect(screen.getByLabelText(/Total Customer Amount/)).toHaveValue(3500);
  });

  it('renders the TCS checkbox and all GST options including dynamic company default', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.getByRole('checkbox', { name: /TCS Exempt/ })).toBeInTheDocument();
    const gst = screen.getByLabelText(/GST Rate/);
    const options = within(gst).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(
      expect.arrayContaining([
        'Default (0% Additive)',
        '0% - No GST',
        '5% - Additive',
        '5% - Inclusive',
        '18% - Additive',
        '18% - Inclusive',
      ]),
    );
  });

  it('renders Place of Supply field', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.getByLabelText(/Place of Supply/)).toBeInTheDocument();
  });

  it('does not render Customer Information or customer editing controls', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    expect(screen.queryByText('Customer Information')).not.toBeInTheDocument();
    expect(screen.queryByText(/Select Different Customer/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create New Customer/)).not.toBeInTheDocument();
    expect(screen.queryByText('Foreign National')).not.toBeInTheDocument();
  });

  it('defaults the first reminder to 2 days before at 11:00 AM', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Booking Reminders');
    expect(screen.getByLabelText(/Days Before Travel/)).toHaveValue('2');
    expect(screen.getByLabelText(/Reminder Time/)).toHaveValue('11:00');
  });

  it('adds and removes reminder rows', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Booking Reminders');
    await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
    expect(screen.getAllByLabelText(/Days Before Travel/)).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: /Remove reminder/ })[0]!);
    expect(screen.getAllByLabelText(/Days Before Travel/)).toHaveLength(1);
  });

  it('submits a single create-booking request with the correct payload', async () => {
    const calls = stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Lead Information');
    await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]!.body).toMatchObject({
      leadId: 'lead-1',
      quotationId: 'quote-1',
      title: 'Aarav Mehta - Singapore Package for Aarav Mehta',
      totalSellingAmount: 3500,
      reminders: [{ daysBefore: 2, dueTime: '11:00' }],
    });
  });

  it('Back to Lead navigates to the source lead', async () => {
    stubPreview(null);
    const view = renderWithProviders(
      <CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />,
    );
    await screen.findByText('Lead Information');
    const back = screen.getByRole('link', { name: /Back to Lead/ });
    expect(back).toHaveAttribute('href', '/queries/lead-1');
    view.unmount();
  });
});
