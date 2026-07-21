import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { BookingsPage } from './BookingsPage';
import { NewBookingPage } from './NewBookingPage';
import { BookingWorkspacePage } from './BookingWorkspacePage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));
const response = (data: unknown, ok = true) =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: async () =>
      ok
        ? { success: true, data }
        : { success: false, error: { code: 'INTERNAL_ERROR', message: 'failed' } },
  }) as Response;
const person = { id: 'user-1', fullName: 'Aditi Rao', username: 'owner' };
const booking = {
  id: '11111111-1111-4111-8111-111111111111',
  bookingNumber: 'BK-2026-000001',
  queryId: 'lead-1',
  quotationId: 'quote-1',
  quotationVersionId: 'version-1',
  customerName: 'Ravi Kumar',
  customerEmail: 'ravi@example.test',
  customerPhone: '9000012345',
  destinationSummary: 'Goa',
  travelStartDate: '2026-10-10T00:00:00.000Z',
  travelEndDate: '2026-10-14T00:00:00.000Z',
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  currency: 'INR',
  bookingStatus: 'CONFIRMED',
  operationalStatus: 'IN_PROGRESS',
  paymentStatus: 'PARTIALLY_PAID',
  bookedBy: person,
  assignedTo: person,
  sourceTitle: 'Goa package',
  manualCreationReason: null,
  internalNotes: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  attentionIndicators: ['CUSTOMER_BALANCE_DUE'],
  totalSellingAmount: '50000.00',
  totalCustomerPaid: '20000.00',
  totalCustomerOutstanding: '30000.00',
  totalCost: '25000.00',
  grossProfit: '25000.00',
  profitMarginPercentage: '50.0000',
  travellers: [
    {
      id: 'traveller-1',
      travellerType: 'ADULT',
      title: 'Mr',
      firstName: 'Ravi',
      middleName: null,
      lastName: 'Kumar',
      nationality: 'Indian',
      dateOfBirth: null,
      passportMasked: '••••4567',
      passportExpiresAt: '2027-01-01',
      visaStatus: 'APPROVED',
      isPrimaryTraveller: true,
      sequence: 1,
    },
  ],
  services: [
    {
      id: 'service-1',
      serviceType: 'HOTEL',
      name: 'Harbour Hotel',
      city: 'Goa',
      confirmationStatus: 'PENDING',
      confirmationNumber: null,
      supplierName: 'Hotel Co',
      supplierReference: null,
      customerSellingAmount: '30000.00',
      internalCostSnapshot: '18000.00',
      sequence: 1,
    },
  ],
  itinerary: [
    {
      id: 'day-1',
      dayNumber: 1,
      title: 'Arrival',
      destination: 'Goa',
      description: 'Airport transfer',
      sequence: 1,
    },
  ],
  paymentSchedules: [
    {
      id: 'schedule-1',
      installmentNumber: 1,
      label: 'Advance',
      amount: '25000.00',
      dueDate: '2026-09-01',
      status: 'PARTIALLY_PAID',
      notes: null,
    },
  ],
  payments: [
    {
      id: 'payment-1',
      paymentNumber: 'PAY-2026-000001',
      amount: '20000.00',
      currency: 'INR',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'RECEIVED',
      receivedAt: '2026-08-01',
      reversedAt: null,
      reversalReason: null,
      paymentScheduleId: 'schedule-1',
    },
  ],
  costs: [
    {
      id: 'cost-1',
      costCategory: 'HOTEL',
      supplierName: 'Hotel Co',
      description: 'Four nights',
      amount: '25000.00',
      currency: 'INR',
      costStatus: 'PAYABLE',
      dueDate: '2026-09-01',
      paidAt: null,
      bookingServiceId: 'service-1',
    },
  ],
  documents: [
    {
      id: 'document-1',
      travellerId: 'traveller-1',
      bookingServiceId: null,
      paymentId: null,
      documentType: 'PASSPORT',
      fileName: 'passport.pdf',
      originalFileName: 'passport.pdf',
      mimeType: 'application/pdf',
      fileSize: 1000,
      uploadStatus: 'AVAILABLE',
      visibility: 'INTERNAL',
      createdAt: '2026-07-21',
      uploadedBy: person,
    },
  ],
  notes: [
    {
      id: 'note-1',
      content: 'Customer called.',
      noteType: 'CUSTOMER_COMMUNICATION',
      createdAt: '2026-07-21',
      authorUser: person,
    },
  ],
  emailLogs: [
    {
      id: 'email-1',
      emailType: 'CONFIRMATION',
      recipientEmail: 'ravi@example.test',
      subject: 'Booking confirmation',
      status: 'SENT',
      sentAt: '2026-07-21',
      createdAt: '2026-07-21',
    },
  ],
  query: { id: 'lead-1', queryNumber: 'QRY-2026-000001', leadStage: 'BOOKING_CONFIRMED' },
  quotation: { id: 'quote-1', quotationNumber: 'QT-2026-000001', status: 'ACCEPTED' },
  quotationVersion: { id: 'version-1', versionNumber: 1, title: 'Goa', status: 'FINALIZED' },
};
const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});
const analytics = {
  totalBookings: 1,
  pendingConfirmation: 0,
  confirmed: 1,
  travelUpcoming: 1,
  travelInProgress: 0,
  completed: 0,
  cancelled: 0,
  overdueCustomerPayments: 0,
  bookingsDepartingNext7Days: 0,
  bookingsWithMissingTravellerDocuments: 0,
  servicesAwaitingConfirmation: 1,
  totalCustomerOutstanding: '30000.00',
};

describe('Phase 9 booking pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'bookings.view',
      'bookings.create',
      'bookings.update',
      'bookings.convert_from_quotation',
      'bookings.change_status',
      'bookings.manage_travellers',
      'bookings.manage_documents',
      'bookings.view_sensitive_documents',
      'bookings.view_financials',
      'bookings.manage_payments',
      'bookings.manage_costs',
      'bookings.send_confirmation',
      'bookings.export',
    ]);
  });

  it('renders analytics, a server-paginated row and URL-synchronised filters', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/analytics') ? response(analytics) : response(page([booking])),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<BookingsPage />);
    expect(await screen.findByText('BK-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getAllByText('₹30,000').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Search bookings'), 'Ravi');
    await userEvent.selectOptions(screen.getByLabelText('Booking status'), 'CONFIRMED');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('search=Ravi&bookingStatus=CONFIRMED'),
        ),
      ).toBe(true),
    );
  });

  it('shows empty/error states and hides financial columns without permission', async () => {
    const fetchEmpty = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/analytics')
        ? response({ ...analytics, totalBookings: 0 })
        : response(page([])),
    );
    vi.stubGlobal('fetch', fetchEmpty);
    const empty = renderWithProviders(<BookingsPage />);
    expect(await screen.findByText('No bookings found')).toBeInTheDocument();
    empty.unmount();
    auth.permissions.delete('bookings.view_financials');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/analytics')
          ? response(analytics)
          : response(
              page([
                {
                  ...booking,
                  totalSellingAmount: undefined,
                  totalCustomerPaid: undefined,
                  totalCustomerOutstanding: undefined,
                },
              ]),
            ),
      ),
    );
    renderWithProviders(<BookingsPage />);
    await screen.findByText('BK-2026-000001');
    expect(screen.queryByText('Selling')).not.toBeInTheDocument();
    expect(screen.queryByText('Outstanding')).not.toBeInTheDocument();
  });

  it('converts only the accepted quotation and navigates to the resulting workspace', async () => {
    const quotation = {
      id: 'quote-1',
      quotationNumber: 'QT-2026-000001',
      status: 'ACCEPTED',
      acceptedVersionId: 'version-1',
      customerName: 'Ravi Kumar',
      destinationSummary: 'Goa',
      adults: 2,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      rooms: 1,
      versions: [{ id: 'version-1', versionNumber: 1, finalAmount: '50000', currency: 'INR' }],
    };
    const fetchMock = vi.fn(async (_request: RequestInfo | URL, options?: RequestInit) =>
      options?.method === 'POST' ? response(booking) : response(quotation),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId/convert-to-booking" element={<NewBookingPage />} />
        <Route path="/bookings/:bookingId" element={<div>Created booking workspace</div>} />
      </Routes>,
      { route: '/quotations/quote-1/convert-to-booking' },
    );
    expect(await screen.findByText('Create booking from QT-2026-000001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create booking' }));
    expect(await screen.findByText('Created booking workspace')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).endsWith('/quotations/quote-1/convert-to-booking') &&
          options?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('validates and submits the manual booking workflow', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL, options?: RequestInit) =>
      String(request).endsWith('/bookings/lookups')
        ? response({ users: [person] })
        : options?.method === 'POST'
          ? response(booking)
          : response({ users: [person] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/bookings/new" element={<NewBookingPage />} />
        <Route path="/bookings/:bookingId" element={<div>Manual booking created</div>} />
      </Routes>,
      { route: '/bookings/new' },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create manual booking' }));
    expect(
      await screen.findByText('A clear manual-booking reason is required.'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Customer name'), 'Manual Customer');
    await userEvent.type(screen.getByLabelText('Phone'), '9000012345');
    await userEvent.type(screen.getByLabelText('Destination'), 'Kerala');
    await userEvent.clear(screen.getByLabelText('Total selling amount'));
    await userEvent.type(screen.getByLabelText('Total selling amount'), '50000');
    await userEvent.type(
      screen.getByLabelText('Reason for manual booking'),
      'Offline corporate confirmation',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create manual booking' }));
    expect(await screen.findByText('Manual booking created')).toBeInTheDocument();
  });

  it('renders the complete workspace with passport masking, financials and operational panels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/timeline')
          ? response({
              data: [
                {
                  id: 't1',
                  type: 'BOOKING_CREATED',
                  title: 'Booking created',
                  description: 'Booking',
                  timestamp: '2026-07-21',
                  actor: person,
                },
              ],
              pagination: {},
            })
          : response(booking),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/bookings/:bookingId" element={<BookingWorkspacePage />} />
      </Routes>,
      { route: `/bookings/${booking.id}` },
    );
    expect(await screen.findByText(/Bookings \/ BK-2026-000001/)).toBeInTheDocument();
    expect(screen.getByText('₹30,000.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Travellers' }));
    expect(screen.getByText(/Passport ••••4567/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(screen.getByText('Harbour Hotel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(screen.getByText('PAY-2026-000001')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Payment notes (required when unallocated)'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Costs' }));
    expect(screen.getByText(/Hotel Co · Four nights/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(await screen.findByText('Booking created')).toBeInTheDocument();
  });

  it('runs status, service confirmation, payment reversal and email actions', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL, options?: RequestInit) =>
      options?.method && options.method !== 'GET'
        ? response(booking)
        : String(request).includes('/timeline')
          ? response({ data: [], pagination: {} })
          : response(booking),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/bookings/:bookingId" element={<BookingWorkspacePage />} />
      </Routes>,
      { route: `/bookings/${booking.id}` },
    );
    await screen.findByText(/Bookings \/ BK-2026-000001/);
    await userEvent.selectOptions(screen.getByDisplayValue('Select next status'), 'ON_HOLD');
    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await userEvent.click(screen.getByRole('button', { name: 'Services' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Payments' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    await userEvent.type(screen.getByPlaceholderText('Payment reversal reason'), 'Duplicate entry');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reversal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Emails' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send confirmation' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) => String(url).endsWith('/status') && options?.method === 'PATCH',
        ),
      ).toBe(true);
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith('/services/service-1/status')),
      ).toBe(true);
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith('/payments/payment-1/reverse')),
      ).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/send-confirmation'))).toBe(
        true,
      );
    });
  });
});
