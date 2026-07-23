import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { DashboardPage } from './DashboardPage';

const response = (data: unknown, ok = true) =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: async () =>
      ok
        ? { success: true, data }
        : { success: false, error: { code: 'INTERNAL_ERROR', message: 'failed' } },
  }) as Response;

const fullCaps = {
  canViewLeads: true,
  canViewQuotations: true,
  canViewBookings: true,
  canViewFinancials: true,
  canViewVendors: true,
  canViewVendorFinancials: true,
  canViewFollowUps: true,
};

const analytics = (overrides: Record<string, unknown> = {}) => ({
  period: { key: 'THIS_YEAR', from: null, to: null, timezone: 'Asia/Kolkata' },
  capabilities: fullCaps,
  leads: {
    totalLeads: 40,
    convertedLeads: 12,
    lostLeads: 8,
    qualifiedLeads: 10,
    hotLeads: 6,
    quotationRequired: 5,
    readyToBook: 3,
    conversionRate: 30,
    winRate: 60,
  },
  quotations: {
    totalQuotations: 20,
    acceptedQuotations: 12,
    rejectedQuotations: 8,
    totalQuotedValue: '500000.00',
    quotationAcceptanceRate: 60,
  },
  bookings: {
    totalBookings: 12,
    confirmedBookings: 8,
    pendingConfirmation: 2,
    travelInProgress: 1,
    completed: 1,
    cancelled: 0,
  },
  financials: {
    totalCustomerAmount: '600000.00',
    totalPayable: '640000.00',
    customerPaymentsReceived: '400000.00',
    customerOutstanding: '240000.00',
    totalRefunded: '20000.00',
    netRevenue: '380000.00',
    totalCost: '300000.00',
    totalVendorOutstanding: '50000.00',
    grossProfit: '340000.00',
    netProfit: '80000.00',
    profitMarginPercentage: '53.1200',
  },
  leadSources: [
    { source: 'REFERRAL', label: 'Referral', count: 20, percentage: 50 },
    { source: 'WEBSITE', label: 'Website', count: 12, percentage: 30 },
  ],
  topDestinations: [
    { destination: 'Goa', enquiryCount: 15 },
    { destination: 'Dubai', enquiryCount: 9 },
  ],
  staffConversions: [
    {
      userId: 'u1',
      displayName: 'Aditi Rao',
      totalLeads: 20,
      convertedLeads: 8,
      lostLeads: 4,
      conversionRate: 40,
      rank: 1,
    },
  ],
  staffFinancials: [
    {
      userId: 'u1',
      displayName: 'Aditi Rao',
      bookingCount: 6,
      revenue: '300000.00',
      netRevenue: '280000.00',
      grossProfit: '120000.00',
      netProfit: '60000.00',
      marginPercentage: '20.0000',
      rank: 1,
    },
  ],
  ...overrides,
});

const operations = (overrides: Record<string, unknown> = {}) => ({
  capabilities: fullCaps,
  priorityFollowUps: {
    totalCount: 1,
    viewAllPath: '/follow-ups',
    items: [
      {
        followUpId: 'f1',
        queryId: 'q1',
        queryNumber: 'QRY-2026-000001',
        customerName: 'Ravi Kumar',
        assignedTo: 'Aditi Rao',
        leadType: 'HOT',
        overdue: true,
      },
    ],
  },
  nearTravelDates: {
    totalCount: 1,
    viewAllPath: '/queries',
    items: [
      {
        queryId: 'q2',
        queryNumber: 'QRY-2026-000002',
        customerName: 'Meera Shah',
        destinationSummary: 'Goa',
        daysUntilTravel: 4,
      },
    ],
  },
  upcomingTrips: {
    totalCount: 1,
    viewAllPath: '/bookings',
    items: [
      {
        bookingId: 'b1',
        bookingNumber: 'BK-2026-000001',
        customerName: 'Ravi Kumar',
        destinationSummary: 'Goa',
        daysUntilTravel: 12,
      },
    ],
  },
  pendingCompletion: {
    totalCount: 1,
    viewAllPath: '/bookings',
    items: [
      {
        bookingId: 'b2',
        bookingNumber: 'BK-2026-000002',
        customerName: 'Sara Khan',
        operationalStatus: 'TRAVEL_IN_PROGRESS',
        daysOverdue: 2,
      },
    ],
  },
  clientPaymentsDue: {
    totalCount: 1,
    viewAllPath: '/bookings',
    items: [
      {
        scheduleId: 's1',
        bookingId: 'b3',
        bookingNumber: 'BK-2026-000003',
        customerName: 'Ravi Kumar',
        label: 'Advance',
        amount: '25000.00',
        overdue: true,
      },
    ],
  },
  vendorPaymentsDue: {
    totalCount: 1,
    viewAllPath: '/vendors',
    items: [
      {
        payableId: 'p1',
        vendorId: 'v1',
        vendorName: 'Ground Handler',
        bookingNumber: 'BK-2026-000004',
        payableNumber: 'VP-2026-000001',
        outstandingAmount: '18000.00',
      },
    ],
  },
  ...overrides,
});

function stub(analyticsData: unknown, operationsData: unknown, ok = true) {
  const mock = vi.fn(async (request: RequestInfo | URL) =>
    String(request).includes('/dashboard/operations')
      ? response(operationsData, ok)
      : response(analyticsData, ok),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

const renderDashboard = () =>
  renderWithProviders(
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/queries/:id" element={<div>Lead page</div>} />
      <Route path="/bookings/:id" element={<div>Booking page</div>} />
    </Routes>,
    { route: '/dashboard' },
  );

describe('Phase 16 dashboard page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the analytics tab by default with lead KPIs', async () => {
    stub(analytics(), operations());
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Total leads')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('Converted leads')).toBeInTheDocument();
    // No account/session panel remains from the old dashboard.
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
  });

  it('shows financial tiles and the profit table with financial permission', async () => {
    stub(analytics(), operations());
    renderDashboard();
    await screen.findByText('Total leads');
    expect(screen.getByText('Agency revenue')).toBeInTheDocument();
    expect(screen.getAllByText('Net profit').length).toBeGreaterThan(0);
    expect(screen.getByText('Top performers — profit earned')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
  });

  it('omits financial tiles and profit table without financial permission', async () => {
    stub(
      analytics({
        capabilities: { ...fullCaps, canViewFinancials: false },
        financials: undefined,
        staffFinancials: undefined,
      }),
      operations(),
    );
    renderDashboard();
    await screen.findByText('Total leads');
    expect(screen.queryByText('Agency revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('Top performers — profit earned')).not.toBeInTheDocument();
    // Non-financial lead panels still render.
    expect(screen.getByText('Lead sources')).toBeInTheDocument();
  });

  it('renders the lead-source and destination charts with accessible values', async () => {
    stub(analytics(), operations());
    renderDashboard();
    await screen.findByText('Lead sources');
    // Legend carries the real counts and percentages.
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Top destination enquiries')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Goa: 15' })).toBeInTheDocument();
  });

  it('renders the staff conversion table', async () => {
    stub(analytics(), operations());
    renderDashboard();
    await screen.findByText('Top performers — conversion rate');
    expect(screen.getAllByText('Aditi Rao').length).toBeGreaterThan(0);
  });

  it('switches to the operations tab and shows actionable panels', async () => {
    stub(analytics(), operations());
    renderDashboard();
    await screen.findByText('Total leads');
    await userEvent.click(screen.getByRole('button', { name: 'operations' }));
    expect(await screen.findByText('Priority follow-ups')).toBeInTheDocument();
    expect(screen.getByText('Near travel dates')).toBeInTheDocument();
    expect(screen.getByText('Upcoming trips')).toBeInTheDocument();
    expect(screen.getByText('Pending completion')).toBeInTheDocument();
    expect(screen.getByText('Client payments due')).toBeInTheDocument();
    expect(screen.getByText('Vendor payments due')).toBeInTheDocument();
    // Row content and View All links.
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /View all/ }).length).toBeGreaterThan(0);
  });

  it('omits client and vendor payment panels without financial permission', async () => {
    stub(analytics(), operations({ clientPaymentsDue: undefined, vendorPaymentsDue: undefined }));
    renderDashboard();
    await screen.findByText('Total leads');
    await userEvent.click(screen.getByRole('button', { name: 'operations' }));
    await screen.findByText('Priority follow-ups');
    expect(screen.queryByText('Client payments due')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor payments due')).not.toBeInTheDocument();
  });

  it('exposes the period selector and custom range fields', async () => {
    const mock = stub(analytics(), operations());
    renderDashboard();
    await screen.findByText('Total leads');
    await userEvent.selectOptions(screen.getByLabelText('Dashboard period'), 'CUSTOM');
    expect(screen.getByLabelText('Custom from date')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Custom from date'), '2026-01-01');
    await userEvent.type(screen.getByLabelText('Custom to date'), '2026-06-30');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) =>
          String(url).includes('period=CUSTOM&from=2026-01-01&to=2026-06-30'),
        ),
      ).toBe(true),
    );
  });

  it('shows an error state when analytics fails', async () => {
    stub(analytics(), operations(), false);
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('shows empty panel states', async () => {
    stub(
      analytics({ leadSources: [], topDestinations: [], staffConversions: [] }),
      operations({
        priorityFollowUps: { totalCount: 0, viewAllPath: '/follow-ups', items: [] },
      }),
    );
    renderDashboard();
    await screen.findByText('Total leads');
    await userEvent.click(screen.getByRole('button', { name: 'operations' }));
    expect(await screen.findByText('Nothing pending.')).toBeInTheDocument();
  });
});
