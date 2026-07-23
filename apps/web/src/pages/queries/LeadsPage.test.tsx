import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { LeadsPage } from './LeadsPage';
import { LeadFormPage } from './LeadFormPage';
import { LeadDetailsPage } from './LeadDetailsPage';

const authState = vi.hoisted(() => ({
  permissions: new Set([
    'queries.view',
    'queries.create',
    'queries.update',
    'queries.delete',
    'queries.assign',
  ]),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'me' },
    hasPermission: (permission: string) => authState.permissions.has(permission),
  }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const lookups = {
  countries: ['India'],
  cities: ['Delhi'],
  leadSources: [{ value: 'WEBSITE', label: 'Website' }],
  leadTypes: [
    { value: 'FRESH', label: 'Fresh' },
    { value: 'HOT', label: 'Hot' },
  ],
  leadStages: [{ value: 'NEW_LEAD', label: 'New Lead' }],
  priorities: [{ value: 'MEDIUM', label: 'Medium' }],
  serviceTypes: [
    { value: 'GENERAL_ENQUIRY', label: 'General Enquiry' },
    { value: 'FLIGHT', label: 'Flight' },
  ],
  tripTypes: ['Leisure'],
  currencies: ['INR'],
  assignableUsers: [{ id: 'me', fullName: 'Owner', username: 'owner' }],
};
const analytics = {
  totalLeads: 0,
  newLeads: 0,
  qualifiedLeads: 0,
  followUpsDue: 0,
  quotationRequired: 0,
  readyToBook: 0,
  bookingConfirmed: 0,
  lostLeads: 0,
  conversionRate: 0,
  winRate: 0,
  byLeadType: {},
  byLeadStage: {},
};
const lead = {
  id: '11111111-1111-4111-8111-111111111111',
  queryNumber: 'QRY-2026-000001',
  customerName: 'Aarav Mehta',
  phone: '+91 98765 43210',
  alternatePhone: null,
  email: 'aarav@example.test',
  dateOfBirth: null,
  leadSource: 'REFERRAL',
  leadType: 'HOT',
  leadStage: 'NEW_LEAD',
  priority: 'HIGH',
  departureCountry: 'India',
  departureCity: 'Delhi',
  travelStartDate: '2026-08-15T00:00:00.000Z',
  travelEndDate: '2026-08-22T00:00:00.000Z',
  flexibleDates: false,
  rooms: 1,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  extraBeds: 0,
  travellerSummary: '1 Room, 2 Adults',
  expectedAmount: '250000',
  budgetMin: null,
  budgetMax: null,
  expectedMargin: null,
  currency: 'INR',
  tripType: 'Leisure',
  quotationRequired: true,
  bookingStatusPlaceholder: null,
  webLinkPlaceholder: null,
  supplierCostingNotes: null,
  assignedToId: 'me',
  createdById: 'me',
  lastContactedAt: null,
  nextFollowUpAt: '2026-08-01T10:00:00.000Z',
  lostReason: null,
  convertedAt: null,
  internalRemarks: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  assignedTo: { id: 'me', fullName: 'Owner', username: 'owner' },
  createdBy: { id: 'me', fullName: 'Owner', username: 'owner' },
  services: [{ serviceType: 'FLIGHT' }, { serviceType: 'HOTEL' }],
  itinerary: [
    {
      id: 'itinerary-1',
      country: 'Thailand',
      destination: 'Bangkok',
      nights: 3,
      sequence: 1,
      arrivalDate: null,
      departureDate: null,
      notes: null,
    },
  ],
};
describe('Phase 6 lead pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.permissions = new Set([
      'queries.view',
      'queries.create',
      'queries.update',
      'queries.delete',
      'queries.assign',
    ]);
  });
  it('renders analytics and the empty lead state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        response(
          String(input).includes('analytics')
            ? analytics
            : String(input).includes('lookups')
              ? lookups
              : { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
        ),
      ),
    );
    renderWithProviders(<LeadsPage />);
    expect(await screen.findByText('No leads found')).toBeInTheDocument();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add Lead/i })).toBeInTheDocument();
  });
  it('renders loading and error states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const view = renderWithProviders(<LeadsPage />);
    expect(screen.getByLabelText('Loading leads')).toBeInTheDocument();
    view.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            json: async () => ({
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'failed' },
            }),
          }) as Response,
      ),
    );
    renderWithProviders(<LeadsPage />);
    expect(await screen.findByText('Leads could not be loaded.')).toBeInTheDocument();
  });
  it('supports service selection and itinerary add, remove and reorder controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(lookups)),
    );
    renderWithProviders(<LeadFormPage />);
    expect(await screen.findByRole('heading', { name: 'Create lead' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add destination/i }));
    expect(screen.getByLabelText('Destination 2')).toBeInTheDocument();
    await userEvent.click(screen.getAllByLabelText('Move up')[1]!);
    await userEvent.click(screen.getAllByLabelText('Remove itinerary')[1]!);
    expect(screen.queryByLabelText('Destination 2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Flight'));
    expect(screen.getByText(/1 Room, 1 Adult/)).toBeInTheDocument();
  });
  it('validates the form and only autofills a duplicate after explicit confirmation', async () => {
    authState.permissions.delete('queries.assign');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        response(
          String(input).includes('search-by-phone')
            ? [
                {
                  id: lead.id,
                  queryNumber: lead.queryNumber,
                  customerName: lead.customerName,
                  phone: lead.phone,
                  alternatePhone: null,
                  email: lead.email,
                  dateOfBirth: null,
                  departureCity: lead.departureCity,
                },
              ]
            : lookups,
        ),
      ),
    );
    renderWithProviders(<LeadFormPage />);
    await screen.findByRole('heading', { name: 'Create lead' });
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    expect(await screen.findByText('Enter the customer name.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Primary phone'), '98765');
    expect(await screen.findByText('Possible duplicate leads found')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer name')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: /Use details from/ }));
    expect(screen.getByLabelText('Customer name')).toHaveValue('Aarav Mehta');
    expect(screen.getByLabelText('Primary phone')).toHaveValue('+91 98765 43210');
    expect(screen.getByLabelText('Assigned salesperson')).toBeDisabled();
  });
  it('synchronizes search, filters, sorting and pagination with the server query string', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      response(
        String(input).includes('analytics')
          ? { ...analytics, totalLeads: 2, byLeadType: { HOT: 1 } }
          : String(input).includes('lookups')
            ? lookups
            : {
                data: [lead],
                pagination: { page: 1, pageSize: 20, total: 2, totalPages: 2 },
              },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<LeadsPage />);
    expect(await screen.findAllByText('Aarav Mehta')).not.toHaveLength(0);
    await userEvent.type(screen.getByLabelText('Search leads'), 'Bangkok');
    await userEvent.selectOptions(screen.getByLabelText('All lead types'), 'HOT');
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Customer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => {
          const value = String(url);
          return (
            value.includes('search=Bangkok') &&
            value.includes('leadType=HOT') &&
            value.includes('sortBy=customerName') &&
            value.includes('sortOrder=asc') &&
            value.includes('page=2')
          );
        }),
      ).toBe(true),
    );
    expect(screen.getByLabelText('Travel from')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hot 1/ })).toBeInTheDocument();
  });
  it('renders lead details, notes, follow-ups and timeline with permission-aware actions', async () => {
    authState.permissions = new Set(['queries.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/notes'))
          return response([
            {
              id: 'note-1',
              content: 'Customer prefers morning flights',
              createdAt: lead.createdAt,
              updatedAt: lead.updatedAt,
              isCustomerContact: false,
              contactMethod: null,
              contactedAt: null,
              authorUser: lead.createdBy,
            },
          ]);
        if (url.endsWith('/follow-ups'))
          return response([
            {
              id: 'follow-up-1',
              scheduledAt: lead.nextFollowUpAt,
              status: 'PENDING',
              effectiveStatus: 'PENDING',
              outcomeType: null,
              outcome: null,
              notes: 'Confirm hotel category',
              completionNotes: null,
              completedAt: null,
              cancelledAt: null,
              cancellationReason: null,
              assignedTo: lead.assignedTo,
              createdBy: lead.createdBy,
            },
          ]);
        if (url.includes('/timeline'))
          return response({
            data: [
              {
                id: 'timeline-1',
                type: 'CREATED',
                actor: lead.createdBy,
                title: 'Lead created',
                description: lead.queryNumber,
                timestamp: lead.createdAt,
                iconKey: 'lead',
              },
            ],
            pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
          });
        if (url.endsWith('/lookups')) return response(lookups);
        if (url.endsWith('/workspace'))
          return response({
            lead,
            operationalSummary: {
              pendingFollowUpCount: 1,
              overdueFollowUpCount: 0,
              completedFollowUpCount: 0,
              notesCount: 1,
              daysSinceLastContact: null,
              noFutureFollowUp: false,
              requiresAttention: false,
            },
            recent: { notes: [], followUps: [], timeline: [] },
            quotations: {
              count: 1,
              latest: {
                id: 'quotation-1',
                quotationNumber: 'QT-2026-000001',
                status: 'SENT',
                currentVersionId: 'version-1',
                lastSentAt: lead.createdAt,
                lastViewedAt: null,
                createdAt: lead.createdAt,
                versions: [
                  {
                    id: 'version-1',
                    versionNumber: 1,
                    finalAmount: '16065.87',
                    currency: 'INR',
                    status: 'FINALIZED',
                  },
                ],
              },
              items: [
                {
                  id: 'quotation-1',
                  quotationNumber: 'QT-2026-000001',
                  status: 'SENT',
                  currentVersionId: 'version-1',
                  lastSentAt: lead.createdAt,
                  lastViewedAt: null,
                  createdAt: lead.createdAt,
                  versions: [
                    {
                      id: 'version-1',
                      versionNumber: 1,
                      finalAmount: '16065.87',
                      currency: 'INR',
                      status: 'FINALIZED',
                    },
                  ],
                },
              ],
            },
            indicators: [],
            timezone: 'Asia/Kolkata',
            permissions: {
              canEdit: false,
              canAssign: false,
              canChangeStage: false,
              canAddNote: false,
              canScheduleFollowUp: false,
              canCompleteFollowUp: false,
              canArchive: false,
              canViewQuotations: true,
              canCreateQuotation: false,
              canSendQuotation: false,
              canGenerateQuotationPdf: false,
              canViewBookings: true,
              canConvertBooking: false,
            },
          });
        return response(lead);
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/queries/:queryId" element={<LeadDetailsPage />} />
      </Routes>,
      { route: `/queries/${lead.id}` },
    );
    expect(await screen.findByRole('heading', { name: 'Aarav Mehta' })).toBeInTheDocument();
    // Overview is the default tab; action controls are gated off by permissions.
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByText('Reassign lead')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New stage')).not.toBeInTheDocument();
    // Sectioned content now lives on its own tab.
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(await screen.findByText('Customer prefers morning flights')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Follow-ups' }));
    expect(await screen.findByText('Confirm hotel category')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(await screen.findByText('Lead created')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quotations' }));
    expect(screen.getByRole('link', { name: 'QT-2026-000001' })).toBeInTheDocument();
    expect(screen.getByText('1 customer quotation linked to this lead.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 17 — enriched columns, quick actions, bulk operations and tabs
// ---------------------------------------------------------------------------

const enrichedLead = {
  ...lead,
  hasQuotations: true,
  createdBy: { id: 'me', fullName: 'Owner', username: 'owner' },
  quotationSummary: {
    quotationId: 'quote-1',
    quotationNumber: 'QT-2026-000001',
    quotationStatus: 'ACCEPTED',
    acceptedVersionId: 'ver-1',
    latestVersionAmount: '50000.00',
    currency: 'INR',
    bookingId: null,
    lastSentAt: null,
    acceptedAt: '2026-07-22T00:00:00.000Z',
  },
  bookingSummary: null,
  actions: {
    canCreateQuotation: true,
    canOpenQuotation: true,
    canConvertToBooking: true,
    canViewBooking: false,
    canAddFollowUp: true,
  },
};

function stubLeadList(rows: unknown[], analyticsData = analytics) {
  const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (url.includes('/analytics')) return response(analyticsData);
    if (url.includes('/lookups')) return response(lookups);
    if (options?.method === 'POST' || url.includes('/bulk') || url.includes('/export'))
      return response({ updatedCount: rows.length, unchangedCount: 0, results: [] });
    return response({
      data: rows,
      pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('Phase 17 lead list enrichment', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.permissions = new Set([
      'queries.view',
      'queries.create',
      'queries.update',
      'queries.assign',
      'queries.export',
    ]);
  });

  it('renders source, quotation, booking and created-by columns with a convert action', async () => {
    stubLeadList([enrichedLead]);
    renderWithProviders(<LeadsPage />);
    expect((await screen.findAllByText('QRY-2026-000001'))[0]).toBeInTheDocument();
    // Column headers.
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Quotation')).toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
    expect(screen.getByText('Created by')).toBeInTheDocument();
    // Quotation status badge and a convert-to-booking quick action.
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);
    const convert = screen.getAllByRole('link', { name: 'Convert to booking' })[0];
    expect(convert).toHaveAttribute('href', '/quotations/quote-1/convert-to-booking');
  });

  it('shows a view-booking action and hides convert once booked', async () => {
    stubLeadList([
      {
        ...enrichedLead,
        bookingSummary: {
          bookingId: 'book-1',
          bookingNumber: 'BK-2026-000001',
          bookingStatus: 'CONFIRMED',
          operationalStatus: 'IN_PROGRESS',
          travelStartDate: null,
          travelEndDate: null,
          paymentStatus: 'PARTIALLY_PAID',
        },
        actions: { ...enrichedLead.actions, canConvertToBooking: false, canViewBooking: true },
      },
    ]);
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText('QRY-2026-000001');
    expect(screen.queryByRole('link', { name: 'Convert to booking' })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /BK-2026-000001|View booking/ }).length,
    ).toBeGreaterThan(0);
  });

  it('selects rows and performs a bulk assignment', async () => {
    const mock = stubLeadList([enrichedLead]);
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText('QRY-2026-000001');
    await userEvent.click(screen.getAllByLabelText('Select QRY-2026-000001')[0]!);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await userEvent.selectOptions(screen.getByLabelText('Bulk assignee'), 'me');
    await userEvent.click(screen.getByRole('button', { name: 'Assign leads' }));
    await waitFor(() =>
      expect(
        mock.mock.calls.some(
          ([url, options]) =>
            String(url).endsWith('/queries/bulk-assignment') && options?.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('performs a bulk stage change', async () => {
    const mock = stubLeadList([enrichedLead]);
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText('QRY-2026-000001');
    await userEvent.click(screen.getAllByLabelText('Select page')[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Change stage' }));
    await userEvent.selectOptions(screen.getByLabelText('Bulk stage'), 'NEW_LEAD');
    await userEvent.click(screen.getByRole('button', { name: 'Update stage' }));
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).endsWith('/queries/bulk-stage'))).toBe(
        true,
      ),
    );
  });

  it('shows the export button only with export permission', async () => {
    stubLeadList([enrichedLead]);
    const view = renderWithProviders(<LeadsPage />);
    await screen.findAllByText('QRY-2026-000001');
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
    view.unmount();
    authState.permissions = new Set(['queries.view']);
    stubLeadList([enrichedLead]);
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText('QRY-2026-000001');
    expect(screen.queryByRole('button', { name: /Export CSV/ })).not.toBeInTheDocument();
    // Without assign permission there are no selection checkboxes.
    expect(screen.queryByLabelText('Select page')).not.toBeInTheDocument();
  });
});

describe('Phase 17 lead workspace tabs', () => {
  const workspace = {
    lead: enrichedLead,
    operationalSummary: {
      pendingFollowUpCount: 1,
      overdueFollowUpCount: 0,
      completedFollowUpCount: 0,
      notesCount: 0,
      daysSinceLastContact: null,
      noFutureFollowUp: false,
      requiresAttention: false,
    },
    indicators: [],
    recent: { notes: [], followUps: [], timeline: [] },
    quotations: {
      count: 1,
      latest: null,
      items: [
        {
          id: 'quote-1',
          quotationNumber: 'QT-2026-000001',
          status: 'ACCEPTED',
          currentVersionId: 'ver-1',
          lastSentAt: null,
          lastViewedAt: null,
          acceptedAt: '2026-07-22T00:00:00.000Z',
          createdAt: '2026-07-21T00:00:00.000Z',
          booking: null,
          versions: [
            {
              id: 'ver-1',
              versionNumber: 1,
              finalAmount: '50000',
              currency: 'INR',
              status: 'FINALIZED',
            },
          ],
        },
      ],
    },
    bookings: { count: 0, latest: null, items: [] },
    timezone: 'Asia/Kolkata',
    permissions: {
      canEdit: true,
      canAssign: true,
      canChangeStage: true,
      canAddNote: true,
      canScheduleFollowUp: true,
      canCompleteFollowUp: true,
      canArchive: true,
      canViewQuotations: true,
      canCreateQuotation: true,
      canSendQuotation: true,
      canGenerateQuotationPdf: true,
      canViewBookings: true,
      canConvertBooking: true,
    },
  };

  function stubWorkspace() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace')) return response(workspace);
        if (url.includes('/notes'))
          return response([
            {
              id: 'note-1',
              content: 'Prefers morning flights',
              createdAt: '2026-07-21T00:00:00.000Z',
              updatedAt: '2026-07-21T00:00:00.000Z',
              isCustomerContact: false,
              contactMethod: null,
              contactedAt: null,
              authorUser: { id: 'me', fullName: 'Owner', username: 'owner' },
            },
          ]);
        if (url.includes('/follow-ups'))
          return response([
            {
              id: 'fu-1',
              scheduledAt: '2026-08-01T10:00:00.000Z',
              status: 'PENDING',
              effectiveStatus: 'PENDING',
              outcomeType: null,
              outcome: null,
              notes: 'Confirm hotel category',
              completionNotes: null,
              completedAt: null,
              cancelledAt: null,
              cancellationReason: null,
              createdAt: '2026-07-21T00:00:00.000Z',
              updatedAt: '2026-07-21T00:00:00.000Z',
              assignedTo: { id: 'me', fullName: 'Owner', username: 'owner' },
              createdBy: { id: 'me', fullName: 'Owner', username: 'owner' },
            },
          ]);
        if (url.includes('/timeline'))
          return response({
            data: [
              {
                id: 't1',
                type: 'LEAD_CREATED',
                title: 'Lead created',
                description: 'Created',
                timestamp: '2026-07-21T00:00:00.000Z',
                actor: { id: 'me', fullName: 'Owner', username: 'owner' },
              },
            ],
            pagination: {},
          });
        if (url.includes('/lookups')) return response(lookups);
        return response(enrichedLead);
      }),
    );
  }

  const renderWorkspace = () =>
    renderWithProviders(
      <Routes>
        <Route path="/queries/:queryId" element={<LeadDetailsPage />} />
      </Routes>,
      { route: `/queries/${enrichedLead.id}` },
    );

  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.permissions = new Set([
      'queries.view',
      'queries.update',
      'queries.assign',
      'followups.create',
      'followups.update',
      'followups.delete',
    ]);
  });

  it('defaults to the Overview tab and switches between tabs', async () => {
    stubWorkspace();
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: 'Aarav Mehta' })).toBeInTheDocument();
    // Overview shows the lead-actions panel.
    expect(screen.getByText('Lead actions')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Travel & Itinerary' }));
    expect(await screen.findByText('Travel and travellers')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(await screen.findByText('Prefers morning flights')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Follow-ups' }));
    expect(await screen.findByText('Confirm hotel category')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(await screen.findByText('Lead created')).toBeInTheDocument();
  });

  it('shows the quotations tab with a convert-to-booking action', async () => {
    stubWorkspace();
    renderWorkspace();
    await screen.findByRole('heading', { name: 'Aarav Mehta' });
    await userEvent.click(screen.getByRole('button', { name: 'Quotations' }));
    expect(await screen.findByRole('link', { name: 'QT-2026-000001' })).toBeInTheDocument();
    const convert = screen.getByRole('link', { name: 'Convert to booking' });
    expect(convert).toHaveAttribute('href', '/quotations/quote-1/convert-to-booking');
  });

  it('explains the accepted-quotation rule on the Booking tab when unbooked', async () => {
    stubWorkspace();
    renderWorkspace();
    await screen.findByRole('heading', { name: 'Aarav Mehta' });
    await userEvent.click(screen.getByRole('button', { name: 'Booking' }));
    expect(await screen.findByText(/created from an accepted quotation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert to booking' })).toBeInTheDocument();
  });
});
