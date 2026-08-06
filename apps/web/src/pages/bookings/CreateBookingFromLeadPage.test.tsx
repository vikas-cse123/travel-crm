import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { CreateBookingFromLeadPage } from './CreateBookingFromLeadPage';

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const basePreview = {
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
  duration: {
    travelStart: '2026-10-10',
    travelEnd: '2026-10-14',
    totalNights: 4,
    totalDays: 5,
    durationLabel: '4 Nights / 5 Days',
  },
  customer: null,
  customerState: null,
  company: { timezone: 'Asia/Kolkata', defaultGstRate: 0, defaultGstMode: 'ADDITIVE' },
};

const existingCustomerPreview = {
  ...basePreview,
  customer: {
    customerId: 'cust-1',
    customerNumber: 'CUS-000010',
    displayName: 'Aarav Mehta',
    state: 'Karnataka',
  },
};

// getByText only sees direct text nodes, so rows built as
// `<p><span>Label:</span> value</p>` need a full-textContent matcher.
const rowWithText = (prefix: string) => (_content: string, element?: Element | null) =>
  element?.tagName === 'P' && element.textContent?.includes(prefix) === true;
const emailRow = rowWithText('Email:');
const durationRow = rowWithText('Duration:');
const quotationRow = rowWithText('Quotation:');

function stubPreview(customerMatch: unknown, previewData: unknown = basePreview) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (url.includes('/bookings/from-lead/preview')) {
      return response({ ...basePreview, ...(previewData as object), customer: customerMatch });
    }
    if (url.includes('/bookings/lookups')) return response({ users: [] });
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

interface SubmittedBody {
  leadId: string;
  quotationId: string;
  title: string;
  totalSellingAmount: number;
  tcsExempt: boolean;
  gstRate?: number | null;
  gstMode?: string | null;
  placeOfSupply?: string | null;
  customer?: { displayName: string; phone: string; email: string | null; state: string | null };
  reminders: Array<{ daysBefore: number; dueTime: string }>;
}

const submittedBody = (calls: Array<{ url: string; body: unknown }>) =>
  calls[0]!.body as SubmittedBody;

describe('Create Booking from Lead page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the heading, blue strip and full-width Lead Information panel', async () => {
    stubPreview(null);
    renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
    await screen.findByText('Create Booking from Lead: Aarav Mehta');
    expect(screen.getByRole('heading', { name: 'Create Booking' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lead Information' })).toBeInTheDocument();
  });

  describe('Lead information', () => {
    it('shows the email row when a valid email exists', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText('aarav@example.test')).toBeInTheDocument();
      expect(screen.getByText(emailRow).textContent).toContain('Email:');
      expect(screen.getByText(emailRow).textContent).toContain('aarav@example.test');
    });

    it('omits the entire email row when email is unavailable', async () => {
      stubPreview(null, {
        lead: { ...basePreview.lead, email: null },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.queryByText(emailRow)).not.toBeInTheDocument();
      expect(screen.queryByText('aarav@example.test')).not.toBeInTheDocument();
    });

    it('does not render "Email: —" for a whitespace-only email', async () => {
      stubPreview(null, {
        lead: { ...basePreview.lead, email: '   ' },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.queryByText(emailRow)).not.toBeInTheDocument();
      expect(screen.queryByText(/Email:\s*—/)).not.toBeInTheDocument();
    });

    it('shows phone, duration and traveller summary', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
      expect(screen.getByText('2A, 1 CWB')).toBeInTheDocument();
      expect(screen.getByText('Booking Confirmed')).toBeInTheDocument();
      expect(screen.getByText(/₹3,500\.00/)).toBeInTheDocument();
      expect(screen.getByText(/Services will be imported with profit tracking\./)).toBeInTheDocument();
    });

    it('shows the travel start date beside the duration', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText('10 Oct 2026')).toBeInTheDocument();
    });
  });

  describe('Duration', () => {
    it('renders the API-provided duration label', async () => {
      stubPreview(null, {
        duration: {
          travelStart: '2026-11-13',
          travelEnd: '2026-11-18',
          totalNights: 5,
          totalDays: 6,
          durationLabel: '5 Nights / 6 Days',
        },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText(durationRow).textContent).toContain('5 Nights / 6 Days');
      expect(screen.getByText('13 Nov 2026')).toBeInTheDocument();
    });

    it('renders a same-day duration label', async () => {
      stubPreview(null, {
        duration: {
          travelStart: '2026-10-10',
          travelEnd: '2026-10-10',
          totalNights: 0,
          totalDays: 1,
          durationLabel: '0 Nights / 1 Day',
        },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText(durationRow).textContent).toContain('0 Nights / 1 Day');
    });

    it('shows a dash when the API has no resolvable duration', async () => {
      stubPreview(null, {
        duration: {
          travelStart: null,
          travelEnd: null,
          totalNights: null,
          totalDays: null,
          durationLabel: null,
        },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText(durationRow).textContent).toBe('Duration: —');
    });
  });

  describe('Quotation display', () => {
    it('renders the quotation code and version together', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText(/QT-2026-000001 · Version 1/)).toBeInTheDocument();
    });

    it('does not display the internal database UUID', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.queryByText(/quote-1/)).not.toBeInTheDocument();
      expect(screen.queryByText(/ver-1/)).not.toBeInTheDocument();
    });

    it('falls back safely when the quotation code is missing', async () => {
      stubPreview(null, {
        quotation: { ...basePreview.quotation, quotationNumber: '' },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByText(quotationRow).textContent).toBe('Quotation: Version 1');
      expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    });
  });

  describe('Yellow New Customer notice removal', () => {
    it('does not render the yellow New Customer card when no customer matches', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      expect(screen.queryByText(/No existing customer was found for this phone number/)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'New Customer' })).not.toBeInTheDocument();
      // The new-customer form is shown instead.
      expect(screen.getByRole('heading', { name: 'Create New Customer' })).toBeInTheDocument();
    });

    it('does not render the yellow New Customer card when an existing customer matches', async () => {
      stubPreview(existingCustomerPreview.customer);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.queryByText(/No existing customer was found for this phone number/)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'New Customer' })).not.toBeInTheDocument();
    });
  });

  describe('TCS Exempt', () => {
    it('defaults the TCS Exempt checkbox to false with the compact label', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByRole('checkbox', { name: /TCS Exempt - Exempt this booking from TCS calculation/ })).not.toBeChecked();
      expect(
        screen.getByText(/Check this option if this international booking should be exempted from TCS calculation/),
      ).toBeInTheDocument();
    });

    it('sends tcsExempt: false in the default create request', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls).tcsExempt).toBe(false);
    });

    it('sends tcsExempt: true when the checkbox is checked', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      await userEvent.click(screen.getByRole('checkbox', { name: /TCS Exempt/ }));
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls).tcsExempt).toBe(true);
    });

    it('keeps the GST rate independent of the TCS Exempt checkbox', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      await userEvent.click(screen.getByRole('checkbox', { name: /TCS Exempt/ }));
      await userEvent.selectOptions(screen.getByLabelText(/GST Rate/), '18:ADDITIVE');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls)).toMatchObject({ tcsExempt: true, gstRate: 18, gstMode: 'ADDITIVE' });
    });
  });

  describe('GST and Place of Supply', () => {
    it('renders the GST options including the dynamic company default', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
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

    it('submits the chosen GST rate and mode', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      await userEvent.selectOptions(screen.getByLabelText(/GST Rate/), '18:INCLUSIVE');
      await userEvent.selectOptions(screen.getByLabelText(/Place of Supply/), 'Karnataka');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls)).toMatchObject({
        gstRate: 18,
        gstMode: 'INCLUSIVE',
        placeOfSupply: 'Karnataka',
      });
    });
  });

  describe('Create New Customer', () => {
    it('shows the Create New Customer heading, not Customer Information', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByRole('heading', { name: 'Create New Customer' });
      expect(screen.queryByText('Customer Information')).not.toBeInTheDocument();
      expect(screen.queryByText('Select Different Customer')).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });

    it('prefills lead name, phone and email into the new-customer form', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      expect(screen.getByLabelText(/Full Name/)).toHaveValue('Aarav Mehta');
      expect(screen.getByLabelText(/^Phone/)).toHaveValue('+91 98765 43210');
      expect(screen.getByLabelText(/Email/)).toHaveValue('aarav@example.test');
    });

    it('keeps the email input empty and optional when the lead has no email', async () => {
      stubPreview(null, {
        lead: { ...basePreview.lead, email: null },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      expect(screen.getByLabelText(/Email/)).toHaveValue('');
      expect(screen.queryByText(emailRow)).not.toBeInTheDocument();
    });

    it('shows the State dropdown with the canonical Indian state options', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      const state = screen.getByLabelText(/^State/);
      const options = within(state).getAllByRole('option').map((o) => o.textContent);
      expect(options[0]).toBe('-- Select State --');
      expect(options).toContain('Karnataka');
      expect(options).toContain('Maharashtra');
      expect(options).toContain('Delhi');
    });

    it('prefills State from the preview customerState', async () => {
      stubPreview(null, { customerState: 'Gujarat' });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      expect(screen.getByLabelText(/^State/)).toHaveValue('Gujarat');
    });

    it('blocks submission without State for a domestic customer', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      expect(screen.getByText('State is required for a domestic customer.')).toBeInTheDocument();
      await waitFor(() => expect(calls.length).toBe(0));
    });

    it('submits the selected State in the create request', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Karnataka');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls).customer).toEqual({
        displayName: 'Aarav Mehta',
        phone: '+91 98765 43210',
        email: 'aarav@example.test',
        state: 'Karnataka',
      });
    });

    it('allows a foreign national to submit without State', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      await userEvent.click(screen.getByRole('checkbox', { name: /Foreign National/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls).customer).toEqual({
        displayName: 'Aarav Mehta',
        phone: '+91 98765 43210',
        email: 'aarav@example.test',
        state: null,
      });
    });

    it('normalises a whitespace-only email to null in the request', async () => {
      const calls = stubPreview(null, {
        lead: { ...basePreview.lead, email: null },
      });
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls).customer?.email).toBeNull();
    });

    it('does not render the new-customer form when an existing customer matches', async () => {
      stubPreview(existingCustomerPreview.customer);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.queryByRole('heading', { name: 'Create New Customer' })).not.toBeInTheDocument();
      expect(screen.getByText(/linked to the existing customer CUS-000010 - Aarav Mehta/)).toBeInTheDocument();
    });

    it('opening the page does not create a customer', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Create New Customer');
      expect(calls).toHaveLength(0);
    });
  });

  describe('Booking Reminders', () => {
    it('defaults the first reminder to 2 days before at 11:00 AM', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Booking Reminders');
      expect(screen.getByLabelText(/Days Before Travel/)).toHaveValue('2');
      expect(screen.getByLabelText(/Reminder Time/)).toHaveValue('11:00');
    });

    it('shows the formatted travel start date in the reminder helper text', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Booking Reminders');
      expect(
        screen.getByText(/Set reminders before travel start date \(10 Oct 2026\)\. Reminders will be sent to the company admin and lead assignee\./),
      ).toBeInTheDocument();
    });

    it('adds a new reminder with a blank offset and no duplicate error', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Booking Reminders');
      await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
      const selects = screen.getAllByLabelText(/Days Before Travel/);
      expect(selects).toHaveLength(2);
      expect(selects[1]).toHaveValue('');
      expect(within(selects[1]!).getByText('Select...')).toBeInTheDocument();
      expect(screen.queryByText(/Duplicate reminder offsets/)).not.toBeInTheDocument();
    });

    it('disables offsets already selected in another row', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Booking Reminders');
      await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
      const selects = screen.getAllByLabelText(/Days Before Travel/);
      const secondOptions = within(selects[1]!).getAllByRole('option');
      expect(secondOptions.find((option) => option.getAttribute('value') === '2')).toHaveAttribute(
        'disabled',
      );
      expect(secondOptions.find((option) => option.getAttribute('value') === '3')).not.toHaveAttribute(
        'disabled',
      );
    });

    it('shows the inline duplicate error and blocks submission for a real duplicate', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Booking Reminders');
      await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
      const selects = screen.getAllByLabelText(/Days Before Travel/);
      fireEvent.change(selects[0]!, { target: { value: '2' } });
      fireEvent.change(selects[1]!, { target: { value: '2' } });
      expect(screen.getByText(/Duplicate reminder offsets are not allowed\./)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(0));
    });

    it('omits blank reminder rows from submission', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls).reminders).toEqual([{ daysBefore: 2, dueTime: '11:00' }]);
    });

    it('removes only the targeted reminder row', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Booking Reminders');
      await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
      await userEvent.click(screen.getByRole('button', { name: /Add Another Reminder/ }));
      const selects = screen.getAllByLabelText(/Days Before Travel/);
      expect(selects).toHaveLength(3);
      await userEvent.selectOptions(selects[0]!, '3');
      await userEvent.selectOptions(selects[2]!, '5');
      const removeButtons = screen.getAllByRole('button', { name: /Remove reminder/ });
      await userEvent.click(removeButtons[1]!);
      const remaining = screen.getAllByLabelText(/Days Before Travel/);
      expect(remaining).toHaveLength(2);
      expect(remaining[0]).toHaveValue('3');
      expect(remaining[1]).toHaveValue('5');
      expect(screen.queryByText(/Duplicate reminder offsets/)).not.toBeInTheDocument();
    });
  });

  describe('Submission', () => {
    it('prefills the booking title and total customer amount from the finalized quotation', async () => {
      stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      expect(screen.getByLabelText(/Booking Title/)).toHaveValue('Aarav Mehta - Singapore Package for Aarav Mehta');
      expect(screen.getByLabelText(/Total Customer Amount/)).toHaveValue(3500);
    });

    it('submits a single create-booking request with the correct payload', async () => {
      const calls = stubPreview(null);
      renderWithProviders(<CreateBookingFromLeadPage leadId="lead-1" quotationId="quote-1" />);
      await screen.findByText('Lead Information');
      await userEvent.selectOptions(screen.getByLabelText(/^State/), 'Goa');
      await userEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
      await waitFor(() => expect(calls.length).toBe(1));
      expect(submittedBody(calls)).toMatchObject({
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
});
