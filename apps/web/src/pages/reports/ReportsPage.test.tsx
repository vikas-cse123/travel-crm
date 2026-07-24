import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PERMISSIONS } from '@interscale/shared';
import { renderWithProviders } from '@/test/utils';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { ReportsPage } from './ReportsPage';

const ok = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const fail = () =>
  ({
    ok: false,
    status: 500,
    json: async () => ({ success: false, error: { code: 'X', message: 'boom' } }),
  }) as Response;

const allCaps = {
  canViewLeads: true,
  canViewQuotations: true,
  canViewBookings: true,
  canViewFinancials: true,
  canViewVendors: true,
  canViewVendorFinancials: true,
  canViewCustomers: true,
  canViewClientPayments: true,
  canViewVendorPayables: true,
};

const period = {
  key: 'THIS_YEAR',
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-07-25T00:00:00.000Z',
  timezone: 'Asia/Kolkata',
};

/** Mirrors the server: an unauthorised block is omitted, never zero-filled. */
const summary = (capabilities = allCaps, overrides: Record<string, unknown> = {}) => ({
  period,
  capabilities,
  ...(capabilities.canViewLeads
    ? { leads: { total: 12, converted: 4, lost: 2, hot: 3, conversionRate: 33.3, winRate: 66.7 } }
    : {}),
  ...(capabilities.canViewQuotations
    ? {
        quotations: {
          total: 8,
          accepted: 3,
          rejected: 1,
          totalQuotedValue: '120000.00',
          acceptanceRate: 75,
        },
      }
    : {}),
  ...(capabilities.canViewBookings
    ? { bookings: { total: 5, confirmed: 3, completed: 1, cancelled: 1 } }
    : {}),
  ...(capabilities.canViewFinancials
    ? {
        financials: {
          customerAmount: '500000.00',
          totalPayable: '520000.00',
          paymentsReceived: '300000.00',
          customerOutstanding: '220000.00',
          refunds: '10000.00',
          netRevenue: '290000.00',
          totalCost: '200000.00',
          grossProfit: '90000.00',
          netProfit: '80000.00',
          margin: '17.3077',
        },
      }
    : {}),
  ...(capabilities.canViewClientPayments
    ? {
        receivables: {
          overdueCount: 2,
          overdueAmount: '50000.00',
          dueInPeriodCount: 4,
          dueInPeriodAmount: '120000.00',
        },
      }
    : {}),
  ...(capabilities.canViewVendorPayables
    ? {
        vendorPayables: {
          overdueCount: 1,
          overdueAmount: '15000.00',
          dueInPeriodCount: 3,
          dueInPeriodAmount: '60000.00',
        },
      }
    : {}),
  ...overrides,
});

const sourceRows = [
  {
    source: 'WEBSITE',
    label: 'Website',
    leadCount: 7,
    convertedCount: 3,
    conversionRate: 42.9,
    percentage: 58.3,
  },
  {
    source: 'REFERRAL',
    label: 'Referral',
    leadCount: 5,
    convertedCount: 1,
    conversionRate: 20,
    percentage: 41.7,
  },
];
const destinationRows = [
  { destination: 'Goa', enquiryCount: 9, convertedCount: 3, percentage: 60, rank: 1 },
  { destination: 'Kerala', enquiryCount: 6, convertedCount: 1, percentage: 40, rank: 2 },
];
const conversionRows = [
  {
    userId: 'u1',
    displayName: 'Asha Rao',
    totalLeads: 8,
    convertedLeads: 4,
    lostLeads: 2,
    conversionRate: 50,
    winRate: 66.7,
    rank: 1,
  },
];
const financialRows = [
  {
    userId: 'u1',
    displayName: 'Asha Rao',
    bookingCount: 3,
    revenue: '300000.00',
    netRevenue: '280000.00',
    grossProfit: '60000.00',
    netProfit: '50000.00',
    marginPercentage: '16.6667',
    rank: 1,
  },
];

const bookingRow = (financial: boolean) => ({
  bookingId: 'b1',
  bookingNumber: 'BK-2026-000001',
  customerName: 'Rahul Menon',
  destination: 'Goa',
  travelStartDate: '2026-10-10T00:00:00.000Z',
  travelEndDate: '2026-10-14T00:00:00.000Z',
  bookingStatus: 'CONFIRMED',
  operationalStatus: 'NOT_STARTED',
  paymentStatus: 'PARTIALLY_PAID',
  bookedBy: 'Asha Rao',
  assignedTo: 'Asha Rao',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...(financial
    ? {
        customerAmount: '50000.00',
        gstAmount: '2500.00',
        tcsAmount: '500.00',
        totalPayable: '53000.00',
        paidAmount: '20000.00',
        outstandingAmount: '33000.00',
        refundedAmount: '0.00',
        netRevenue: '50000.00',
        totalCost: '30000.00',
        vendorOutstanding: '0.00',
        grossProfit: '20000.00',
        netProfit: '20000.00',
        marginPercentage: '37.7358',
      }
    : {}),
});

const pagination = (total = 1, totalPages = 1, page = 1) => ({
  page,
  pageSize: 10,
  total,
  totalPages,
});

/**
 * Route the stubbed fetch by URL so each tab gets its own payload. Returns the
 * mock so tests can assert exactly which endpoints were called.
 */
function stub(
  options: { capabilities?: typeof allCaps; financial?: boolean; failAll?: boolean } = {},
) {
  const caps = options.capabilities ?? allCaps;
  const financial = options.financial ?? true;
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (options.failAll) return fail();
    if (url.includes('/reports/summary')) return ok(summary(caps));
    if (url.includes('/reports/leads'))
      return ok({
        period,
        capabilities: caps,
        summary: {
          totalLeads: 12,
          convertedLeads: 4,
          lostLeads: 2,
          hotLeads: 3,
          qualifiedLeads: 2,
          quotationRequired: 5,
          readyToBook: 1,
          conversionRate: 33.3,
          winRate: 66.7,
        },
        byStage: [{ stage: 'NEW_LEAD', label: 'New Lead', count: 6 }],
        byType: [{ type: 'HOT', label: 'Hot', count: 3 }],
        bySource: sourceRows,
        byDestination: destinationRows,
        byAssignee: [{ userId: 'u1', displayName: 'Asha Rao', totalLeads: 8 }],
      });
    if (url.includes('/reports/quotations/export'))
      return ok({
        fileName: 'quotations-report.csv',
        mimeType: 'text/csv',
        content: 'a,b',
        exportedCount: 1,
        truncated: false,
        rowLimit: 5000,
      });
    if (url.includes('/reports/quotations'))
      return ok({
        period,
        capabilities: caps,
        summary: {
          totalQuotations: 8,
          draft: 2,
          sent: 3,
          accepted: 3,
          rejected: 1,
          expired: 0,
          totalQuotedValue: '120000.00',
          acceptedValue: '90000.00',
          acceptanceRate: 75,
        },
        rows: [
          {
            quotationId: 'q1',
            quotationNumber: 'QT-2026-000001',
            leadNumber: 'QRY-2026-000001',
            customerName: 'Rahul Menon',
            destination: 'Goa',
            status: 'ACCEPTED',
            currentVersion: 2,
            currency: 'INR',
            currentAmount: '45000.00',
            sentAt: null,
            acceptedAt: null,
            createdBy: 'Asha Rao',
            createdAt: '2026-06-01T00:00:00.000Z',
            bookingNumber: 'BK-2026-000001',
          },
        ],
        pagination: pagination(24, 3),
      });
    if (url.includes('/reports/bookings/export'))
      return ok({
        fileName: 'bookings-report.csv',
        mimeType: 'text/csv',
        content: 'a,b',
        exportedCount: 1,
        truncated: false,
        rowLimit: 5000,
      });
    if (url.includes('/reports/bookings'))
      return ok({
        period,
        capabilities: caps,
        summary: {
          totalBookings: 5,
          confirmedBookings: 3,
          pendingConfirmation: 1,
          travelInProgress: 0,
          completed: 1,
          cancelled: 1,
        },
        ...(financial
          ? {
              financialSummary: {
                totalCustomerAmount: '500000.00',
                totalPayable: '520000.00',
                customerPaymentsReceived: '300000.00',
                customerOutstanding: '220000.00',
                totalRefunded: '10000.00',
                netRevenue: '290000.00',
                totalCost: '200000.00',
                totalVendorOutstanding: '0.00',
                grossProfit: '90000.00',
                netProfit: '80000.00',
                profitMarginPercentage: '17.3077',
              },
            }
          : {}),
        includesFinancials: financial,
        rows: [bookingRow(financial)],
        pagination: pagination(1, 1),
      });
    if (url.includes('/reports/client-payments/export'))
      return ok({
        fileName: 'client-payments-report.csv',
        mimeType: 'text/csv',
        content: 'a,b',
        exportedCount: 2,
        truncated: false,
        rowLimit: 5000,
      });
    if (url.includes('/reports/client-payments'))
      return ok({
        period,
        capabilities: caps,
        summary: {
          totalSchedules: 2,
          totalScheduledAmount: '50000.00',
          totalPaidAmount: '5000.00',
          totalOutstandingAmount: '45000.00',
          overdueCount: 1,
          overdueAmount: '15000.00',
        },
        rows: [
          {
            scheduleId: 's1',
            bookingId: 'b1',
            bookingNumber: 'BK-2026-000001',
            customerName: 'Rahul Menon',
            installmentNumber: 1,
            label: 'Advance',
            dueDate: '2026-08-01T00:00:00.000Z',
            amount: '20000.00',
            paidAmount: '5000.00',
            outstandingAmount: '15000.00',
            status: 'PARTIALLY_PAID',
            overdue: false,
            assignedTo: 'Asha Rao',
          },
        ],
        pagination: pagination(2, 1),
      });
    if (url.includes('/reports/vendor-payables/export'))
      return ok({
        fileName: 'vendor-payables-report.csv',
        mimeType: 'text/csv',
        content: 'a,b',
        exportedCount: 1,
        truncated: false,
        rowLimit: 5000,
      });
    if (url.includes('/reports/vendor-payables'))
      return ok({
        period,
        capabilities: caps,
        summary: {
          totalPayables: 1,
          originalAmount: '10000.00',
          paidAmount: '0.00',
          outstandingAmount: '10000.00',
          overdueCount: 0,
          overdueAmount: '0.00',
        },
        rows: [
          {
            payableId: 'p1',
            payableNumber: 'VP-2026-000001',
            vendorId: 'v1',
            vendorName: 'Coastal DMC',
            bookingId: 'b1',
            bookingNumber: 'BK-2026-000001',
            supplierInvoiceNumber: 'SUP-77',
            dueDate: '2026-09-01T00:00:00.000Z',
            originalAmount: '10000.00',
            paidAmount: '0.00',
            outstandingAmount: '10000.00',
            paymentStatus: 'UNPAID',
            overdue: false,
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        pagination: pagination(1, 1),
      });
    if (url.includes('/reports/staff-conversions'))
      return ok({ period, capabilities: caps, rows: conversionRows });
    if (url.includes('/reports/staff-financials'))
      return ok({ period, capabilities: caps, rows: financialRows });
    if (url.includes('/reports/lead-sources'))
      return ok({ period, capabilities: caps, totalLeads: 12, rows: sourceRows });
    if (url.includes('/reports/destinations'))
      return ok({ period, capabilities: caps, totalEnquiries: 15, rows: destinationRows });
    return ok({});
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const openTab = async (name: string) =>
  userEvent.click(await screen.findByRole('button', { name }));

beforeEach(() => {
  vi.unstubAllGlobals();
  // jsdom has no object-URL support; the download helper needs both.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

describe('Phase 19 reports navigation and route', () => {
  it('exposes an enabled Reports nav item guarded by reports.view', () => {
    const item = NAV_ITEMS.find((entry) => entry.label === 'Reports');
    expect(item).toBeDefined();
    expect(item?.to).toBe('/reports');
    expect(item?.available).toBe(true);
    expect(item?.permission).toBe(PERMISSIONS.REPORTS_VIEW);
  });

  it('renders the Overview tab by default with the period control', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByRole('heading', { name: /Reports/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Report period')).toHaveValue('THIS_YEAR');
    expect(await screen.findByText('Total leads')).toBeInTheDocument();
  });
});

describe('Phase 19 reports period controls', () => {
  it('refetches with the selected period after Apply', async () => {
    const mock = stub();
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Total leads');
    await userEvent.selectOptions(screen.getByLabelText('Report period'), 'THIS_MONTH');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).includes('period=THIS_MONTH'))).toBe(true),
    );
  });

  it('sends a custom from/to range', async () => {
    const mock = stub();
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Total leads');
    await userEvent.selectOptions(screen.getByLabelText('Report period'), 'CUSTOM');
    await userEvent.type(screen.getByLabelText('Custom from date'), '2026-01-01');
    await userEvent.type(screen.getByLabelText('Custom to date'), '2026-03-31');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url]) =>
            String(url).includes('period=CUSTOM') &&
            String(url).includes('from=2026-01-01') &&
            String(url).includes('to=2026-03-31'),
        ),
      ).toBe(true),
    );
  });
});

describe('Phase 19 reports overview', () => {
  it('shows summary cards including financial cards with permission', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('Total leads')).toBeInTheDocument();
    expect(screen.getByText('Converted leads')).toBeInTheDocument();
    expect(screen.getByText('Total quotations')).toBeInTheDocument();
    expect(screen.getByText('Accepted quotations')).toBeInTheDocument();
    expect(screen.getByText('Total bookings')).toBeInTheDocument();
    expect(screen.getByText('Agency revenue')).toBeInTheDocument();
    expect(screen.getByText('Customer outstanding')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Net profit')).toBeInTheDocument();
    expect(screen.getByText('Vendor outstanding')).toBeInTheDocument();
  });

  it('omits financial cards without booking financial permission', async () => {
    stub({
      capabilities: {
        ...allCaps,
        canViewFinancials: false,
        canViewClientPayments: false,
        canViewVendorPayables: false,
        canViewVendorFinancials: false,
      },
      financial: false,
    });
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Total leads');
    for (const label of ['Agency revenue', 'Customer outstanding', 'Refunds', 'Net profit'])
      expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it('renders the lead-source, destination and staff charts on the overview', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Total leads');
    expect(await screen.findByText('Lead sources')).toBeInTheDocument();
    expect(screen.getByText('Top destinations')).toBeInTheDocument();
    expect(screen.getByText('Staff conversions')).toBeInTheDocument();
    expect(screen.getByText('Staff net profit')).toBeInTheDocument();
    // Chart values come from the reports endpoints, not the dashboard.
    expect(await screen.findAllByText('Website')).not.toHaveLength(0);
  });
});

describe('Phase 19 reports tabs', () => {
  it('renders the Leads tab summary and breakdowns', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Leads');
    expect(await screen.findByText('Conversion rate')).toBeInTheDocument();
    expect(screen.getByText('By stage')).toBeInTheDocument();
    expect(screen.getByText('By assigned user')).toBeInTheDocument();
  });

  it('renders the Quotations tab with rows and a result count', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Quotations');
    expect(await screen.findByText('QT-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('Quoted value')).toBeInTheDocument();
    expect(screen.getByText('24 results')).toBeInTheDocument();
  });

  it('renders the Bookings tab with financial columns when permitted', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Bookings');
    expect((await screen.findAllByText('BK-2026-000001')).length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: 'Customer Amount' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Net Profit' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Margin' })).toBeInTheDocument();
  });

  it('omits booking financial columns without permission', async () => {
    stub({
      capabilities: {
        ...allCaps,
        canViewFinancials: false,
        canViewClientPayments: false,
      },
      financial: false,
    });
    renderWithProviders(<ReportsPage />);
    await openTab('Bookings');
    expect((await screen.findAllByText('BK-2026-000001')).length).toBeGreaterThan(0);
    for (const column of ['Customer Amount', 'Net Profit', 'Margin', 'Outstanding'])
      expect(screen.queryByRole('columnheader', { name: column })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Booked By' })).toBeInTheDocument();
  });

  it('renders the Client Payments tab', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Client Payments');
    expect(await screen.findByText('Customer payments due')).toBeInTheDocument();
    expect(screen.getByText(/Advance/)).toBeInTheDocument();
    expect(screen.getByText('Schedules')).toBeInTheDocument();
  });

  it('renders the Vendor Payables tab', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Vendor Payables');
    expect(await screen.findByText('VP-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('Coastal DMC')).toBeInTheDocument();
  });

  it('renders both staff-performance tables', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Staff Performance');
    const conversions = await screen.findByText('Lead conversion (by assigned user)');
    expect(conversions).toBeInTheDocument();
    expect(screen.getByText('Revenue and profit (by booked by)')).toBeInTheDocument();
    expect(await screen.findAllByText('Asha Rao')).not.toHaveLength(0);
  });

  it('renders the Sources & Destinations tab with chart and table', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Sources & Destinations');
    expect((await screen.findAllByText('Referral')).length).toBeGreaterThan(0);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getAllByText('Goa').length).toBeGreaterThan(0);
  });
});

describe('Phase 19 reports permission-aware tabs', () => {
  it('hides every tab the caller may not see', async () => {
    stub({
      capabilities: {
        ...allCaps,
        canViewQuotations: false,
        canViewFinancials: false,
        canViewClientPayments: false,
        canViewVendorPayables: false,
        canViewVendorFinancials: false,
      },
      financial: false,
    });
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Total leads');
    expect(screen.queryByRole('button', { name: 'Quotations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Client Payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vendor Payables' })).not.toBeInTheDocument();
    // Still-authorised tabs remain.
    expect(screen.getByRole('button', { name: 'Leads' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bookings' })).toBeInTheDocument();
  });

  it('never renders out-of-scope settings sections', async () => {
    stub();
    renderWithProviders(<ReportsPage />);
    await screen.findByText('Total leads');
    for (const label of [
      'Email Configuration',
      'WhatsApp Settings',
      'Subscription Info',
      'Learning',
    ])
      expect(screen.queryByText(label)).not.toBeInTheDocument();
  });
});

describe('Phase 19 reports exports, paging and states', () => {
  it('triggers each CSV export through the shared download helper', async () => {
    const mock = stub();
    renderWithProviders(<ReportsPage />);

    await openTab('Quotations');
    await userEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => String(url).includes('/reports/quotations/export')),
      ).toBe(true),
    );
    // The helper created and released an object URL.
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    await openTab('Bookings');
    await userEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => String(url).includes('/reports/bookings/export')),
      ).toBe(true),
    );

    await openTab('Client Payments');
    await userEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => String(url).includes('/reports/client-payments/export')),
      ).toBe(true),
    );

    await openTab('Vendor Payables');
    await userEvent.click(await screen.findByRole('button', { name: /Export CSV/ }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(([url]) => String(url).includes('/reports/vendor-payables/export')),
      ).toBe(true),
    );
  });

  it('pages and sorts server-side', async () => {
    const mock = stub();
    renderWithProviders(<ReportsPage />);
    await openTab('Quotations');
    await screen.findByText('QT-2026-000001');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true),
    );

    await openTab('Bookings');
    await screen.findAllByText('BK-2026-000001');
    await userEvent.click(screen.getByRole('button', { name: /Sort:/ }));
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).includes('sortDir=asc'))).toBe(true),
    );
  });

  it('shows loading, error and empty states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const view = renderWithProviders(<ReportsPage />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    view.unmount();

    stub({ failAll: true });
    const errored = renderWithProviders(<ReportsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    errored.unmount();

    // Authorised but no rows for the period.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/reports/summary')) return ok(summary());
        if (url.includes('/reports/vendor-payables'))
          return ok({
            period,
            capabilities: allCaps,
            summary: undefined,
            rows: [],
            pagination: pagination(0, 0),
          });
        return ok({ period, capabilities: allCaps, rows: [] });
      }),
    );
    renderWithProviders(<ReportsPage />);
    await openTab('Vendor Payables');
    expect(await screen.findByText('No data for this period.')).toBeInTheDocument();
  });
});
