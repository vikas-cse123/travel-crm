import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cabinLuggageLabel, hotelStayNights } from '@interscale/shared';
import { renderWithProviders } from '@/test/utils';
import { serviceCardIcon } from './serviceCards';
import { QuotationTemplatesPage } from './QuotationTemplatesPage';
import { QuotationTemplateDetailsPage } from './QuotationTemplateDetailsPage';
import { QuotationTemplateFormPage } from './QuotationTemplateFormPage';
import { QuotationsPage } from './QuotationsPage';
import { NewQuotationPage } from './NewQuotationPage';
import { PublicQuotationPage } from './PublicQuotationPage';
import { buildQuotationDescription, formatPublicQuotationNumber, normalizeWhatsAppPhone } from './quotationContact';
import { QuotationBuilderPage } from './QuotationBuilderPage';
import { QuotationDetailsPage } from './QuotationDetailsPage';
import { uploadQuotationAttachment } from '@/features/quotations/quotations.api';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const person = { id: 'user-1', fullName: 'Aditi Rao', username: 'owner' };
/** Rich finalized-version + quotation detail fixture reused by copy/weblink tests. */
const copyFinalizedVersion = {
  id: 'version-1',
  versionNumber: 1,
  title: 'Goa proposal',
  introduction: 'A coastal holiday.',
  destinationSummary: 'Goa',
  travelStartDate: null,
  travelEndDate: null,
  currency: 'INR',
  subtotalSellingPrice: '25000',
  markupMode: 'NONE',
  markupValue: '0',
  totalMarkup: '0',
  taxRate: '0',
  taxAmount: '0',
  discountAmount: '0',
  finalAmount: '25000',
  pricingMode: 'ITEMIZED',
  notes: null,
  status: 'FINALIZED',
  finalizedAt: '2026-07-21T00:00:00.000Z',
  createdAt: '2026-07-21T00:00:00.000Z',
  createdBy: person,
  itinerary: [],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
};
const copyQuotationDetail = {
  id: 'quotation-1',
  quotationNumber: 'QT-2026-000001',
  queryId: 'lead-1',
  currentVersionId: 'version-1',
  status: 'SENT',
  customerName: 'Aarav Mehta',
  customerEmail: 'aarav@example.test',
  customerPhone: '+91 90000 00000',
  destinationSummary: 'Goa',
  travelStartDate: null,
  travelEndDate: null,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  rooms: 1,
  validUntil: null,
  lastSentAt: '2026-07-21T00:00:00.000Z',
  lastViewedAt: null,
  acceptedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: person,
  query: {
    id: 'lead-1',
    queryNumber: 'QRY-1',
    leadStage: 'QUOTATION_SENT',
    assignedToId: 'user-1',
    createdById: 'user-1',
  },
  versions: [copyFinalizedVersion],
  documents: [
    {
      id: 'document-1',
      quotationVersionId: 'version-1',
      fileName: 'QT-2026-000001-v1.pdf',
      mimeType: 'application/pdf',
      fileSize: 4096,
      checksum: 'abc',
      documentType: 'QUOTATION_PDF',
      status: 'AVAILABLE',
      createdAt: '2026-07-21T00:00:00.000Z',
    },
  ],
  emailLogs: [],
  activityTimeline: [],
};
const template = {
  id: '11111111-1111-4111-8111-111111111111',
  templateCode: 'QTP-2026-000001',
  name: 'Goa family escape',
  description: 'Coastal package',
  destinationSummary: 'Goa • Calangute',
  durationDays: 5,
  durationNights: 4,
  baseCurrency: 'INR',
  adultBasePrice: '35000',
  childWithBedBasePrice: '22000',
  childWithoutBedBasePrice: '12000',
  infantBasePrice: '2500',
  status: 'ACTIVE',
  usageCount: 3,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: person,
  cities: ['Calangute'],
  itinerary: [],
  hotels: [],
  services: [],
  inclusions: [],
  exclusions: [],
  terms: [],
  actionPermissions: { canUpdate: true, canDelete: true, canUse: true },
};
const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});

/* ------------------------------------------------------------------ *
 * Create Quotation — searchable lead field
 * ------------------------------------------------------------------ */

const visibleLead = {
  id: 'lead-1',
  queryNumber: 'QRY-1',
  customerName: 'Aarav Mehta',
  phone: '+91 90000 00000',
  email: 'aarav@example.test',
};
const searchableLead = {
  id: 'lead-1042',
  queryNumber: 'QRY-1042',
  customerName: 'Vikas Singh',
  phone: '9876543210',
  email: 'vikas@example.test',
};

/** Every `?search=` term the lead field actually sent to the list endpoint. */
const searchTerms = (mock: { mock: { calls: unknown[][] } }) =>
  mock.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost').searchParams.get('search'))
    .filter((term): term is string => term !== null);

/**
 * Stand-in for `GET /queries`, filtering the way the server does: the caller
 * only ever sees `visible`, and `search` narrows *within* that set across
 * customer name, phone, email and query number. Passing a smaller `visible`
 * models a user with a narrower lead visibility scope.
 */
const leadSearchFetch = (visible: Array<typeof visibleLead> = [visibleLead, searchableLead]) =>
  vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
    async (input, options) => {
      if (options?.method === 'POST') return response({ id: 'quotation-new' });
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.startsWith('/api/queries')) {
        const id = url.pathname.slice('/api/queries'.length).replace(/^\//, '');
        if (id) return response(visible.find((lead) => lead.id === id) ?? null);
        const term = (url.searchParams.get('search') ?? '').toLowerCase();
        const matches = term
          ? visible.filter((lead) =>
              [lead.customerName, lead.phone, lead.email, lead.queryNumber]
                .join(' ')
                .toLowerCase()
                .includes(term),
            )
          : visible;
        return response(page(matches));
      }
      return response(page([template]));
    },
  );

/** Open the lead combobox and wait for its listbox. */
const openLeadList = async () => {
  await userEvent.click(await screen.findByLabelText('Lead'));
  return screen.findByRole('listbox');
};

/** Open the lead combobox and choose the option matching `name`. */
const pickLead = async (name: RegExp) => {
  await openLeadList();
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('Phase 8 quotation pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'quotation_templates.view',
      'quotation_templates.create',
      'quotation_templates.update',
      'quotation_templates.delete',
      'quotations.view',
      'quotations.create',
      'quotations.update',
      'quotations.send',
      'quotations.generate_pdf',
      'quotations.view_costing',
    ]);
  });

  it('loads a dense template list and synchronizes search/status filters', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(page([template])),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<QuotationTemplatesPage />);
    expect((await screen.findAllByText('Goa family escape')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('QTP-2026-000001').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Search templates'), 'Coastal');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ACTIVE');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('search=Coastal&status=ACTIVE')),
      ).toBe(true),
    );
  });

  it('duplicates a template and changes its status from the list actions', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (_input, options) =>
        options?.method === 'POST' || options?.method === 'PATCH'
          ? response(template)
          : response(page([template])),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<QuotationTemplatesPage />);
    await screen.findAllByText('Goa family escape');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) =>
            String(url).endsWith(`/${template.id}/duplicate`) && options?.method === 'POST',
        ),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) =>
            String(url).endsWith(`/${template.id}/status`) && options?.method === 'PATCH',
        ),
      ).toBe(true),
    );
  });

  it('renders template empty and error states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(page([]))),
    );
    const empty = renderWithProviders(<QuotationTemplatesPage />);
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    empty.unmount();
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
    renderWithProviders(<QuotationTemplatesPage />);
    expect(await screen.findByText('Quotation templates could not be loaded.')).toBeInTheDocument();
  });

  it('renders the template preview with route, hotel, service and content sections', async () => {
    const preview = {
      ...template,
      hotels: [
        {
          id: 'hotel-1',
          city: 'Calangute',
          hotelName: 'Coastal Bay Resort',
          category: '4 star',
          roomType: 'Deluxe',
          mealPlan: 'Breakfast',
          rooms: 1,
          nights: 4,
          checkInDate: null,
          checkOutDate: null,
          sellingPrice: '12500',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
      services: [
        {
          id: 'service-1',
          serviceType: 'SIGHTSEEING',
          name: 'North Goa tour',
          description: null,
          dayNumber: 2,
          city: 'Goa',
          quantity: '1',
          sellingPrice: '2500',
          taxCategory: null,
          notes: null,
          sequence: 1,
        },
      ],
      itinerary: [
        {
          id: 'day-1',
          dayNumber: 1,
          date: null,
          title: 'Arrival and check-in',
          destination: 'Calangute',
          description: 'Private transfer to the hotel.',
          meals: 'Breakfast',
          overnightLocation: 'Calangute',
          activities: null,
          transfers: null,
          notes: null,
          sequence: 1,
        },
      ],
      inclusions: [{ id: 'inc-1', content: 'Daily breakfast', sequence: 1 }],
      exclusions: [{ id: 'exc-1', content: 'Personal expenses', sequence: 1 }],
      terms: [{ id: 'term-1', content: 'Subject to availability', sequence: 1 }],
      counts: { cities: 1, services: 1, hotelOptions: 1 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(preview)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quotation-templates/:templateId" element={<QuotationTemplateDetailsPage />} />
      </Routes>,
      { route: `/quotation-templates/${template.id}` },
    );
    expect(
      await screen.findByRole('heading', { name: 'Goa family escape', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Coastal Bay Resort')).toBeInTheDocument();
    expect(screen.getByText('North Goa tour')).toBeInTheDocument();
    expect(screen.getByText(/Daily breakfast/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use template' })).toBeInTheDocument();
  });

  it('uses React Hook Form dynamic hotel, itinerary and service rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(template)),
    );
    renderWithProviders(<QuotationTemplateFormPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Add hotel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add service' }));
    expect(screen.getByLabelText('Hotel name')).toBeInTheDocument();
    expect(screen.getByLabelText('Day description')).toBeInTheDocument();
    expect(screen.getByLabelText('Service type')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBeGreaterThan(0);
  });

  it('renders quotation analytics and a customer/version row', async () => {
    const quotation = {
      id: '22222222-2222-4222-8222-222222222222',
      quotationNumber: 'QT-2026-000001',
      customerName: 'Aarav Mehta',
      destinationSummary: 'Goa',
      status: 'SENT',
      currentVersionId: 'version-1',
      lastSentAt: '2026-07-21T00:00:00.000Z',
      lastViewedAt: null,
      validUntil: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-07-20T00:00:00.000Z',
      createdBy: person,
      query: { id: 'lead-1', queryNumber: 'QRY-2026-000001' },
      versions: [{ id: 'version-1', versionNumber: 1, currency: 'INR', finalAmount: '16065.87' }],
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () =>
        response({
          ...page([quotation]),
          analytics: { byStatus: { SENT: 1 }, totalQuotedValue: '16065.87', acceptanceRate: 50 },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<QuotationsPage />);
    expect((await screen.findAllByText('QT-2026-000001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aarav Mehta').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Search quotations'), 'Aarav');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=Aarav'))).toBe(true),
    );
  });

  it('shows the simplified quotation table and clean header', async () => {
    const quotation = {
      id: '22222222-2222-4222-8222-222222222222',
      quotationNumber: 'QT-2026-000001',
      customerName: 'Aarav Mehta',
      destinationSummary: 'Goa',
      status: 'SENT',
      currentVersionId: 'version-1',
      lastSentAt: '2026-07-21T00:00:00.000Z',
      lastViewedAt: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      createdBy: person,
      query: { id: 'lead-1', queryNumber: 'QRY-2026-000001' },
      versions: [{ id: 'version-1', versionNumber: 1, currency: 'INR', finalAmount: '16065.87' }],
    };
    const fetchMock = vi.fn(async () =>
      response({
        ...page([quotation]),
        analytics: { byStatus: { SENT: 1 }, totalQuotedValue: '16065.87', acceptanceRate: 50 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<QuotationsPage />);
    await screen.findAllByText('QT-2026-000001');
    // Clean header: eyebrow + subtitle removed.
    expect(screen.queryByText('Commercial workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/Versioned proposals/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Customer quotations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /New quotation/ })).toBeInTheDocument();
    // Table shows the simplified columns, LEAD heading, no removed columns.
    const thead = document.querySelector('thead');
    expect(thead).not.toBeNull();
    const headerText = thead!.textContent ?? '';
    for (const header of ['Quotation', 'Lead', 'Destination', 'Version', 'Created by', 'Created']) {
      expect(headerText).toContain(header);
    }
    expect(headerText).not.toContain('Final amount');
    expect(headerText).not.toContain('Last sent');
    expect(headerText).not.toContain('Last viewed');
    expect(headerText).not.toContain('Lead / customer');
  });

  it('calculates a live builder summary and hides costing without permission', async () => {
    const draftVersion = {
      id: 'version-1',
      versionNumber: 1,
      title: 'Goa proposal',
      introduction: null,
      destinationSummary: 'Goa',
      travelStartDate: null,
      travelEndDate: null,
      currency: 'INR',
      subtotalSellingPrice: '100',
      subtotalCost: '50',
      markupMode: 'NONE',
      markupValue: '0',
      totalMarkup: '0',
      taxRate: '0',
      taxAmount: '0',
      discountAmount: '0',
      finalAmount: '100',
      marginAmount: '50',
      marginPercentage: '50',
      pricingMode: 'ITEMIZED',
      notes: null,
      internalNotes: null,
      status: 'DRAFT',
      finalizedAt: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      createdBy: person,
      itinerary: [],
      hotels: [
        {
          id: 'hotel-1',
          city: 'Goa',
          hotelName: 'Coastal Bay',
          category: null,
          roomType: null,
          mealPlan: null,
          rooms: 1,
          nights: 1,
          checkInDate: null,
          checkOutDate: null,
          internalCost: '50',
          sellingPrice: '100',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
      services: [],
      inclusions: [],
      exclusions: [],
      terms: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          quotationNumber: 'QT-2026-000001',
          customerName: 'Aarav Mehta',
          adults: 1,
          childrenWithBed: 0,
          childrenWithoutBed: 0,
          infants: 0,
          versions: [draftVersion],
        }),
      ),
    );
    const renderBuilder = () =>
      renderWithProviders(
        <Routes>
          <Route
            path="/quotations/:quotationId/versions/:versionId/edit"
            element={<QuotationBuilderPage />}
          />
        </Routes>,
        { route: '/quotations/quotation-1/versions/version-1/edit' },
      );
    const costView = renderBuilder();
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel' }));
    expect(await screen.findByLabelText('Hotel amount')).toBeEnabled();
    expect(screen.queryByLabelText('Hotel internal cost')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Summary & Pricing' }));
    // Per-passenger pricing: 1 adult × 110 = the package total.
    await userEvent.type(screen.getByLabelText('Per Adult Price'), '110');
    // The Total Package Price field, breakdown and the summary card all echo it.
    expect((await screen.findAllByText('INR 110.00')).length).toBeGreaterThan(0);
    // Net Amount (margin basis) is a costing-only field.
    expect(screen.getByLabelText('Net Amount')).toBeInTheDocument();
    costView.unmount();
    auth.permissions.delete('quotations.view_costing');
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel' }));
    expect(screen.queryByLabelText('Hotel internal cost')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Summary & Pricing' }));
    expect(screen.queryByLabelText('Net Amount')).not.toBeInTheDocument();
  });

  it('marks every Lead-requested service tab with a red asterisk', async () => {
    const draftVersion = {
      id: 'version-1',
      versionNumber: 1,
      title: 'Malaysia proposal',
      introduction: null,
      destinationSummary: 'Kuala Lumpur',
      travelStartDate: null,
      travelEndDate: null,
      currency: 'INR',
      subtotalSellingPrice: '0',
      subtotalCost: '0',
      markupMode: 'NONE',
      markupValue: '0',
      totalMarkup: '0',
      taxRate: '0',
      taxAmount: '0',
      discountAmount: '0',
      finalAmount: '0',
      marginAmount: '0',
      marginPercentage: '0',
      pricingMode: 'ITEMIZED',
      notes: null,
      internalNotes: null,
      status: 'DRAFT',
      finalizedAt: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      createdBy: person,
      itinerary: [],
      hotels: [],
      services: [
        { serviceType: 'FLIGHT', name: 'flight', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', taxCategory: null, notes: null, sequence: 1 },
        { serviceType: 'HOTEL', name: 'hotel', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', taxCategory: null, notes: null, sequence: 2 },
        { serviceType: 'SIGHTSEEING', name: 'sightseeing', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', taxCategory: null, notes: null, sequence: 3 },
        { serviceType: 'CRUISE', name: 'cruise', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', taxCategory: null, notes: null, sequence: 4 },
        { serviceType: 'VEHICLE_TRANSFER', name: 'vehicle', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', taxCategory: null, notes: null, sequence: 5 },
        { serviceType: 'OTHER_ADD_ON', name: 'add-on', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', taxCategory: null, notes: null, sequence: 6 },
      ],
      inclusions: [],
      exclusions: [],
      terms: [],
    };
    const quotation = {
      id: 'quotation-1',
      quotationNumber: 'QT-2026-000001',
      customerName: 'Aarav Mehta',
      currentVersionId: 'version-1',
      destinationSummary: 'Kuala Lumpur',
      travelStartDate: null,
      travelEndDate: null,
      adults: 1,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      rooms: 1,
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-1',
        leadStage: 'QUOTATION_SENT',
        assignedToId: null,
        createdById: 'user-1',
        departureCity: null,
        departureCountry: null,
        services: [
          { serviceType: 'FLIGHT' },
          { serviceType: 'HOTEL' },
          { serviceType: 'SIGHTSEEING' },
          { serviceType: 'CRUISE' },
          { serviceType: 'VEHICLE_TRANSFER' },
          { serviceType: 'OTHER_ADD_ON' },
        ],
      },
      versions: [draftVersion],
      documents: [],
      emailLogs: [],
      booking: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(quotation)),
    );
    renderWithProviders(
      <Routes>
        <Route
          path="/quotations/:quotationId/versions/:versionId/edit"
          element={<QuotationBuilderPage />}
        />
      </Routes>,
      { route: '/quotations/quotation-1/versions/version-1/edit' },
    );
    await screen.findByRole('button', { name: 'Flight' });
    // Every Lead-requested service tab shows a red `*` inside its button text.
    for (const label of ['Flight', 'Hotel', 'Sightseeing', 'Cruise', 'Vehicle', 'Add-on Services']) {
      const tab = screen.getByRole('button', { name: label });
      expect(tab.textContent).toContain('*');
    }
  });

  it('shows version history and runs revision, PDF, public-link and send actions', async () => {
    const finalizedVersion = {
      id: 'version-1',
      versionNumber: 1,
      title: 'Goa proposal',
      introduction: 'A coastal holiday.',
      destinationSummary: 'Goa',
      travelStartDate: null,
      travelEndDate: null,
      currency: 'INR',
      subtotalSellingPrice: '25000',
      markupMode: 'NONE',
      markupValue: '0',
      totalMarkup: '0',
      taxRate: '0',
      taxAmount: '0',
      discountAmount: '0',
      finalAmount: '25000',
      pricingMode: 'ITEMIZED',
      notes: null,
      status: 'FINALIZED',
      finalizedAt: '2026-07-21T00:00:00.000Z',
      createdAt: '2026-07-21T00:00:00.000Z',
      createdBy: person,
      itinerary: [],
      hotels: [],
      services: [],
      inclusions: [],
      exclusions: [],
      terms: [],
    };
    const detail = {
      id: 'quotation-1',
      quotationNumber: 'QT-2026-000001',
      queryId: 'lead-1',
      currentVersionId: 'version-1',
      status: 'SENT',
      customerName: 'Aarav Mehta',
      customerEmail: 'aarav@example.test',
      customerPhone: '+91 90000 00000',
      destinationSummary: 'Goa',
      travelStartDate: null,
      travelEndDate: null,
      adults: 2,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      rooms: 1,
      validUntil: null,
      lastSentAt: '2026-07-21T00:00:00.000Z',
      lastViewedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
      createdBy: person,
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-1',
        leadStage: 'QUOTATION_SENT',
        assignedToId: 'user-1',
        createdById: 'user-1',
      },
      versions: [finalizedVersion],
      documents: [
        {
          id: 'document-1',
          quotationVersionId: 'version-1',
          fileName: 'QT-2026-000001-v1.pdf',
          mimeType: 'application/pdf',
          fileSize: 4096,
          checksum: 'abc',
          documentType: 'QUOTATION_PDF',
          status: 'AVAILABLE',
          createdAt: '2026-07-21T00:00:00.000Z',
        },
      ],
      emailLogs: [],
      activityTimeline: [],
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (input, options) => {
        const url = String(input);
        if (!options || options.method === 'GET') return response(detail);
        if (url.endsWith('/public-link'))
          return response({ url: 'http://localhost:5173/q/customer-token' });
        if (url.endsWith('/send')) return response({ sent: true, publicUrl: null });
        if (url.endsWith('/versions')) return response({ id: 'version-2', versionNumber: 2 });
        return response({ id: 'document-1', reused: true });
      },
    );
    const clipboardWrite = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    expect(await screen.findByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText('QT-2026-000001-v1.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/generate-pdf'))).toBe(
        true,
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith('http://localhost:5173/q/customer-token'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create revision' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/versions'))).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Recipient email')).toHaveValue('aarav@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send quotation' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/send'))).toBe(true),
    );
  });

  it('shows inclusive travel dates and no lifecycle status on the detail page', async () => {
    const detail = {
      ...copyQuotationDetail,
      travelStartDate: '2026-09-02',
      travelEndDate: null,
      validUntil: '2026-09-20',
      status: 'SENT',
      versions: [
        {
          ...copyFinalizedVersion,
          travelStartDate: '2026-09-02',
          travelEndDate: null,
          itinerary: [
            { id: 'i1', dayNumber: 1, title: 'Arrive', destination: 'Kuala Lumpur', description: 'a', meals: null, overnightLocation: null, activities: null, transfers: null, notes: null, sequence: 1 },
            { id: 'i2', dayNumber: 7, title: 'Depart', destination: 'Kuala Lumpur', description: 'b', meals: null, overnightLocation: null, activities: null, transfers: null, notes: null, sequence: 2 },
          ],
        },
      ],
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (_input, options) => {
        if (!options || options.method === 'GET') return response(detail);
        return response({ id: 'doc-new', reused: true });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByText('Version 1');
    // Travel dates: 7-day trip starting 02/09/2026 ends 08/09/2026 (inclusive).
    const start = new Date('2026-09-02').toLocaleDateString();
    const end = new Date('2026-09-08').toLocaleDateString();
    expect(screen.getByText(`${start} – ${end}`)).toBeInTheDocument();
    // No "Open" anywhere in the travel dates row.
    expect(screen.queryByText(/– Open/)).not.toBeInTheDocument();
    // No lifecycle Status card and no Valid until row.
    expect(screen.queryByText('Valid until')).not.toBeInTheDocument();
    const statusLabel = screen.queryByText((_content, element) =>
      element?.textContent === 'Status' &&
      element?.tagName === 'P' &&
      element?.className?.includes('uppercase'),
    );
    expect(statusLabel).toBeNull();
  });

  it('copy public link shows a Copy icon, a Copied! tooltip on success, and resets', async () => {
    const detailForCopy = copyQuotationDetail;
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (input, options) => {
        const url = String(input);
        if (!options || options.method === 'GET') return response(detailForCopy);
        if (url.endsWith('/public-link'))
          return response({ url: 'http://localhost:5173/q/customer-token' });
        return response({ id: 'document-1', reused: true });
      },
    );
    const clipboardWrite = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByText('Version 1');
    // Copy public link uses the Copy icon (not the ExternalLink icon).
    const copyButton = screen.getByRole('button', { name: 'Copy public link' });
    expect(copyButton.querySelector('svg')).not.toBeNull();
    // Open Weblink sits immediately after Copy public link and shares the URL.
    const buttonsRow = copyButton.closest('div')!;
    const rowText = buttonsRow.textContent ?? '';
    expect(rowText.indexOf('Copy public link')).toBeLessThan(rowText.indexOf('Open Weblink'));
    await userEvent.click(copyButton);
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith('http://localhost:5173/q/customer-token'),
    );
    // Tooltip shows "Copied!" after a successful copy.
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
    // Tooltip resets to the default label afterwards (after ~1.8s).
    await waitFor(
      () => expect(screen.queryByText('Copied!')).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
    // Open Weblink is a same-origin anchor to the same URL with rel noopener.
    const weblink = screen.getByRole('link', { name: 'Open Weblink' });
    expect(weblink.getAttribute('href')).toBe('http://localhost:5173/q/customer-token');
    expect(weblink.getAttribute('target')).toBe('_blank');
    expect(weblink.getAttribute('rel')).toContain('noopener');
    expect(weblink.getAttribute('rel')).toContain('noreferrer');
  });

  it('does not show Copied! when the clipboard write fails', async () => {
    const detailForCopy = copyQuotationDetail;
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (input, options) => {
        const url = String(input);
        if (!options || options.method === 'GET') return response(detailForCopy);
        if (url.endsWith('/public-link'))
          return response({ url: 'http://localhost:5173/q/customer-token' });
        return response({ id: 'document-1', reused: true });
      },
    );
    const clipboardWrite = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByText('Version 1');
    await userEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled());
    // Failed copy must NOT show "Copied!".
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
  });

  it('re-provisions the public link when the current version changes', async () => {
    // Simulate the current version changing during the same page session (e.g.
    // after finalize/duplicate): the quotation refetch returns a new
    // currentVersionId, so the cached public link must be re-resolved for the
    // new version rather than reused from the old one.
    const mutableDetail = {
      ...copyQuotationDetail,
      versions: [
        copyFinalizedVersion,
        { ...copyFinalizedVersion, id: 'version-2', versionNumber: 2 },
      ],
    };
    const publicLinkCalls: Array<{ versionId: string }> = [];
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (input, options) => {
        const url = String(input);
        // Return a fresh clone each time so a refetch is a new object reference,
        // which is what makes the component's effect re-run on version change.
        if (!options || options.method === 'GET')
          return response(JSON.parse(JSON.stringify(mutableDetail)));
        if (url.endsWith('/public-link')) {
          const body = JSON.parse(String(options.body)) as { quotationVersionId: string };
          publicLinkCalls.push({ versionId: body.quotationVersionId });
          return response({
            url: `http://localhost:5173/q/token-for-${body.quotationVersionId}`,
          });
        }
        if (url.endsWith('/duplicate')) {
          // Duplicating invalidates the quotation query; flip the current
          // version to v2 on the next refetch to simulate a session change.
          mutableDetail.currentVersionId = 'version-2';
          return response({ id: 'version-2' });
        }
        return response({ id: 'document-1', reused: true });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    // Mount provisions the link for the initially current version (v1).
    await waitFor(() =>
      expect(publicLinkCalls.some((call) => call.versionId === 'version-1')).toBe(true),
    );
    // Copy copies the v1 URL, not a stale one.
    const clipboardWrite = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith('http://localhost:5173/q/token-for-version-1'),
    );
    // Duplicate: invalidates the quotation query and flips currentVersionId to v2.
    await userEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]!);
    // After refetch, the component re-provisions for v2.
    await waitFor(() =>
      expect(publicLinkCalls.some((call) => call.versionId === 'version-2')).toBe(true),
    );
    // Copy now uses the v2 URL (the stale v1 URL is discarded).
    clipboardWrite.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith('http://localhost:5173/q/token-for-version-2'),
    );
  });

  it('creates from a visible lead and saved template', async () => {
    const fetchMock = leadSearchFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, {
      route: '/quotations/new?templateId=11111111-1111-4111-8111-111111111111',
    });
    await pickLead(/Aarav Mehta/);
    await userEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => {
          if (options?.method !== 'POST') return false;
          const body = JSON.parse(String(options.body));
          return body.queryId === 'lead-1' && body.templateId === template.id;
        }),
      ).toBe(true),
    );
  });

  it('does not render the copied-safely informational line on Create Quotation', async () => {
    vi.stubGlobal('fetch', leadSearchFetch());
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await openLeadList();
    expect(
      screen.queryByText(
        'Customer and traveller details are copied safely. Templates become independent snapshots.',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not render the Start from section on Create Quotation', async () => {
    vi.stubGlobal('fetch', leadSearchFetch());
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await openLeadList();
    expect(screen.queryByText('Start from')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quotation template')).not.toBeInTheDocument();
    expect(screen.queryByText('Blank quotation / lead itinerary')).not.toBeInTheDocument();
  });

  it('searches leads by customer name and shows the distinguishing detail line', async () => {
    const fetchMock = leadSearchFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await userEvent.type(await screen.findByLabelText('Lead'), 'Vikas');

    // The unfiltered list holds both leads, so wait for the narrowed result.
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Vikas Singh/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Aarav Mehta/ })).not.toBeInTheDocument();
    });
    const option = screen.getByRole('option', { name: /Vikas Singh/ });
    expect(
      within(option).getByText('QRY-1042 · 9876543210 · vikas@example.test'),
    ).toBeInTheDocument();
    expect(searchTerms(fetchMock)).toContain('Vikas');
  });

  it('searches leads by phone number and by email', async () => {
    const fetchMock = leadSearchFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    const input = await screen.findByLabelText('Lead');

    await userEvent.type(input, '9876543210');
    await screen.findByRole('option', { name: /Vikas Singh/ });
    await waitFor(() => expect(searchTerms(fetchMock)).toContain('9876543210'));

    await userEvent.clear(input);
    await userEvent.type(input, 'aarav@example.test');
    await screen.findByRole('option', { name: /Aarav Mehta/ });
    await waitFor(() => expect(searchTerms(fetchMock)).toContain('aarav@example.test'));
  });

  it('searches leads by lead/query id', async () => {
    vi.stubGlobal('fetch', leadSearchFetch());
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await userEvent.type(await screen.findByLabelText('Lead'), 'QRY-1042');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Vikas Singh/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Aarav Mehta/ })).not.toBeInTheDocument();
    });
  });

  it('shows "No leads found" when the search matches nothing', async () => {
    vi.stubGlobal('fetch', leadSearchFetch());
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await userEvent.type(await screen.findByLabelText('Lead'), 'Nobody');
    expect(await screen.findByText('No leads found')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('surfaces an error state when the lead search request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            json: async () => ({ success: false, message: 'Server error' }),
          }) as Response,
      ),
    );
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await userEvent.click(await screen.findByLabelText('Lead'));
    expect(await screen.findByText('Unable to search leads.')).toBeInTheDocument();
  });

  it('selecting a search result sets that lead and creates the quotation with its id', async () => {
    const fetchMock = leadSearchFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });

    await userEvent.type(await screen.findByLabelText('Lead'), 'Vikas');
    await userEvent.click(await screen.findByRole('option', { name: /Vikas Singh/ }));

    // The chosen lead is shown in the closed field...
    expect(screen.getByLabelText('Lead')).toHaveValue('Vikas Singh · QRY-1042');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // ...and the unchanged create action posts that lead's id.
    await userEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => {
          if (options?.method !== 'POST') return false;
          const body = JSON.parse(String(options.body));
          return body.queryId === 'lead-1042' && body.templateId === null;
        }),
      ).toBe(true),
    );
  });

  it('searches only the leads the server makes visible to the caller', async () => {
    // This caller may see one lead. The other exists in the tenant but is
    // outside their visibility, so the server never returns it — and the
    // combobox must therefore never offer it.
    const fetchMock = leadSearchFetch([visibleLead]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });

    await userEvent.type(await screen.findByLabelText('Lead'), 'Vikas');
    expect(await screen.findByText('No leads found')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Vikas Singh/ })).not.toBeInTheDocument();

    // Every lookup goes through the permission-scoped list endpoint; the field
    // never reaches for an unscoped or bespoke search route.
    const leadUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/queries'));
    expect(leadUrls.length).toBeGreaterThan(0);
    for (const url of leadUrls) expect(url).toMatch(/\/api\/queries\?pageSize=\d+/);
  });

  it('locks the lead field to the route lead and still creates with it', async () => {
    const fetchMock = leadSearchFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/queries/:queryId/quotations/new" element={<NewQuotationPage />} />
      </Routes>,
      { route: '/queries/lead-1/quotations/new' },
    );

    const input = await screen.findByLabelText('Lead');
    await waitFor(() => expect(input).toHaveValue('Aarav Mehta · QRY-1'));
    expect(input).toBeDisabled();
    await userEvent.click(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => {
          if (options?.method !== 'POST') return false;
          return JSON.parse(String(options.body)).queryId === 'lead-1';
        }),
      ).toBe(true),
    );
  });

  it('creates a blank quotation through the default path when no template is passed', async () => {
    const fetchMock = leadSearchFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, { route: '/quotations/new' });
    await pickLead(/Aarav Mehta/);
    await userEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => {
          if (options?.method !== 'POST') return false;
          const body = JSON.parse(String(options.body));
          return body.queryId === 'lead-1' && body.templateId === null;
        }),
      ).toBe(true),
    );
  });

  it('completes the presigned attachment upload and server confirmation flow', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (input, options) => {
        const url = String(input);
        if (url === 'https://storage.example.test/upload')
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        if (url.endsWith('/uploads'))
          return response({
            documentId: 'document-1',
            uploadUrl: 'https://storage.example.test/upload',
            requiredHeaders: { 'Content-Type': 'application/pdf' },
          });
        if (url.endsWith('/uploads/document-1/confirm'))
          return response({ id: 'document-1', status: 'AVAILABLE' });
        throw new Error(`Unexpected request: ${url} ${options?.method}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF'], 'voucher.pdf', { type: 'application/pdf' });
    await expect(uploadQuotationAttachment('quotation-1', file)).resolves.toBe('document-1');
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url) === 'https://storage.example.test/upload' &&
          options?.method === 'PUT' &&
          options.body === file,
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).endsWith('/uploads/document-1/confirm') && options?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('renders the customer-safe public page without the final-amount/decision box', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: 'https://storage.example.test/alpha-logo.png',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        introduction: 'A coastal holiday.',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        hotelDetails: {
          sectionTitle: 'Accommodation Details',
          amount: 0,
          description: '<p>Hotel welcome note.</p>',
        },
        flightDetails: {
          include: true,
          sectionTitle: 'Flight Details',
          amount: 0,
          journeyType: 'ONEWAY_OUTBOUND',
          outbound: {
            fromCity: 'Delhi',
            toCity: 'Goa',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: 'aaaaaaa4-1111-4111-8111-111111111111',
                airlineName: 'Air India',
                flightNumber: 'AI101',
                travelClass: 'Economy',
                from: 'Delhi',
                to: 'Goa',
                departureDate: '2026-09-10',
                departureTime: '10:00',
                arrivalDate: '2026-09-10',
                arrivalTime: '12:00',
                duration: '2h 0m',
                cabinLuggage: '7kg',
                checkInLuggage: '20kg',
                notes: null,
                connectionVia: null,
              },
            ],
          },
          returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
        },
        hotels: [
          {
            id: 'quote-hotel-1',
            hotelName: 'Coastal Bay Resort',
            city: 'Calangute',
            category: '4 Star',
            roomType: 'Deluxe Room',
            mealPlan: 'Breakfast Only',
            rooms: 1,
            nights: 4,
            checkInDate: '2026-09-10T00:00:00.000Z',
            checkOutDate: '2026-09-14T00:00:00.000Z',
            sellingPrice: '12000',
            selected: true,
            notes: null,
            sequence: 1,
          },
        ],
        services: [
          {
            id: 'quote-vehicle-1',
            serviceType: 'VEHICLE_TRANSFER',
            name: 'Innova Crysta',
            description: '<p>Private air-conditioned transport.</p>',
            dayNumber: null,
            city: 'SUV',
            quantity: '1',
            unitSellingPrice: '5000',
            totalSellingPrice: '5000',
            sellingPrice: '5000',
            taxCategory: 'Transportation',
            notes: '3 hours',
            sequence: 1,
          },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {
        'quote-hotel-1': {
          imageUrl: 'https://storage.example.test/coastal-bay.jpg',
          starCategory: 4,
          starRating: '4.6',
          address: 'Calangute Beach Road',
          reviewLink: 'https://reviews.example.test/coastal-bay',
          checkInTime: '14:00',
          checkOutTime: '12:00',
          destination: 'Goa',
          country: 'India',
        },
      },
      vehiclePresentations: {
        'quote-vehicle-1': {
          imageUrl: 'https://storage.example.test/innova.jpg',
          name: 'Innova Crysta',
          vehicleType: 'SUV',
          capacity: 6,
        },
      },
      airlinePresentations: {
        'aaaaaaa4-1111-4111-8111-111111111111': {
          name: 'Air India',
          logoUrl: 'https://storage.example.test/air-india-logo.png',
        },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    expect(await screen.findByText('Goa proposal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Hotels' })).toBeInTheDocument();
    expect(screen.getByText('Hotel welcome note.').closest('article')).not.toBeNull();
    // Hotel image uses the dynamic presentation URL in a landscape cover wrapper.
    const hotelImg = screen.getByAltText('Coastal Bay Resort');
    expect(hotelImg).toHaveAttribute('src', 'https://storage.example.test/coastal-bay.jpg');
    expect(hotelImg).toHaveAttribute('class', expect.stringContaining('object-cover'));
    expect(hotelImg.parentElement?.className).toContain('aspect-[4/3]');
    // The hotel card container is a full-width single-column grid, not narrow tiles.
    const hotelsSection = screen.getByRole('heading', { name: 'Your Hotels' }).closest('section');
    expect(hotelsSection?.querySelector('div.grid')?.className).not.toContain('md:grid-cols-2');
    expect(screen.getByText(/Deluxe Room/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Transportation' })).toBeInTheDocument();
    expect(screen.getByAltText('Innova Crysta')).toHaveAttribute(
      'src',
      'https://storage.example.test/innova.jpg',
    );
    expect(screen.getByText('Private air-conditioned transport.')).toBeInTheDocument();
    expect(screen.getByAltText('Air India logo')).toHaveAttribute(
      'src',
      'https://storage.example.test/air-india-logo.png',
    );
    // The public final-amount/decision box is no longer rendered.
    expect(screen.queryByText('Final quotation amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Valid until/)).not.toBeInTheDocument();
    // Contact Us flows straight into the public footer.
    const footer = document.querySelector('footer');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent('Alpha Travel. All rights reserved.');
  });

  it('hides an excluded service (hotelDetails.include=false) from the public weblink', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: 'https://storage.example.test/alpha-logo.png',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        introduction: null,
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        // Hotel explicitly excluded in the quotation → must not render.
        hotelDetails: { include: false, sectionTitle: 'Accommodation Details' },
        flightDetails: null,
        sightseeingDetails: null,
        hotels: [
          {
            id: 'hotel-1',
            city: 'Goa',
            hotelName: 'Coastal Bay Resort',
            category: '5 Star',
            roomType: 'Deluxe Room',
            mealPlan: 'BB',
            nights: 3,
            selected: true,
            notes: null,
          },
        ],
        itinerary: [],
        services: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      heroImageUrl: null,
      hotelPresentations: {},
      vehiclePresentations: {},
      airlinePresentations: {},
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');
    // The excluded Hotel section is completely absent.
    expect(screen.queryByRole('heading', { name: /Your Hotels|Accommodation Details/ })).toBeNull();
    expect(screen.queryByText('Coastal Bay Resort')).not.toBeInTheDocument();
    // "Hotels" does not appear in Services Include.
    const servicesInclude = screen.queryByText('Services Include')?.closest('section');
    if (servicesInclude) {
      expect(within(servicesInclude).queryByText('Hotels')).not.toBeInTheDocument();
    }
  });

  it('shows the Master destination (Malaysia) in Destinations while the hero stays the city', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: '919876543210',
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: null,
      },
      quotation: {
        quotationNumber: 'QT-2026-000123',
        customerName: 'Rajesh Kumar',
        destinationSummary: 'Kuala Lumpur',
        destinations: 'Malaysia',
        travelStartDate: '2026-10-23',
        travelEndDate: '2026-10-27',
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Kuala Lumpur Package for Rajesh Kumar',
        introduction: null,
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '80000',
        notes: null,
        perAdultPrice: '40000',
        perChildWithBedPrice: '0',
        perChildWithoutBedPrice: '0',
        perInfantPrice: '0',
        taxNote: null,
        initialPaymentAmount: '0',
        paymentLink: null,
        inclusionsHtml: null,
        exclusionsHtml: null,
        paymentPolicies: null,
        cancellationPolicies: null,
        bookingTerms: null,
        weblinkHeading: 'Kuala Lumpur',
        includeVisa: false,
        visaSectionTitle: null,
        visaAmount: '0',
        visaDestination: null,
        visaType: null,
        visaServiceCharge: '0',
        visaGstPercent: '0',
        visaVfsCharge: '0',
        sightseeingDetails: { include: false, days: [] },
        flightDetails: null,
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
        createdBy: null,
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    // Hero heading remains the city.
    expect(await screen.findByRole('heading', { name: 'Kuala Lumpur' })).toBeInTheDocument();
    // The Destinations summary card shows the Master destination (Malaysia).
    const dest = screen.getByText('Destinations');
    expect(dest.closest('div')?.textContent).toContain('Malaysia');
    expect(dest.closest('div')?.textContent).not.toContain('Kuala Lumpur');
    // Package title keeps the city.
    expect(screen.getByText('Kuala Lumpur Package for Rajesh Kumar')).toBeInTheDocument();
  });

  it('deduplicates destination names in the Destinations summary', async () => {
    const base = {
      company: {
        name: 'Alpha Travel', email: 'hello@alpha.test', phone: '919876543210',
        website: null, address: null, primaryColor: '#2563eb',
        operatingSince: 2015, tripsSold: 4200, tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5', logoUrl: null,
      },
      quotation: {
        quotationNumber: 'QT-2026-000124', customerName: 'Rajesh Kumar',
        destinationSummary: 'Kuala Lumpur',
        // Malaysia repeated across two itinerary stays → deduplicated.
        destinations: 'Malaysia → Singapore',
        travelStartDate: '2026-10-23', travelEndDate: '2026-10-27',
        adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1,
        validUntil: null, createdAt: '2026-08-04T10:00:00.000Z', status: 'VIEWED',
      },
      version: {
        title: 'Malaysia & Singapore Package', introduction: null, versionNumber: 1,
        currency: 'INR', finalAmount: '80000', notes: null,
        perAdultPrice: '40000', perChildWithBedPrice: '0', perChildWithoutBedPrice: '0', perInfantPrice: '0',
        taxNote: null, initialPaymentAmount: '0', paymentLink: null,
        inclusionsHtml: null, exclusionsHtml: null, paymentPolicies: null,
        cancellationPolicies: null, bookingTerms: null, weblinkHeading: 'Kuala Lumpur',
        includeVisa: false, visaSectionTitle: null, visaAmount: '0', visaDestination: null,
        visaType: null, visaServiceCharge: '0', visaGstPercent: '0', visaVfsCharge: '0',
        sightseeingDetails: { include: false, days: [] }, flightDetails: null,
        hotels: [], services: [], itinerary: [], inclusions: [], exclusions: [], terms: [],
        createdBy: null,
      },
      downloadUrl: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(base)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByRole('heading', { name: 'Kuala Lumpur' });
    const dest = screen.getByText('Destinations');
    expect(dest.closest('div')?.textContent).toContain('Malaysia → Singapore');
  });

  it('removes the optional add-ons amount line from the Total Package Price card', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: '919876543210',
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: null,
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        introduction: 'A coastal holiday.',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '10000',
        perAdultPrice: '5000',
        perChildWithBedPrice: '0',
        perChildWithoutBedPrice: '0',
        perInfantPrice: '0',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        flightDetails: null,
        hotels: [],
        services: [
          {
            id: 'quote-addon-1',
            serviceType: 'TRAVEL_INSURANCE',
            addOnServiceId: 'quote-addon-master-1',
            name: 'Travel Insurance',
            description: '<p>Comprehensive international cover.</p>',
            dayNumber: null,
            city: null,
            quantity: '1',
            unitSellingPrice: '3800',
            totalSellingPrice: '3800',
            sellingPrice: '3800',
            taxCategory: 'Insurance',
            notes: null,
            sequence: 1,
          },
          {
            id: 'quote-vehicle-1',
            serviceType: 'VEHICLE_TRANSFER',
            name: 'Innova Crysta',
            description: '<p>Private air-conditioned transport.</p>',
            dayNumber: null,
            city: 'SUV',
            quantity: '1',
            unitSellingPrice: '5000',
            totalSellingPrice: '5000',
            sellingPrice: '5000',
            taxCategory: 'Transportation',
            notes: '3 hours',
            sequence: 2,
          },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {},
      vehiclePresentations: {},
      airlinePresentations: {},
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');
    // 1. Final package price is still shown.
    expect(screen.getByText('Total Package Price')).toBeInTheDocument();
    expect(screen.getByText(/₹10,000/)).toBeInTheDocument();
    // 2. The traveller price breakdown still shows.
    expect(screen.getByText(/2 Adults × ₹5,000/)).toBeInTheDocument();
    // 3. The optional add-ons summary text is gone.
    expect(screen.queryByText(/add-ons \(optional\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/optional add-ons/i)).not.toBeInTheDocument();
    // 4. The add-on amount no longer appears as a summary line under the price.
    expect(screen.queryByText(/₹3,800/)).not.toBeInTheDocument();
    // 5. Add-on services elsewhere on the weblink remain unaffected.
    expect(screen.getByRole('heading', { name: 'Additional Services' })).toBeInTheDocument();
    expect(screen.getByText('Travel Insurance')).toBeInTheDocument();
    // Contact Now is preserved.
    expect(screen.getByRole('link', { name: /Contact Now/ })).toHaveAttribute(
      'href',
      'tel:919876543210',
    );
  });

  it('renders multiple hotels as wide cards and falls back without an image', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Grand Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'h1', hotelName: 'Marina Bay Sands', city: 'Singapore', category: '5 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 3, checkInDate: null, checkOutDate: null, sellingPrice: '20000', selected: true, notes: null, sequence: 1 },
          { id: 'h2', hotelName: 'Orchard Hotel', city: 'Singapore', category: '4 Star', roomType: 'Superior', mealPlan: 'Half Board', rooms: 1, nights: 3, checkInDate: null, checkOutDate: null, sellingPrice: '15000', selected: true, notes: null, sequence: 2 },
        ],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {
        'h1': { imageUrl: 'https://storage.example.test/marina-bay.jpg', starCategory: 5, starRating: '4.8', address: 'Bayfront', reviewLink: null, checkInTime: '15:00', checkOutTime: '12:00', destination: 'Singapore', country: 'Singapore' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Grand Escape');

    // Both hotels render as separate full-width cards.
    const section = screen.getByRole('heading', { name: 'Your Hotels' }).closest('section') as HTMLElement;
    expect(section.querySelectorAll('article').length).toBe(2);
    expect(section.querySelector('div.grid')?.className).not.toContain('md:grid-cols-2');
    // First hotel uses its own dynamic image with a landscape cover wrapper.
    const marina = screen.getByAltText('Marina Bay Sands');
    expect(marina).toHaveAttribute('src', 'https://storage.example.test/marina-bay.jpg');
    expect(marina).toHaveAttribute('class', expect.stringContaining('object-cover'));
    expect(marina.parentElement?.className).toContain('aspect-[4/3]');
    // Second hotel has no presentation and uses the fallback.
    expect(screen.getByText('Orchard Hotel')).toBeInTheDocument();
    expect(screen.getByText('Hotel image unavailable')).toBeInTheDocument();
    expect(screen.queryByAltText('Orchard Hotel')).not.toBeInTheDocument();
  });

  it('drops the auto-generated "prepared for" sentence from the public hero', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: 'https://storage.example.test/alpha-logo.png',
      },
      quotation: {
        quotationNumber: 'QT-2026-000010',
        customerName: 'Vikas Singh',
        destinationSummary: 'Singapore',
        travelStartDate: '2026-09-10T00:00:00.000Z',
        travelEndDate: '2026-09-14T00:00:00.000Z',
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Singapore Package for Vikas Singh',
        introduction: 'A travel proposal prepared for Vikas Singh.',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Singapore Package for Vikas Singh');

    // The stock "prepared for" sentence is fully gone from the hero.
    expect(screen.queryByText('A travel proposal prepared for Vikas Singh.')).not.toBeInTheDocument();
    expect(screen.queryByText(/A travel proposal prepared for/)).not.toBeInTheDocument();

    // Destination and duration headline remain visible.
    expect(screen.getByRole('heading', { name: 'Singapore' })).toBeInTheDocument();
    expect(screen.getAllByText('4 Nights / 5 Days').length).toBeGreaterThan(0);

    // The traveller name stays in the summary card.
    expect(screen.getByText('Vikas Singh')).toBeInTheDocument();

    // Contact Us and the public footer are still present.
    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeInTheDocument();
    const footer = document.querySelector('footer');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent('Alpha Travel. All rights reserved.');

    // The final-amount/decision black box remains absent.
    expect(screen.queryByText('Final quotation amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();

    // Dynamic tab title and logo favicon are unchanged.
    expect(document.title).toBe('Singapore Package for Vikas Singh');
    await waitFor(() =>
      expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
        'href',
        'https://storage.example.test/alpha-logo.png',
      ),
    );
  });

  it('renders a taller, balanced destination hero on public links', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000011',
        customerName: 'Riya Kapoor',
        destinationSummary: 'Bali',
        travelStartDate: '2026-09-10T00:00:00.000Z',
        travelEndDate: '2026-09-14T00:00:00.000Z',
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Bali Package for Riya Kapoor',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      heroImageUrl: 'https://storage.example.test/bali-hero.jpg',
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Bali Package for Riya Kapoor');

    // The destination image stays a cover, no-repeat background.
    const hero = screen.getByRole('banner');
    expect(hero.className).toContain('bg-cover');
    expect(hero.className).toContain('bg-no-repeat');
    // Responsive heights: mobile 300, tablet 330, desktop 380.
    expect(hero.className).toContain('min-h-[300px]');
    expect(hero.className).toContain('sm:min-h-[330px]');
    expect(hero.className).toContain('md:min-h-[380px]');
    expect(hero.className).toContain('items-center');
    // Balanced positioning shows more of the image without stretching it.
    expect(hero.style.backgroundPosition).toBe('center 45%');
    expect(hero.style.backgroundImage).toContain('https://storage.example.test/bali-hero.jpg');
    // A left-weighted dark overlay improves readability without hiding the image.
    expect(hero.style.backgroundImage).toContain('rgba(8,22,45,0.72)');

    // Hero values are preserved: destination heading, duration, package title.
    expect(screen.getByRole('heading', { name: 'Bali' })).toBeInTheDocument();
    expect(screen.getAllByText('4 Nights / 5 Days').length).toBeGreaterThan(0);
    expect(screen.getByText('Bali Package for Riya Kapoor')).toBeInTheDocument();

    // The hero text block is left-aligned in the page content container, never
    // horizontally centred.
    const heroContent = screen.getByRole('heading', { name: 'Bali' }).parentElement!;
    expect(heroContent.className).toContain('text-left');
    expect(heroContent.className).toContain('max-w-5xl');
    expect(heroContent.className).toContain('mx-auto');
    expect(heroContent.className).not.toContain('text-center');
    const destination = screen.getByRole('heading', { name: 'Bali' });
    expect(destination.className).toContain('font-extrabold');
    expect(destination.className).toContain('text-[32px]');
    expect(destination.className).toContain('lg:text-[48px]');
    const packageTitle = screen.getByText('Bali Package for Riya Kapoor');
    expect(packageTitle.className).toContain('font-bold');
    expect(packageTitle.className).toContain('lg:text-[28px]');
    // The stored title is not uppercased.
    expect(packageTitle.textContent).toBe('Bali Package for Riya Kapoor');

    // Summary and price cards still sit below the hero.
    expect(screen.getByText('Total Package Price')).toBeInTheDocument();
  });

  it('renders the summary and price cards in normal flow below the hero image', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000012',
        customerName: 'Riya Kapoor',
        destinationSummary: 'Bali',
        travelStartDate: '2026-09-10T00:00:00.000Z',
        travelEndDate: '2026-09-14T00:00:00.000Z',
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Bali Package for Riya Kapoor',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        initialPaymentAmount: '5000',
        paymentLink: 'https://pay.example.test/secure',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      heroImageUrl: 'https://storage.example.test/bali-hero.jpg',
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Bali Package for Riya Kapoor');

    // 1. The hero section renders before the information/price card wrapper.
    const header = screen.getByRole('banner');
    const cardsSection = screen.getByText('Traveler Name').closest('section')!;
    expect(
      header.compareDocumentPosition(cardsSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // 2 & 3. The information card and the total-price card are both outside the
    // hero container (which clips its overflow).
    expect(header.contains(cardsSection)).toBe(false);
    const priceCard = screen.getByText('Total Package Price').closest('div.bg-emerald-600');
    expect(priceCard).not.toBeNull();
    expect(header.contains(priceCard!)).toBe(false);

    // The cards sit in normal document flow: no negative margin, no relative
    // z-index lift, no translate — a clean gap below the hero instead.
    const contentWrapper = cardsSection.parentElement!;
    expect(contentWrapper?.className).toContain('mt-8');
    expect(contentWrapper?.className).not.toMatch(/-mt-\d+/);
    expect(contentWrapper?.className).not.toContain('relative');
    expect(contentWrapper?.className).not.toContain('z-10');
    expect(contentWrapper?.className).not.toContain('translate');

    // 4. Secure Your Booking Now renders after the information/price cards.
    const secureSection = screen
      .getByRole('heading', { name: 'Secure Your Booking Now' })
      .closest('section')!;
    expect(
      cardsSection.compareDocumentPosition(secureSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // 5. Existing price values, summary fields and buttons still render.
    expect(screen.getByText('Traveler Name')).toBeInTheDocument();
    expect(screen.getByText('Travel Date')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Travelers')).toBeInTheDocument();
    expect(screen.getByText(/₹16,066/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pay Now/ })).toHaveAttribute(
      'href',
      'https://pay.example.test/secure',
    );

    // 6. No negative-margin/overlap utilities remain anywhere on the page.
    expect(document.querySelector('.mx-auto')).not.toBeNull();
    expect(document.querySelector('[class*="-mt-"]')).toBeNull();
    expect(document.querySelector('[class*="translate"]')).toBeNull();
  });

  it('renders included services as separate cards with the Services Include heading', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Singapore',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Grand Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '200000',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        flightDetails: {
          include: true,
          sectionTitle: 'Flight Details',
          amount: 0,
          journeyType: 'ONEWAY_OUTBOUND',
          outbound: {
            fromCity: 'Delhi',
            toCity: 'Singapore',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: 'air-1',
                airlineName: 'Air India',
                flightNumber: 'AI101',
                travelClass: 'Economy',
                from: 'Delhi',
                to: 'Singapore',
                departureDate: '2026-09-10',
                departureTime: '10:00',
                arrivalDate: '2026-09-10',
                arrivalTime: '12:00',
                duration: '2h 0m',
                cabinLuggage: '7kg',
                checkInLuggage: '20kg',
                notes: null,
                connectionVia: null,
              },
            ],
          },
          returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
        },
        hotels: [
          {
            id: 'h1',
            hotelName: 'Marina Bay Sands',
            city: 'Singapore',
            category: '5 Star',
            roomType: 'Deluxe',
            mealPlan: 'Breakfast',
            rooms: 1,
            nights: 3,
            checkInDate: '2026-09-10T00:00:00.000Z',
            checkOutDate: '2026-09-13T00:00:00.000Z',
            sellingPrice: '20000',
            selected: true,
            notes: null,
            sequence: 1,
          },
        ],
        services: [
          {
            id: 's-sight',
            serviceType: 'SIGHTSEEING',
            name: 'City Tour',
            description: null,
            dayNumber: 1,
            city: 'Singapore',
            quantity: '1',
            unitSellingPrice: '3000',
            totalSellingPrice: '3000',
            sellingPrice: '3000',
            taxCategory: 'Sightseeing',
            notes: null,
            sequence: 1,
          },
          {
            id: 's-cruise',
            serviceType: 'CRUISE',
            name: 'Harbour Cruise',
            description: null,
            dayNumber: 2,
            city: 'Singapore',
            quantity: '1',
            unitSellingPrice: '5000',
            totalSellingPrice: '5000',
            sellingPrice: '5000',
            taxCategory: 'Cruise',
            notes: null,
            sequence: 2,
          },
          {
            id: 's-vehicle',
            serviceType: 'VEHICLE_TRANSFER',
            name: 'Airport Transfer',
            description: null,
            dayNumber: 1,
            city: 'Singapore',
            quantity: '1',
            unitSellingPrice: '2000',
            totalSellingPrice: '2000',
            sellingPrice: '2000',
            taxCategory: 'Transportation',
            notes: null,
            sequence: 3,
          },
          {
            id: 's-addon',
            serviceType: 'TRAVEL_INSURANCE',
            name: 'Travel Insurance',
            description: null,
            dayNumber: null,
            city: null,
            quantity: '1',
            unitSellingPrice: '1500',
            totalSellingPrice: '1500',
            sellingPrice: '1500',
            taxCategory: 'Add-on',
            notes: null,
            sequence: 4,
          },
        ],
        includeVisa: true,
        visaAmount: '2500',
        visaServiceCharge: '500',
        visaGstPercent: '18',
        visaVfsCharge: '300',
        visaType: 'Tourist',
        visaDestination: 'Singapore',
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Grand Escape');

    const heading = screen.getByRole('heading', { name: 'Services Include' });
    const section = heading.closest('section') as HTMLElement;
    // Heading sits on the page background, not inside the old large rounded card.
    expect(section.className).not.toContain('rounded-2xl');
    expect(section.className).not.toContain('bg-card');

    // Every included service renders as its own card with a green check icon.
    for (const label of [
      'Flights',
      'Hotels',
      'Sightseeing',
      'Cruise',
      'Transportation',
      'Add-ons',
      'Visa',
    ]) {
      const labelNode = within(section).getByText(label);
      expect(labelNode.closest('article')).not.toBeNull();
      expect(labelNode.closest('article')?.querySelector('svg')).not.toBeNull();
    }
    // Cards are rectangular, not pill badges, and the old wrapper is gone.
    expect(section.querySelector('.rounded-full')).toBeNull();
    expect(section.querySelector('.bg-emerald-50')).toBeNull();
  });

  it('does not render a duplicate Services & Experiences block on the public page', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000007', customerName: 'Aarav Mehta', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'No Duplicate Block',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '200000',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        flightDetails: {
          include: true,
          sectionTitle: 'Flight Details',
          amount: 0,
          journeyType: 'ONEWAY_OUTBOUND',
          outbound: {
            fromCity: 'Delhi',
            toCity: 'Singapore',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: 'air-1',
                airlineName: 'Air India',
                flightNumber: 'AI101',
                travelClass: 'Economy',
                from: 'Delhi',
                to: 'Singapore',
                departureDate: '2026-09-10',
                departureTime: '10:00',
                arrivalDate: '2026-09-10',
                arrivalTime: '12:00',
                duration: '2h 0m',
                cabinLuggage: '7kg',
                checkInLuggage: '20kg',
                notes: null,
                connectionVia: null,
              },
            ],
          },
          returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
        },
        hotels: [
          { id: 'h1', hotelName: 'Marina Bay Sands', city: 'Singapore', category: '5 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 3, checkInDate: null, checkOutDate: null, sellingPrice: '20000', selected: true, notes: null, sequence: 1 },
        ],
        services: [
          { id: 's-sight', serviceType: 'SIGHTSEEING', name: 'City Tour', description: null, dayNumber: 1, city: 'Singapore', quantity: '1', unitSellingPrice: '3000', totalSellingPrice: '3000', sellingPrice: '3000', taxCategory: 'Sightseeing', notes: null, sequence: 1 },
          { id: 's-cruise', serviceType: 'CRUISE', name: 'Harbour Cruise', description: null, dayNumber: 2, city: 'Singapore', quantity: '1', unitSellingPrice: '5000', totalSellingPrice: '5000', sellingPrice: '5000', taxCategory: 'Cruise', notes: null, sequence: 2 },
          { id: 's-vehicle', serviceType: 'VEHICLE_TRANSFER', name: 'Airport Transfer', description: null, dayNumber: 1, city: 'Singapore', quantity: '1', unitSellingPrice: '2000', totalSellingPrice: '2000', sellingPrice: '2000', taxCategory: 'Transportation', notes: null, sequence: 3 },
          { id: 's-addon', serviceType: 'TRAVEL_INSURANCE', name: 'Travel Insurance', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '1500', totalSellingPrice: '1500', sellingPrice: '1500', taxCategory: 'Add-on', notes: null, sequence: 4 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('No Duplicate Block');

    // The duplicate block is gone entirely.
    expect(screen.queryByRole('heading', { name: 'Services & Experiences' })).not.toBeInTheDocument();
    expect(screen.queryByText('Services & Experiences')).not.toBeInTheDocument();
    // No duplicate standalone row for the non-addon sightseeing service (the
    // only kind the old block would have shown without a dedicated section).
    expect(screen.queryByText('City Tour')).not.toBeInTheDocument();

    // Dedicated sections still render.
    expect(screen.getByRole('heading', { name: 'Services Include' })).toBeInTheDocument();
    expect(screen.getByText('Marina Bay Sands')).toBeInTheDocument();
    expect(screen.getByText('Air India')).toBeInTheDocument();
    expect(screen.getByText('Harbour Cruise')).toBeInTheDocument();

    // Add-ons still render under "Additional Services".
    const addonsHeading = screen.getByRole('heading', { name: 'Additional Services' });
    const addonsSection = addonsHeading.closest('section') as HTMLElement;
    expect(within(addonsSection).getByText('Travel Insurance')).toBeInTheDocument();
  });

  it('does not resurrect the block for legacy generic service names', async () => {
    const service = (id: string, serviceType: string, name: string) => ({
      id,
      serviceType,
      name,
      description: null,
      dayNumber: null,
      city: null,
      quantity: '1',
      unitSellingPrice: '0',
      totalSellingPrice: '0',
      sellingPrice: '0',
      taxCategory: null,
      notes: null,
      sequence: 1,
    });
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000008', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Legacy Generic Services',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [
          service('s1', 'SIGHTSEEING', 'sightseeing'),
          service('s2', 'CRUISE', 'cruise'),
          service('s3', 'VEHICLE_TRANSFER', 'vehicle'),
          service('s4', 'FLIGHT', 'flight'),
          service('s5', 'TRAVEL_INSURANCE', 'visa'),
          service('s6', 'SIGHTSEEING', 'hotel'),
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Legacy Generic Services');

    // No "Services & Experiences" block, and no bare duplicate value rows for
    // values that only the old block ever displayed (no dedicated section).
    expect(screen.queryByRole('heading', { name: 'Services & Experiences' })).not.toBeInTheDocument();
    expect(screen.queryByText('Services & Experiences')).not.toBeInTheDocument();
    expect(screen.queryByText('hotel', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('sightseeing', { exact: true })).not.toBeInTheDocument();
    // Legacy cruise/vehicle values still render inside their dedicated sections.
    expect(screen.getByText('cruise', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('vehicle', { exact: true })).toBeInTheDocument();
    // The legacy add-on value still renders as an add-on under "Additional Services".
    const addonsHeading = screen.getByRole('heading', { name: 'Additional Services' });
    const addonsSection = addonsHeading.closest('section') as HTMLElement;
    expect(within(addonsSection).getByText('visa')).toBeInTheDocument();
  });

  it('shows the Sightseeing service card from saved sightseeing details', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Sightseeing Trip',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'h1', hotelName: 'Marina Bay', city: 'Singapore', category: '5 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '1000', selected: true, notes: null, sequence: 1 },
        ],
        // No SIGHTSEEING service rows — the canonical sightseeingDetails drives the card.
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            { dayNumber: 1, title: 'City Tour', city: 'Singapore', meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }] },
            { dayNumber: 2, title: 'Gardens by the Bay', city: 'Singapore', meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [{ name: 'Cloud Forest', description: null, startTime: null, sightseeingId: null, imageUrl: null }] },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Sightseeing Trip');

    const section = screen.getByRole('heading', { name: 'Services Include' }).closest('section') as HTMLElement;
    // Exactly one Sightseeing card, with a green icon and check indicator.
    const sightseeingCards = within(section).getAllByText('Sightseeing');
    expect(sightseeingCards).toHaveLength(1);
    const card = sightseeingCards[0]!.closest('article');
    expect(card).not.toBeNull();
    expect(card?.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    // Stable order: Hotels before Sightseeing.
    const cardLabels = [...section.querySelectorAll('article span')].map((s) => s.textContent);
    expect(cardLabels).toEqual(['Hotels', 'Sightseeing']);
  });

  it('hides the Sightseeing card for empty or placeholder sightseeing data', async () => {
    const baseVersion = {
      title: 'No Sightseeing',
      versionNumber: 1,
      currency: 'INR',
      finalAmount: '100',
      hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
      hotels: [
        { id: 'h1', hotelName: 'Marina Bay', city: 'Singapore', category: '5 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '1000', selected: true, notes: null, sequence: 1 },
      ],
      services: [],
      itinerary: [],
      inclusions: [],
      exclusions: [],
      terms: [],
    };
    const renderVersion = async (sightseeingDetails: unknown) => {
      const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
        async () => response({
          company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
          quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
          version: { ...baseVersion, sightseeingDetails },
          downloadUrl: null,
        }),
      );
      vi.stubGlobal('fetch', fetchMock);
      renderWithProviders(
        <Routes>
          <Route path="/q/:token" element={<PublicQuotationPage />} />
        </Routes>,
        { route: '/q/public-token-value-with-at-least-32-characters' },
      );
      await screen.findByText('No Sightseeing');
      const section = screen.getByRole('heading', { name: 'Services Include' }).closest('section') as HTMLElement;
      return within(section).queryByText('Sightseeing');
    };

    // Empty days array → no card.
    expect(await renderVersion({ include: true, sectionTitle: 'Sightseeing', amount: 0, description: null, days: [] })).not.toBeInTheDocument();
    cleanup();
    // Placeholder day with no title and empty activities → no card.
    expect(
      await renderVersion({
        include: true,
        sectionTitle: 'Sightseeing',
        amount: 0,
        description: null,
        days: [
          { dayNumber: 1, title: '', city: null, meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [] },
        ],
      }),
    ).not.toBeInTheDocument();
  });

  it('removes the old generic itinerary card but keeps the detailed sightseeing timeline', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Itinerary Check',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [],
        // The old generic itinerary snapshot must no longer be rendered.
        itinerary: [
          { id: 'd1', dayNumber: 1, title: 'Singapore', destination: 'Singapore', description: '4 night stay in Singapore.', overnightLocation: 'Singapore', meals: null, transfers: null, sequence: 1 },
        ],
        // The detailed sightseeing timeline must still render.
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            { dayNumber: 1, title: 'City Tour', city: 'Singapore', meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }] },
          ],
        },
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Itinerary Check');

    // The old generic itinerary card is gone (no generic title, description, or overnight line).
    expect(screen.queryByText(/4 night stay in Singapore/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Overnight: Singapore/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Day 1: Singapore/)).not.toBeInTheDocument();
    // The detailed sightseeing timeline still renders.
    expect(screen.getByRole('heading', { name: 'Your Itinerary' })).toBeInTheDocument();
    expect(screen.getByText('Merlion Park')).toBeInTheDocument();
  });

  it('does not render any itinerary fallback when there is no detailed sightseeing', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'No Itinerary',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [],
        itinerary: [
          { id: 'd1', dayNumber: 1, title: 'Singapore', destination: 'Singapore', description: '4 night stay in Singapore.', overnightLocation: 'Singapore', meals: null, transfers: null, sequence: 1 },
        ],
        sightseeingDetails: null,
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('No Itinerary');

    // No generic fallback itinerary card and no "Your Itinerary" heading.
    expect(screen.queryByRole('heading', { name: 'Your Itinerary' })).not.toBeInTheDocument();
    expect(screen.queryByText(/4 night stay in Singapore/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Day 1: Singapore/)).not.toBeInTheDocument();
  });

  it('renders the Your Itinerary timeline with deduplicated titles, metadata and badges', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: '2026-08-10T00:00:00.000Z', travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Singapore Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: '<p>Explore the highlights.</p>',
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: '2026-08-10',
              meals: { breakfast: true, lunch: false, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'SHARED',
              activities: [
                { name: 'Merlion Park', description: '<p>Visit the <strong>Merlion</strong>.</p>', startTime: '09:00', sightseeingId: null, imageUrl: 'https://storage.example.test/merlion.jpg' },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      heroImageUrl: 'https://storage.example.test/singapore-hero.jpg',
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Singapore Escape');

    expect(screen.getByRole('heading', { name: 'Your Itinerary' })).toBeInTheDocument();
    // Section intro renders sanitized rich text inside the Instructions info box.
    expect(screen.getByText('Instructions')).toBeInTheDocument();
    expect(screen.getByText('Explore the highlights.')).toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
    // Deduplicated day title (never "Day 1: Day 1: …").
    expect(screen.getByRole('heading', { name: 'Day 1: City Tour' })).toBeInTheDocument();
    expect(screen.queryByText('Day 1: Day 1: City Tour')).not.toBeInTheDocument();
    // Metadata: city + formatted date.
    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    expect(within(article).getByText('Singapore')).toBeInTheDocument();
    expect(within(article).getByText(/Mon, 10 Aug 2026/)).toBeInTheDocument();
    // Snapshot image used first.
    const img = within(article).getByAltText('Day 1: City Tour');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/merlion.jpg');
    // Fixed desktop image wrapper (image never stretches to the description).
    const wrapper = img.parentElement as HTMLElement;
    expect(wrapper.className).toContain('md:w-[285px]');
    expect(wrapper.className).toContain('md:h-[180px]');
    expect(wrapper.className).not.toContain('h-full');
    // Transfer badge + meals.
    expect(within(article).getByText('Shared Transfer')).toBeInTheDocument();
    expect(within(article).getByText(/Meals:/)).toBeInTheDocument();
    expect(within(article).getByText('Breakfast (Hotel)')).toBeInTheDocument();
  });

  it('renders independent per-meal modes and transfer details in the Meals summary', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000005', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Per Meal Options',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: true, lunch: true, dinner: true },
              mealMode: 'INCLUDE_AT_HOTEL',
              mealPreferences: {
                breakfast: { mode: 'NO_TRANSFER', transferDetails: null },
                lunch: { mode: 'INCLUDE_AT_HOTEL', transferDetails: null },
                dinner: { mode: 'WITH_TRANSFER', transferDetails: 'at the Taj Hotel' },
              },
              dailyTransfer: 'SHARED',
              activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Per Meal Options');
    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    expect(
      within(article).getByText('Breakfast (No Transfer), Lunch (Hotel), Dinner (With Transfer: at the Taj Hotel)'),
    ).toBeInTheDocument();
    // Daily transfer badge stays independent of the meal-transfer configuration.
    expect(within(article).getByText('Shared Transfer')).toBeInTheDocument();
  });

  it('falls back to the shared mealMode when no per-meal preferences exist', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000006', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Legacy Meals',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: true, dinner: true },
              mealMode: 'WITH_TRANSFER',
              dailyTransfer: 'SHARED',
              activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Legacy Meals');
    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    // The shared legacy WITH_TRANSFER mode now renders per meal.
    expect(
      within(article).getByText('Breakfast (With Transfer), Dinner (With Transfer)'),
    ).toBeInTheDocument();
  });

  it('shows With Transfer without details and hides the Meals row when nothing is selected', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000011', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'No Detail Meal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: false, lunch: false, dinner: true },
              mealMode: 'NO_TRANSFER',
              mealPreferences: {
                dinner: { mode: 'WITH_TRANSFER', transferDetails: '' },
              },
              dailyTransfer: 'NO_TRANSFER',
              activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('No Detail Meal');
    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    // WITH_TRANSFER with blank details renders without a trailing colon.
    expect(within(article).getByText('Dinner (With Transfer)')).toBeInTheDocument();
    // Unselected meals (Breakfast/Lunch) are never shown.
    expect(within(article).queryByText(/Breakfast/)).not.toBeInTheDocument();
    expect(within(article).queryByText(/Lunch/)).not.toBeInTheDocument();
  });

  it('normalizes legacy meal-mode variants instead of falling back to Hotel', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000012', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Legacy Variants',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: true, lunch: true, dinner: true },
              mealMode: 'INCLUDE AT HOTEL',
              mealPreferences: {
                breakfast: { mode: 'NO TRANSFER', transferDetails: null },
                lunch: { mode: 'no-transfer', transferDetails: null },
                dinner: { mode: 'HOTEL', transferDetails: null },
              },
              dailyTransfer: 'NO_TRANSFER',
              activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Legacy Variants');
    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    // Each variant normalizes to its canonical label; none becomes (Hotel).
    expect(
      within(article).getByText('Breakfast (No Transfer), Lunch (No Transfer), Dinner (Hotel)'),
    ).toBeInTheDocument();
  });

  it('does not fall back to Hotel for an unknown per-meal mode', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000013', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Unknown Mode',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: true },
              mealMode: 'INCLUDE_AT_HOTEL',
              mealPreferences: {
                breakfast: { mode: 'PICNIC', transferDetails: null },
              },
              dailyTransfer: 'NO_TRANSFER',
              activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Unknown Mode');
    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    // A present-but-unknown per-meal mode shows no suffix (never (Hotel)).
    expect(within(article).getByText('Meals:')).toBeInTheDocument();
    expect(within(article).getByText('Breakfast')).toBeInTheDocument();
    expect(within(article).queryByText('Breakfast (Hotel)')).not.toBeInTheDocument();
  });

  it('shows a thumbnail for every activity and matches them to the correct activity', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000009', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Thumbnails',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: false, lunch: false, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'NO_TRANSFER',
              activities: [
                { name: 'Arrival in Singapore & Hotel Check-in', description: '<p>Check in.</p>', startTime: null, sightseeingId: null, imageUrl: 'https://storage.example.test/arrival.jpg' },
                { name: 'Night Safari – Singapore', description: null, startTime: null, sightseeingId: 'sg-ns', imageUrl: null },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      sightseeingPresentations: {
        'sg-ns': { imageUrl: 'https://storage.example.test/night-safari.jpg' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Thumbnails');

    const article = screen.getByRole('heading', { name: 'Day 1: City Tour' }).closest('article') as HTMLElement;
    expect(within(article).getByText('Activities & Details')).toBeInTheDocument();
    // First activity uses its snapshot image; second resolves its signed presentation.
    const arrival = within(article).getByAltText('Arrival in Singapore & Hotel Check-in');
    expect(arrival).toHaveAttribute('src', 'https://storage.example.test/arrival.jpg');
    expect(arrival).toHaveClass('object-cover');
    const safari = within(article).getByAltText('Night Safari – Singapore');
    expect(safari).toHaveAttribute('src', 'https://storage.example.test/night-safari.jpg');
    // The large day image uses the first valid activity image too.
    const mainImages = within(article).getAllByRole('img');
    expect(mainImages[0]).toHaveAttribute('src', 'https://storage.example.test/arrival.jpg');
  });

  it('shows a neutral thumbnail placeholder when an activity has no image', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000010', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'No Thumbnails',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: City Tour',
              city: 'Singapore',
              date: null,
              meals: { breakfast: false, lunch: false, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'NO_TRANSFER',
              activities: [
                { name: 'Free Walking', description: null, startTime: null, sightseeingId: null, imageUrl: null },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('No Thumbnails');
    // No broken image icon for the activity without an image.
    expect(screen.queryByAltText('Free Walking')).not.toBeInTheDocument();
    expect(screen.getByText('Free Walking')).toBeInTheDocument();
  });

  it('falls back to the primary activity title when the day title is missing', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 2,
              title: '',
              city: 'Kochi',
              date: '2026-08-11',
              meals: { breakfast: false, lunch: false, dinner: false },
              mealMode: 'NO_TRANSFER',
              dailyTransfer: 'NO_TRANSFER',
              activities: [{ name: 'Sentosa Tour', description: null, startTime: null, sightseeingId: null, imageUrl: null }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByRole('heading', { name: 'Day 2: Sentosa Tour' })).toBeInTheDocument();
    // No transfer badge for NO_TRANSFER, no meals row when nothing selected.
    expect(screen.queryByText('Shared Transfer')).not.toBeInTheDocument();
    expect(screen.queryByText('Private Transfer')).not.toBeInTheDocument();
    expect(screen.queryByText(/Meals:/)).not.toBeInTheDocument();
  });

  it('renders the light-blue Instructions box with formatted rich text', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000003', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Instructions Box',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description:
            '<p>Meet your guide at the <strong>lobby</strong>.</p><p>Carry:</p><ul><li>Passport</li><li>Water bottle</li></ul><p>More at <a href="https://example.test">the site</a>.</p>',
          days: [
            { dayNumber: 1, title: 'Day 1: City Tour', city: 'Singapore', date: null, meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }] },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Instructions Box');

    const box = screen.getByText('Instructions').closest('div')?.parentElement as HTMLElement;
    // The info icon + Instructions heading render inside the box.
    expect(within(box).getByText('Instructions')).toBeInTheDocument();
    // Rich formatting: bold, lists and links are preserved, no raw tags.
    expect(box).toHaveTextContent('Meet your guide at the lobby.');
    expect(box).toHaveTextContent('Passport');
    expect(box).toHaveTextContent('Water bottle');
    expect(box.querySelector('strong')).toBeInTheDocument();
    expect(box.querySelector('ul')).toBeInTheDocument();
    expect(box.querySelector('a')).toHaveAttribute('href', 'https://example.test');
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
    // Unsafe scripts are sanitized away.
    expect(screen.queryByText(/alert/)).not.toBeInTheDocument();
    // The green itinerary timeline remains directly below the box.
    expect(screen.getByRole('heading', { name: 'Your Itinerary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Day 1: City Tour' })).toBeInTheDocument();
  });

  it('hides the Instructions box when the section description is empty', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000004', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Empty Instructions',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: '<p><br></p>',
          days: [
            { dayNumber: 1, title: 'Day 1: City Tour', city: 'Singapore', date: null, meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [{ name: 'Merlion Park', description: null, startTime: null, sightseeingId: null, imageUrl: null }] },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Empty Instructions');

    expect(screen.queryByText('Instructions')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your Itinerary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Day 1: City Tour' })).toBeInTheDocument();
  });

  it('hides empty sightseeing days and renders multiple activities in one card', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: Full Day',
              city: 'Kochi',
              date: null,
              meals: { breakfast: false, lunch: false, dinner: false },
              mealMode: 'NO_TRANSFER',
              dailyTransfer: 'NO_TRANSFER',
              activities: [
                { name: 'Morning Tour', description: '<p>Desc A</p>', startTime: null, sightseeingId: null, imageUrl: null },
                { name: 'Evening Dinner Cruise', description: '<p>Desc B</p>', startTime: null, sightseeingId: null, imageUrl: null },
              ],
            },
            {
              dayNumber: 2,
              title: '',
              city: null,
              date: null,
              meals: { breakfast: false, lunch: false, dinner: false },
              mealMode: 'NO_TRANSFER',
              dailyTransfer: 'NO_TRANSFER',
              activities: [],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByRole('heading', { name: 'Day 1: Full Day' })).toBeInTheDocument();
    // The empty day 2 is hidden entirely.
    expect(screen.queryByRole('heading', { name: 'Day 2:' })).not.toBeInTheDocument();
    // Both activities render inside the same day card, in order.
    const article = screen.getByRole('heading', { name: 'Day 1: Full Day' }).closest('article') as HTMLElement;
    expect(within(article).getByText('Morning Tour')).toBeInTheDocument();
    expect(within(article).getByText('Evening Dinner Cruise')).toBeInTheDocument();
    expect(article.querySelectorAll('h3').length).toBe(1);
    const activityOrder = [...article.querySelectorAll('p')]
      .map((node) => node.textContent)
      .filter((text) => text === 'Morning Tour' || text === 'Evening Dinner Cruise');
    expect(activityOrder).toEqual(['Morning Tour', 'Evening Dinner Cruise']);
  });

  it('renders sanitized rich text and strips unsafe scripts from activities', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: Tour',
              city: null,
              date: null,
              meals: { breakfast: false, lunch: false, dinner: false },
              mealMode: 'NO_TRANSFER',
              dailyTransfer: 'NO_TRANSFER',
              activities: [
                { name: 'Safe Tour', description: '<p>Safe content</p><script>window.pwned = true</script>', startTime: null, sightseeingId: null, imageUrl: null },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByText('Safe content')).toBeInTheDocument();
    expect(screen.queryByText(/window\.pwned/)).not.toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('single activity: omits thumbnail, keeps full-width title and description, transfer inside panel, meals below', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000003', customerName: 'Mira Shah', destinationSummary: 'Ladakh', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Ladakh Trip',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: Pangong',
              city: 'Leh',
              date: null,
              meals: { breakfast: true, lunch: false, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'SHARED',
              activities: [
                { name: 'Pangong Lake Visit', description: '<p>Beautiful lake at high altitude</p>', startTime: null, sightseeingId: null, imageUrl: null },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Ladakh Trip');
    const article = screen.getByRole('heading', { name: 'Day 1: Pangong' }).closest('article') as HTMLElement;
    // Header exists
    expect(within(article).getByText('Activities & Details')).toBeInTheDocument();
    // Activity name rendered without a dedicated thumbnail img
    expect(within(article).getByText('Pangong Lake Visit')).toBeInTheDocument();
    expect(within(article).queryByAltText('Pangong Lake Visit')).not.toBeInTheDocument();
    // Description visible
    expect(within(article).getByText('Beautiful lake at high altitude')).toBeInTheDocument();
    // Transfer badge appears inside the panel
    expect(within(article).getByText('Shared Transfer')).toBeInTheDocument();
    // Meals appear once below the panel
    expect(within(article).getByText('Breakfast (Hotel)')).toBeInTheDocument();
  });

  it('multiple activities: shows thumbnails, dividers, transfer per activity, meals once below panel', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000004', customerName: 'Mira Shah', destinationSummary: 'Goa', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Goa Beach Holiday',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 1,
              title: 'Day 1: North Goa',
              city: 'Goa',
              date: null,
              meals: { breakfast: false, lunch: true, dinner: false },
              mealMode: 'INCLUDE_AT_HOTEL',
              dailyTransfer: 'PRIVATE',
              activities: [
                { name: 'Fort Aguada', description: null, startTime: null, sightseeingId: null, imageUrl: null },
                { name: 'Calangute Beach', description: '<p>Relax by the shore</p>', startTime: null, sightseeingId: null, imageUrl: null },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa Beach Holiday');
    const article = screen.getByRole('heading', { name: 'Day 1: North Goa' }).closest('article') as HTMLElement;
    expect(within(article).getByText('Activities & Details')).toBeInTheDocument();
    expect(within(article).getByText('Fort Aguada')).toBeInTheDocument();
    expect(within(article).getByText('Calangute Beach')).toBeInTheDocument();
    expect(within(article).getByText('Relax by the shore')).toBeInTheDocument();
    // Divider between activities
    expect(article.querySelector('hr')).toBeInTheDocument();
    // Transfer badge inside panel (per activity: Private Transfer appears twice)
    const transferBadges = within(article).getAllByText('Private Transfer');
    expect(transferBadges.length).toBe(2);
    // Meals appear only once below the panel
    const mealsMatches = within(article).getAllByText('Lunch (Hotel)');
    expect(mealsMatches.length).toBe(1);
  });

  it('shows each activity its own transfer in the itinerary', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000009', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Per Activity Transfer',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 2,
              title: 'Day 2: Mandai Wildlife Reserve Adventure',
              city: 'Singapore',
              date: null,
              meals: { breakfast: true, lunch: false, dinner: false },
              mealMode: 'NO_TRANSFER',
              mealPreferences: { breakfast: { mode: 'NO_TRANSFER', transferDetails: null } },
              dailyTransfer: 'SHARED',
              activities: [
                { name: 'Singapore City Tour', description: null, startTime: null, sightseeingId: null, imageUrl: null, dailyTransfer: 'SHARED' },
                { name: 'Singapore Zoo', description: null, startTime: null, sightseeingId: null, imageUrl: null, dailyTransfer: 'NO_TRANSFER' },
                { name: 'Day at Cruise', description: null, startTime: null, sightseeingId: null, imageUrl: null, dailyTransfer: 'PRIVATE' },
              ],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Per Activity Transfer');
    const article = screen
      .getByRole('heading', { name: 'Day 2: Mandai Wildlife Reserve Adventure' })
      .closest('article') as HTMLElement;
    expect(within(article).getByText('Singapore City Tour')).toBeInTheDocument();
    expect(within(article).getByText('Singapore Zoo')).toBeInTheDocument();
    expect(within(article).getByText('Day at Cruise')).toBeInTheDocument();
    // Each activity shows its OWN saved transfer (not one shared day badge).
    expect(within(article).getAllByText('Shared Transfer')).toHaveLength(1);
    expect(within(article).getByText('No Transfer')).toBeInTheDocument();
    expect(within(article).getByText('Private Transfer')).toBeInTheDocument();
  });

  it('renders legacy sightseeing snapshot shapes without crashing', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [],
        sightseeingDetails: {
          include: true,
          sectionTitle: 'Sightseeing & Experiences',
          amount: 0,
          description: null,
          days: [
            {
              dayNumber: 3,
              dayTitle: 'Legacy Day',
              city: 'Munnar',
              date: '2026-08-12',
              meals: ['Breakfast', 'Dinner'],
              mealMode: 'WITH_TRANSFER',
              dailyTransfer: 'PRIVATE_TRANSFER',
              activity: [{ title: 'Legacy Activity', image: 'https://storage.example.test/legacy.jpg' }],
            },
          ],
        },
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByRole('heading', { name: 'Day 3: Legacy Day' })).toBeInTheDocument();
    expect(screen.getByText('Legacy Activity')).toBeInTheDocument();
    expect(screen.getByText('Private Transfer')).toBeInTheDocument();
    // Array meals normalize to booleans; the shared WITH_TRANSFER mode renders per meal.
    expect(screen.getByText('Breakfast (With Transfer), Dinner (With Transfer)')).toBeInTheDocument();
    const img = screen.getByAltText('Day 3: Legacy Day');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/legacy.jpg');
  });

  it('renders only services actually included and hides the section when none exist', async () => {
    const base = {
      title: 'Kerala Escape',
      versionNumber: 1,
      currency: 'INR',
      finalAmount: '120000',
      hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
      flightDetails: {
        include: false,
        sectionTitle: 'Flight Details',
        amount: 0,
        journeyType: 'ONEWAY_OUTBOUND',
        outbound: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
        returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
      },
      hotels: [
        {
          id: 'h1',
          hotelName: 'Backwater Resort',
          city: 'Alleppey',
          category: '4 Star',
          roomType: 'Villa',
          mealPlan: 'Breakfast',
          rooms: 1,
          nights: 3,
          checkInDate: '2026-09-10T00:00:00.000Z',
          checkOutDate: '2026-09-13T00:00:00.000Z',
          sellingPrice: '12000',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
      services: [],
      includeVisa: false,
      visaAmount: '0',
      visaServiceCharge: '0',
      visaGstPercent: '18',
      visaVfsCharge: '0',
      visaType: null,
      visaDestination: null,
      itinerary: [],
      inclusions: [],
      exclusions: [],
      terms: [],
    };
    const render = (version: unknown) => {
      const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
        async () => response({ company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' }, quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' }, version, downloadUrl: null }),
      );
      vi.stubGlobal('fetch', fetchMock);
      return renderWithProviders(
        <Routes>
          <Route path="/q/:token" element={<PublicQuotationPage />} />
        </Routes>,
        { route: '/q/public-token-value-with-at-least-32-characters' },
      );
    };

    // Hotels only: Flights/Hotels shown, everything else omitted.
    render(base);
    await screen.findByText('Kerala Escape');
    const section = screen.getByRole('heading', { name: 'Services Include' }).closest('section') as HTMLElement;
    expect(within(section).getByText('Hotels')).toBeInTheDocument();
    expect(within(section).queryByText('Flights')).not.toBeInTheDocument();
    expect(within(section).queryByText('Sightseeing')).not.toBeInTheDocument();
    expect(within(section).queryByText('Cruise')).not.toBeInTheDocument();
    expect(within(section).queryByText('Transportation')).not.toBeInTheDocument();
    expect(within(section).queryByText('Add-ons')).not.toBeInTheDocument();
    expect(within(section).queryByText('Visa')).not.toBeInTheDocument();

    // No included services at all → the whole section is hidden.
    cleanup();
    const noServices = {
      ...base,
      hotels: [],
      flightDetails: { include: false, sectionTitle: 'Flight Details', amount: 0, journeyType: 'ONEWAY_OUTBOUND', outbound: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] }, returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] } },
    };
    render(noServices);
    await screen.findByText('Kerala Escape');
    expect(screen.queryByRole('heading', { name: 'Services Include' })).not.toBeInTheDocument();
  });

  it('does not show a Hotels card when the quotation has no hotels', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-vehicle', serviceType: 'VEHICLE_TRANSFER', name: 'Airport Transfer', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '2000', totalSellingPrice: '2000', sellingPrice: '2000', taxCategory: 'Transportation', notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');

    const section = screen.getByRole('heading', { name: 'Services Include' }).closest('section') as HTMLElement;
    expect(within(section).getByText('Transportation')).toBeInTheDocument();
    expect(within(section).queryByText('Hotels')).not.toBeInTheDocument();
    expect(within(section).queryByText('Flights')).not.toBeInTheDocument();
  });

  it('renders the saved custom Vehicle section title on the public page', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-vehicle', serviceType: 'VEHICLE_TRANSFER', name: 'Airport Transfer', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '2000', totalSellingPrice: '2000', sellingPrice: '2000', taxCategory: 'Airport Transfers', notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(
      screen.getByRole('heading', { name: 'Airport Transfers' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vehicle Details' })).not.toBeInTheDocument();
  });

  it('falls back to Transportation for the public Vehicle section title when empty', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-vehicle', serviceType: 'VEHICLE_TRANSFER', name: 'Airport Transfer', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '2000', totalSellingPrice: '2000', sellingPrice: '2000', taxCategory: '', notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByRole('heading', { name: 'Transportation' })).toBeInTheDocument();
  });

  it('renders included add-on services as formatted Additional Services cards', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-addon', serviceType: 'TRAVEL_INSURANCE', addOnServiceId: 'addon-master-1', name: 'Travel Insurance', description: '<p><strong>Cover</strong> for the trip.</p>', dayNumber: null, city: null, quantity: '1', unitSellingPrice: '1500', totalSellingPrice: '1500', sellingPrice: '1500', taxCategory: null, notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByRole('heading', { name: 'Additional Services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Travel Insurance' })).toBeInTheDocument();
    // Description renders as formatted rich text, not raw HTML.
    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(screen.getByText('for the trip.')).toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  });

  it('hides Additional Services when no add-on service is included', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-vehicle', serviceType: 'VEHICLE_TRANSFER', name: 'Airport Transfer', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '2000', totalSellingPrice: '2000', sellingPrice: '2000', taxCategory: 'Transportation', notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.queryByRole('heading', { name: 'Additional Services' })).not.toBeInTheDocument();
  });

  it('renders only add-on rows that are actually selected (have an addOnServiceId)', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-checked', serviceType: 'OTHER_ADD_ON', addOnServiceId: 'master-visa', name: 'Singapore Visa', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '1500', totalSellingPrice: '1500', sellingPrice: '1500', taxCategory: null, notes: null, sequence: 1 },
          { id: 's-unchecked', serviceType: 'OTHER_ADD_ON', addOnServiceId: null, name: 'other add on', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '500', totalSellingPrice: '500', sellingPrice: '500', taxCategory: null, notes: null, sequence: 2 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.getByRole('heading', { name: 'Additional Services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Singapore Visa' })).toBeInTheDocument();
    // The unselected add-on row must NOT appear.
    expect(screen.queryByRole('heading', { name: 'other add on' })).not.toBeInTheDocument();
  });

  it('hides the whole Additional Services section when every add-on row is unselected', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        services: [
          { id: 's-unchecked-1', serviceType: 'OTHER_ADD_ON', addOnServiceId: null, name: 'other add on', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '500', totalSellingPrice: '500', sellingPrice: '500', taxCategory: null, notes: null, sequence: 1 },
          { id: 's-unchecked-2', serviceType: 'TRAVEL_INSURANCE', addOnServiceId: null, name: 'Singapore Visa', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '1500', totalSellingPrice: '1500', sellingPrice: '1500', taxCategory: null, notes: null, sequence: 2 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(screen.queryByRole('heading', { name: 'Additional Services' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'other add on' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Singapore Visa' })).not.toBeInTheDocument();
  });

  it('hides Add-ons publicly when top-level Add-on Services include is off', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotels: [],
        // Top-level Add-on include is OFF even though an add-on row exists.
        addOnDetails: { include: false },
        services: [
          { id: 's-addon', serviceType: 'OTHER_ADD_ON', name: 'other add on', description: null, dayNumber: null, city: null, quantity: '1', unitSellingPrice: '500', totalSellingPrice: '500', sellingPrice: '500', taxCategory: null, notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    // No Additional Services section, no `other add on`, no Add-ons chip.
    expect(screen.queryByRole('heading', { name: 'Additional Services' })).not.toBeInTheDocument();
    expect(screen.queryByText('other add on')).not.toBeInTheDocument();
    const servicesInclude = screen.queryByText('Services Include')?.closest('section');
    if (servicesInclude) {
      expect(within(servicesInclude).queryByText('Add-ons')).not.toBeInTheDocument();
    }
  });

  it('shows Cabin: 10 kg+ on the public page for a stored 10kg value', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        flightDetails: {
          include: true,
          sectionTitle: 'Flight Details',
          amount: 0,
          journeyType: 'ONEWAY_OUTBOUND',
          outbound: {
            fromCity: 'Delhi',
            toCity: 'Kochi',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: null,
                airlineName: 'Air India',
                flightNumber: 'AI201',
                travelClass: 'Economy',
                from: 'Delhi',
                to: 'Kochi',
                departureDate: '2026-09-10',
                departureTime: '10:00',
                arrivalDate: '2026-09-10',
                arrivalTime: '12:00',
                duration: '2h 0m',
                cabinLuggage: '10kg',
                checkInLuggage: '30kg',
                notes: null,
                connectionVia: null,
              },
            ],
          },
          returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
        },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    expect(await screen.findByText('Cabin: 10 kg+')).toBeInTheDocument();
    expect(screen.queryByText('Cabin: 10kg')).not.toBeInTheDocument();
  });

  it('renders flight notes inside a transparent scoped container despite inline white backgrounds', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000003', customerName: 'Mira Shah', destinationSummary: 'Kerala', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Kerala Escape',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        flightDetails: {
          include: true,
          sectionTitle: 'Flight Details',
          amount: 0,
          journeyType: 'ROUND_TRIP',
          outbound: {
            fromCity: 'Delhi',
            toCity: 'Kochi',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: null,
                airlineName: 'Air India',
                flightNumber: 'AI201',
                travelClass: 'Economy',
                from: 'Delhi',
                to: 'Kochi',
                departureDate: '2026-09-10',
                departureTime: '10:00',
                arrivalDate: '2026-09-10',
                arrivalTime: '12:00',
                duration: '2h 0m',
                cabinLuggage: '7kg',
                checkInLuggage: '20kg',
                notes: '<p style="background-color: white">Outbound note line</p><span style="background: white">inline note</span>',
                connectionVia: null,
              },
            ],
          },
          returnJourney: {
            fromCity: 'Kochi',
            toCity: 'Delhi',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: null,
                airlineName: 'Air India',
                flightNumber: 'AI202',
                travelClass: 'Economy',
                from: 'Kochi',
                to: 'Delhi',
                departureDate: '2026-09-14',
                departureTime: '14:00',
                arrivalDate: '2026-09-14',
                arrivalTime: '16:00',
                duration: '2h 0m',
                cabinLuggage: '7kg',
                checkInLuggage: '20kg',
                notes: '<ul style="background-color: white"><li>Return note item</li></ul>',
                connectionVia: null,
              },
            ],
          },
        },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala Escape');
    await screen.findByText('Outbound Journey');

    // The note text (with inline white backgrounds) still renders.
    expect(screen.getByText('Outbound note line')).toBeInTheDocument();
    expect(screen.getByText('inline note')).toBeInTheDocument();
    expect(screen.getByText('Return note item')).toBeInTheDocument();

    // The stored inline white background styles are NOT stripped from the HTML.
    const outboundPara = screen.getByText('Outbound note line');
    expect(outboundPara.getAttribute('style')).toContain('background-color: white');
    const inlineSpan = screen.getByText('inline note');
    expect(inlineSpan.getAttribute('style')).toContain('background: white');
    const returnItem = screen.getByText('Return note item');
    expect(returnItem.closest('ul')?.getAttribute('style')).toContain('background-color: white');

    // Every note is inside a scoped `.flight-notes` container (outbound + return).
    const outboundContainer = outboundPara.closest('.flight-notes');
    expect(outboundContainer).not.toBeNull();
    expect(outboundContainer?.className).toContain('flight-notes');
    expect(inlineSpan.closest('.flight-notes')).not.toBeNull();
    expect(returnItem.closest('.flight-notes')).not.toBeNull();
  });

  it('renders the public cruise card with image, duration, room type and description', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Cruise Trip',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [
          { id: 's-cruise', serviceType: 'CRUISE', name: 'Dream Genting', description: '<p>A lovely voyage.</p>', dayNumber: null, city: null, quantity: '1', unitSellingPrice: '18000', totalSellingPrice: '18000', sellingPrice: '18000', taxCategory: 'Ocean Cruise', notes: '2 nights', sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      cruisePresentations: {
        's-cruise': { imageUrl: 'https://storage.example.test/cruise.jpg', name: 'Dream Genting', roomTypeName: 'Balcony' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Cruise Trip');

    // Saved section title becomes the heading.
    expect(screen.getByRole('heading', { name: 'Ocean Cruise' })).toBeInTheDocument();
    // Dynamic cruise image, name, duration and room type.
    expect(screen.getByAltText('Dream Genting')).toHaveAttribute(
      'src',
      'https://storage.example.test/cruise.jpg',
    );
    expect(screen.getByText('Dream Genting')).toBeInTheDocument();
    expect(screen.getByText('2 nights')).toBeInTheDocument();
    expect(screen.getByText('Balcony')).toBeInTheDocument();
    // Sanitized rich-text description renders.
    expect(screen.getByText('A lovely voyage.')).toBeInTheDocument();
    expect(screen.queryByText(/localhost|http:\/\//)).not.toBeInTheDocument();
  });

  it('hides a raw localhost URL and falls back when a cruise has no image', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Cruise Trip',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [
          { id: 's-cruise', serviceType: 'CRUISE', name: 'Dream Genting', description: 'http://localhost:5173/q/some-token', dayNumber: null, city: null, quantity: '1', unitSellingPrice: '18000', totalSellingPrice: '18000', sellingPrice: '18000', taxCategory: null, notes: null, sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      cruisePresentations: {
        's-cruise': { imageUrl: null, name: 'Dream Genting', roomTypeName: null },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Cruise Trip');

    // Empty section title falls back to Cruise Details.
    expect(screen.getByRole('heading', { name: 'Cruise Details' })).toBeInTheDocument();
    // The raw localhost URL is never rendered as cruise content.
    expect(screen.queryByText(/localhost|some-token/)).not.toBeInTheDocument();
    // Missing image shows the fallback, not a broken image.
    expect(screen.getByText('Cruise image unavailable')).toBeInTheDocument();
    expect(screen.queryByAltText('Dream Genting')).not.toBeInTheDocument();
    // Missing duration/room type rows are hidden.
    expect(screen.queryByText(/Duration:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Room Type:/)).not.toBeInTheDocument();
  });

  it('treats editor-empty cruise descriptions as no description', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Cruise Trip',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [
          { id: 's-cruise', serviceType: 'CRUISE', name: 'Dream Genting', description: '<p><br></p>', dayNumber: null, city: null, quantity: '1', unitSellingPrice: '18000', totalSellingPrice: '18000', sellingPrice: '18000', taxCategory: null, notes: '2 nights', sequence: 1 },
        ],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      cruisePresentations: {
        's-cruise': { imageUrl: null, name: 'Dream Genting', roomTypeName: 'Balcony' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Cruise Trip');

    expect(screen.getByText('Dream Genting')).toBeInTheDocument();
    expect(screen.getByText('2 nights')).toBeInTheDocument();
    // Empty editor HTML renders no description block.
    expect(screen.queryByText('<p>')).not.toBeInTheDocument();
    expect(screen.queryByText('<br>')).not.toBeInTheDocument();
  });

  it('renders the public policies accordion with one section open at a time', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Policies Check',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
        inclusionsHtml: '<ul><li>Hotel</li><li>Flights</li></ul>',
        exclusionsHtml: '<p>Personal expenses</p>',
        paymentPolicies: null,
        cancellationPolicies: null,
        bookingTerms: null,
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Policies Check');

    // Heading + Inclusions expanded by default; Exclusions collapsed.
    expect(screen.getByRole('heading', { name: 'Policies' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inclusions' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const exclusionsButton = screen.getByRole('button', { name: 'Exclusions' });
    expect(exclusionsButton).toHaveAttribute('aria-expanded', 'false');
    // Expanded content renders formatted list items.
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(screen.getByText('Flights')).toBeInTheDocument();

    // Clicking Exclusions opens it and collapses Inclusions (one at a time).
    await userEvent.click(exclusionsButton);
    expect(screen.getByText('Personal expenses')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inclusions' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // Clicking again collapses it.
    await userEvent.click(exclusionsButton);
    expect(screen.queryByText('Personal expenses')).not.toBeInTheDocument();
  });

  it('hides the public policies section when all values are empty', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'No Policies',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
        inclusionsHtml: '<p><br></p>',
        exclusionsHtml: null,
        paymentPolicies: null,
        cancellationPolicies: null,
        bookingTerms: null,
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('No Policies');
    expect(screen.queryByRole('heading', { name: 'Policies' })).not.toBeInTheDocument();
  });

  it('renders the left-aligned contact card with dynamic details, buttons and logo', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: '+91 98765 43210',
        website: null,
        address: '1 MG Road, Bengaluru, Karnataka 560001',
        primaryColor: '#2563eb',
        logoUrl: 'https://storage.example.test/alpha-logo.png',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        createdBy: person,
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');

    const heading = screen.getByRole('heading', { name: 'Contact Us' });
    expect(heading).toBeInTheDocument();
    // Green vertical line sits immediately left of the heading.
    const line = heading.closest('section')?.querySelector('span[class*="bg-emerald-600"]');
    expect(line).not.toBeNull();
    expect(
      screen.getByText(/Ready to book this amazing journey or have questions/),
    ).toBeInTheDocument();

    // Company name (bold) and contact person row (scoped to the Contact Us card).
    expect(screen.getByText('Alpha Travel')).toBeInTheDocument();
    const contactSection = screen.getByRole('heading', { name: 'Contact Us' }).closest('section');
    expect(within(contactSection as HTMLElement).getByText('Aditi Rao')).toBeInTheDocument();

    // Clickable phone and email, plus the address row (scoped to the Contact Us card).
    expect(within(contactSection as HTMLElement).getByRole('link', { name: '+91 98765 43210' })).toHaveAttribute(
      'href',
      'tel:+91 98765 43210',
    );
    expect(within(contactSection as HTMLElement).getByRole('link', { name: 'hello@alpha.test' })).toHaveAttribute(
      'href',
      'mailto:hello@alpha.test',
    );
    expect(screen.getByText(/1 MG Road, Bengaluru/)).toBeInTheDocument();

    // Action buttons: tel, WhatsApp (new tab, prefilled message), mailto (prefilled).
    expect(screen.getByRole('link', { name: /Call Now/ })).toHaveAttribute(
      'href',
      'tel:+91 98765 43210',
    );
    const whatsapp = screen.getByRole('link', { name: /WhatsApp/ });
    const whatsappHref = whatsapp.getAttribute('href') ?? '';
    expect(whatsappHref.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    // Normalized phone: spaces/+ stripped, country code preserved.
    expect(whatsappHref).not.toContain('+91');
    // Message includes quotation ID, title and lead/customer name, URL-encoded.
    expect(whatsappHref).toContain(encodeURIComponent('QT-2026-000001'));
    expect(whatsappHref).toContain(encodeURIComponent('Goa proposal'));
    expect(whatsappHref).toContain(encodeURIComponent('Aarav Mehta'));
    expect(whatsapp).toHaveAttribute('target', '_blank');

    const email = screen.getByRole('link', { name: /Email/ });
    const emailHref = email.getAttribute('href') ?? '';
    expect(emailHref.startsWith('mailto:hello@alpha.test?subject=')).toBe(true);
    expect(emailHref).toContain(
      encodeURIComponent('Quotation Inquiry (ID: QT-2026-000001 - Goa proposal for Aarav Mehta)'),
    );
    expect(emailHref).toContain(
      encodeURIComponent(
        "Hello,\n\nI'm interested in the travel quotation (ID: QT-2026-000001 - Goa proposal for Aarav Mehta).\n\nPlease contact me with more information.",
      ),
    );

    // Company logo in the card.
    expect(screen.getByAltText('Alpha Travel logo')).toHaveAttribute(
      'src',
      'https://storage.example.test/alpha-logo.png',
    );
  });

  it('prefills WhatsApp and Email without duplicating a lead name already in the title', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: '+91 90000 00000',
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-000034',
        customerName: 'Vikas Singh',
        destinationSummary: 'Singapore',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Singapore Package for Vikas Singh',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100000',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Singapore Package for Vikas Singh');

    const single = encodeURIComponent('QT-34 - Singapore Package for Vikas Singh');
    const duplicate = encodeURIComponent('for Vikas Singh for Vikas Singh');

    const whatsappHref = screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href') ?? '';
    expect(whatsappHref).toContain(single);
    expect(whatsappHref).not.toContain(duplicate);

    const emailHref = screen.getByRole('link', { name: /Email/ }).getAttribute('href') ?? '';
    expect(emailHref).toContain(encodeURIComponent('Quotation Inquiry (ID: QT-34 - Singapore Package for Vikas Singh)'));
    expect(emailHref).not.toContain(duplicate);
  });

  it('keeps the contact card balanced when optional contact data is missing', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: null,
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        logoUrl: null,
      },
      quotation: {
        quotationNumber: 'QT-2026-000002',
        customerName: 'Mira Shah',
        destinationSummary: 'Kerala',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Kerala proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '25000',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Kerala proposal');

    // Heading and description remain.
    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeInTheDocument();
    expect(
      screen.getByText(/Ready to book this amazing journey or have questions/),
    ).toBeInTheDocument();
    // Company name stays, no contact rows, no buttons, no logo.
    expect(screen.getByText('Alpha Travel')).toBeInTheDocument();
    expect(screen.queryByText(/undefined|null|NaN/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Call Now/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Email/ })).not.toBeInTheDocument();
    expect(screen.queryByAltText(/logo/)).not.toBeInTheDocument();
  });

  it('shows Prepared By with the name and a combined phone | email row', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'vikassahni4453@gmail.com',
        phone: '7460939319',
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100000',
        createdBy: { id: 'user-1', fullName: 'Vikas Sahni', username: 'owner' },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');

    const block = screen.getByText('Prepared By').parentElement!;
    expect(block).toHaveTextContent('Vikas Sahni');
    const row = block.querySelector('p[class*="flex"]');
    expect(row).not.toBeNull();
    // Phone and email share the same secondary row with a single separator.
    expect(row).toHaveTextContent('7460939319');
    expect(row).toHaveTextContent('vikassahni4453@gmail.com');
    expect(row).toHaveTextContent('|');
    expect(block.querySelector('a[href^="tel:"]')).toHaveAttribute('href', 'tel:7460939319');
    expect(block.querySelector('a[href^="mailto:"]')).toHaveAttribute(
      'href',
      'mailto:vikassahni4453@gmail.com',
    );
    // Other summary fields are untouched.
    expect(screen.getByText('Traveler Name')).toBeInTheDocument();
    expect(screen.getByText('Quotation ID')).toBeInTheDocument();
    expect(screen.getByText('Aarav Mehta')).toBeInTheDocument();
  });

  it('omits the separator when only one Prepared By contact value exists', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: null,
        phone: '7460939319',
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100000',
        createdBy: { id: 'user-1', fullName: 'Vikas Sahni', username: 'owner' },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');

    const block = screen.getByText('Prepared By').parentElement!;
    const row = block.querySelector('p[class*="flex"]');
    expect(row).toHaveTextContent('7460939319');
    expect(row).not.toHaveTextContent('|');
    expect(block.querySelector('a[href^="tel:"]')).toHaveAttribute('href', 'tel:7460939319');
    expect(block.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('omits the contact row entirely when both Prepared By values are missing', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: null,
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100000',
        createdBy: { id: 'user-1', fullName: 'Vikas Sahni', username: 'owner' },
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');

    const block = screen.getByText('Prepared By').parentElement!;
    expect(block).toHaveTextContent('Vikas Sahni');
    expect(block.querySelector('p[class*="flex"]')).toBeNull();
    expect(block.querySelector('a[href^="tel:"]')).toBeNull();
    expect(block.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('hides stars and 0/5 for zero or missing ratings while keeping review links and scores', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Goa', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Rating Check',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'h0', hotelName: 'Zero Star Hotel', city: 'Goa', category: '0 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '10000', selected: true, notes: null, sequence: 1 },
          { id: 'h1', hotelName: 'Three Star Hotel', city: 'Goa', category: '3 Star', roomType: 'Superior', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '15000', selected: true, notes: null, sequence: 2 },
          { id: 'h2', hotelName: 'No Rating Hotel', city: 'Goa', category: null, roomType: 'Standard', mealPlan: 'Bed', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '8000', selected: true, notes: null, sequence: 3 },
        ],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {
        'h0': { imageUrl: null, starCategory: 0, starRating: '0', address: null, reviewLink: null, checkInTime: null, checkOutTime: null, destination: 'Goa', country: 'India' },
        'h1': { imageUrl: null, starCategory: 3, starRating: null, address: null, reviewLink: 'https://reviews.example.test/three-star', checkInTime: null, checkOutTime: null, destination: 'Goa', country: 'India' },
        'h2': { imageUrl: null, starCategory: null, starRating: '3.7', address: null, reviewLink: 'https://reviews.example.test/no-rating', checkInTime: null, checkOutTime: null, destination: 'Goa', country: 'India' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Rating Check');

    // Zero rating: no stars, no "0/5" badge, no review link.
    const zeroCard = screen.getByText('Zero Star Hotel').closest('article') as HTMLElement;
    expect(within(zeroCard).queryByLabelText(/star hotel/)).not.toBeInTheDocument();
    expect(within(zeroCard).queryByText('0/5')).not.toBeInTheDocument();
    expect(within(zeroCard).queryByText('Hotel Review')).not.toBeInTheDocument();

    // Star rating 3: exactly three filled stars; review link, no score badge.
    const threeCard = screen.getByText('Three Star Hotel').closest('article') as HTMLElement;
    expect(within(threeCard).getByLabelText('3 star hotel').querySelectorAll('svg').length).toBe(3);
    expect(within(threeCard).queryByText('3.7')).not.toBeInTheDocument();
    const threeReview = within(threeCard).getByText('Hotel Review').closest('a');
    expect(threeReview).toHaveAttribute('href', 'https://reviews.example.test/three-star');
    expect(threeReview).toHaveAttribute('target', '_blank');
    expect(threeReview).toHaveAttribute('rel', 'noopener noreferrer');

    // Missing star rating: no star row, but review link and score badge appear.
    const noRatingCard = screen.getByText('No Rating Hotel').closest('article') as HTMLElement;
    expect(within(noRatingCard).queryByLabelText(/star hotel/)).not.toBeInTheDocument();
    expect(within(noRatingCard).getByText('Hotel Review')).toBeInTheDocument();
    expect(within(noRatingCard).getByText('3.7')).toBeInTheDocument();
    expect(within(noRatingCard).queryByText('0/5')).not.toBeInTheDocument();
  });

  it('clamps star count to five and hides the score badge when the score is zero', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Goa', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Clamp Check',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'h5', hotelName: 'Five Star Hotel', city: 'Goa', category: '5 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '20000', selected: true, notes: null, sequence: 1 },
          { id: 'h9', hotelName: 'Overrated Hotel', city: 'Goa', category: '9 Star', roomType: 'Suite', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '25000', selected: true, notes: null, sequence: 2 },
        ],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {
        'h5': { imageUrl: null, starCategory: 5, starRating: '3.7', address: null, reviewLink: 'https://reviews.example.test/five', checkInTime: null, checkOutTime: null, destination: 'Goa', country: 'India' },
        'h9': { imageUrl: null, starCategory: 9, starRating: '0', address: null, reviewLink: null, checkInTime: null, checkOutTime: null, destination: 'Goa', country: 'India' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Clamp Check');

    const fiveCard = screen.getByText('Five Star Hotel').closest('article') as HTMLElement;
    expect(within(fiveCard).getByLabelText('5 star hotel').querySelectorAll('svg').length).toBe(5);
    expect(within(fiveCard).getByText('3.7')).toBeInTheDocument();
    expect(within(fiveCard).getByText('Hotel Review')).toBeInTheDocument();

    // Star rating 9 never renders more than five stars; score 0 hides the badge.
    const overCard = screen.getByText('Overrated Hotel').closest('article') as HTMLElement;
    expect(within(overCard).getByLabelText('9 star hotel').querySelectorAll('svg').length).toBe(5);
    expect(within(overCard).queryByText('0/5')).not.toBeInTheDocument();
    expect(within(overCard).queryByText('Hotel Review')).not.toBeInTheDocument();
  });

  it('renders the public footer from company settings and sets the logo favicon', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: 'https://storage.example.test/alpha-logo.png',
      },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');

    // Copyright line with dynamic year and company name from settings.
    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year} Alpha Travel. All rights reserved.`)).toBeInTheDocument();
    // Secondary metadata line joins only present values.
    expect(
      screen.getByText('Since: 2015 | Trips: 4200 | TAN: ABCD12345E | GSTIN: 29ABCDE1234F1Z5'),
    ).toBeInTheDocument();
    // Right side: quotation number + formatted generated date.
    expect(screen.getByText('Quotation ID: #QT-2026-000001 | Generated: 04 Aug 2026')).toBeInTheDocument();

    // The company logo becomes the favicon.
    await waitFor(() =>
      expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
        'href',
        'https://storage.example.test/alpha-logo.png',
      ),
    );
  });

  it('shows the quotation ID as "#1032" in the info card and the footer', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
        operatingSince: 2015,
        tripsSold: 4200,
        tan: 'ABCD12345E',
        taxRegistrationNumber: '29ABCDE1234F1Z5',
        logoUrl: 'https://storage.example.test/alpha-logo.png',
      },
      quotation: {
        quotationNumber: 'QT-001032',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Goa',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        createdAt: '2026-08-04T10:00:00.000Z',
        status: 'VIEWED',
      },
      version: {
        title: 'Goa proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '16065.87',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {},
      vehiclePresentations: {},
      airlinePresentations: {},
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Goa proposal');
    // The info card value and the footer both render '#1032', never '#QT-...'
    // or 'QT-...'.
    expect(screen.getByText('#1032')).toBeInTheDocument();
    expect(screen.getByText(/Quotation ID: #1032/)).toBeInTheDocument();
    expect(screen.queryByText(/QT-1032/)).not.toBeInTheDocument();
    expect(screen.queryByText(/QT-001032/)).not.toBeInTheDocument();
    expect(screen.queryByText(/#QT-1032/)).not.toBeInTheDocument();
  });

  it('sets the browser tab title from the quotation title and restores it on leave', async () => {
    document.title = 'Travel CRM';
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: {
        quotationNumber: 'QT-2026-000001',
        customerName: 'Aarav Mehta',
        destinationSummary: 'Dubai',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Dubai Honeymoon Package',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100000',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Dubai Honeymoon Package');
    expect(document.title).toBe('Dubai Honeymoon Package');
    view.unmount();
    expect(document.title).toBe('Travel CRM');
  });

  it('falls back to the Quotation title when the quotation has no title', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: {
        quotationNumber: 'QT-2026-000002',
        customerName: 'Mira Shah',
        destinationSummary: 'Kerala',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: '',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '25000',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await waitFor(() => expect(document.title).toBe('Quotation'));
  });

  it('renders the public page without the final-amount/decision box and hides missing settings', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel',
        email: 'hello@alpha.test',
        phone: null,
        website: null,
        address: null,
        primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000002',
        customerName: 'Mira Shah',
        destinationSummary: 'Kerala',
        travelStartDate: null,
        travelEndDate: null,
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
        rooms: 1,
        validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Kerala proposal',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '25000',
        hotels: [],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    expect(await screen.findByText('Kerala proposal')).toBeInTheDocument();
    // The public final-amount/decision box is not rendered.
    expect(screen.queryByText('Final quotation amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Valid until/)).not.toBeInTheDocument();
    // Missing optional settings never leak placeholders into the footer.
    const footer = document.querySelector('footer');
    expect(footer).not.toHaveTextContent(/undefined|null|NaN|Since:|Trips:|TAN:|GSTIN:/i);
    expect(footer).toHaveTextContent('Quotation ID: #QT-2026-000002');
    // No company logo → the default favicon stays untouched.
    expect(document.querySelector('link[rel="icon"]')).toBeNull();
    // No POST decision request is ever sent from the public page.
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('shows each hotel card its own full address below the location row', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Singapore', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Address Check',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'hA', hotelName: 'V Hotel Lavender', city: 'Singapore', category: null, roomType: 'Family Room', mealPlan: 'Breakfast Only (CP)', rooms: 3, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '20000', selected: true, notes: null, sequence: 1 },
          { id: 'hB', hotelName: 'Marina Bay Hotel', city: 'Singapore', category: null, roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '30000', selected: true, notes: null, sequence: 2 },
          { id: 'hC', hotelName: 'Bare Hotel', city: 'Goa', category: null, roomType: 'Standard', mealPlan: 'Bed', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '8000', selected: true, notes: null, sequence: 3 },
        ],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      hotelPresentations: {
        'hA': { imageUrl: null, starCategory: 4, starRating: '3.7', address: '70 Jellicoe Rd, Singapore 208767', reviewLink: 'https://reviews.example.test/v-hotel', checkInTime: null, checkOutTime: null, destination: 'Singapore', country: 'Singapore' },
        'hB': { imageUrl: null, starCategory: null, starRating: null, address: '10 Bayfront Avenue, Singapore 018956', reviewLink: null, checkInTime: null, checkOutTime: null, destination: 'Singapore', country: 'Singapore' },
        'hC': { imageUrl: null, starCategory: null, starRating: null, address: null, reviewLink: null, checkInTime: null, checkOutTime: null, destination: 'Goa', country: 'India' },
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Address Check');

    // Each card shows its own full address below the location row.
    const cardA = screen.getByText('V Hotel Lavender').closest('article') as HTMLElement;
    expect(within(cardA).getByText('70 Jellicoe Rd, Singapore 208767')).toBeInTheDocument();
    const cardB = screen.getByText('Marina Bay Hotel').closest('article') as HTMLElement;
    expect(within(cardB).getByText('10 Bayfront Avenue, Singapore 018956')).toBeInTheDocument();
    // No-address hotel renders no address line.
    const cardC = screen.getByText('Bare Hotel').closest('article') as HTMLElement;
    expect(cardC).not.toHaveTextContent(/Address unavailable|No address|undefined|null/i);
    // Existing card content remains visible.
    expect(within(cardA).getByText(/Family Room/)).toBeInTheDocument();
    expect(within(cardA).getByText(/Breakfast Only \(CP\)/)).toBeInTheDocument();
    expect(within(cardA).getByText('Nights:')).toBeInTheDocument();
    expect(within(cardA).getByText('Hotel Review')).toBeInTheDocument();
    expect(within(cardA).getByLabelText('4 star hotel')).toBeInTheDocument();
  });

  it('keeps older quotations without an address loading on the public page', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Goa', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Legacy Quotation',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'hL', hotelName: 'Legacy Hotel', city: 'Goa', category: null, roomType: 'Standard', mealPlan: 'Bed', rooms: 1, nights: 2, checkInDate: null, checkOutDate: null, sellingPrice: '8000', selected: true, notes: null, sequence: 1 },
        ],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      // No presentation entry at all — mimics older data lacking address/rating.
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Legacy Quotation');
    const card = screen.getByText('Legacy Hotel').closest('article') as HTMLElement;
    expect(card).not.toHaveTextContent(/undefined|null/i);
    expect(screen.queryByText('Address unavailable')).not.toBeInTheDocument();
  });

  it('displays the date-derived hotel nights on the public page', async () => {
    const publicData = {
      company: { name: 'Alpha Travel', email: 'a@b.test', phone: null, website: null, address: null, primaryColor: '#2563eb' },
      quotation: { quotationNumber: 'QT-2026-000002', customerName: 'Mira Shah', destinationSummary: 'Goa', travelStartDate: null, travelEndDate: null, adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null, status: 'VIEWED' },
      version: {
        title: 'Nights Check',
        versionNumber: 1,
        currency: 'INR',
        finalAmount: '100',
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [
          { id: 'hA', hotelName: 'Coastal Bay Resort', city: 'Goa', category: '4 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', rooms: 1, nights: 4, checkInDate: '2026-08-10T00:00:00.000Z', checkOutDate: '2026-08-12T00:00:00.000Z', sellingPrice: '12000', selected: true, notes: null, sequence: 1 },
          { id: 'hB', hotelName: 'No Dates Hotel', city: 'Goa', category: null, roomType: 'Standard', mealPlan: 'Bed', rooms: 1, nights: 4, checkInDate: null, checkOutDate: null, sellingPrice: '8000', selected: true, notes: null, sequence: 2 },
        ],
        services: [],
        itinerary: [],
        inclusions: [],
        exclusions: [],
        terms: [],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () => response(publicData),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Nights Check');

    // Stored nights are 4 but 10 Aug → 12 Aug is 2 calendar nights.
    const cardA = screen.getByText('Coastal Bay Resort').closest('article') as HTMLElement;
    expect(within(cardA).getByText('Nights:')).toBeInTheDocument();
    const nightsRowA = within(cardA).getByText('Nights:').parentElement as HTMLElement;
    expect(nightsRowA).toHaveTextContent('2');

    // Missing dates fall back to the stored nights value.
    const cardB = screen.getByText('No Dates Hotel').closest('article') as HTMLElement;
    const nightsRowB = within(cardB).getByText('Nights:').parentElement as HTMLElement;
    expect(nightsRowB).toHaveTextContent('4');
  });

  it('renders sections in the required order on the public page', async () => {
    const publicData = {
      company: {
        name: 'Alpha Travel', email: 'a@b.test', phone: '+91 90000 00000', website: null,
        address: '1 MG Road, Bengaluru', primaryColor: '#2563eb',
      },
      quotation: {
        quotationNumber: 'QT-2026-000100', customerName: 'Priya Sharma',
        destinationSummary: 'Singapore', travelStartDate: '2026-10-23', travelEndDate: '2026-10-29',
        adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0, rooms: 1, validUntil: null,
        status: 'VIEWED',
      },
      version: {
        title: 'Section Order Test', versionNumber: 1, currency: 'INR', finalAmount: '45000',
        notes: null, perAdultPrice: '22500', perChildWithBedPrice: '0', perChildWithoutBedPrice: '0',
        perInfantPrice: '0', taxNote: 'Inclusive of GST', initialPaymentAmount: '5000',
        paymentLink: 'https://rzp.io/l/test',
        inclusionsHtml: null, exclusionsHtml: null, paymentPolicies: '<p>Policy</p>',
        cancellationPolicies: '<p>Cancellation</p>', bookingTerms: '<p>Terms</p>',
        includeVisa: true, visaSectionTitle: 'Visa', visaAmount: '2000', visaDestination: 'Singapore',
        visaType: 'e-Visa', visaServiceCharge: '500', visaGstPercent: '18', visaVfsCharge: '300',
        sightseeingDetails: {
          include: true, sectionTitle: 'Sightseeing', amount: 0, description: null,
          days: [{ dayNumber: 1, title: 'Day 1', city: 'Singapore', date: null, meals: { breakfast: true, lunch: false, dinner: false }, mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED', activities: [{ name: 'City Tour', description: null, startTime: null, sightseeingId: null, imageUrl: null }] }],
        },
        flightDetails: {
          include: true, journeyType: 'ROUND_TRIP',
          outbound: { fromCity: 'DEL', toCity: 'SIN', segments: [{ airlineName: 'IndiGo', flightNumber: '6E101', from: 'DEL', to: 'SIN', departureDate: '2026-10-23', departureTime: '06:00', arrivalDate: '2026-10-23', arrivalTime: '12:00', duration: '6h' }] },
          returnJourney: { fromCity: 'SIN', toCity: 'DEL', segments: [{ airlineName: 'IndiGo', flightNumber: '6E102', from: 'SIN', to: 'DEL', departureDate: '2026-10-29', departureTime: '14:00', arrivalDate: '2026-10-29', arrivalTime: '20:00', duration: '6h 30m' }] },
        },
        hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
        hotels: [{ id: 'h1', hotelName: 'Marina Bay Sands', city: 'Singapore', category: '5 Star', roomType: 'Deluxe', mealPlan: 'Breakfast', nights: 6, selected: true, notes: null, sequence: 1 }],
        itinerary: [],
        services: [
          { serviceType: 'VEHICLE_TRANSFER', name: 'Airport Transfer', description: null, city: 'Singapore', quantity: '1', unitSellingPrice: '3000', notes: null },
          { serviceType: 'CRUISE', name: 'River Cruise', description: 'Cruise.', city: 'Singapore', quantity: '1', unitSellingPrice: '1500', notes: null },
          { serviceType: 'OTHER_ADD_ON', name: 'Travel Insurance', description: 'Cover.', city: null, quantity: '1', unitSellingPrice: '800', notes: null },
        ],
        inclusions: [{ content: 'Inclusion A' }],
        exclusions: [{ content: 'Exclusion A' }],
        terms: [{ content: 'Term A' }],
      },
      downloadUrl: null,
    };
    const fetchMock = vi.fn(async () => response(publicData));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes><Route path="/q/:token" element={<PublicQuotationPage />} /></Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Section Order Test');

    const headingNames = [
      'Secure Your Booking Now',
      'Services Include',
      'Your Itinerary',
      'Your Hotels',
      'Flight Details',
      'Transportation',
      'Cruise Details',
      'Additional Services',
      'Policies',
      'Contact Us',
    ];

    const headings = headingNames.map((name) =>
      screen.getByRole('heading', { name }),
    );

    // Verify ascending DOM position confirms the required order
    for (let i = 1; i < headings.length; i += 1) {
      expect(
        headings[i - 1]!.compareDocumentPosition(headings[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 14 — master selectors inside the quotation and template builders
// ---------------------------------------------------------------------------

const hotelSummary = {
  id: 'aaaaaaa1-1111-4111-8111-111111111111',
  name: 'Shah Palace Hotel',
  starCategory: 4,
  starRating: null,
  status: 'ACTIVE',
  isDefaultForCity: false,
  isFeatured: false,
  hasImage: false,
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdAt: '2026-07-21T00:00:00.000Z',
  destination: { id: 'dest-1', name: 'Azerbaijan' },
  city: { id: 'city-1', name: 'Baku' },
};
const hotelDetail = {
  ...hotelSummary,
  roomTypes: [
    {
      id: 'aaaaaaa2-1111-4111-8111-111111111111',
      hotelId: 'aaaaaaa1-1111-4111-8111-111111111111',
      name: 'Deluxe Room',
      baseCost: 4000,
      sellingPrice: 6000,
      currency: 'INR',
      status: 'ACTIVE',
      sortOrder: 1,
    },
  ],
  mealPlans: [
    {
      id: 'aaaaaaa3-1111-4111-8111-111111111111',
      hotelId: 'aaaaaaa1-1111-4111-8111-111111111111',
      name: 'Breakfast Only',
      type: 'BREAKFAST',
      baseCost: 500,
      sellingPrice: 800,
      currency: 'INR',
      status: 'ACTIVE',
      sortOrder: 1,
    },
  ],
};
const airline = { id: 'aaaaaaa4-1111-4111-8111-111111111111', name: 'Air India', status: 'ACTIVE' };
const cruise = {
  id: 'aaaaaaa5-1111-4111-8111-111111111111',
  name: 'Dream Genting',
  status: 'ACTIVE',
  roomTypes: [
    {
      id: 'aaaaaaa6-1111-4111-8111-111111111111',
      name: 'Interior',
      price: 18000,
      currency: 'INR',
      status: 'ACTIVE',
      sortOrder: 1,
    },
  ],
};
const cruiseDetail = {
  ...cruise,
  roomTypes: [
    {
      id: 'aaaaaaa6-1111-4111-8111-111111111111',
      name: 'Interior',
      price: 18000,
      currency: 'INR',
      status: 'ACTIVE',
      sortOrder: 1,
    },
  ],
};
const vehicle = {
  id: 'aaaaaaa7-1111-4111-8111-111111111111',
  name: 'Innova Crysta',
  vehicleType: 'Standard MPV',
  capacity: 8,
  status: 'ACTIVE',
};
const sightseeing = {
  id: 'aaaaaaa8-1111-4111-8111-111111111111',
  title: 'Gobustan Tour',
  sequence: 1,
  status: 'ACTIVE',
};
const addOn = {
  id: 'aaaaaaa9-1111-4111-8111-111111111111',
  name: 'Visa Assistance',
  description: '<p><strong>Visa</strong> assistance with documentation support.</p>',
  price: 3800,
  currency: 'INR',
  status: 'ACTIVE',
};

/** Build the activities response shape for the sightseeing/activities endpoint from a page of sightseeing rows. */
function sightseeingActivitiesFrom(data: { data: unknown[] }) {
  const rows = data.data as Array<Record<string, unknown>>;
  const first = rows[0];
  return {
    destination: first?.destination ?? null,
    city: first?.city ?? null,
    activities: rows.map((row) => ({
      id: row.id,
      title: row.title,
      sequence: row.sequence,
      estimatedHours: row.estimatedHours ?? null,
      suggestedStartTime: row.suggestedStartTime ?? null,
      description: row.description ?? null,
      destination: row.destination,
      city: row.city,
    })),
  };
}

/** Route master lookups by URL so one stub can serve every selector. */
function masterFetch(base: unknown, extra: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/masters/hotels/': hotelDetail,
    '/masters/hotels': page([hotelSummary]),
    '/masters/airlines': page([airline]),
    '/masters/cruises/': cruiseDetail,
    '/masters/cruises': page([cruise]),
    '/masters/vehicles': page([vehicle]),
    '/masters/sightseeing': page([sightseeing]),
    '/masters/sightseeing/activities': sightseeingActivitiesFrom(page([sightseeing])),
    '/masters/sightseeing/presentations': {},
    '/masters/add-on-services': page([addOn]),
    ...extra,
  };
  // When a caller overrides /masters/sightseeing, also create the matching
  // /masters/sightseeing/activities response from the same data.
  const sightseeingExtra = extra['/masters/sightseeing'];
  if (sightseeingExtra && !extra['/masters/sightseeing/activities']) {
    if (typeof sightseeingExtra === 'object' && sightseeingExtra !== null && 'data' in sightseeingExtra) {
      routes['/masters/sightseeing/activities'] = sightseeingActivitiesFrom(
        sightseeingExtra as { data: Array<Record<string, unknown>> },
      );
    }
  }
  return vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
    void _options;
    const url = String(input);
    // Most specific prefixes (longest) are matched first so image download-url
    // routes beat their parent list routes.
    for (const [prefix, body] of Object.entries(routes).sort(([a], [b]) => b.length - a.length))
      if (prefix.endsWith('/') ? url.includes(prefix) && !url.includes('?') : url.includes(prefix))
        return response(body);
    return response(base);
  });
}

const builderQuotation = (overrides: Record<string, unknown> = {}) => ({
  quotationNumber: 'QT-2026-000001',
  versions: [
    {
      id: 'version-1',
      versionNumber: 1,
      title: 'Goa proposal',
      introduction: null,
      destinationSummary: 'Goa',
      travelStartDate: null,
      travelEndDate: null,
      currency: 'INR',
      subtotalSellingPrice: '0',
      subtotalCost: '0',
      markupMode: 'NONE',
      markupValue: '0',
      totalMarkup: '0',
      taxRate: '0',
      taxAmount: '0',
      discountAmount: '0',
      finalAmount: '0',
      pricingMode: 'ITEMIZED',
      notes: null,
      internalNotes: null,
      status: 'DRAFT',
      finalizedAt: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      createdBy: person,
      itinerary: [],
      hotels: [],
      services: [],
      inclusions: [],
      exclusions: [],
      terms: [],
      addOnDetails: { include: true },
      ...overrides,
    },
  ],
});

const renderBuilderPage = () =>
  renderWithProviders(
    <Routes>
      <Route
        path="/quotations/:quotationId/versions/:versionId/edit"
        element={<QuotationBuilderPage />}
      />
    </Routes>,
    { route: '/quotations/quotation-1/versions/version-1/edit' },
  );

/** Activate a builder tab by its nav-button label (tabs mount only when active). */
const openTab = async (name: string) =>
  userEvent.click(await screen.findByRole('button', { name }));

/** Open the sightseeing activity combobox and wait for an option label. */
const openActivityPicker = async (picker: HTMLElement, label: string) => {
  fireEvent.focus(picker);
  await waitFor(() => {
    const listbox = screen.getByRole('listbox', {
      name: picker.getAttribute('aria-label') ?? '',
    });
    const labels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    expect(labels.some((text) => text.includes(label))).toBe(true);
  });
};

describe('Phase 14 master selectors', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'quotation_templates.view',
      'quotation_templates.create',
      'quotation_templates.update',
      'quotations.view',
      'quotations.update',
      'quotations.view_costing',
    ]);
  });

  it('keeps room type and meal plan disabled until a hotel is linked', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Hotel' }));
    expect(screen.getByLabelText('Hotel master')).toBeEnabled();
    expect(screen.getByLabelText('Room type master')).toBeDisabled();
    expect(screen.getByLabelText('Meal plan master')).toBeDisabled();
  });

  it('prefills hotel stays from the lead itinerary', async () => {
    const quotation = {
      ...builderQuotation(),
      rooms: 2,
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-000001',
        leadStage: 'NEW_LEAD',
        assignedToId: null,
        createdById: 'user-1',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          {
            id: 'stay-1',
            country: 'Azerbaijan',
            destination: 'Baku',
            nights: 3,
            sequence: 1,
            arrivalDate: '2026-09-10T00:00:00.000Z',
            departureDate: '2026-09-13T00:00:00.000Z',
          },
        ],
      },
    };
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Hotel');

    expect(await screen.findByLabelText('Hotel city')).toHaveValue('Baku');
    expect(screen.getByLabelText('Hotel check-in')).toHaveValue('2026-09-10');
    expect(screen.getByLabelText('Hotel check-out')).toHaveValue('2026-09-13');
    expect(screen.queryByLabelText('Rooms')).not.toBeInTheDocument();
    // Nights is read-only and derived from the stay dates (10 Sep → 13 Sep = 3).
    expect(screen.getByLabelText('Hotel nights')).toHaveValue('3');
  });

  it('uses the lead destination and customer for a legacy generated quotation title', async () => {
    const quotation = {
      ...builderQuotation({
        title: 'Singapore travel proposal',
        destinationSummary: 'Singapore',
      }),
      customerName: 'Vikas Singh',
      destinationSummary: 'Singapore',
    };
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();

    expect(await screen.findByLabelText('Title')).toHaveValue('Singapore Package for Vikas Singh');
  });

  it('hides alternative Hotel Options without removing the hotel editor', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Hotel');

    expect(await screen.findByText('Hotel Options')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Hotel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Hotel Option' })).not.toBeInTheDocument();
  });

  it('labels hotel cards as Hotel Stay without exposing Default wording', async () => {
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    const fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');

    expect(await screen.findByText('Hotel Options')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Hotel Stay').length).toBeGreaterThan(0));
    expect(screen.queryByText('Default Hotel Option')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel for Default Option')).not.toBeInTheDocument();
    // The default hotel is still auto-prefilled into the Hotel Stay card.
    expect(screen.getByLabelText('Hotel master')).toHaveValue(
      'Aloft Singapore Novena by Marriott',
    );
  });

  it('warns and blocks saving when arrival is not after departure', async () => {
    vi.stubGlobal('scrollTo', vi.fn());
    const fetchMock = masterFetch(
      builderQuotation({
        flightDetails: {
          include: true,
          sectionTitle: 'Flight Details',
          amount: 0,
          journeyType: 'ONEWAY_OUTBOUND',
          outbound: {
            fromCity: 'Chennai',
            toCity: 'Singapore',
            travelClass: 'Economy',
            segments: [
              {
                airlineId: null,
                airlineName: null,
                flightNumber: null,
                travelClass: 'Economy',
                from: 'Chennai',
                to: 'Singapore',
                departureDate: '2026-08-10',
                departureTime: '23:00',
                arrivalDate: '2026-08-10',
                arrivalTime: '17:00',
                duration: null,
                cabinLuggage: '7kg',
                checkInLuggage: '20kg',
                notes: null,
                connectionVia: null,
              },
            ],
          },
          returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();

    expect(await screen.findByText('Arrival time must be after departure time.')).toHaveAttribute(
      'role',
      'alert',
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false),
    );
  });

  it('fills missing dates on an existing hotel row from the lead travel dates', async () => {
    const quotation = {
      ...builderQuotation({
        hotelDetails: {
          sectionTitle: 'Accommodation Details',
          amount: 0,
          description: null,
        },
        hotels: [
          {
            id: 'existing-hotel-row',
            city: 'Goa',
            hotelName: 'Coastal Bay Resort',
            category: '4 Star',
            roomType: 'Deluxe Room',
            mealPlan: 'Breakfast Only',
            rooms: 1,
            nights: 4,
            checkInDate: null,
            checkOutDate: null,
            internalCost: '0',
            sellingPrice: '0',
            selected: true,
            notes: null,
            sequence: 1,
          },
        ],
      }),
      travelStartDate: '2026-09-10T00:00:00.000Z',
      travelEndDate: '2026-09-14T00:00:00.000Z',
      destinationSummary: 'Goa',
      rooms: 1,
    };
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Hotel');

    expect(await screen.findByLabelText('Hotel section title')).toHaveValue('Your Hotels');
    expect(screen.getByLabelText('Hotel check-in')).toHaveValue('2026-09-10');
    expect(screen.getByLabelText('Hotel check-out')).toHaveValue('2026-09-14');
  });

  it('derives hotel dates from the trip start and itinerary nights when end dates are absent', async () => {
    const quotation = {
      ...builderQuotation(),
      travelStartDate: '2026-08-10T00:00:00.000Z',
      travelEndDate: null,
      destinationSummary: 'Singapore',
      rooms: 4,
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-000001',
        leadStage: 'NEW_LEAD',
        assignedToId: null,
        createdById: 'user-1',
        departureCity: 'Chennai',
        departureCountry: 'India',
        itinerary: [
          {
            id: 'stay-1',
            country: 'Singapore',
            destination: 'Singapore',
            nights: 6,
            sequence: 1,
            arrivalDate: null,
            departureDate: null,
          },
        ],
      },
    };
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Hotel');

    expect(await screen.findByLabelText('Hotel check-in')).toHaveValue('2026-08-10');
    expect(screen.getByLabelText('Hotel check-out')).toHaveValue('2026-08-16');
  });

  it('links the hotel, room type and meal plan without showing internal pricing fields', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Hotel' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');

    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue('Shah Palace Hotel'),
    );
    expect(screen.getByLabelText('Hotel city')).toHaveValue('Baku');
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeEnabled());

    await userEvent.type(screen.getByLabelText('Room type master'), 'Deluxe Room');
    await waitFor(() =>
      expect(screen.getByLabelText('Room type master')).toHaveValue('Deluxe Room'),
    );

    await userEvent.type(screen.getByLabelText('Meal plan master'), 'Breakfast Only');
    await waitFor(() =>
      expect(screen.getByLabelText('Meal plan master')).toHaveValue('Breakfast Only'),
    );
    expect(screen.queryByLabelText('Hotel selling price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hotel internal cost')).not.toBeInTheDocument();
  });

  it('keeps the simplified hotel card free of costing fields for every permission level', async () => {
    auth.permissions.delete('quotations.view_costing');
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Hotel' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Room type master'), 'Deluxe Room');
    await waitFor(() =>
      expect(screen.getByLabelText('Room type master')).toHaveValue('Deluxe Room'),
    );
    expect(screen.queryByLabelText('Hotel selling price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hotel internal cost')).not.toBeInTheDocument();
  });

  it('shows each tab its own master picker and keeps a fresh row unlinked', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();

    // The Sightseeing tab is a day-wise itinerary builder, not a service picker.
    await openTab('Sightseeing');
    expect(await screen.findByLabelText('Sightseeing section title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Day/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Airline master')).not.toBeInTheDocument();

    // The Flight tab is a structured journey builder (Journey Type + segments),
    // not a service-row master picker.
    await openTab('Flight');
    expect(await screen.findByLabelText('Journey type')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Airline').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Add Connection/i }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Sightseeing master')).not.toBeInTheDocument();
  });

  it('links a cruise before its cabin and prefills the cabin price', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Cruise');
    // Enabling Cruise auto-creates the first entry.
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    expect(await screen.findByLabelText('Cruise room type master')).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Cruise master'), 'Dream Genting');
    await waitFor(() => expect(screen.getByLabelText('Cruise room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Cruise room type master'), 'Interior');
    await waitFor(() => expect(screen.getByLabelText('Cruise amount')).toHaveValue(18000));
  });

  it('saves a cruise with name, duration, room type, description and section fields', async () => {
    const quotation = builderQuotation();
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Cruise');
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    await userEvent.type(await screen.findByLabelText('Cruise master'), 'Dream Genting');
    await waitFor(() => expect(screen.getByLabelText('Cruise room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Cruise room type master'), 'Interior');
    await userEvent.clear(screen.getByLabelText('Cruise section title'));
    await userEvent.type(screen.getByLabelText('Cruise section title'), 'Ocean Cruise');
    await userEvent.type(screen.getByLabelText('Cruise duration'), '2 nights');
    // Rich-text description: set HTML directly (jsdom typing can hit execCommand).
    fireEvent.input(screen.getByLabelText('Cruise description'), {
      target: { innerHTML: '<p>A lovely voyage.</p>' },
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      const cruiseRow = body.services.find(
        (service: { serviceType: string }) => service.serviceType === 'CRUISE',
      );
      expect(cruiseRow).toMatchObject({
        cruiseId: 'aaaaaaa5-1111-4111-8111-111111111111',
        cruiseRoomTypeId: 'aaaaaaa6-1111-4111-8111-111111111111',
        name: 'Dream Genting',
        notes: '2 nights',
        taxCategory: 'Ocean Cruise',
        sellingPrice: 18000,
      });
      expect(String(cruiseRow.description)).toContain('A lovely voyage.');
    });
  });

  it('auto-creates one cruise entry with Cruise Details title when enabled', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Cruise');
    // No entry before enabling.
    expect(screen.queryByLabelText('Cruise master')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    // Exactly one entry appears with the default Section Title.
    expect(await screen.findByLabelText('Cruise section title')).toHaveValue('Cruise Details');
    expect(screen.getAllByLabelText('Cruise master').length).toBe(1);
    // Tab switching / rerenders must not duplicate it.
    await openTab('Flight');
    await openTab('Cruise');
    expect(screen.getAllByLabelText('Cruise master').length).toBe(1);
  });

  it('loads saved cruise rows without adding an automatic entry', async () => {
    const quotation = builderQuotation({
      services: [
        {
          id: 's-cruise',
          serviceType: 'CRUISE',
          name: 'Saved Cruise',
          description: null,
          dayNumber: null,
          city: null,
          quantity: '1',
          unitSellingPrice: '1000',
          totalSellingPrice: '1000',
          sellingPrice: '1000',
          taxCategory: 'My Cruise Title',
          notes: '3 nights',
          sequence: 1,
        },
      ],
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Cruise');
    // The saved row loads, Cruise is included, and no extra row is created.
    expect(await screen.findByLabelText('Cruise master')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Cruise master').length).toBe(1);
    expect(screen.getByLabelText('Cruise section title')).toHaveValue('My Cruise Title');
  });

  it('defaults the Cruise section title for snapshots that never stored one', async () => {
    const quotation = builderQuotation({
      services: [
        {
          id: 's-cruise',
          serviceType: 'CRUISE',
          name: 'Legacy Cruise',
          description: null,
          dayNumber: null,
          city: null,
          quantity: '1',
          unitSellingPrice: '1000',
          totalSellingPrice: '1000',
          sellingPrice: '1000',
          taxCategory: null,
          notes: null,
          sequence: 1,
        },
      ],
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Cruise');
    expect(await screen.findByLabelText('Cruise master')).toBeInTheDocument();
    // The legacy snapshot has no stored title, so the field gets the default.
    expect(screen.getByLabelText('Cruise section title')).toHaveValue('Cruise Details');
  });

  it('refills an empty Cruise section title on re-enable but preserves a custom one', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Cruise');
    const includeCruise = () => screen.getByLabelText('Include Cruise in Quotation');
    await userEvent.click(includeCruise());
    const title = await screen.findByLabelText('Cruise section title');
    expect(title).toHaveValue('Cruise Details');
    // Empty the title, uncheck, then re-check: the default is restored.
    await userEvent.clear(title);
    await userEvent.click(includeCruise());
    expect(screen.queryByLabelText('Cruise section title')).not.toBeInTheDocument();
    await userEvent.click(includeCruise());
    expect(await screen.findByLabelText('Cruise section title')).toHaveValue('Cruise Details');

    // A custom title is preserved across uncheck/re-check.
    await userEvent.clear(screen.getByLabelText('Cruise section title'));
    await userEvent.type(screen.getByLabelText('Cruise section title'), 'Luxury Cruise Experience');
    await userEvent.click(includeCruise());
    await userEvent.click(includeCruise());
    expect(await screen.findByLabelText('Cruise section title')).toHaveValue(
      'Luxury Cruise Experience',
    );
  });

  it('shows the selected cruise room type options and preserves a historical value', async () => {
    const quotation = builderQuotation({
      services: [
        {
          id: 's-cruise',
          serviceType: 'CRUISE',
          name: 'Saved Cruise',
          description: null,
          dayNumber: null,
          city: null,
          quantity: '1',
          unitSellingPrice: '1000',
          totalSellingPrice: '1000',
          sellingPrice: '1000',
          taxCategory: null,
          notes: null,
          cruiseId: 'aaaaaaa5-1111-4111-8111-111111111111',
          // A historical room type no longer present in the active options.
          cruiseRoomTypeId: 'aaaaaaa6-1111-4111-8111-111111111111',
          sequence: 1,
        },
      ],
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Cruise');
    // The selected cruise's active room type option is shown.
    expect(await screen.findByLabelText('Cruise room type master')).toBeEnabled();
    expect(screen.getByLabelText('Cruise room type master')).toHaveValue('Interior');
  });

  it('lists every room type option for the selected cruise', async () => {
    const multiRoomCruise = {
      ...cruise,
      roomTypes: [
        { id: 'rt-1', name: 'Interior', price: 18000, currency: 'INR', status: 'ACTIVE', sortOrder: 1 },
        { id: 'rt-2', name: 'Ocean View', price: 24000, currency: 'INR', status: 'ACTIVE', sortOrder: 2 },
      ],
    };
    vi.stubGlobal(
      'fetch',
      masterFetch(builderQuotation(), { '/masters/cruises': page([multiRoomCruise]) }),
    );
    renderBuilderPage();
    await openTab('Cruise');
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    await userEvent.type(await screen.findByLabelText('Cruise master'), 'Dream Genting');
    await waitFor(() => expect(screen.getByLabelText('Cruise room type master')).toBeEnabled());
    const input = screen.getByLabelText('Cruise room type master');
    const list = document.querySelector(`datalist[id="${input.getAttribute('list')}"]`);
    expect(list).not.toBeNull();
    const labels = Array.from(list!.querySelectorAll('option')).map((option) =>
      option.getAttribute('value'),
    );
    expect(labels).toEqual(expect.arrayContaining(['Interior', 'Ocean View']));
  });

  it('shows an empty state when the selected cruise has no room types', async () => {
    const noRoomCruise = { ...cruise, roomTypes: [] };
    vi.stubGlobal(
      'fetch',
      masterFetch(builderQuotation(), { '/masters/cruises': page([noRoomCruise]) }),
    );
    renderBuilderPage();
    await openTab('Cruise');
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    await userEvent.type(await screen.findByLabelText('Cruise master'), 'Dream Genting');
    await waitFor(() => expect(screen.getByLabelText('Cruise room type master')).toBeEnabled());
    expect(screen.getByLabelText('Cruise room type master')).toHaveAttribute(
      'placeholder',
      'No room types configured',
    );
  });

  it('clears an invalid saved room type when the cruise changes', async () => {
    const cruiseA = {
      id: 'cruise-a',
      name: 'Cruise Alpha',
      status: 'ACTIVE',
      roomTypes: [{ id: 'rt-a', name: 'Balcony', price: 100, currency: 'INR', status: 'ACTIVE', sortOrder: 1 }],
    };
    const cruiseB = {
      id: 'cruise-b',
      name: 'Cruise Beta',
      status: 'ACTIVE',
      roomTypes: [{ id: 'rt-b', name: 'Suite', price: 200, currency: 'INR', status: 'ACTIVE', sortOrder: 1 }],
    };
    const quotation = builderQuotation({
      services: [
        {
          id: 's-cruise',
          serviceType: 'CRUISE',
          name: 'Cruise Alpha',
          description: null,
          dayNumber: null,
          city: null,
          quantity: '1',
          unitSellingPrice: '100',
          totalSellingPrice: '100',
          sellingPrice: '100',
          taxCategory: null,
          notes: null,
          cruiseId: 'cruise-a',
          cruiseRoomTypeId: 'rt-a',
          sequence: 1,
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, { '/masters/cruises': page([cruiseA, cruiseB]) }),
    );
    renderBuilderPage();
    await openTab('Cruise');
    // Saved cruise + room type load automatically.
    await waitFor(() =>
      expect(screen.getByLabelText('Cruise room type master')).toHaveValue('Balcony'),
    );
    // Switching to a cruise whose room types do not include the saved one clears it.
    await userEvent.clear(screen.getByLabelText('Cruise master'));
    await userEvent.type(screen.getByLabelText('Cruise master'), 'Cruise Beta');
    await waitFor(() => expect(screen.getByLabelText('Cruise room type master')).toHaveValue(''));
    const input = screen.getByLabelText('Cruise room type master');
    const list = document.querySelector(`datalist[id="${input.getAttribute('list')}"]`);
    const labels = Array.from(list!.querySelectorAll('option')).map((option) =>
      option.getAttribute('value'),
    );
    expect(labels).toEqual(['Suite']);
  });

  it('saves without cruise validation errors when Cruise is unchecked', async () => {
    const quotation = builderQuotation();
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Cruise');
    // Enabling Cruise creates an empty entry; saving is blocked while included.
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    expect(
      await screen.findByText(/services\.0\.name: String must contain at least 1 character/),
    ).toBeInTheDocument();
    // Unchecking Cruise clears the stale error and saves without cruise rows.
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    expect(screen.queryByText(/services\.0\.name/)).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.services.some((s: { serviceType: string }) => s.serviceType === 'CRUISE')).toBe(
        false,
      );
    });
  });

  const sgMaster = (id: string, title: string, sequence: number) => ({
    id,
    title,
    sequence,
    status: 'ACTIVE',
    destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
    city: { id: 'city-sg', name: 'Singapore' },
    estimatedHours: 2,
    suggestedStartTime: '09:00',
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('prefills one primary sightseeing activity per day within the trip duration', async () => {
    const masters = [
      sgMaster('sg-1', 'City Tour', 1),
      sgMaster('sg-2', 'Sentosa Tour', 2),
      sgMaster('sg-3', 'Universal Studios', 3),
      sgMaster('sg-4', 'Zoo', 4),
      sgMaster('sg-5', 'Gardens by the Bay', 5),
      sgMaster('sg-6', 'Night Safari', 6),
      sgMaster('sg-7', 'Bird Park', 7),
    ];
    const quotation = {
      ...builderQuotation(),
      destinationSummary: 'Singapore',
      travelStartDate: '2026-08-10T00:00:00.000Z',
      travelEndDate: '2026-08-14T00:00:00.000Z',
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-1',
        leadStage: 'QUALIFIED',
        assignedToId: null,
        createdById: 'user-1',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          {
            id: 'stay-1',
            country: 'Singapore',
            destination: 'Singapore',
            nights: 4,
            sequence: 1,
            arrivalDate: '2026-08-10T00:00:00.000Z',
            departureDate: '2026-08-14T00:00:00.000Z',
          },
        ],
      },
    };
    vi.stubGlobal('fetch', masterFetch(quotation, { '/masters/sightseeing': page(masters) }));
    renderBuilderPage();
    await openTab('Sightseeing');
    // 4 nights → up to 5 day containers.
    await waitFor(() =>
      expect(screen.getAllByLabelText(/Sightseeing day \d+ title/)).toHaveLength(5),
    );
    // One primary activity per day, taken in ascending master sequence order.
    expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('City Tour');
    expect(screen.getByLabelText('Day 2 activity 1 name')).toHaveValue('Sentosa Tour');
    expect(screen.getByLabelText('Day 3 activity 1 name')).toHaveValue('Universal Studios');
    expect(screen.getByLabelText('Day 4 activity 1 name')).toHaveValue('Zoo');
    expect(screen.getByLabelText('Day 5 activity 1 name')).toHaveValue('Gardens by the Bay');
    // No extra prefilled activities; the remaining masters stay in the picker.
    expect(screen.queryByLabelText('Day 1 activity 2 name')).not.toBeInTheDocument();
    // Meaningful day titles derived from the primary activity (no duplicated prefix).
    expect(screen.getByLabelText('Sightseeing day 1 title')).toHaveValue('Day 1: City Tour');
    expect(screen.getByLabelText('Sightseeing day 5 title')).toHaveValue('Day 5: Gardens by the Bay');
  });

  it('defaults the Sightseeing section title to Sightseeing & Experiences', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Sightseeing');
    expect(await screen.findByLabelText('Sightseeing section title')).toHaveValue(
      'Sightseeing & Experiences',
    );
  });

  it('preserves a manually edited sightseeing day title', async () => {
    const quotation = builderQuotation({
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: 0,
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'My Custom Day',
            titleTouched: true,
            city: 'Singapore',
            date: null,
            meals: { breakfast: false, lunch: false, dinner: false },
            mealMode: 'NO_TRANSFER',
            dailyTransfer: 'NO_TRANSFER',
            activities: [
              { sightseeingId: 'sg-1', name: 'City Tour', description: null, startTime: '09:00', imageUrl: null },
            ],
          },
        ],
      },
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Sightseeing');
    await waitFor(() =>
      expect(screen.getByLabelText('Sightseeing day 1 title')).toHaveValue('My Custom Day'),
    );
  });

  it('copies master sightseeing fields and auto-generates the day title', async () => {
    const master = {
      id: 'sg-1',
      title: 'City Tour',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      estimatedHours: 3,
      suggestedStartTime: '14:00',
      description: '<p>Guided tour of the city.</p>',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quotation = {
      ...builderQuotation({ destinationSummary: 'Singapore' }),
      destinationSummary: 'Singapore',
    };
    vi.stubGlobal('fetch', masterFetch(quotation, { '/masters/sightseeing': page([master]) }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    // Wait for the destination-scoped master options to load, then select one.
    await openActivityPicker(picker, 'City Tour');
    fireEvent.change(picker, { target: { value: 'City Tour' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('City Tour'),
    );
    expect(screen.getByLabelText('Sightseeing day 1 title')).toHaveValue('Day 1: City Tour');
    expect(screen.getByLabelText('Day 1 activity 1 start time')).toHaveValue('14:00');
    expect(screen.getByLabelText('Day 1 activity 1 description')).toHaveTextContent(
      'Guided tour of the city.',
    );
  });

  it('shows the selected sightseeing master image in the builder via the batched presentation', async () => {
    const withImage = {
      id: 'sg-img-1',
      title: 'Marina Bay',
      sequence: 2,
      status: 'ACTIVE',
      hasImage: true,
      estimatedHours: 2,
      suggestedStartTime: '10:00',
      description: '<p>Bay lights.</p>',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const noImage = {
      id: 'sg-no-img',
      title: 'Legacy Walk',
      sequence: 1,
      status: 'ACTIVE',
      hasImage: false,
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const quotation = builderQuotation({ destinationSummary: 'Singapore' });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing': page([noImage, withImage]),
      '/masters/sightseeing/presentations': {
        'sg-img-1': { imageUrl: 'https://storage.example.test/signed/marina-bay.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    // The prefilled activity is the first master (no image), so selecting the
    // image master later always fires a real change.
    expect(picker).toHaveValue('Legacy Walk');
    await openActivityPicker(picker, 'Marina Bay');
    fireEvent.change(picker, { target: { value: 'Marina Bay' } });
    const img = await screen.findByAltText('Activity');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/signed/marina-bay.jpg');
    expect(img).toHaveClass('object-cover');
    expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Marina Bay');
    // The expiring signed URL is resolved for display only, never fetched via
    // the single download-url endpoint or persisted.
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/masters/sightseeing/sg-img-1/image/download-url'),
      ),
    ).toBe(false);
  });

  it('changes the preview when the activity changes, falls back without an image and on load failure', async () => {
    const withImage = {
      id: 'sg-img-1',
      title: 'Marina Bay',
      sequence: 2,
      status: 'ACTIVE',
      hasImage: true,
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const noImage = {
      id: 'sg-no-img',
      title: 'Legacy Walk',
      sequence: 1,
      status: 'ACTIVE',
      hasImage: false,
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const quotation = builderQuotation({ destinationSummary: 'Singapore' });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing': page([noImage, withImage]),
      '/masters/sightseeing/presentations': {
        'sg-img-1': { imageUrl: 'https://storage.example.test/signed/marina-bay.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    await openActivityPicker(picker, 'Marina Bay');
    fireEvent.change(picker, { target: { value: 'Marina Bay' } });
    const img = await screen.findByAltText('Activity');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/signed/marina-bay.jpg');
    // Switching to a master without an image clears the preview back to the placeholder.
    fireEvent.change(picker, { target: { value: 'Legacy Walk' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Legacy Walk');
      expect(screen.queryByAltText('Activity')).not.toBeInTheDocument();
    });
    // Clearing the master removes the preview entirely.
    fireEvent.change(picker, { target: { value: '' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue(''),
    );
    expect(screen.queryByAltText('Activity')).not.toBeInTheDocument();
    // And a load failure on an image falls back to the neutral placeholder.
    fireEvent.change(picker, { target: { value: 'Marina Bay' } });
    const imgAgain = await screen.findByAltText('Activity');
    fireEvent.error(imgAgain);
    await waitFor(() => expect(screen.queryByAltText('Activity')).not.toBeInTheDocument());
  });

  it('renders existing selected activities with their master image on load', async () => {
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1: Marina Bay',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                sightseeingId: 'sg-img-1',
                name: 'Marina Bay',
                description: null,
                startTime: '10:00',
                duration: '2 hours',
                city: 'Singapore',
                imageUrl: null,
                sequence: 1,
              },
            ],
          },
        ],
      },
    });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing/presentations': {
        'sg-img-1': { imageUrl: 'https://storage.example.test/signed/marina-bay.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    // The legacy snapshot has no imageUrl — the master presentation resolves it.
    const img = await screen.findByAltText('Activity');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/signed/marina-bay.jpg');
  });

  it('resolves each of multiple selected activities to its own image', async () => {
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1: Marina Bay',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                sightseeingId: 'sg-img-1',
                name: 'Marina Bay',
                description: null,
                startTime: '10:00',
                duration: '2 hours',
                city: 'Singapore',
                imageUrl: null,
                sequence: 1,
              },
              {
                sightseeingId: 'sg-img-2',
                name: 'City Tour',
                description: null,
                startTime: '14:00',
                duration: '3 hours',
                city: 'Singapore',
                imageUrl: null,
                sequence: 2,
              },
            ],
          },
        ],
      },
    });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing/presentations': {
        'sg-img-1': { imageUrl: 'https://storage.example.test/signed/marina-bay.jpg' },
        'sg-img-2': { imageUrl: 'https://storage.example.test/signed/city-tour.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const images = await screen.findAllByAltText('Activity');
    expect(images).toHaveLength(2);
    const srcs = images.map((img) => img.getAttribute('src')).sort();
    expect(srcs).toEqual([
      'https://storage.example.test/signed/city-tour.jpg',
      'https://storage.example.test/signed/marina-bay.jpg',
    ]);
  });

  it('does not issue duplicate image requests for duplicate sightseeing ids', async () => {
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                sightseeingId: 'sg-img-1',
                name: 'Marina Bay',
                description: null,
                startTime: '10:00',
                duration: '2 hours',
                city: 'Singapore',
                imageUrl: null,
                sequence: 1,
              },
              {
                sightseeingId: 'sg-img-1',
                name: 'Marina Bay Again',
                description: null,
                startTime: '12:00',
                duration: '2 hours',
                city: 'Singapore',
                imageUrl: null,
                sequence: 2,
              },
            ],
          },
        ],
      },
    });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing/presentations': {
        'sg-img-1': { imageUrl: 'https://storage.example.test/signed/marina-bay.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const images = await screen.findAllByAltText('Activity');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute(
      'src',
      'https://storage.example.test/signed/marina-bay.jpg',
    );
    const presentationCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/masters/sightseeing/presentations'),
    );
    expect(presentationCalls.length).toBe(1);
  });

  it('uses the saved image snapshot when no master presentation exists', async () => {
    const quotation = builderQuotation({
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1: Marina Bay',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                sightseeingId: 'sg-img-1',
                name: 'Marina Bay',
                description: null,
                startTime: '10:00',
                duration: '2 hours',
                city: 'Singapore',
                imageUrl: 'https://storage.example.test/signed/snapshot.jpg',
                sequence: 1,
              },
            ],
          },
        ],
      },
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Sightseeing');
    const img = await screen.findByAltText('Activity');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/signed/snapshot.jpg');
  });

  it('does not persist expiring signed URLs into the quotation save payload', async () => {
    const withImage = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Marina Bay',
      sequence: 1,
      status: 'ACTIVE',
      hasImage: true,
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quotation = builderQuotation({ destinationSummary: 'Singapore' });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing': page([withImage]),
      '/masters/sightseeing/presentations': {
        '11111111-1111-4111-8111-111111111111': {
          imageUrl: 'https://storage.example.test/signed/marina-bay.jpg?X-Amz-Signature=abc',
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    await openActivityPicker(picker, 'Marina Bay');
    fireEvent.change(picker, { target: { value: 'Marina Bay' } });
    await screen.findByAltText('Activity');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
    });
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    const body = JSON.parse(String(patch![1]!.body));
    const days = body.sightseeingDetails.days;
    const urls = JSON.stringify(days);
    expect(urls).not.toContain('X-Amz-Signature');
    expect(urls).not.toContain('storage.example.test');
    const activity = days[0].activities[0];
    expect(activity.sightseeingId).toBe('11111111-1111-4111-8111-111111111111');
    expect(activity.imageUrl).toBeNull();
  });

  it('shows special options and grouped master options in the activity dropdown', async () => {
    const singaporeMaster = {
      id: 'sg-1',
      title: 'City Tour',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1: City Tour',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                sightseeingId: null,
                name: null,
                description: null,
                startTime: null,
                duration: null,
                city: null,
                imageUrl: null,
                sequence: null,
              },
            ],
          },
        ],
      },
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, { '/masters/sightseeing': page([singaporeMaster]) }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    const texts = within(listbox).getAllByRole('option').map((option) => option.textContent ?? '');
    // Reference quick options are always present.
    expect(texts.some((text) => text.includes('Day at Leisure'))).toBe(true);
    expect(texts.some((text) => text.includes('Custom Sightseeing'))).toBe(true);
    expect(texts.some((text) => text.includes('Arrival and Check-in'))).toBe(true);
    // Grouped master heading uses the day city.
    expect(within(listbox).getByText('Activities in Singapore')).toBeInTheDocument();
    expect(texts.some((text) => text.includes('City Tour'))).toBe(true);
  });

  it('handles Day at Leisure, Custom Sightseeing and Arrival and Check-in', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');

    fireEvent.focus(picker);
    await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    fireEvent.change(picker, { target: { value: 'Day at Leisure' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Day at Leisure'),
    );
    // Day at Leisure needs no master id; no image shows (placeholder).
    expect(screen.queryByAltText('Activity')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sightseeing day 1 title')).toHaveValue('Day 1: Day at Leisure');

    fireEvent.change(picker, { target: { value: 'Custom Sightseeing' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue(''),
    );

    fireEvent.change(picker, { target: { value: 'Arrival and Check-in' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Arrival and Check-in'),
    );
  });

  it('keeps other-destination activities available after the current city, sorted by sequence', async () => {
    const singaporeMaster = {
      id: 'sg-2',
      title: 'Singapore Zoo',
      sequence: 2,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const kualaMaster = {
      id: 'sg-1',
      title: 'Batu Caves',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-my', name: 'Malaysia', countryName: 'Malaysia' },
      city: { id: 'city-kl', name: 'Kuala Lumpur' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
          },
        ],
      },
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([singaporeMaster, kualaMaster]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    const labels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    // Other-destination activities are no longer hidden: both are selectable.
    expect(labels.some((text) => text.includes('Batu Caves'))).toBe(true);
    expect(labels.some((text) => text.includes('Singapore Zoo'))).toBe(true);
    // Current-day city (Singapore) activities stay at the top of the list.
    const singaporeIndex = labels.findIndex((text) => text.includes('Singapore Zoo'));
    const kualaIndex = labels.findIndex((text) => text.includes('Batu Caves'));
    expect(singaporeIndex).toBeGreaterThanOrEqual(0);
    expect(kualaIndex).toBeGreaterThan(singaporeIndex);
  });

  it('falls back to destination masters for a Cruise day and uses the destination heading', async () => {
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Cruise',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
          },
        ],
      },
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([sgMaster('sg-2', 'Singapore Zoo', 3), sgMaster('sg-1', 'Singapore City Tour', 1)]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    // The heading uses the quotation destination, not the day city.
    expect(within(listbox).getByText('Activities in Singapore')).toBeInTheDocument();
    expect(within(listbox).queryByText('Activities in Cruise')).not.toBeInTheDocument();
    const labels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    expect(labels.some((text) => text.includes('Singapore Zoo'))).toBe(true);
    expect(labels.some((text) => text.includes('Singapore City Tour'))).toBe(true);
    // Sorted by master sequence ascending.
    expect(
      labels.indexOf(labels.find((text) => text.includes('Singapore City Tour'))!),
    ).toBeLessThan(labels.indexOf(labels.find((text) => text.includes('Singapore Zoo'))!));
    // No empty state while destination masters exist.
    expect(within(listbox).queryByText(/No matching activities/)).not.toBeInTheDocument();
  });

  it('keeps an existing selected activity in a Cruise day without duplicating it', async () => {
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Cruise',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              {
                sightseeingId: 'sg-1',
                name: 'Singapore City Tour',
                description: '<p>Guided tour.</p>',
                startTime: '09:00',
                duration: '2 hours',
                city: 'Singapore',
                imageUrl: null,
                sequence: 1,
              },
            ],
          },
        ],
      },
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, { '/masters/sightseeing': page([sgMaster('sg-1', 'Singapore City Tour', 1)]) }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    // The selected activity stays visible even though the day city is Cruise.
    expect(picker).toHaveValue('Singapore City Tour');
    expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Singapore City Tour');
    expect(screen.getByLabelText('Day 1 activity 1 start time')).toHaveValue('09:00');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    const labels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    // Exactly one entry for the selected activity.
    expect(labels.filter((text) => text.includes('Singapore City Tour')).length).toBe(1);
  });

  it('uses the same corrected dropdown for activities added to a Cruise day', async () => {
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Cruise',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
          },
        ],
      },
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([sgMaster('sg-1', 'Singapore City Tour', 1), sgMaster('sg-2', 'Singapore Zoo', 2)]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    await userEvent.click(screen.getByRole('button', { name: 'Add Activity' }));
    const picker = await screen.findByLabelText('Day 1 activity 2');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 2' });
    expect(within(listbox).getByText('Activities in Singapore')).toBeInTheDocument();
    const labels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    expect(labels.some((text) => text.includes('Singapore Zoo'))).toBe(true);
    expect(labels.some((text) => text.includes('Singapore City Tour'))).toBe(true);
  });

  it('searches destination masters case-insensitively', async () => {
    const fullDaySentosa = { ...sgMaster('sg-1', 'Full Day Sentosa', 1), description: '<p>Sentosa island.</p>' };
    const fullDayExpress = { ...sgMaster('sg-2', 'Full Day Universal Studios Tour with Express Pass', 2) };
    const zoo = sgMaster('sg-3', 'Singapore Zoo', 3);
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Cruise',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
          },
        ],
      },
    });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([fullDaySentosa, fullDayExpress, zoo]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    fireEvent.change(picker, { target: { value: 'FULL DAY' } });
    await waitFor(() => {
      const listbox = screen.getByRole('listbox', { name: 'Day 1 activity 1' });
      const labels = within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent ?? '');
      expect(labels.some((text) => text.includes('Full Day Sentosa'))).toBe(true);
      expect(
        labels.some((text) => text.includes('Full Day Universal Studios Tour with Express Pass')),
      ).toBe(true);
      expect(labels.some((text) => text.includes('Singapore Zoo'))).toBe(false);
    });
  });

  it('selecting a master in a Cruise day fills description, time, duration and image', async () => {
    const cityTour = {
      ...sgMaster('sg-1', 'Singapore City Tour', 1),
      description: '<p>Guided city tour.</p>',
    };
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Cruise',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
          },
        ],
      },
    });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing': page([cityTour]),
      '/masters/sightseeing/presentations': {
        'sg-1': { imageUrl: 'https://storage.example.test/city-tour.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    await openActivityPicker(picker, 'Singapore City Tour');
    fireEvent.change(picker, { target: { value: 'Singapore City Tour' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Singapore City Tour'),
    );
    expect(screen.getByLabelText('Day 1 activity 1 start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Day 1 activity 1 description')).toHaveTextContent(
      'Guided city tour.',
    );
    const img = await screen.findByAltText('Activity');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/city-tour.jpg');
  });

  it('searches and selects a cross-destination activity without changing the day city', async () => {
    const klMaster = {
      id: 'kl-1',
      title: 'Batu Caves Tour',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-my', name: 'Malaysia', countryName: 'Malaysia' },
      city: { id: 'city-kl', name: 'Kuala Lumpur' },
      estimatedHours: 4,
      suggestedStartTime: '09:00',
      description: '<p>Limestone caves.</p>',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const sgMasterCross = {
      ...sgMaster('sg-9', 'Universal Studios Singapore', 9),
      description: '<p>Theme park day.</p>',
    };
    const quotation = builderQuotation({
      destinationSummary: 'Kuala Lumpur',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Kuala Lumpur',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
          },
        ],
      },
    });
    const fetchMock = masterFetch(quotation, {
      '/masters/sightseeing': page([klMaster, sgMasterCross]),
      '/masters/sightseeing/presentations': {
        'sg-9': { imageUrl: 'https://storage.example.test/universal-studios.jpg' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    // Both the current-day (Kuala Lumpur) and cross-destination (Singapore)
    // masters are available in the same dropdown.
    fireEvent.focus(picker);
    await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    expect(within(listbox).getByText('Batu Caves Tour')).toBeInTheDocument();
    expect(within(listbox).getByText('Universal Studios Singapore')).toBeInTheDocument();
    // Searching finds the Singapore activity even though the day is Kuala Lumpur.
    fireEvent.change(picker, { target: { value: 'Universal Studios' } });
    const searchList = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    expect(within(searchList).getByText('Universal Studios Singapore')).toBeInTheDocument();
    // Selecting it autofills from the selected master record.
    fireEvent.change(picker, { target: { value: 'Universal Studios Singapore' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Universal Studios Singapore'),
    );
    expect(screen.getByLabelText('Day 1 activity 1 start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Day 1 activity 1 description')).toHaveTextContent('Theme park day.');
    // The itinerary day city is untouched.
    expect(screen.getByLabelText('Sightseeing day 1 city')).toHaveValue('Kuala Lumpur');
    // The image comes from the selected activity's own master presentation.
    const img = await screen.findByAltText('Activity');
    expect(img).toHaveAttribute('src', 'https://storage.example.test/universal-studios.jpg');
  });

  it('keeps two activities in one day separate', async () => {
    const first = {
      id: 'sg-1',
      title: 'Singapore City Tour',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      suggestedStartTime: '09:00',
      description: '<p>First tour.</p>',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const second = {
      id: 'sg-2',
      title: 'Night Safari',
      sequence: 2,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      suggestedStartTime: '18:00',
      description: '<p>Night tour.</p>',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const quotation = builderQuotation({ destinationSummary: 'Singapore' });
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, { '/masters/sightseeing': page([first, second]) }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    await userEvent.click(screen.getByRole('button', { name: 'Add Activity' }));
    const picker1 = await screen.findByLabelText('Day 1 activity 1');
    const picker2 = await screen.findByLabelText('Day 1 activity 2');
    await openActivityPicker(picker1, 'Singapore City Tour');
    fireEvent.change(picker1, { target: { value: 'Singapore City Tour' } });
    await openActivityPicker(picker2, 'Night Safari');
    fireEvent.change(picker2, { target: { value: 'Night Safari' } });
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('Singapore City Tour'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Day 1 activity 2 name')).toHaveValue('Night Safari'),
    );
    expect(screen.getByLabelText('Day 1 activity 1 start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Day 1 activity 2 start time')).toHaveValue('18:00');
    // Each activity keeps its own description.
    expect(screen.getByLabelText('Day 1 activity 1 description')).toHaveTextContent('First tour.');
    expect(screen.getByLabelText('Day 1 activity 2 description')).toHaveTextContent('Night tour.');
  });

  it('adds and removes sightseeing activities and days', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Sightseeing');
    expect(await screen.findByLabelText('Day 1 activity 1 name')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Activity' }));
    expect(await screen.findByLabelText('Day 1 activity 2 name')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove activity' })[0]!);
    expect(screen.queryByLabelText('Day 1 activity 2 name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Day' }));
    expect(screen.queryByLabelText('Sightseeing day 1 title')).not.toBeInTheDocument();
  });

  it('stores an independent daily transfer per sightseeing activity', async () => {
    const quotation = builderQuotation({
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing & Experiences',
        amount: '0',
        description: null,
        days: [
          {
            dayNumber: 1,
            title: 'Day 1',
            city: 'Singapore',
            date: null,
            meals: { breakfast: true, lunch: false, dinner: false },
            mealMode: 'INCLUDE_AT_HOTEL',
            dailyTransfer: 'SHARED',
            activities: [
              { sightseeingId: null, name: 'Singapore City Tour', description: null, startTime: null, duration: null, city: null, imageUrl: null, dailyTransfer: null, sequence: null },
              { sightseeingId: null, name: 'Singapore Zoo', description: null, startTime: null, duration: null, city: null, imageUrl: null, dailyTransfer: null, sequence: null },
              { sightseeingId: null, name: 'Day at Cruise', description: null, startTime: null, duration: null, city: null, imageUrl: null, dailyTransfer: null, sequence: null },
            ],
          },
        ],
      },
    });
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    await screen.findByLabelText('Day 1 activity 1 name');
    // Every activity has its own Daily Transfer control; the first inherits the
    // day-level fallback, the others can differ.
    expect(
      screen.getByRole('radio', { name: 'Day 1 activity 1 daily transfer Shared Transfer' }),
    ).toBeChecked();
    await userEvent.click(
      screen.getByRole('radio', { name: 'Day 1 activity 2 daily transfer No Transfer' }),
    );
    await userEvent.click(
      screen.getByRole('radio', { name: 'Day 1 activity 3 daily transfer Private Transfer' }),
    );
    expect(
      screen.getByRole('radio', { name: 'Day 1 activity 2 daily transfer No Transfer' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Day 1 activity 3 daily transfer Private Transfer' }),
    ).toBeChecked();
    // The old shared day-level transfer control is gone.
    expect(screen.queryByRole('radio', { name: 'Private Transfer' })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
    });
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    const body = JSON.parse(String(patch![1]!.body));
    const activities = body.sightseeingDetails.days[0].activities;
    // Untouched activity keeps null (inherits the day-level value on display).
    expect(activities[0].dailyTransfer).toBeNull();
    expect(activities[1].dailyTransfer).toBe('NO_TRANSFER');
    expect(activities[2].dailyTransfer).toBe('PRIVATE');
  });

  it('supports independent per-meal transfer options in the builder', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Sightseeing');
    await screen.findByLabelText('Day 1 activity 1 name');

    // Breakfast is included by default and shows its own meal-option row.
    expect(screen.getByRole('checkbox', { name: 'breakfast' })).toBeChecked();
    const breakfastOptions = screen.getByRole('group', { name: 'breakfast meal options' });
    expect(within(breakfastOptions).getByRole('radio', { name: 'No Transfer' })).toBeChecked();
    expect(
      within(breakfastOptions).getByRole('radio', { name: 'Include At Hotel' }),
    ).not.toBeChecked();
    // Unselected meals show no option row and no transfer input.
    expect(screen.queryByRole('group', { name: 'lunch meal options' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'dinner meal options' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('breakfast transfer details')).not.toBeInTheDocument();

    // Checking Lunch adds its own row (default NO_TRANSFER) without touching breakfast.
    await userEvent.click(screen.getByRole('checkbox', { name: 'lunch' }));
    const lunchOptions = await screen.findByRole('group', { name: 'lunch meal options' });
    expect(within(lunchOptions).getByRole('radio', { name: 'No Transfer' })).toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'breakfast meal options' })).getByRole('radio', {
        name: 'No Transfer',
      }),
    ).toBeChecked();

    // WITH_TRANSFER on lunch only: transfer input appears for lunch only.
    await userEvent.click(within(lunchOptions).getByRole('radio', { name: 'With Transfer' }));
    const lunchDetails = await screen.findByLabelText('lunch transfer details');
    await userEvent.type(lunchDetails, 'at the Taj Hotel');
    expect(lunchDetails).toHaveValue('at the Taj Hotel');
    expect(screen.queryByLabelText('breakfast transfer details')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('dinner transfer details')).not.toBeInTheDocument();
    // Breakfast row is still independent.
    expect(
      within(screen.getByRole('group', { name: 'breakfast meal options' })).getByRole('radio', {
        name: 'No Transfer',
      }),
    ).toBeChecked();

    // Switching lunch away from WITH_TRANSFER hides its details input.
    await userEvent.click(within(lunchOptions).getByRole('radio', { name: 'No Transfer' }));
    expect(screen.queryByLabelText('lunch transfer details')).not.toBeInTheDocument();

    // Unchecking lunch removes its row entirely.
    await userEvent.click(screen.getByRole('checkbox', { name: 'lunch' }));
    expect(screen.queryByRole('group', { name: 'lunch meal options' })).not.toBeInTheDocument();

    // Daily Transfer is now per-activity, defaulting to the day-level value.
    expect(
      screen.getByRole('radio', { name: 'Day 1 activity 1 daily transfer Shared Transfer' }),
    ).toBeChecked();
    await userEvent.click(
      screen.getByRole('radio', { name: 'Day 1 activity 1 daily transfer Private Transfer' }),
    );
    expect(
      screen.getByRole('radio', { name: 'Day 1 activity 1 daily transfer Private Transfer' }),
    ).toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'breakfast meal options' })).getByRole('radio', {
        name: 'No Transfer',
      }),
    ).toBeChecked();
  });

  it('does not require sightseeing fields when the section is disabled', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    await userEvent.click(screen.getByLabelText('Include Sightseeing in Quotation'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {

      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
    });
  });

  it('persists each meal mode and transfer details on save', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    await screen.findByLabelText('Day 1 activity 1 name');

    // Breakfast default = No Transfer; set Lunch to With Transfer + details.
    await userEvent.click(screen.getByRole('checkbox', { name: 'lunch' }));
    const lunchOptions = await screen.findByRole('group', { name: 'lunch meal options' });
    await userEvent.click(within(lunchOptions).getByRole('radio', { name: 'With Transfer' }));
    const lunchDetails = await screen.findByLabelText('lunch transfer details');
    await userEvent.type(lunchDetails, 'pokemon sabji');

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
    });
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    const body = JSON.parse(String(patch![1]!.body));
    const day = body.sightseeingDetails.days[0];
    expect(day.meals.breakfast).toBe(true);
    expect(day.mealPreferences.breakfast).toMatchObject({ mode: 'NO_TRANSFER' });
    expect(day.meals.lunch).toBe(true);
    expect(day.mealPreferences.lunch).toMatchObject({
      mode: 'WITH_TRANSFER',
      transferDetails: 'pokemon sabji',
    });
  });

  it('hides the Visa tab and its controls from the quotation builder', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    // Wait for the builder to load (a visible tab appears).
    await screen.findByRole('button', { name: 'Vehicle' });
    // The Visa tab is not part of the navigation.
    expect(screen.queryByRole('button', { name: 'Visa' })).not.toBeInTheDocument();
    // All remaining tabs are present and Add-on Services follows Vehicle.
    const expected = [
      'Flight',
      'Hotel',
      'Sightseeing',
      'Cruise',
      'Vehicle',
      'Add-on Services',
      'Inclusions & Exclusions',
      'Summary & Pricing',
    ];
    for (const label of expected) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    const vehicleButton = screen.getByRole('button', { name: 'Vehicle' });
    const addonButton = screen.getByRole('button', { name: 'Add-on Services' });
    expect(
      vehicleButton.compareDocumentPosition(addonButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // No Visa panel controls are rendered anywhere.
    expect(screen.queryByText('Include Visa in Quotation')).not.toBeInTheDocument();
    expect(screen.queryByText(/Consolidated Total/)).not.toBeInTheDocument();
  });

  it('loads and saves an existing quotation with Visa data while the tab is hidden', async () => {
    const quotation = builderQuotation({
      includeVisa: true,
      visaAmount: '2500',
      visaDestination: 'Singapore',
      visaType: 'Tourist',
      visaServiceCharge: '500',
      visaGstPercent: '18',
      visaVfsCharge: '300',
    });
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    // The builder loads on a visible tab without crashing.
    await screen.findByRole('button', { name: 'Vehicle' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      // Saved Visa values are preserved in the payload.
      expect(body.includeVisa).toBe(true);
      expect(body.visaAmount).toBe(2500);
      expect(body.visaDestination).toBe('Singapore');
      expect(body.visaType).toBe('Tourist');
    });
  });

  it('saves a quotation without Visa data while the tab is hidden', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await screen.findByRole('button', { name: 'Vehicle' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
    });
  });

  const destinationFixture = (
    name: string,
    policies: Partial<Record<string, string | null>> = {},
  ) => ({
    id: `dest-${name.toLowerCase()}`,
    countryCode: 'SG',
    countryName: 'Singapore',
    name,
    destinationType: 'CITY',
    status: 'ACTIVE',
    inclusions: null,
    exclusions: null,
    paymentPolicies: null,
    cancellationPolicies: null,
    bookingTerms: null,
    ...policies,
    cities: [],
    _count: { cities: 0 },
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    createdBy: person,
  });

  it('prefills the five policy editors from the destination master', async () => {
    const sg = destinationFixture('Singapore', {
      inclusions: '<p>Hotel, flights, transfers</p>',
      exclusions: '<p>Personal expenses</p>',
      paymentPolicies: '<p>50% advance</p>',
      cancellationPolicies: '<p>Free up to 7 days</p>',
      bookingTerms: '<p>Valid for the dates shown</p>',
    });
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    vi.stubGlobal('fetch', masterFetch(quotation, { '/masters/destinations': page([sg]) }));
    renderBuilderPage();
    await openTab('Inclusions & Exclusions');

    expect(await screen.findByLabelText('Inclusions')).toHaveTextContent(
      'Hotel, flights, transfers',
    );
    expect(screen.getByLabelText('Exclusions')).toHaveTextContent('Personal expenses');
    expect(screen.getByLabelText('Payment Policies')).toHaveTextContent('50% advance');
    expect(screen.getByLabelText('Cancellation Policies')).toHaveTextContent('Free up to 7 days');
    expect(screen.getByLabelText('Booking Terms & Conditions')).toHaveTextContent(
      'Valid for the dates shown',
    );
  });

  it('combines multiple destination policies in order and deduplicates identical content', async () => {
    const sg = destinationFixture('Singapore', { inclusions: '<p>SG inclusions</p>' });
    const dubai = destinationFixture('Dubai', { inclusions: '<p>DXB inclusions</p>' });
    const quotation = stayQuotation([
      { destination: 'Singapore', nights: 2 },
      { destination: 'Dubai', nights: 2 },
    ]);
    vi.stubGlobal('fetch', masterFetch(quotation, { '/masters/destinations': page([sg, dubai]) }));
    renderBuilderPage();
    await openTab('Inclusions & Exclusions');

    const editor = await screen.findByLabelText('Inclusions');
    expect(editor).toHaveTextContent('SG inclusions');
    expect(editor).toHaveTextContent('DXB inclusions');
    expect(editor).toHaveTextContent('Singapore');
    expect(editor).toHaveTextContent('Dubai');

    // Identical content is deduplicated (single value, no destination headings).
    cleanup();
    const sgSame = destinationFixture('Singapore', { inclusions: '<p>Same content</p>' });
    const dubaiSame = destinationFixture('Dubai', { inclusions: '<p>Same content</p>' });
    const sameQuotation = stayQuotation([
      { destination: 'Singapore', nights: 2 },
      { destination: 'Dubai', nights: 2 },
    ]);
    vi.stubGlobal(
      'fetch',
      masterFetch(sameQuotation, { '/masters/destinations': page([sgSame, dubaiSame]) }),
    );
    renderBuilderPage();
    await openTab('Inclusions & Exclusions');
    const dedupEditor = await screen.findByLabelText('Inclusions');
    expect(dedupEditor).toHaveTextContent('Same content');
    expect(dedupEditor).not.toHaveTextContent('Singapore');
    expect(dedupEditor).not.toHaveTextContent('Dubai');
  });

  it('does not overwrite saved quotation policies with destination data', async () => {
    const sg = destinationFixture('Singapore', { inclusions: '<p>Destination inclusions</p>' });
    const quotation = {
      ...builderQuotation({ inclusionsHtml: '<p>Custom saved inclusions</p>' }),
      destinationSummary: 'Singapore',
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-000001',
        leadStage: 'NEW_LEAD',
        assignedToId: null,
        createdById: 'user-1',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          {
            id: 'stay-1',
            country: 'Singapore',
            destination: 'Singapore',
            nights: 2,
            sequence: 1,
            arrivalDate: '2026-08-10T00:00:00.000Z',
            departureDate: '2026-08-12T00:00:00.000Z',
          },
        ],
      },
    };
    vi.stubGlobal('fetch', masterFetch(quotation, { '/masters/destinations': page([sg]) }));
    renderBuilderPage();
    await openTab('Inclusions & Exclusions');

    const editor = await screen.findByLabelText('Inclusions');
    expect(editor).toHaveTextContent('Custom saved inclusions');
    expect(editor).not.toHaveTextContent('Destination inclusions');
  });

  it('prefills an add-on service price and saves the reference vehicle fields', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();

    // Including an add-on master with its own price prefills its selling figure.
    await openTab('Add-on Services');
    await userEvent.click(await screen.findByLabelText('Include Visa Assistance'));
    await waitFor(() => expect(screen.getByLabelText('Visa Assistance price')).toHaveValue(3800));

    // The dedicated vehicle section keeps the editable quotation amount while
    // the type/model are selected from the Vehicle master.
    await openTab('Vehicle');
    await userEvent.selectOptions(await screen.findByLabelText('Vehicle type'), 'Standard MPV');
    await userEvent.clear(screen.getByLabelText('Vehicle amount'));
    await userEvent.type(screen.getByLabelText('Vehicle amount'), '5000');
    await userEvent.selectOptions(
      screen.getByLabelText('Vehicle model'),
      'aaaaaaa7-1111-4111-8111-111111111111',
    );
    await userEvent.type(screen.getByLabelText('Vehicle usage or duration'), '3 hours');
    expect(screen.getByLabelText('Vehicle model')).toHaveValue(
      'aaaaaaa7-1111-4111-8111-111111111111',
    );
    expect(screen.getByLabelText('Vehicle amount')).toHaveValue(5000);

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body)) as {
        services: Array<Record<string, unknown>>;
      };
      expect(body.services).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            serviceType: 'VEHICLE_TRANSFER',
            vehicleId: 'aaaaaaa7-1111-4111-8111-111111111111',
            name: 'Innova Crysta',
            city: 'Standard MPV',
            sellingPrice: 5000,
            taxCategory: 'Transportation',
            notes: '3 hours',
          }),
        ]),
      );
    });
  });

  it('loads master add-on descriptions into the rich text editor without raw HTML', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Add-on Services');
    await userEvent.click(await screen.findByLabelText('Include Visa Assistance'));
    const editor = await screen.findByLabelText('Visa Assistance description');
    // The description is a rich-text editor, not a plain textarea.
    expect(editor.tagName).not.toBe('TEXTAREA');
    expect(editor).toHaveTextContent('Visa assistance with documentation support.');
    // No raw HTML tags leak into the editor content.
    expect(editor).not.toHaveTextContent('<');
  });

  it('keeps an edited add-on description and price after saving', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Add-on Services');
    await userEvent.click(await screen.findByLabelText('Include Visa Assistance'));
    const editor = await screen.findByLabelText('Visa Assistance description');
    await userEvent.type(editor, ' plus airfare assistance');
    await userEvent.clear(screen.getByLabelText('Visa Assistance price'));
    await userEvent.type(screen.getByLabelText('Visa Assistance price'), '4200');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body)) as {
        services: Array<Record<string, unknown>>;
      };
      const services = body.services as Array<{
        serviceType: string;
        description: string | null;
        sellingPrice: number | null;
      }>;
      const addonRow = services.find((service) => service.serviceType === 'OTHER_ADD_ON');
      expect(addonRow?.description ?? '').toContain('airfare assistance');
      expect(Number(addonRow?.sellingPrice)).toBe(4200);
    });
  });

  it('prefills Transportation as the Vehicle section title for a new quotation', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Vehicle');
    expect(await screen.findByLabelText('Vehicle section title')).toHaveValue('Transportation');
  });

  it('saves a custom Vehicle section title without overwriting it', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Vehicle');
    await userEvent.clear(await screen.findByLabelText('Vehicle section title'));
    await userEvent.type(screen.getByLabelText('Vehicle section title'), 'Airport Transfers');
    await userEvent.selectOptions(screen.getByLabelText('Vehicle type'), 'Standard MPV');
    await userEvent.selectOptions(
      screen.getByLabelText('Vehicle model'),
      'aaaaaaa7-1111-4111-8111-111111111111',
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body)) as {
        services: Array<Record<string, unknown>>;
      };
      expect(body.services).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            serviceType: 'VEHICLE_TRANSFER',
            taxCategory: 'Airport Transfers',
          }),
        ]),
      );
    });
  });

  it('keeps an existing custom Vehicle section title when the quotation is reopened', async () => {
    const quotation = builderQuotation({
      services: [
        {
          serviceType: 'VEHICLE_TRANSFER',
          vehicleId: null,
          name: 'Innova Crysta',
          description: null,
          dayNumber: null,
          city: 'SUV',
          quantity: '1',
          unitSellingPrice: '5000',
          totalSellingPrice: '5000',
          sellingPrice: '5000',
          taxCategory: 'Airport Transfers',
          notes: null,
          sequence: 1,
        },
      ],
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Vehicle');
    expect(await screen.findByLabelText('Vehicle section title')).toHaveValue('Airport Transfers');
  });

  it('falls back to Transportation when an existing Vehicle section title is empty', async () => {
    const quotation = builderQuotation({
      services: [
        {
          serviceType: 'VEHICLE_TRANSFER',
          vehicleId: null,
          name: 'Innova Crysta',
          description: null,
          dayNumber: null,
          city: 'SUV',
          quantity: '1',
          unitSellingPrice: '5000',
          totalSellingPrice: '5000',
          sellingPrice: '5000',
          taxCategory: '',
          notes: null,
          sequence: 1,
        },
      ],
    });
    vi.stubGlobal('fetch', masterFetch(quotation));
    renderBuilderPage();
    await openTab('Vehicle');
    expect(await screen.findByLabelText('Vehicle section title')).toHaveValue('Transportation');
  });

  it('preserves the Vehicle section title when the section is disabled and re-enabled', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Vehicle');
    await userEvent.clear(await screen.findByLabelText('Vehicle section title'));
    await userEvent.type(screen.getByLabelText('Vehicle section title'), 'Airport Transfers');
    await userEvent.click(screen.getByLabelText('Include Vehicle in Quotation'));
    expect(screen.queryByLabelText('Vehicle section title')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Include Vehicle in Quotation'));
    expect(await screen.findByLabelText('Vehicle section title')).toHaveValue('Airport Transfers');
  });

  it('submits the linked master ids alongside the snapshot fields', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Hotel' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Room type master'), 'Deluxe Room');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels[0]).toMatchObject({
        hotelId: 'aaaaaaa1-1111-4111-8111-111111111111',
        hotelRoomTypeId: 'aaaaaaa2-1111-4111-8111-111111111111',
        hotelName: 'Shah Palace Hotel',
      });
    });
  });

  it('saves the editable hotel section title, amount and single description', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    const title = await screen.findByLabelText('Hotel section title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Stay Details');
    await userEvent.clear(screen.getByLabelText('Hotel amount'));
    await userEvent.type(screen.getByLabelText('Hotel amount'), '12500');
    await userEvent.type(screen.getByLabelText('Hotel description'), 'Breakfast included.');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotelDetails).toMatchObject({
        sectionTitle: 'Stay Details',
        amount: 12500,
        description: 'Breakfast included.',
      });
    });
  });

  it('saves a draft with the default empty hotel row when Hotel is excluded', async () => {
    // A real quotation carries destination/date data, so the builder auto-creates
    // one default empty hotel row. Excluding Hotel must skip its validation and
    // never submit `[{ hotelName: "" }]`.
    const quotation = { ...builderQuotation(), destinationSummary: 'Goa', rooms: 1 };
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(screen.getByLabelText('Include Hotel in Quotation'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels).toEqual([]);
    });
  });

  it('saves a draft with multiple empty hotel rows when Hotel is excluded', async () => {
    const emptyRow = {
      id: 'empty-hotel-1',
      hotelId: null,
      hotelRoomTypeId: null,
      hotelMealPlanId: null,
      city: 'Goa',
      hotelName: '',
      category: null,
      roomType: null,
      mealPlan: null,
      rooms: 1,
      nights: 1,
      checkInDate: null,
      checkOutDate: null,
      internalCost: '0',
      sellingPrice: '0',
      selected: true,
      notes: null,
      sequence: 1,
    };
    const quotation = { ...builderQuotation({ hotels: [emptyRow, { ...emptyRow, id: 'empty-hotel-2' }] }), destinationSummary: 'Goa' };
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(screen.getByLabelText('Include Hotel in Quotation'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels).toEqual([]);
    });
  });

  it('shows a hotel-name error when Hotel is included with an empty row', async () => {
    const quotation = { ...builderQuotation(), destinationSummary: 'Goa', rooms: 1 };
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    // Hotel is included by default and the form has an empty default row.
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    expect(
      await screen.findByText(/hotels\.0\.hotelName: String must contain at least 1 character/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false),
    );
  });

  it('clears stale hotel errors and saves once Hotel is switched off', async () => {
    const quotation = { ...builderQuotation(), destinationSummary: 'Goa', rooms: 1 };
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    // Included hotel with an empty row → hotel-name error appears.
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    expect(
      await screen.findByText(/hotels\.0\.hotelName: String must contain at least 1 character/),
    ).toBeInTheDocument();

    // Turning Hotel off clears the stale hotel errors immediately.
    await userEvent.click(screen.getByLabelText('Include Hotel in Quotation'));
    expect(
      screen.queryByText(/hotels\.0\.hotelName: String must contain at least 1 character/),
    ).not.toBeInTheDocument();

    // Saving now succeeds with hotels: [].
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels).toEqual([]);
    });
  });

  it('saves valid hotel information when Hotel is included', async () => {
    const quotation = builderQuotation({
      hotels: [
        {
          id: 'valid-hotel-1',
          hotelId: null,
          hotelRoomTypeId: null,
          hotelMealPlanId: null,
          city: 'Goa',
          hotelName: 'Coastal Bay Resort',
          category: '4 Star',
          roomType: 'Deluxe Room',
          mealPlan: 'Breakfast Only',
          rooms: 1,
          nights: 4,
          checkInDate: '2026-09-10T00:00:00.000Z',
          checkOutDate: '2026-09-14T00:00:00.000Z',
          internalCost: '0',
          sellingPrice: '12000',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
    });
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels[0]).toMatchObject({
        hotelName: 'Coastal Bay Resort',
        city: 'Goa',
      });
    });
  });

  it('shows 10 kg+ in the Cabin Luggage dropdown and keeps the stored 10kg value', async () => {
    const quotation = builderQuotation({
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 0,
        journeyType: 'ONEWAY_OUTBOUND',
        outbound: {
          fromCity: 'Delhi',
          toCity: 'Goa',
          travelClass: 'Economy',
          segments: [
            {
              airlineId: null,
              airlineName: 'Air India',
              flightNumber: 'AI101',
              travelClass: 'Economy',
              from: 'Delhi',
              to: 'Goa',
              departureDate: '2026-09-10',
              departureTime: '10:00',
              arrivalDate: '2026-09-10',
              arrivalTime: '12:00',
              duration: null,
              cabinLuggage: '10kg',
              checkInLuggage: '30kg',
              notes: null,
              connectionVia: null,
            },
          ],
        },
        returnJourney: { fromCity: null, toCity: null, travelClass: 'Economy', segments: [] },
      },
    });
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Flight');

    // Existing stored 10kg loads selected and is displayed as "10 kg+".
    const cabin = (await screen.findAllByLabelText('Cabin Luggage'))[0]!;
    expect(cabin).toHaveValue('10kg');
    const option10 = within(cabin).getByRole('option', { name: '10 kg+' });
    expect(option10).toHaveValue('10kg');
    // The old "10kg" label is gone and no duplicate option appears.
    expect(within(cabin).queryByRole('option', { name: '10kg' })).not.toBeInTheDocument();
    // Other options are unchanged.
    expect(within(cabin).getByRole('option', { name: '7kg' })).toBeInTheDocument();
    expect(within(cabin).getByRole('option', { name: 'No Cabin Baggage' })).toBeInTheDocument();

    // Re-selecting and saving preserves the stored value.
    await userEvent.selectOptions(cabin, '10kg');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.flightDetails.outbound.segments[0].cabinLuggage).toBe('10kg');
    });
  });

  it('unlinks a hotel master and disables its dependent selectors', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Hotel' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue('Shah Palace Hotel'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear Hotel master' }));
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeDisabled());
    expect(screen.getByLabelText('Meal plan master')).toBeDisabled();
  });

  it('derives hotel nights from check-in/check-out dates in the editor and on save', async () => {
    const quotation = builderQuotation({
      hotels: [
        {
          id: 'hotel-row-1',
          hotelId: null,
          hotelRoomTypeId: null,
          hotelMealPlanId: null,
          city: 'Goa',
          hotelName: 'Coastal Bay Resort',
          category: '4 Star',
          roomType: 'Deluxe Room',
          mealPlan: 'Breakfast Only',
          rooms: 1,
          nights: 4,
          checkInDate: '2026-08-10T00:00:00.000Z',
          checkOutDate: '2026-08-12T00:00:00.000Z',
          internalCost: '0',
          sellingPrice: '12000',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
    });
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');

    // 10 Aug → 12 Aug = 2 nights, overriding the stored (wrong) value of 4.
    expect(await screen.findByLabelText('Hotel nights')).toHaveValue('2');

    // Changing the check-out date updates nights immediately (10 Aug → 13 Aug = 3).
    await fireEvent.change(screen.getByLabelText('Hotel check-out'), {
      target: { value: '2026-08-13' },
    });
    expect(screen.getByLabelText('Hotel nights')).toHaveValue('3');

    // Saving persists the derived nights.
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels[0].nights).toBe(3);
    });
  });

  it('normalises stored hotel nights to the date-derived value when saving', async () => {
    const quotation = builderQuotation({
      hotels: [
        {
          id: 'hotel-row-1',
          hotelId: null,
          hotelRoomTypeId: null,
          hotelMealPlanId: null,
          city: 'Goa',
          hotelName: 'Coastal Bay Resort',
          category: '4 Star',
          roomType: 'Deluxe Room',
          mealPlan: 'Breakfast Only',
          rooms: 1,
          nights: 4,
          checkInDate: '2026-08-10T00:00:00.000Z',
          checkOutDate: '2026-08-12T00:00:00.000Z',
          internalCost: '0',
          sellingPrice: '12000',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
    });
    const fetchMock = masterFetch(quotation);
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      // Dates 10 Aug → 12 Aug = 2 nights, even though the stored value was 4.
      expect(body.hotels[0].nights).toBe(2);
    });
  });

  it('loads an existing row with its master already linked', async () => {
    vi.stubGlobal(
      'fetch',
      masterFetch(
        builderQuotation({
          hotels: [
            {
              id: 'hotel-row-1',
              hotelId: 'aaaaaaa1-1111-4111-8111-111111111111',
              hotelRoomTypeId: 'aaaaaaa2-1111-4111-8111-111111111111',
              hotelMealPlanId: null,
              city: 'Baku',
              hotelName: 'Shah Palace Hotel',
              category: null,
              roomType: 'Deluxe Room',
              mealPlan: null,
              rooms: 1,
              nights: 2,
              checkInDate: null,
              checkOutDate: null,
              internalCost: '4000',
              sellingPrice: '6000',
              selected: true,
              notes: null,
              sequence: 1,
            },
          ],
          services: [
            {
              id: 'service-row-1',
              serviceType: 'FLIGHT',
              airlineId: 'aaaaaaa4-1111-4111-8111-111111111111',
              name: 'Delhi to Baku',
              description: null,
              dayNumber: null,
              city: null,
              quantity: '2',
              unitCost: '0',
              unitSellingPrice: '30000',
              taxCategory: null,
              notes: null,
              sequence: 1,
            },
          ],
        }),
      ),
    );
    renderBuilderPage();
    // The Hotel tab loads its preloaded hotel master link and enabled room type.
    await openTab('Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue('Shah Palace Hotel'),
    );
    expect(screen.getByLabelText('Room type master')).toBeEnabled();
  });

  const singaporeDefaultHotel = () => ({
    id: 'aaaaaa11-1111-4111-8111-111111111111',
    name: 'Aloft Singapore Novena by Marriott',
    starCategory: 4,
    starRating: null,
    status: 'ACTIVE',
    isDefaultForCity: true,
    isFeatured: false,
    hasImage: false,
    updatedAt: '2026-07-21T00:00:00.000Z',
    createdAt: '2026-07-21T00:00:00.000Z',
    destination: { id: 'dest-sg', name: 'Singapore' },
    city: { id: 'city-sg', name: 'Singapore' },
  });

  const dubaiDefaultHotel = () => ({
    id: 'aaaaaa22-2222-4222-8222-222222222222',
    name: 'Burj View Hotel',
    starCategory: 5,
    starRating: null,
    status: 'ACTIVE',
    isDefaultForCity: true,
    isFeatured: false,
    hasImage: false,
    updatedAt: '2026-07-21T00:00:00.000Z',
    createdAt: '2026-07-21T00:00:00.000Z',
    destination: { id: 'dest-dx', name: 'Dubai' },
    city: { id: 'city-dx', name: 'Dubai' },
  });

  const stayQuotation = (stays: Array<{ destination: string; nights: number }>) => ({
    ...builderQuotation(),
    destinationSummary: stays.map((stay) => stay.destination).join(' • '),
    query: {
      id: 'lead-1',
      queryNumber: 'QRY-000001',
      leadStage: 'NEW_LEAD',
      assignedToId: null,
      createdById: 'user-1',
      departureCity: 'Delhi',
      departureCountry: 'India',
      itinerary: stays.map((stay, index) => ({
        id: `stay-${index}`,
        country: stay.destination,
        destination: stay.destination,
        nights: stay.nights,
        sequence: index + 1,
        arrivalDate: '2026-08-10T00:00:00.000Z',
        departureDate: '2026-08-12T00:00:00.000Z',
      })),
    },
  });

  it('prefills the active default hotel for the quotation destination', async () => {
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    const fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue(
        'Aloft Singapore Novena by Marriott',
      ),
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels).toHaveLength(1);
      expect(body.hotels[0]).toMatchObject({
        hotelId: 'aaaaaa11-1111-4111-8111-111111111111',
        hotelName: 'Aloft Singapore Novena by Marriott',
        city: 'Singapore',
        category: '4 Star',
      });
    });
  });

  it('selects the best available hotel when no default exists, skips inactive default', async () => {
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    // Not marked default — best available active hotel should still be selected.
    let fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([{ ...singaporeDefaultHotel(), isDefaultForCity: false }]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue('Aloft Singapore Novena by Marriott'),
    );
    cleanup();

    // Marked default but inactive — no active hotel exists, so hotel is blank.
    fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([{ ...singaporeDefaultHotel(), status: 'INACTIVE' }]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() => expect(screen.getByLabelText('Hotel master')).toHaveValue(''));
  });

  it('creates a row for every hotel-required city with or without a default', async () => {
    const quotation = stayQuotation([
      { destination: 'Singapore', nights: 2 },
      { destination: 'Dubai', nights: 2 },
    ]);
    const fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel(), dubaiDefaultHotel()]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() => expect(screen.getAllByLabelText('Hotel master').length).toBe(2));
    const masters = screen.getAllByLabelText('Hotel master');
    expect(masters[0]).toHaveValue('Aloft Singapore Novena by Marriott');
    expect(masters[1]).toHaveValue('Burj View Hotel');

    // Both city rows remain even when only one has a default; the second gets
    // the best available hotel or an empty row if none exist.
    cleanup();
    const partialMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    });
    vi.stubGlobal('fetch', partialMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() => expect(screen.getAllByLabelText('Hotel master').length).toBe(2));
    const m2 = screen.getAllByLabelText('Hotel master');
    expect(m2[0]).toHaveValue('Aloft Singapore Novena by Marriott');
    // Dubai has no hotel master in the mock, so it stays blank
    expect(m2[1]).toHaveValue('');
  });

  it('single hotel city with Cruise in between covers full quotation nights', async () => {
    const quotation = {
      ...builderQuotation({
        destinationSummary: 'Singapore • Cruise • Singapore',
        hotels: [],
        sightseeingDetails: null,
      }),
      travelStartDate: '2026-08-14',
      travelEndDate: '2026-08-20',
      rooms: 1,
      query: {
        id: 'lead-cruise',
        queryNumber: 'QRY-000010',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 's1', country: 'Singapore', destination: 'Singapore', nights: 2, sequence: 1 },
          { id: 's2', country: 'International', destination: 'Cruise', nights: 2, sequence: 2 },
          { id: 's3', country: 'Singapore', destination: 'Singapore', nights: 2, sequence: 3 },
        ],
      },
    };
    vi.stubGlobal('fetch', masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    }));
    renderBuilderPage();
    await openTab('Hotel');
    // Exactly one Hotel Stay row despite Singapore appearing twice
    expect(await screen.findAllByLabelText('Hotel master')).toHaveLength(1);
    expect(screen.getByLabelText('Hotel master')).toHaveValue('Aloft Singapore Novena by Marriott');
    expect(screen.getByLabelText('Hotel city')).toHaveValue('Singapore');
    // 6 total nights (2+2+2), not merged land nights (2+2=4)
    expect(screen.getByLabelText('Hotel nights')).toHaveValue('6');
    expect(screen.getByLabelText('Hotel check-in')).toHaveValue('2026-08-14');
    expect(screen.getByLabelText('Hotel check-out')).toHaveValue('2026-08-20');
  });

  it('single hotel city with full nights preserves the correct hotel selection', async () => {
    const quotation = {
      ...builderQuotation({
        destinationSummary: 'Singapore',
        hotels: [],
        sightseeingDetails: null,
      }),
      travelStartDate: '2026-08-14',
      travelEndDate: '2026-08-20',
      rooms: 1,
      query: {
        id: 'lead-sg-only',
        queryNumber: 'QRY-000011',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 's1', country: 'Singapore', destination: 'Singapore', nights: 6, sequence: 1 },
        ],
      },
    };
    vi.stubGlobal('fetch', masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    }));
    renderBuilderPage();
    await openTab('Hotel');
    expect(await screen.findAllByLabelText('Hotel master')).toHaveLength(1);
    expect(screen.getByLabelText('Hotel master')).toHaveValue('Aloft Singapore Novena by Marriott');
    expect(screen.getByLabelText('Hotel nights')).toHaveValue('6');
    expect(screen.getByLabelText('Hotel check-in')).toHaveValue('2026-08-14');
    expect(screen.getByLabelText('Hotel check-out')).toHaveValue('2026-08-20');
  });

  it('preserves a saved hotel snapshot and a manually selected hotel', async () => {
    const saved = builderQuotation({
      hotels: [
        {
          id: 'saved-row-1',
          hotelId: 'aaaaaa33-3333-4333-8333-333333333333',
          hotelRoomTypeId: null,
          hotelMealPlanId: null,
          city: 'Singapore',
          hotelName: 'Saved Beach Resort',
          category: '3 Star',
          roomType: null,
          mealPlan: null,
          rooms: 1,
          nights: 2,
          checkInDate: null,
          checkOutDate: null,
          internalCost: '0',
          sellingPrice: '0',
          selected: true,
          notes: null,
          sequence: 1,
        },
      ],
    });
    // A different default hotel exists in Hotel Master.
    const fetchMock = masterFetch(saved, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels).toHaveLength(1);
      expect(body.hotels[0].hotelId).toBe('aaaaaa33-3333-4333-8333-333333333333');
      expect(body.hotels[0].hotelName).toBe('Saved Beach Resort');
    });
  });

  it('does not re-add a default hotel for a destination that already has one', async () => {
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    const fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue(
        'Aloft Singapore Novena by Marriott',
      ),
    );
    // Adding another hotel row for the same destination must not duplicate the default.
    await userEvent.click(screen.getByRole('button', { name: 'Add Hotel' }));
    await waitFor(() => expect(screen.getAllByLabelText('Hotel master').length).toBe(2));
    expect(screen.getAllByLabelText('Hotel master')[1]).toHaveValue('');
  });

  it('does not replace a hotel the user selects manually', async () => {
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    const altHotel = {
      ...singaporeDefaultHotel(),
      id: 'aaaaaa44-4444-4444-8444-444444444444',
      name: 'Alternative Hotel',
      isDefaultForCity: false,
    };
    const fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel(), altHotel]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue(
        'Aloft Singapore Novena by Marriott',
      ),
    );
    // The user picks a different hotel from the master.
    await userEvent.clear(screen.getByLabelText('Hotel master'));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Alternative Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue('Alternative Hotel'),
    );
    // Automatic prefill must not change it back.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.getByLabelText('Hotel master')).toHaveValue('Alternative Hotel');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels[0].hotelId).toBe('aaaaaa44-4444-4444-8444-444444444444');
      expect(body.hotels[0].hotelName).toBe('Alternative Hotel');
    });
  });

  it('fetches the activities lookup without a destination/city narrow so all tenant activities are searchable', async () => {
    const quotation = builderQuotation({ destinationSummary: 'Singapore' });
    const baseFetch = masterFetch(quotation);
    let activitiesUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/masters/sightseeing/activities')) {
        activitiesUrl = url;
      }
      return baseFetch(input, init);
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    await screen.findByLabelText('Day 1 activity 1');
    // The dropdown is not scoped to a destination/city: the backend returns
    // every tenant-visible activity and the builder orders current-city first.
    expect(activitiesUrl).toContain('/masters/sightseeing/activities');
    expect(activitiesUrl).not.toMatch(/destination=/);
    expect(activitiesUrl).not.toMatch(/city=/);
  });

  it('shows loading state when sightseeing master data is pending', async () => {
    const quotation = builderQuotation();
    const baseFetch = masterFetch(quotation);
    const pending = new Promise<Response>(() => { /* never resolves */ });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/masters/sightseeing/activities')) {
        return pending;
      }
      return baseFetch(input, init);
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    expect(within(listbox).getByText('Day at Leisure')).toBeInTheDocument();
    expect(within(listbox).getByText('Loading activities...')).toBeInTheDocument();
  });

  it('shows error state when sightseeing master request fails', async () => {
    const quotation = builderQuotation();
    const baseFetch = masterFetch(quotation);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/masters/sightseeing/activities')) {
        return { ok: false, status: 500, headers: new Headers(), json: async () => ({ success: false, error: { code: 'INTERNAL_ERROR', message: 'error' } }) } as unknown as Response;
      }
      return baseFetch(input, init);
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    expect(within(listbox).getByText('Unable to load sightseeing activities.')).toBeInTheDocument();
  });

  it('shows empty state when no active master records exist for the destination', async () => {
    const quotation = builderQuotation({ destinationSummary: 'Singapore' });
    vi.stubGlobal('fetch', masterFetch(quotation, {
      '/masters/sightseeing': page([]),
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    expect(within(listbox).getByText('Day at Leisure')).toBeInTheDocument();
    expect(within(listbox).getByText('No sightseeing activities found for Singapore.')).toBeInTheDocument();
  });

  it('uses destination fallback when day city is Cruise for a Singapore quotation', async () => {
    const singaporeMaster = {
      id: 'sg-1',
      title: 'Sentosa Tour',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quotation = builderQuotation({
      destinationSummary: 'Singapore',
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing',
        amount: '0',
        description: null,
        days: [{
          dayNumber: 1, title: 'Day 1', city: 'Cruise', date: null,
          meals: { breakfast: true, lunch: false, dinner: false },
          mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED',
          activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
        }],
      },
    });
    vi.stubGlobal('fetch', masterFetch(quotation, {
      '/masters/sightseeing': page([singaporeMaster]),
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    // Heading uses destination (Singapore) since Cruise is not a matching city.
    expect(within(listbox).getByText('Activities in Singapore')).toBeInTheDocument();
    expect(within(listbox).getByText('Sentosa Tour')).toBeInTheDocument();
  });

  it('shows Kuala Lumpur sightseeing records when the destinationSummary is the city', async () => {
    const klMaster1 = {
      id: 'kl-1',
      title: 'Batu Caves Tour',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-my', name: 'Malaysia', countryName: 'Malaysia' },
      city: { id: 'city-kl', name: 'Kuala Lumpur' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const klMaster2 = {
      id: 'kl-2',
      title: 'Petronas Towers Tour',
      sequence: 2,
      status: 'ACTIVE',
      destination: { id: 'dest-my', name: 'Malaysia', countryName: 'Malaysia' },
      city: { id: 'city-kl', name: 'Kuala Lumpur' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    // The lead itinerary carries country="Malaysia" (Master destination) while the
    // quotation destinationSummary holds the CITY "Kuala Lumpur". Simulate the real
    // backend: activities are resolved by the destination NAME (Malaysia), so the
    // client must send destination=Malaysia (not the city token) to receive them.
    const quotation = {
      ...builderQuotation({ destinationSummary: 'Kuala Lumpur' }),
      query: {
        id: 'lead-kl',
        queryNumber: 'QRY-KL',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 'kl-stay', country: 'Malaysia', destination: 'Kuala Lumpur', nights: 3, sequence: 1 },
        ],
      },
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing',
        amount: '0',
        description: null,
        days: [{
          dayNumber: 1, title: 'Day 1', city: 'Kuala Lumpur', date: null,
          meals: { breakfast: true, lunch: false, dinner: false },
          mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED',
          activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
        }],
      },
    };
    const baseFetch = masterFetch(quotation, {
      '/masters/sightseeing': page([klMaster1, klMaster2]),
      '/masters/destinations': page([{
        id: 'dest-my', countryCode: 'MY', countryName: 'Malaysia', name: 'Malaysia',
        destinationType: 'CITY', status: 'ACTIVE',
        inclusions: null, exclusions: null, paymentPolicies: null, cancellationPolicies: null, bookingTerms: null,
        cities: [], _count: { cities: 0 },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }]),
    });
    let activitiesUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/masters/sightseeing/activities')) {
        activitiesUrl = url;
        // The endpoint is global: all tenant-visible activities are returned,
        // and the builder orders current-day-city options first.
        return response({
          destination: { id: 'dest-my', name: 'Malaysia' },
          city: null,
          activities: [klMaster1, klMaster2],
        });
      }
      return baseFetch(input, init);
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    // No destination/city narrow is sent; the dropdown browses every tenant
    // activity and keeps the Kuala Lumpur (current day city) records visible.
    expect(activitiesUrl).toContain('/masters/sightseeing/activities');
    expect(activitiesUrl).not.toMatch(/destination=/);
    expect(activitiesUrl).not.toMatch(/city=/);
    expect(within(listbox).getByText('Activities in Kuala Lumpur')).toBeInTheDocument();
    expect(within(listbox).getByText('Batu Caves Tour')).toBeInTheDocument();
    expect(within(listbox).getByText('Petronas Towers Tour')).toBeInTheDocument();
    expect(within(listbox).queryByText(/No sightseeing activities found/i)).not.toBeInTheDocument();
  });

  it('shows the empty state only when the resolved destination has zero sightseeing', async () => {
    const quotation = {
      ...builderQuotation({ destinationSummary: 'Kuala Lumpur' }),
      query: {
        id: 'lead-kl',
        queryNumber: 'QRY-KL',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 'kl-stay', country: 'Malaysia', destination: 'Kuala Lumpur', nights: 3, sequence: 1 },
        ],
      },
      sightseeingDetails: {
        include: true,
        sectionTitle: 'Sightseeing',
        amount: '0',
        description: null,
        days: [{
          dayNumber: 1, title: 'Day 1', city: 'Kuala Lumpur', date: null,
          meals: { breakfast: true, lunch: false, dinner: false },
          mealMode: 'INCLUDE_AT_HOTEL', dailyTransfer: 'SHARED',
          activities: [{ sightseeingId: null, name: null, description: null, startTime: null, duration: null, city: null, imageUrl: null, sequence: null }],
        }],
      },
    };
    const baseFetch = masterFetch(quotation, {
      '/masters/sightseeing': page([]),
      '/masters/destinations': page([{
        id: 'dest-my', countryCode: 'MY', countryName: 'Malaysia', name: 'Malaysia',
        destinationType: 'CITY', status: 'ACTIVE',
        inclusions: null, exclusions: null, paymentPolicies: null, cancellationPolicies: null, bookingTerms: null,
        cities: [], _count: { cities: 0 },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }]),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/masters/sightseeing/activities')) {
        return response({ destination: { id: 'dest-my', name: 'Malaysia' }, city: null, activities: [] });
      }
      return baseFetch(input, init);
    }));
    renderBuilderPage();
    await openTab('Sightseeing');
    const picker = await screen.findByLabelText('Day 1 activity 1');
    fireEvent.focus(picker);
    const listbox = await screen.findByRole('listbox', { name: 'Day 1 activity 1' });
    expect(within(listbox).getByText('Day at Leisure')).toBeInTheDocument();
    expect(within(listbox).getByText(/No sightseeing activities found for Malaysia/i)).toBeInTheDocument();
  });

  it('prefills the final day with a departure master regardless of sequence', async () => {
    const departureMaster = {
      id: 'sg-departure',
      title: 'Departure from Singapore',
      sequence: 53,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      suggestedStartTime: '10:00',
      description: '<p>Check-out and airport transfer.</p>',
      estimatedHours: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const zooMaster = {
      id: 'sg-zoo',
      title: 'Singapore Zoo',
      sequence: 7,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quotation = {
      ...builderQuotation({
        destinationSummary: 'Singapore',
        sightseeingDetails: null,
      }),
      travelStartDate: '2026-10-23',
      travelEndDate: '2026-10-29',
      rooms: 1,
      query: {
        id: 'lead-1',
        queryNumber: 'QRY-000001',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 's1', country: 'Singapore', destination: 'Singapore', nights: 3, sequence: 1 },
          { id: 's2', country: 'Singapore', destination: 'Singapore', nights: 3, sequence: 2 },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([zooMaster, departureMaster]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    // Day 7 (final) gets the departure master
    const day7Title = (await screen.findByLabelText('Sightseeing day 7 title')) as HTMLInputElement;
    expect(day7Title.value).toBe('Day 7: Departure from Singapore');
    const day7Activity = screen.getByLabelText('Day 7 activity 1');
    fireEvent.focus(day7Activity);
    const day7Listbox = screen.getByRole('listbox', { name: 'Day 7 activity 1' });
    // High-sequence departure master appears as the selected option
    expect(within(day7Listbox).queryByText('Departure from Singapore')).toBeInTheDocument();
    // Day 7 activity name field is pre-populated
    expect(screen.getByLabelText('Day 7 activity 1 name')).toHaveValue('Departure from Singapore');
    expect(screen.getByLabelText('Day 7 activity 1 start time')).toHaveValue('10:00');
  });

  it('uses departure master for the final day and never assigns a non-departure by sequence', async () => {
    const departureMaster = {
      id: 'sg-dep',
      title: 'Departure from Singapore',
      sequence: 99,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const normalMasters = [
      { id: 'sg-n1', title: 'City Tour', sequence: 1, status: 'ACTIVE', destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' }, city: { id: 'city-sg', name: 'Singapore' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'sg-n2', title: 'Sentosa', sequence: 2, status: 'ACTIVE', destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' }, city: { id: 'city-sg', name: 'Singapore' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const quotation = {
      ...builderQuotation({
        destinationSummary: 'Singapore',
        sightseeingDetails: null,
      }),
      travelStartDate: '2026-10-23',
      travelEndDate: '2026-10-25',
      rooms: 1,
      query: {
        id: 'lead-2',
        queryNumber: 'QRY-000002',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 's1', country: 'Singapore', destination: 'Singapore', nights: 2, sequence: 1 },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([...normalMasters, departureMaster]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    // 3 day trip: Day 1 = City Tour, Day 2 = Sentosa, Day 3 = Departure
    expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('City Tour');
    expect(screen.getByLabelText('Day 2 activity 1 name')).toHaveValue('Sentosa');
    expect(screen.getByLabelText('Day 3 activity 1 name')).toHaveValue('Departure from Singapore');
    // Normal day never gets the departure master
    expect(screen.getByLabelText('Day 1 activity 1 name')).not.toHaveValue('Departure from Singapore');
  });

  it('does not use a departure master on non-final days', async () => {
    const departureMaster = {
      id: 'sg-d1',
      title: 'Departure from Singapore',
      sequence: 1,
      status: 'ACTIVE',
      destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' },
      city: { id: 'city-sg', name: 'Singapore' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const normalMasters = [
      { id: 'sg-ct', title: 'City Tour', sequence: 2, status: 'ACTIVE', destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' }, city: { id: 'city-sg', name: 'Singapore' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'sg-gb', title: 'Gardens by the Bay', sequence: 3, status: 'ACTIVE', destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' }, city: { id: 'city-sg', name: 'Singapore' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'sg-ss', title: 'Sentosa', sequence: 4, status: 'ACTIVE', destination: { id: 'dest-sg', name: 'Singapore', countryName: 'Singapore' }, city: { id: 'city-sg', name: 'Singapore' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const quotation = {
      ...builderQuotation({
        destinationSummary: 'Singapore',
        sightseeingDetails: null,
      }),
      travelStartDate: '2026-10-23',
      travelEndDate: '2026-10-26',
      rooms: 1,
      query: {
        id: 'lead-3',
        queryNumber: 'QRY-000003',
        leadStage: 'NEW_LEAD',
        departureCity: 'Delhi',
        departureCountry: 'India',
        itinerary: [
          { id: 's1', country: 'Singapore', destination: 'Singapore', nights: 3, sequence: 1 },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      masterFetch(quotation, {
        '/masters/sightseeing': page([departureMaster, ...normalMasters]),
      }),
    );
    renderBuilderPage();
    await openTab('Sightseeing');
    // 4 day trip: departure master is reserved for Day 4 only
    expect(screen.getByLabelText('Day 1 activity 1 name')).toHaveValue('City Tour');
    expect(screen.getByLabelText('Day 2 activity 1 name')).toHaveValue('Gardens by the Bay');
    expect(screen.getByLabelText('Day 3 activity 1 name')).toHaveValue('Sentosa');
    expect(screen.getByLabelText('Day 4 activity 1 name')).toHaveValue('Departure from Singapore');
  });

  it('offers the same pickers in the template builder', async () => {
    vi.stubGlobal('fetch', masterFetch(template));
    renderWithProviders(<QuotationTemplateFormPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Add hotel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add service' }));
    expect(screen.getByLabelText('Hotel master')).toBeInTheDocument();
    expect(screen.getByLabelText('Room type master')).toBeDisabled();
    expect(screen.getByLabelText('Sightseeing master')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel name')).toHaveValue('Shah Palace Hotel'),
    );
  });
});

describe('public quotation contact message helpers', () => {
  it('formats the public weblink quotation ID as a leading-# number', () => {
    expect(formatPublicQuotationNumber('QT-001032')).toBe('#1032');
    expect(formatPublicQuotationNumber('QT-1032')).toBe('#1032');
    expect(formatPublicQuotationNumber('1032')).toBe('#1032');
    expect(formatPublicQuotationNumber('#1032')).toBe('#1032');
    // Never '#QT-...' or '##...' for the standard stored format.
    expect(formatPublicQuotationNumber('QT-001032')).not.toMatch(/^#QT/);
    expect(formatPublicQuotationNumber('QT-001032')).not.toMatch(/^##/);
    expect(formatPublicQuotationNumber('')).toBe('');
    expect(formatPublicQuotationNumber(null)).toBe('');
    expect(formatPublicQuotationNumber(undefined)).toBe('');
  });

  it('computes calendar-night differences between check-in and check-out', () => {
    expect(hotelStayNights('2026-08-10', '2026-08-12')).toBe(2);
    expect(hotelStayNights('2026-08-12', '2026-08-13')).toBe(1);
    // Check-in/check-out times must not reduce the calendar-night count.
    expect(hotelStayNights('2026-08-10T14:00:00.000Z', '2026-08-12T12:00:00.000Z')).toBe(2);
  });

  it('handles month and year boundaries', () => {
    expect(hotelStayNights('2026-01-31', '2026-02-02')).toBe(2);
    expect(hotelStayNights('2026-12-31', '2027-01-02')).toBe(2);
  });

  it('returns null for missing, invalid, zero or reversed dates', () => {
    expect(hotelStayNights(null, '2026-08-12')).toBeNull();
    expect(hotelStayNights('2026-08-10', null)).toBeNull();
    expect(hotelStayNights(undefined, undefined)).toBeNull();
    expect(hotelStayNights('not-a-date', '2026-08-12')).toBeNull();
    expect(hotelStayNights('2026-08-12', '2026-08-12')).toBeNull();
    expect(hotelStayNights('2026-08-13', '2026-08-12')).toBeNull();
  });

  it('maps the stored 10kg cabin luggage to the 10 kg+ label and leaves others unchanged', () => {
    expect(cabinLuggageLabel('10kg')).toBe('10 kg+');
    expect(cabinLuggageLabel('7kg')).toBe('7kg');
    expect(cabinLuggageLabel('No Cabin Baggage')).toBe('No Cabin Baggage');
    expect(cabinLuggageLabel('')).toBe('');
    expect(cabinLuggageLabel(null)).toBe('');
    expect(cabinLuggageLabel(undefined)).toBe('');
  });

  it('maps known service keys to icons and falls back safely for unknown keys', () => {
    expect(serviceCardIcon('flights')).toBeDefined();
    expect(serviceCardIcon('hotels')).toBeDefined();
    expect(serviceCardIcon('sightseeing')).toBeDefined();
    expect(serviceCardIcon('cruise')).toBeDefined();
    expect(serviceCardIcon('transportation')).toBeDefined();
    expect(serviceCardIcon('visa')).toBeDefined();
    expect(serviceCardIcon('add-ons')).toBeDefined();
    // Unknown keys return a renderable component instead of breaking.
    const fallback = serviceCardIcon('some-unknown-service');
    expect(fallback).toBeDefined();
    expect(fallback).not.toBeUndefined();
  });

  it('builds the full quotation description', () => {
    expect(buildQuotationDescription('QT-000001', 'Singapore Package', 'Alma Desouza')).toBe(
      'QT-1 - Singapore Package for Alma Desouza',
    );
  });

  it('does not repeat a lead name that the title already contains', () => {
    expect(buildQuotationDescription('QT-000034', 'Singapore Package for Vikas Singh', 'Vikas Singh')).toBe(
      'QT-34 - Singapore Package for Vikas Singh',
    );
  });

  it('avoids the duplicate even when the title capitalisation differs', () => {
    expect(
      buildQuotationDescription('QT-000034', 'Singapore Package for VIKAS SINGH', 'Vikas Singh'),
    ).toBe('QT-34 - Singapore Package for VIKAS SINGH');
  });

  it('avoids the duplicate with extra surrounding and internal whitespace', () => {
    expect(
      buildQuotationDescription('QT-000034', 'Singapore Package for Vikas  Singh', '  Vikas Singh '),
    ).toBe('QT-34 - Singapore Package for Vikas  Singh');
  });

  it('appends the lead name when the title does not contain it', () => {
    expect(buildQuotationDescription('QT-000034', 'Singapore Holiday', 'Vikas Singh')).toBe(
      'QT-34 - Singapore Holiday for Vikas Singh',
    );
  });

  it('drops a missing lead name cleanly', () => {
    expect(buildQuotationDescription('QT-000001', 'Singapore Package', null)).toBe(
      'QT-1 - Singapore Package',
    );
  });

  it('drops a missing title cleanly', () => {
    expect(buildQuotationDescription('QT-000001', null, 'Alma Desouza')).toBe(
      'QT-1 for Alma Desouza',
    );
  });

  it('falls back to the quotation id only', () => {
    expect(buildQuotationDescription('QT-000001', null, null)).toBe('QT-1');
  });

  it('never emits undefined, null, dangling hyphens or dangling "for"', () => {
    expect(buildQuotationDescription('QT-000001', '  ', '')).toBe('QT-1');
    expect(buildQuotationDescription('  ', 'Kerala Package', 'Mira Shah')).toBe(
      'Kerala Package for Mira Shah',
    );
    expect(buildQuotationDescription(null, null, 'Mira Shah')).toBe('Mira Shah');
    expect(buildQuotationDescription(undefined, undefined, undefined)).toBe('');
  });

  it('normalizes the WhatsApp phone while preserving the country code', () => {
    expect(normalizeWhatsAppPhone('+91 (98765) 432-10')).toBe('919876543210');
    expect(normalizeWhatsAppPhone('90000 00000')).toBe('9000000000');
    expect(normalizeWhatsAppPhone(null)).toBe('');
    expect(normalizeWhatsAppPhone('')).toBe('');
  });
});

// The reference "Summary & Pricing" case used throughout: 2 Adults, 1 CWB,
// 1 CWOB, 1 Infant at 10,000 / 2,000 / 1,000 / 7,000 → 30,000 total.
const TAX_NOTE_OPTIONS = [
  '-- No change (keep existing) --',
  'Do not show',
  'Inclusive of all taxes',
  'Inclusive of all taxes, excluding TCS',
  'Inclusive of GST and TCS',
  'Excluding all taxes',
  'Excluding GST and TCS',
];

describe('Summary & Pricing — package pricing, tax note and secure booking', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('scrollTo', vi.fn());
    auth.permissions = new Set(['quotations.view', 'quotations.update', 'quotations.view_costing']);
  });

  const pricingBase = (versionOverrides: Record<string, unknown> = {}) => ({
    ...builderQuotation(versionOverrides),
    adults: 2,
    childrenWithBed: 1,
    childrenWithoutBed: 1,
    infants: 1,
  });

  const fillReferencePrices = async () => {
    await userEvent.type(screen.getByLabelText('Per Adult Price'), '10000');
    await userEvent.type(screen.getByLabelText('Per CWB Price'), '2000');
    await userEvent.type(screen.getByLabelText('Per CWOB Price'), '1000');
    await userEvent.type(screen.getByLabelText('Per Infant Price'), '7000');
  };

  it('computes the total, margin and breakdown live with no NaN', async () => {
    vi.stubGlobal('fetch', masterFetch(pricingBase()));
    renderBuilderPage();
    await openTab('Summary & Pricing');
    // Empty state first.
    expect(screen.getByText('Enter prices to see the breakdown.')).toBeInTheDocument();
    await fillReferencePrices();
    const total = screen.getByLabelText('Total Package Price') as HTMLInputElement;
    await waitFor(() => expect(total.value).toContain('30,000'));
    expect(total.value).not.toMatch(/NaN/);
    // Margin = Total − Net.
    await userEvent.type(screen.getByLabelText('Net Amount'), '10000');
    const margin = screen.getByLabelText('Margin') as HTMLInputElement;
    await waitFor(() => expect(margin.value).toContain('20,000'));
    // Breakdown lines, in order, plus a bold total line.
    expect(screen.getByText(/Adults: 2 ×/)).toBeInTheDocument();
    expect(screen.getByText(/CWB: 1 ×/)).toBeInTheDocument();
    expect(screen.getByText(/CWOB: 1 ×/)).toBeInTheDocument();
    expect(screen.getByText(/Infants: 1 ×/)).toBeInTheDocument();
    expect(screen.getByText(/Total Package Price:/)).toBeInTheDocument();
    // Traveller counts are read-only and driven by the quotation snapshot.
    expect(screen.getByLabelText('Adults')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Adults')).toHaveValue('2');
    expect(screen.getByLabelText('Total Package Price')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Margin')).toHaveAttribute('readonly');
  });

  it('hides breakdown categories whose traveller count is zero', async () => {
    vi.stubGlobal(
      'fetch',
      masterFetch({
        ...builderQuotation(),
        adults: 2,
        childrenWithBed: 0,
        childrenWithoutBed: 0,
        infants: 0,
      }),
    );
    renderBuilderPage();
    await openTab('Summary & Pricing');
    await userEvent.type(screen.getByLabelText('Per Adult Price'), '10000');
    expect(await screen.findByText(/Adults: 2 ×/)).toBeInTheDocument();
    expect(screen.queryByText(/CWB: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/CWOB: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Infants: /)).not.toBeInTheDocument();
  });

  it('renders the exact tax-note options and omits the removed pricing controls', async () => {
    vi.stubGlobal('fetch', masterFetch(pricingBase()));
    renderBuilderPage();
    await openTab('Summary & Pricing');
    const taxSelect = screen.getByLabelText('Tax note');
    expect(
      within(taxSelect)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(TAX_NOTE_OPTIONS);
    expect(screen.queryByText(/Show Service Charges Separately/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mark Service Charges as Outside/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hide Pricing in Weblink/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Show Individual Pricing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Service Sections Pricing/)).not.toBeInTheDocument();
  });

  it('keeps the saved tax note on "no change" and saves the initial amount and link', async () => {
    const fetchMock = masterFetch(
      pricingBase({ taxNote: 'Inclusive of GST and TCS', initialPaymentAmount: '0', paymentLink: null }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Summary & Pricing');
    await userEvent.type(screen.getByLabelText('Initial amount for booking'), '2000');
    await userEvent.type(screen.getByLabelText('Payment link'), 'https://pay.example.com/abc');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.taxNote).toBe('Inclusive of GST and TCS');
      expect(body.initialPaymentAmount).toBe(2000);
      expect(body.paymentLink).toBe('https://pay.example.com/abc');
    });
  });

  it('persists a null tax note when "Do not show" is chosen', async () => {
    const fetchMock = masterFetch(pricingBase({ taxNote: 'Inclusive of all taxes' }));
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Summary & Pricing');
    await userEvent.selectOptions(screen.getByLabelText('Tax note'), 'Do not show');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch![1]!.body)).taxNote).toBeNull();
    });
  });

  it('rejects an invalid payment link and blocks the save', async () => {
    const fetchMock = masterFetch(pricingBase());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Summary & Pricing');
    await userEvent.type(screen.getByLabelText('Payment link'), 'not-a-url');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    expect((await screen.findAllByText(/valid URL starting with/i)).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  const publicPayload = (
    versionOverrides: Record<string, unknown> = {},
    quotationOverrides: Record<string, unknown> = {},
  ) => ({
    company: {
      name: 'Alpha Travel',
      email: 'a@b.test',
      phone: null,
      website: null,
      address: null,
      primaryColor: '#2563eb',
    },
    quotation: {
      quotationNumber: 'QT-2026-000009',
      customerName: 'Vikas Singh',
      destinationSummary: 'Singapore',
      travelStartDate: null,
      travelEndDate: null,
      adults: 2,
      childrenWithBed: 1,
      childrenWithoutBed: 1,
      infants: 1,
      rooms: 1,
      validUntil: null,
      status: 'VIEWED',
      ...quotationOverrides,
    },
    version: {
      title: 'Singapore Package',
      versionNumber: 1,
      currency: 'INR',
      finalAmount: '30000',
      perAdultPrice: '10000',
      perChildWithBedPrice: '2000',
      perChildWithoutBedPrice: '1000',
      perInfantPrice: '7000',
      taxNote: 'Inclusive of all taxes, excluding TCS',
      initialPaymentAmount: '2000',
      paymentLink: 'https://pay.example.com/abc',
      hotels: [],
      services: [],
      itinerary: [],
      inclusions: [],
      exclusions: [],
      terms: [],
      ...versionOverrides,
    },
    downloadUrl: null,
  });

  const renderPublic = (payload: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(payload)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
  };

  it('renders the total, exact tax note and plural traveller breakdown', async () => {
    renderPublic(publicPayload());
    await screen.findByText('Singapore Package');
    expect(screen.getByText('Total Package Price')).toBeInTheDocument();
    expect(screen.getAllByText(/30,000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Inclusive of all taxes, excluding TCS')).toBeInTheDocument();
    expect(screen.getByText(/2 Adults ×/)).toBeInTheDocument();
    expect(screen.getByText(/1 CWB ×/)).toBeInTheDocument();
    expect(screen.getByText(/1 CWOB ×/)).toBeInTheDocument();
    expect(screen.getByText(/1 Infant ×/)).toBeInTheDocument();
    // Internal profitability is never exposed publicly.
    expect(screen.queryByText(/Margin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Net Amount/)).not.toBeInTheDocument();
  });

  it('uses singular labels and hides zero-count categories publicly', async () => {
    renderPublic(
      publicPayload(
        { perChildWithBedPrice: '0', perChildWithoutBedPrice: '0' },
        { adults: 1, childrenWithBed: 0, childrenWithoutBed: 0, infants: 1 },
      ),
    );
    await screen.findByText('Singapore Package');
    expect(screen.getByText(/1 Adult ×/)).toBeInTheDocument();
    expect(screen.getByText(/1 Infant ×/)).toBeInTheDocument();
    expect(screen.queryByText(/CWB ×/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CWOB ×/)).not.toBeInTheDocument();
  });

  it('hides the tax note and never shows the control values publicly', async () => {
    renderPublic(publicPayload({ taxNote: null }));
    await screen.findByText('Singapore Package');
    expect(screen.queryByText(/Inclusive of/)).not.toBeInTheDocument();
    cleanup();
    renderPublic(publicPayload({ taxNote: '-- No change (keep existing) --' }));
    await screen.findByText('Singapore Package');
    expect(screen.queryByText('-- No change (keep existing) --')).not.toBeInTheDocument();
    cleanup();
    renderPublic(publicPayload({ taxNote: 'Do not show' }));
    await screen.findByText('Singapore Package');
    expect(screen.queryByText('Do not show')).not.toBeInTheDocument();
  });

  it('shows the Secure Your Booking card only with a valid amount and link', async () => {
    renderPublic(publicPayload());
    await screen.findByText('Singapore Package');
    const heading = screen.getByRole('heading', { name: 'Secure Your Booking Now' });
    const card = heading.closest('section') as HTMLElement;
    expect(card).toHaveTextContent('Make an initial payment of');
    expect(card).toHaveTextContent(/2,000\.00/);
    expect(card).toHaveTextContent('to confirm your booking.');
    expect(card).toHaveTextContent('The remaining balance can be paid as per the payment policy.');
    const pay = screen.getByRole('link', { name: /Pay Now/ });
    expect(pay).toHaveAttribute('href', 'https://pay.example.com/abc');
    expect(pay).toHaveAttribute('target', '_blank');
    expect(pay).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides the Secure Your Booking card for every invalid combination', async () => {
    const secure = () => screen.queryByRole('heading', { name: 'Secure Your Booking Now' });
    for (const override of [
      { initialPaymentAmount: '0' }, // zero amount + valid link
      { paymentLink: null }, // amount + empty link
      { paymentLink: 'not-a-url' }, // amount + invalid link
      { initialPaymentAmount: '0', paymentLink: null }, // both empty
    ]) {
      renderPublic(publicPayload(override));
      await screen.findByText('Singapore Package');
      expect(secure()).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('renders the Secure Your Booking card as a white card with Pay Now button on the right', async () => {
    renderPublic(publicPayload());
    await screen.findByText('Singapore Package');
    const heading = screen.getByRole('heading', { name: 'Secure Your Booking Now' });
    const card = heading.closest('section') as HTMLElement;
    // White background, no green card background
    expect(card.className).toContain('bg-white');
    expect(card.querySelector('.bg-emerald-50')).toBeNull();
    expect(card.querySelector('.border-emerald-200')).toBeNull();
    // Gray border, subtle shadow, rounded
    expect(card.className).toContain('border-slate-200');
    expect(card.className).toContain('rounded-md');
    expect(card.className).toContain('shadow-sm');
    // No old large circular lock icon
    expect(card.querySelector('.rounded-full.bg-emerald-600')).toBeNull();
    // Pay Now button has Lock icon inside it
    const pay = screen.getByRole('link', { name: /Pay Now/ });
    const lockSvg = pay.querySelector('svg');
    expect(lockSvg).not.toBeNull();
    // Lock icon's parent is the link itself
    expect(lockSvg!.closest('a')).toBe(pay);
  });

  it('Secure Your Booking card hides when amount is zero', async () => {
    renderPublic(publicPayload({ initialPaymentAmount: '0' }));
    await screen.findByText('Singapore Package');
    expect(screen.queryByRole('heading', { name: 'Secure Your Booking Now' })).not.toBeInTheDocument();
  });

  it('Secure Your Booking card hides when payment link is invalid', async () => {
    renderPublic(publicPayload({ paymentLink: 'not-a-url' }));
    await screen.findByText('Singapore Package');
    expect(screen.queryByRole('heading', { name: 'Secure Your Booking Now' })).not.toBeInTheDocument();
  });

  it('raw payment URL is not visible', async () => {
    renderPublic(publicPayload());
    await screen.findByText('Singapore Package');
    const card = screen.getByRole('heading', { name: 'Secure Your Booking Now' }).closest('section') as HTMLElement;
    expect(card.textContent).not.toContain('https://');
  });
});

describe('Generate PDF button — real request, open, loading and error states', () => {
  const finalizedVersion = {
    id: 'version-1',
    versionNumber: 1,
    title: 'Goa proposal',
    introduction: null,
    destinationSummary: 'Goa',
    travelStartDate: null,
    travelEndDate: null,
    currency: 'INR',
    subtotalSellingPrice: '25000',
    markupMode: 'NONE',
    markupValue: '0',
    totalMarkup: '0',
    taxRate: '0',
    taxAmount: '0',
    discountAmount: '0',
    finalAmount: '25000',
    pricingMode: 'ITEMIZED',
    notes: null,
    status: 'FINALIZED',
    finalizedAt: '2026-07-21T00:00:00.000Z',
    createdAt: '2026-07-21T00:00:00.000Z',
    createdBy: person,
    itinerary: [],
    hotels: [],
    services: [],
    inclusions: [],
    exclusions: [],
    terms: [],
  };
  const detail = {
    id: 'quotation-1',
    quotationNumber: 'QT-2026-000001',
    queryId: 'lead-1',
    currentVersionId: 'version-1',
    status: 'SENT',
    customerName: 'Aarav Mehta',
    customerEmail: 'aarav@example.test',
    customerPhone: '+91 90000 00000',
    destinationSummary: 'Goa',
    travelStartDate: null,
    travelEndDate: null,
    adults: 2,
    childrenWithBed: 0,
    childrenWithoutBed: 0,
    infants: 0,
    rooms: 1,
    validUntil: null,
    lastSentAt: '2026-07-21T00:00:00.000Z',
    lastViewedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    createdBy: person,
    query: {
      id: 'lead-1',
      queryNumber: 'QRY-1',
      leadStage: 'QUOTATION_SENT',
      assignedToId: 'user-1',
      createdById: 'user-1',
    },
    versions: [finalizedVersion],
    documents: [],
    emailLogs: [],
    activityTimeline: [],
  };
  const errorResponse = () =>
    ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    }) as Response;

  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(['quotations.view', 'quotations.generate_pdf']);
  });

  const renderDetails = () =>
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );

  it('generates the PDF, fetches the download URL, and triggers a download (no window.open)', async () => {
    const openSpy = vi.fn(() => ({} as Window));
    vi.stubGlobal('open', openSpy);
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/generate-pdf'))
        return response({ id: 'doc-new', fileName: 'qt-2026-000001-aarav-mehta-v1-quotation.pdf' });
      if (url.endsWith('/download-url'))
        return response({ url: 'https://files.example.test/quotation.pdf' });
      return response(detail);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    await screen.findByText('Version 1');
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(anchorClickSpy).toHaveBeenCalled());
    const genCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/generate-pdf'));
    expect(String(genCall![0])).toContain('/versions/version-1/generate-pdf');
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/download-url'))).toBe(true);
    // The download anchor points at the PDF URL with the generated filename.
    const clickedAnchor = anchorClickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(clickedAnchor.href).toBe('https://files.example.test/quotation.pdf');
    expect(clickedAnchor.download).toBe('qt-2026-000001-aarav-mehta-v1-quotation.pdf');
    // window.open is NEVER used for the Generate PDF flow.
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('does not trigger a download and shows an error when generation fails', async () => {
    const openSpy = vi.fn(() => ({} as Window));
    vi.stubGlobal('open', openSpy);
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/generate-pdf')) return errorResponse();
      return response(detail);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    await screen.findByText('Version 1');
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF generation failed. Please try again.',
    );
    expect(anchorClickSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });

  it('starts no new tab or popup for the Generate PDF download', async () => {
    const openSpy = vi.fn(() => ({} as Window));
    vi.stubGlobal('open', openSpy);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/generate-pdf'))
        return response({ id: 'doc-new', fileName: 'qt-2026-000001-aarav-mehta-v1-quotation.pdf' });
      if (url.endsWith('/download-url'))
        return response({ url: 'https://files.example.test/quotation.pdf' });
      return response(detail);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    await screen.findByText('Version 1');
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/download-url'))).toBe(true),
    );
    // Generate PDF triggers a download — no window.open, no new tab/popup.
    expect(openSpy).not.toHaveBeenCalled();
    // The Generate PDF control itself is a plain button, not a link.
    const genButton = screen.getByRole('button', { name: 'Download PDF' });
    expect(genButton.tagName).toBe('BUTTON');
  });

  it('shows a loading label and disables the button while generating', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/generate-pdf')) return new Promise<Response>(() => {});
      if (url.endsWith('/download-url')) return response({ url: 'https://files.example.test/q.pdf' });
      return response(detail);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    await screen.findByText('Version 1');
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    const busy = await screen.findByRole('button', { name: /Generating PDF/ });
    expect(busy).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/generate-pdf')).length).toBe(1);
  });
});

/**
 * Per-activity informational pricing on the customer-facing weblink.
 *
 * An activity with no usable prices must look exactly as it did before this
 * feature existed — no heading, no placeholder, no ₹0 row.
 */
describe('Public weblink — activity pricing', () => {
  const pricingBaseVersion = {
    title: 'Singapore Escape',
    versionNumber: 1,
    currency: 'INR',
    finalAmount: '100',
    hotelDetails: { sectionTitle: 'Accommodation Details', amount: 0, description: null },
    hotels: [],
    services: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    terms: [],
  };

  const renderWithActivities = async (activities: unknown[]) => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async () =>
        response({
          company: {
            name: 'Alpha Travel',
            email: 'a@b.test',
            phone: null,
            website: null,
            address: null,
            primaryColor: '#2563eb',
          },
          quotation: {
            quotationNumber: 'QT-2026-000003',
            customerName: 'Mira Shah',
            destinationSummary: 'Singapore',
            travelStartDate: null,
            travelEndDate: null,
            adults: 3,
            childrenWithBed: 0,
            childrenWithoutBed: 0,
            infants: 0,
            rooms: 1,
            validUntil: null,
            status: 'VIEWED',
          },
          version: {
            ...pricingBaseVersion,
            sightseeingDetails: {
              include: true,
              sectionTitle: 'Sightseeing & Experiences',
              amount: 0,
              description: null,
              days: [
                {
                  dayNumber: 1,
                  title: 'Day 1: Singapore highlights',
                  city: 'Singapore',
                  meals: { breakfast: false, lunch: false, dinner: false },
                  mealMode: 'INCLUDE_AT_HOTEL',
                  dailyTransfer: 'SHARED',
                  activities,
                },
              ],
            },
          },
          downloadUrl: null,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>,
      { route: '/q/public-token-value-with-at-least-32-characters' },
    );
    await screen.findByText('Singapore Zoo');
  };

  it('renders populated prices with the quotation currency', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        startTime: '09:00',
        dailyTransfer: 'SHARED',
        pricingOptions: [
          { label: 'Adult', price: 3500 },
          { label: 'Child', price: 2500 },
          { label: 'Infant', price: 500 },
        ],
      },
    ]);
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    for (const [label, amount] of [
      ['Adult', '₹3,500'],
      ['Child', '₹2,500'],
      ['Infant', '₹500'],
    ]) {
      const term = screen.getByText(label as string);
      expect(term.nextElementSibling).toHaveTextContent(amount as string);
    }
  });

  it('renders custom labels exactly as entered', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [
          { label: 'Foreign National', price: 4500 },
          { label: 'Child 5–12 Years', price: 1500 },
        ],
      },
    ]);
    expect(screen.getByText('Foreign National')).toBeInTheDocument();
    expect(screen.getByText('Child 5–12 Years')).toBeInTheDocument();
  });

  it('shows only the populated row when pricing is partial', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [{ label: 'Adult', price: 3500 }],
      },
    ]);
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Adult')).toBeInTheDocument();
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    expect(screen.queryByText('Senior')).not.toBeInTheDocument();
  });

  it('renders nothing at all when the activity has no pricing', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        dailyTransfer: 'SHARED',
        pricingOptions: [],
      },
    ]);
    expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
    expect(screen.queryByText('₹—')).not.toBeInTheDocument();
    // The rest of the activity is untouched.
    expect(screen.getByText('Shared Transfer')).toBeInTheDocument();
  });

  it('renders nothing for a pre-feature activity with no pricingOptions key', async () => {
    await renderWithActivities([
      { name: 'Singapore Zoo', description: '<p>Meet the animals.</p>', dailyTransfer: 'SHARED' },
    ]);
    expect(screen.getByText('Singapore Zoo')).toBeInTheDocument();
    expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
  });

  it('drops half-filled and invalid rows instead of showing blanks or ₹0', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [
          { label: 'Adult', price: 3500 },
          { label: 'Child', price: null },
          { label: '  ', price: 900 },
          { label: 'Bad', price: -10 },
        ],
      },
    ]);
    expect(screen.getByText('Adult')).toBeInTheDocument();
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    expect(screen.queryByText('Bad')).not.toBeInTheDocument();
  });

  it('keeps pricing per activity when a day has several', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [{ label: 'Adult', price: 3500 }],
      },
      {
        name: 'Gardens by the Bay',
        description: '<p>Evening show.</p>',
        pricingOptions: [{ label: 'Adult', price: 1200 }],
      },
    ]);
    const prices = screen.getAllByText('Adult').map((el) => el.nextElementSibling?.textContent);
    expect(prices).toEqual(['₹3,500', '₹1,200']);
  });

  it('does not add activity pricing to the quotation total', async () => {
    await renderWithActivities([
      {
        name: 'Singapore Zoo',
        description: '<p>Meet the animals.</p>',
        pricingOptions: [
          { label: 'Adult', price: 3500 },
          { label: 'Child', price: 2500 },
        ],
      },
    ]);
    // 3 adults × ₹3,500 must not appear anywhere; the total stays ₹100.
    expect(screen.queryByText('₹10,500')).not.toBeInTheDocument();
    expect(screen.queryByText('₹16,000')).not.toBeInTheDocument();
    expect(screen.getAllByText('₹100').length).toBeGreaterThan(0);
  });
});
