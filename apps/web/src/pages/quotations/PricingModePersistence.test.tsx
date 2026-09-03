import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { QuotationBuilderPage } from './QuotationBuilderPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const person = { id: 'user-1', fullName: 'Aditi Rao', username: 'owner' };

const quotationDetail = (pricingMode: string) => ({
  id: 'quotation-1',
  quotationNumber: 'QT-2026-000001',
  queryId: 'lead-1',
  currentVersionId: 'version-1',
  status: 'DRAFT',
  customerName: 'Aarav Mehta',
  customerEmail: 'aarav@example.test',
  customerPhone: '+91 90000 00000',
  destinationSummary: 'Singapore',
  travelStartDate: null,
  travelEndDate: null,
  adults: 2,
  childrenWithBed: 0,
  childrenWithoutBed: 0,
  infants: 0,
  rooms: 1,
  validUntil: null,
  createdBy: person,
  query: {
    id: 'lead-1',
    queryNumber: 'QRY-1',
    leadStage: 'QUOTATION_SENT',
    assignedToId: 'user-1',
    createdById: 'user-1',
  },
  versions: [
    {
      id: 'version-1',
      versionNumber: 1,
      title: 'Singapore Package',
      introduction: null,
      destinationSummary: 'Singapore',
      travelStartDate: null,
      travelEndDate: null,
      currency: 'INR',
      subtotalSellingPrice: '202440',
      markupMode: 'NONE',
      markupValue: '0',
      totalMarkup: '0',
      taxRate: '0',
      taxAmount: '0',
      discountAmount: '0',
      finalAmount: '202440',
      pricingMode,
      perAdultPrice: '101220',
      perChildWithBedPrice: '0',
      perChildWithoutBedPrice: '0',
      perInfantPrice: '0',
      taxNote: null,
      netAmount: '0',
      initialPaymentAmount: '0',
      paymentLink: null,
      status: 'DRAFT',
      finalizedAt: null,
      createdAt: '2026-08-24T00:00:00.000Z',
      createdBy: person,
      itinerary: [],
      hotels: [],
      services: [],
      inclusions: [],
      exclusions: [],
      terms: [],
      addOnDetails: { include: true },
    },
  ],
  documents: [],
  emailLogs: [],
  activityTimeline: [],
});

function masterFetch(base: unknown) {
  const routes: Record<string, unknown> = {
    '/masters/hotels': { success: true, data: [], pagination: { total: 0 } },
    '/masters/airlines': { success: true, data: [], pagination: { total: 0 } },
    '/masters/cruises': { success: true, data: [], pagination: { total: 0 } },
    '/masters/vehicles': { success: true, data: [], pagination: { total: 0 } },
    '/masters/sightseeing': { success: true, data: [], pagination: { total: 0 } },
    '/masters/sightseeing/activities': { success: true, data: [], pagination: { total: 0 } },
    '/masters/add-on-services': { success: true, data: [], pagination: { total: 0 } },
    '/masters/faqs': { success: true, data: [], pagination: { total: 0 } },
    '/users': { success: true, data: [], pagination: { total: 0 } },
    '/settings': {
      success: true,
      data: { profile: { phone: null, email: 'a@b.test' }, quotationDefaults: {} },
    },
    '/destination-expert/presets': { success: true, data: [] },
  };
  return vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    void options;
    const url = String(input);
    for (const [prefix, body] of Object.entries(routes).sort(([a], [b]) => b.length - a.length))
      if (url.includes(prefix)) return response(body);
    return response(base);
  });
}

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

describe('Pricing mode persistence — builder save must keep the selected mode', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('scrollTo', vi.fn());
    auth.permissions = new Set(['quotations.view', 'quotations.update', 'quotations.view_costing']);
  });

  it('persists SECTION_WISE when selected (By Section)', async () => {
    const fetchMock = masterFetch(quotationDetail('PER_PERSON'));
    vi.stubGlobal('fetch', fetchMock);
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });

    await userEvent.click(screen.getByLabelText('By Section'));

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true),
    );
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    const body = JSON.parse(String(patch![1]!.body));
    expect(body.pricingMode).toBe('SECTION_WISE');
  });

  it('persists PER_PERSON when selected (By Traveler)', async () => {
    const fetchMock = masterFetch(quotationDetail('SECTION_WISE'));
    vi.stubGlobal('fetch', fetchMock);
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });

    await userEvent.click(screen.getByLabelText('By Traveler'));

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true),
    );
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    const body = JSON.parse(String(patch![1]!.body));
    expect(body.pricingMode).toBe('PER_PERSON');
  });

  it('does not let a background data refresh revert a just-selected SECTION_WISE mode', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const base = quotationDetail('TOTAL');
    const routes: Record<string, unknown> = {
      '/masters/hotels': { success: true, data: [], pagination: { total: 0 } },
      '/masters/airlines': { success: true, data: [], pagination: { total: 0 } },
      '/masters/cruises': { success: true, data: [], pagination: { total: 0 } },
      '/masters/vehicles': { success: true, data: [], pagination: { total: 0 } },
      '/masters/sightseeing': { success: true, data: [], pagination: { total: 0 } },
      '/masters/sightseeing/activities': { success: true, data: [], pagination: { total: 0 } },
      '/masters/add-on-services': { success: true, data: [], pagination: { total: 0 } },
      '/masters/faqs': { success: true, data: [], pagination: { total: 0 } },
      '/users': { success: true, data: [], pagination: { total: 0 } },
      '/settings': {
        success: true,
        data: { profile: { phone: null, email: 'a@b.test' }, quotationDefaults: {} },
      },
      '/destination-expert/presets': { success: true, data: [] },
    };
    let mastersCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      void options;
      const url = String(input);
      if (url.includes('/quotations/')) return response(base);
      if (url.includes('/masters/')) {
        mastersCalls += 1;
        if (mastersCalls <= 1) return response(routes['/masters/hotels']);
        await gate;
        return response({ success: true, data: [], pagination: { total: 0 } });
      }
      return response({ success: true, data: [], pagination: { total: 0 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });

    await userEvent.click(screen.getByLabelText('By Section'));

    release();
    await waitFor(() => expect(mastersCalls).toBeGreaterThan(1));
    await new Promise((resolve) => setTimeout(resolve, 300));

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true),
    );
    const patches = fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH');
    const lastBody = JSON.parse(String(patches[patches.length - 1]![1]!.body));
    // If the reset effect clobbered the selection, this is 'PER_PERSON' — the bug.
    expect(lastBody.pricingMode).toBe('SECTION_WISE');
  });

  it('shows both pricing-method labels, the default heading, and a per-person breakdown', async () => {
    const fetchMock = masterFetch(quotationDetail('TOTAL'));
    vi.stubGlobal('fetch', fetchMock);
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });

    // Step 0 pricing cards are visible at the top of the builder
    expect(screen.getByLabelText('By Section')).toBeInTheDocument();
    expect(screen.getByLabelText('By Traveler')).toBeInTheDocument();
    // A legacy TOTAL quotation loads as By Traveler (backward compatible).
    expect(screen.getByLabelText('By Traveler')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(await screen.findByRole('button', { name: 'Summary & Pricing' }));
    // Custom heading field with the default value.
    expect(screen.getByLabelText('Pricing heading')).toHaveValue('Price Breakdown');
    expect(screen.getByLabelText('Pricing subheading')).toBeInTheDocument();
    expect(
      screen.getByText('The heading and pricing method will be used on the customer Weblink and PDF.'),
    ).toBeInTheDocument();

    // The per-person breakdown shows travelers and the package total.
    await userEvent.click(await screen.findByRole('button', { name: 'Pricing Breakdown' }));
    expect(await screen.findByText('Number of Travelers')).toBeInTheDocument();
    expect(screen.getAllByText('Package Subtotal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grand Total').length).toBeGreaterThan(0);
  });

  it('persists the custom heading, subheading and display order', async () => {
    const fetchMock = masterFetch(quotationDetail('PER_PERSON'));
    vi.stubGlobal('fetch', fetchMock);
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });

    await userEvent.click(await screen.findByRole('button', { name: 'Summary & Pricing' }));
    await userEvent.clear(screen.getByLabelText('Pricing heading'));
    await userEvent.type(screen.getByLabelText('Pricing heading'), 'Your Trip Cost');
    await userEvent.type(screen.getByLabelText('Pricing subheading'), 'Complete package cost');
    // Move the first category down so the order is non-default.
    await userEvent.click(screen.getByRole('button', { name: 'Move Flights down' }));

    await userEvent.click(screen.getAllByRole('button', { name: 'Save quotation' })[1]!);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true),
    );
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    const body = JSON.parse(String(patch![1]!.body));
    expect(body.pricingHeading).toBe('Your Trip Cost');
    expect(body.pricingSubheading).toBe('Complete package cost');
    expect(body.pricingDisplayOrder).toEqual([
      'hotel', 'flight', 'cruise', 'vehicle', 'sightseeing', 'addon', 'visa',
    ]);
  });
});