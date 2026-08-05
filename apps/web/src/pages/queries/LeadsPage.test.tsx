import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  it('hides the Visa service checkbox in the create lead form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(lookups)));
    renderWithProviders(<LeadFormPage />);
    await screen.findByRole('heading', { name: 'Create lead' });
    // Visa is not offered as a selectable service.
    expect(screen.queryByRole('checkbox', { name: 'VISA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Visa/i })).not.toBeInTheDocument();
    // The remaining services stay visible and selectable (labels load with lookups).
    expect(await screen.findByRole('checkbox', { name: 'Flight' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'HOTEL' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'CRUISE' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Vehicle/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'SIGHTSEEING' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Add-on Service/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Flight' }));
    expect(screen.getByRole('checkbox', { name: 'Flight' })).toBeChecked();
  });
  it('creates a new lead without adding Visa', async () => {
    authState.permissions.delete('queries.assign');
    const destination = {
      id: 'dest-1',
      name: 'Singapore',
      status: 'ACTIVE',
      cities: [{ id: 'dc-1', sequence: 1, city: { name: 'Singapore' } }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/masters/destinations'))
        return response({
          data: [destination],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        });
      if (url.endsWith('/queries') && options?.method === 'POST')
        return { ok: true, status: 201, json: async () => ({ success: true, data: lead }) } as Response;
      return response(lookups);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<LeadFormPage />);
    await screen.findByRole('heading', { name: 'Create lead' });
    await userEvent.type(screen.getByLabelText('Name'), 'Test Lead');
    await userEvent.type(screen.getByLabelText('Phone'), '9876543210');
    fireEvent.change(screen.getByLabelText('Travel Date *'), { target: { value: '2026-09-10' } });
    await waitFor(() => {
      const destination = screen.getByLabelText('Destination 1');
      expect(
        Array.from(destination.querySelectorAll('option')).some(
          (option) => option.textContent === 'Singapore',
        ),
      ).toBe(true);
    });
    await userEvent.selectOptions(screen.getByLabelText('Destination 1'), 'Singapore');
    await waitFor(() => expect(screen.getByLabelText('City 1')).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText('City 1'), 'Singapore');
    await userEvent.click(screen.getByRole('button', { name: /Create Lead/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String(post![1]!.body));
      expect(body.services).not.toContain('VISA');
      expect(body.services).toContain('HOTEL');
      expect(body.services).toContain('SIGHTSEEING');
    });
  });
  it('hides Visa in the edit form and preserves a stored Visa selection on save', async () => {
    const editLead = {
      ...lead,
      services: [{ serviceType: 'FLIGHT' }, { serviceType: 'HOTEL' }, { serviceType: 'VISA' }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/queries/lookups')) return response(lookups);
      if (url.includes(`/queries/${editLead.id}`)) {
        if (options?.method === 'PATCH')
          return { ok: true, status: 200, json: async () => ({ success: true, data: editLead }) } as Response;
        return response(editLead);
      }
      return response({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/queries/:queryId/edit" element={<LeadFormPage />} />
      </Routes>,
      { route: `/queries/${editLead.id}/edit` },
    );
    await screen.findByRole('heading', { name: 'Edit lead' });
    // Visa checkbox is hidden even though the lead stores it.
    expect(screen.queryByRole('checkbox', { name: 'VISA' })).not.toBeInTheDocument();
    // Other stored services remain checked.
    expect(screen.getByRole('checkbox', { name: 'Flight' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'HOTEL' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.services).toContain('VISA');
    });
  });
  it('keeps the minimum-one-service validation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(lookups)));
    renderWithProviders(<LeadFormPage />);
    await screen.findByRole('heading', { name: 'Create lead' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'HOTEL' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'SIGHTSEEING' }));
    expect(await screen.findByText('Select at least one service.')).toBeInTheDocument();
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

describe('Phase 6 inline Type/Stage editing on the Leads List', () => {
  const pickOption = (listboxName: string, label: string) => {
    const listbox = screen.getByRole('listbox', { name: listboxName });
    const li = within(listbox).getByRole('option', { name: label });
    fireEvent.click(li.querySelector('button')!);
  };
  const patchStub = (rows: unknown[], updated?: (i: unknown, url: string) => unknown) => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const mock = vi.fn(
      async (input: RequestInfo | URL, options?: RequestInit) => {
        const url = String(input);
        if (url.includes('/analytics')) return response(analytics);
        if (url.includes('/lookups')) return response(lookups);
        if (options?.method === 'PATCH') {
          const body = JSON.parse(String(options.body));
          calls.push({ url, body });
          if (updated) return response(updated(rows[0], url));
          return response(rows[0]);
        }
        return response({ data: rows, pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 } });
      },
    );
    vi.stubGlobal('fetch', mock);
    return { mock, calls };
  };

  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.permissions = new Set(['queries.view', 'queries.update']);
  });

  it('renders a clickable Type badge with Create-Lead options for an authorized user', async () => {
    patchStub([lead]);
    renderWithProviders(<LeadsPage />);
    const typeBadge = await screen.findByRole('button', { name: 'Change lead type from Hot' });
    await userEvent.click(typeBadge);
    const listbox = screen.getByRole('listbox', { name: 'Change lead type' });
    const optionTexts = within(listbox).getAllByRole('option').map((o) => o.textContent ?? '');
    // Options match Create Lead exactly (same lookups source / order).
    expect(optionTexts).toEqual(['Fresh', 'Hot']);
  });

  it('renders a static Type badge for an unauthorized user', async () => {
    authState.permissions = new Set(['queries.view']);
    patchStub([lead]);
    renderWithProviders(<LeadsPage />);
    // Wait for the lead row to render; there is no clickable Type button.
    await screen.findAllByText(lead.customerName);
    expect(screen.queryByRole('button', { name: 'Change lead type from Hot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Change lead type' })).not.toBeInTheDocument();
  });

  it('sends the correct stored Type value when a different option is selected', async () => {
    const { calls } = patchStub([{ ...lead, leadType: 'HOT' }]);
    renderWithProviders(<LeadsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead type from Hot' }));
    pickOption('Change lead type', 'Fresh');
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]!.url).toContain(`/queries/${lead.id}`);
    expect(calls[0]!.body).toEqual({ leadType: 'FRESH' });
  });

  it('selecting the current Type sends no request', async () => {
    const { calls } = patchStub([lead]);
    renderWithProviders(<LeadsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead type from Hot' }));
    pickOption('Change lead type', 'Hot');
    expect(calls).toHaveLength(0);
  });

  it('renders a clickable Stage badge with Create-Lead options', async () => {
    const richLookups = {
      ...lookups,
      leadStages: [
        { value: 'NEW_LEAD', label: 'New Lead' },
        { value: 'CONTACTED', label: 'Contacted' },
      ],
    };
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(richLookups);
      return response({ data: [lead], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<LeadsPage />);
    const stageBadge = await screen.findByRole('button', { name: 'Change lead stage from New Lead' });
    await userEvent.click(stageBadge);
    const listbox = screen.getByRole('listbox', { name: 'Change lead stage' });
    expect(within(listbox).getByRole('option', { name: 'New Lead' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Contacted' })).toBeInTheDocument();
  });

  it('sends the correct stored Stage value when a different option is selected', async () => {
    const richLookups = {
      ...lookups,
      leadStages: [
        { value: 'NEW_LEAD', label: 'New Lead' },
        { value: 'CONTACTED', label: 'Contacted' },
      ],
    };
    const calls: Array<{ url: string; body: unknown }> = [];
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(richLookups);
      if (options?.method === 'PATCH') {
        calls.push({ url, body: JSON.parse(String(options.body)) });
        return response({ ...lead, leadStage: 'CONTACTED' });
      }
      return response({ data: [{ ...lead, leadStage: 'NEW_LEAD' }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<LeadsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead stage from New Lead' }));
    pickOption('Change lead stage', 'Contacted');
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]!.url).toContain(`/queries/${lead.id}/stage`);
    expect(calls[0]!.body).toEqual({ stage: 'CONTACTED' });
  });

  it('only one dropdown stays open after opening a second badge', async () => {
    patchStub([lead]);
    renderWithProviders(<LeadsPage />);
    const typeBadge = await screen.findByRole('button', { name: 'Change lead type from Hot' });
    await userEvent.click(typeBadge);
    expect(screen.getByRole('listbox', { name: 'Change lead type' })).toBeInTheDocument();
    // Opening Stage should close Type.
    const stageBadge = await screen.findByRole('button', { name: 'Change lead stage from New Lead' });
    await userEvent.click(stageBadge);
    expect(screen.queryByRole('listbox', { name: 'Change lead type' })).not.toBeInTheDocument();
  });

  it('restores the previous badge value and shows an error when the update fails', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(lookups);
      if (options?.method === 'PATCH') {
        return { ok: false, status: 400, json: async () => ({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid stage transition.' } }) } as unknown as Response;
      }
      return response({ data: [lead], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<LeadsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead type from Hot' }));
    pickOption('Change lead type', 'Fresh');
    // No optimistic update: the badge still shows the previous value.
    expect(await screen.findByRole('button', { name: 'Change lead type from Hot' })).toBeInTheDocument();
    // Failure message is surfaced.
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid stage transition|Unable to update type/);
  });
});

describe('Phase 6 Create Booking action on the Leads List', () => {
  const pickOption = (listboxName: string, label: string) => {
    const listbox = screen.getByRole('listbox', { name: listboxName });
    const li = within(listbox).getByRole('option', { name: label });
    fireEvent.click(li.querySelector('button')!);
  };
  const bookingStub = (initial: Record<string, unknown> & { id: string }) => {
    const current: Record<string, unknown> & { id: string } = { ...initial };
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(lookups);
      if (options?.method === 'PATCH') {
        const body = JSON.parse(String(options.body)) as Record<string, unknown>;
        if (url.endsWith('/stage')) current.leadStage = String(body.stage);
        else if (body.leadType) current.leadType = String(body.leadType);
        return response({ ...current });
      }
      // Return a fresh copy so React Query detects the change after an update.
      return response({ data: [{ ...current }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    return current;
  };

  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.permissions = new Set(['queries.view', 'queries.update', 'bookings.create']);
  });

  it('shows Create Booking for Hot + Booking Confirmed + no booking', async () => {
    bookingStub({
      ...lead,
      leadType: 'HOT',
      leadStage: 'BOOKING_CONFIRMED',
      bookingSummary: null,
      quotationSummary: { quotationId: 'quote-1', quotationStatus: 'ACCEPTED' },
    });
    renderWithProviders(<LeadsPage />);
    const links = await screen.findAllByRole('link', { name: /Create booking for/ });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute(
      'href',
      `/bookings/new?leadId=${lead.id}&quotationId=quote-1`,
    );
  });

  it('shows View Booking instead of Create Booking when a booking already exists', async () => {
    bookingStub({
      ...lead,
      leadType: 'HOT',
      leadStage: 'BOOKING_CONFIRMED',
      bookingSummary: { bookingId: 'b-1', bookingNumber: 'BK-1', bookingStatus: 'CONFIRMED', operationalStatus: 'CONFIRMED' },
    });
    renderWithProviders(<LeadsPage />);
    expect((await screen.findAllByText('BK-1')).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
  });

  it('does not show Create Booking when Stage is not Booking Confirmed', async () => {
    bookingStub({ ...lead, leadType: 'HOT', leadStage: 'NEW_LEAD', bookingSummary: null });
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
  });

  it('does not show Create Booking when Type is not Hot', async () => {
    bookingStub({ ...lead, leadType: 'FRESH', leadStage: 'BOOKING_CONFIRMED', bookingSummary: null });
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
  });

  it('does not show Create Booking for Fresh + New Lead', async () => {
    bookingStub({ ...lead, leadType: 'FRESH', leadStage: 'NEW_LEAD', bookingSummary: null });
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
  });

  it('hides Create Booking for a user without bookings.create permission', async () => {
    authState.permissions = new Set(['queries.view']);
    bookingStub({ ...lead, leadType: 'HOT', leadStage: 'BOOKING_CONFIRMED', bookingSummary: null });
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
  });

  it('Create Booking appears after an inline Type update to Hot', async () => {
    const current = bookingStub({
      ...lead, leadType: 'FRESH', leadStage: 'BOOKING_CONFIRMED', bookingSummary: null,
      quotationSummary: { quotationId: 'quote-1', quotationStatus: 'ACCEPTED' },
    });
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead type from Fresh' }));
    pickOption('Change lead type', 'Hot');
    // Refetch returns the lead with leadType HOT → action appears.
    await waitFor(() =>
      expect(screen.queryAllByRole('link', { name: /Create booking for/ }).length).toBeGreaterThan(0),
    );
    void current;
  });

  it('Create Booking appears after an inline Stage update to Booking Confirmed', async () => {
    const current = bookingStub({
      ...lead, leadType: 'HOT', leadStage: 'NEW_LEAD', bookingSummary: null,
      quotationSummary: { quotationId: 'quote-1', quotationStatus: 'ACCEPTED' },
    });
    void current;
    const richLookups = {
      ...lookups,
      leadStages: [
        { value: 'NEW_LEAD', label: 'New Lead' },
        { value: 'BOOKING_CONFIRMED', label: 'Booking Confirmed' },
      ],
    };
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(richLookups);
      if (options?.method === 'PATCH') {
        const body = JSON.parse(String(options.body)) as Record<string, unknown>;
        current.leadStage = String(body.stage);
        return response({ ...current });
      }
      return response({ data: [{ ...current }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead stage from New Lead' }));
    pickOption('Change lead stage', 'Booking Confirmed');
    expect((await screen.findAllByRole('link', { name: /Create booking for/ })).length).toBeGreaterThan(0);
  });

  it('Create Booking disappears after an inline Type update away from Hot', async () => {
    const current = bookingStub({
      ...lead, leadType: 'HOT', leadStage: 'BOOKING_CONFIRMED', bookingSummary: null,
      quotationSummary: { quotationId: 'quote-1', quotationStatus: 'ACCEPTED' },
    });
    void current;
    const richLookups = {
      ...lookups,
      leadTypes: [
        { value: 'FRESH', label: 'Fresh' },
        { value: 'HOT', label: 'Hot' },
        { value: 'WARM', label: 'Warm' },
      ],
    };
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(richLookups);
      if (options?.method === 'PATCH') {
        const body = JSON.parse(String(options.body)) as Record<string, unknown>;
        current.leadType = String(body.leadType);
        return response({ ...current });
      }
      return response({ data: [{ ...current }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<LeadsPage />);
    expect((await screen.findAllByRole('link', { name: /Create booking for/ })).length).toBeGreaterThan(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead type from Hot' }));
    pickOption('Change lead type', 'Warm');
    await waitFor(() =>
      expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0),
    );
  });

  it('a failed inline update does not change the Booking column', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/lookups')) return response(lookups);
      if (options?.method === 'PATCH') {
        return { ok: false, status: 400, json: async () => ({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid transition.' } }) } as unknown as Response;
      }
      return response({ data: [{ ...lead, leadType: 'FRESH', leadStage: 'BOOKING_CONFIRMED', bookingSummary: null }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    renderWithProviders(<LeadsPage />);
    await screen.findAllByText(lead.customerName);
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
    // Attempt an inline Type update to Hot; it fails, so the action must not appear.
    await userEvent.click(await screen.findByRole('button', { name: 'Change lead type from Fresh' }));
    pickOption('Change lead type', 'Hot');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /Create booking for/ })).toHaveLength(0);
  });
});
