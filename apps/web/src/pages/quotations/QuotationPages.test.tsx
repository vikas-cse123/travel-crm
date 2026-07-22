import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { QuotationTemplatesPage } from './QuotationTemplatesPage';
import { QuotationTemplateDetailsPage } from './QuotationTemplateDetailsPage';
import { QuotationTemplateFormPage } from './QuotationTemplateFormPage';
import { QuotationsPage } from './QuotationsPage';
import { NewQuotationPage } from './NewQuotationPage';
import { PublicQuotationPage } from './PublicQuotationPage';
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
    expect(await screen.findByText('QT-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search quotations'), 'Aarav');
    await userEvent.selectOptions(screen.getByLabelText('Quotation status'), 'SENT');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('search=Aarav&status=SENT')),
      ).toBe(true),
    );
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
      vi.fn(async () => response({ quotationNumber: 'QT-2026-000001', versions: [draftVersion] })),
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
    expect(await screen.findByLabelText('Hotel internal cost')).toHaveValue(50);
    await userEvent.selectOptions(screen.getByLabelText('Markup mode'), 'PERCENTAGE');
    await userEvent.clear(screen.getByLabelText('Markup value'));
    await userEvent.type(screen.getByLabelText('Markup value'), '10');
    expect(await screen.findByText('INR 110.00')).toBeInTheDocument();
    expect(screen.getByText('Internal cost')).toBeInTheDocument();
    costView.unmount();
    auth.permissions.delete('quotations.view_costing');
    renderBuilder();
    await screen.findByRole('heading', { name: 'Quotation builder' });
    expect(screen.queryByLabelText('Hotel internal cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal cost')).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
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

  it('creates from a visible lead and saved template', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, options?: RequestInit) => Promise<Response>>(
      async (input, options) => {
        const url = String(input);
        if (options?.method === 'POST') return response({ id: 'quotation-new' });
        if (url.includes('/queries'))
          return response(
            page([
              {
                id: 'lead-1',
                queryNumber: 'QRY-1',
                customerName: 'Aarav',
                phone: '+91 90000 00000',
              },
            ]),
          );
        return response(page([template]));
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewQuotationPage />, {
      route: '/quotations/new?templateId=11111111-1111-4111-8111-111111111111',
    });
    await screen.findByRole('option', { name: /QRY-1/ });
    await userEvent.selectOptions(await screen.findByLabelText('Lead'), 'lead-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft quotation' }));
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

  it('renders the customer-safe public page and submits acceptance', async () => {
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
        introduction: 'A coastal holiday.',
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
    expect(await screen.findByText('Goa proposal')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm accept' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) => String(url).endsWith('/accept') && options?.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('submits a reason through the public rejection workflow', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.type(screen.getByLabelText('Reason'), 'Dates no longer work');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) => String(url).endsWith('/reject') && options?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/Your response has been recorded/)).toBeInTheDocument();
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
  price: 3800,
  currency: 'INR',
  status: 'ACTIVE',
};

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
    '/masters/add-on-services': page([addOn]),
    ...extra,
  };
  return vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
    void _options;
    const url = String(input);
    // Detail routes carry an id segment, so they are matched before the list.
    for (const [prefix, body] of Object.entries(routes))
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
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel option' }));
    expect(screen.getByLabelText('Hotel master')).toBeEnabled();
    expect(screen.getByLabelText('Room type master')).toBeDisabled();
    expect(screen.getByLabelText('Meal plan master')).toBeDisabled();
  });

  it('prefills the hotel snapshot and adds room type and meal plan pricing', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel option' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');

    // The snapshot fields are filled but stay editable free text.
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel name')).toHaveValue('Shah Palace Hotel'),
    );
    expect(screen.getByLabelText('Hotel city')).toHaveValue('Baku');
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeEnabled());

    await userEvent.type(screen.getByLabelText('Room type master'), 'Deluxe Room');
    await waitFor(() => expect(screen.getByLabelText('Hotel selling price')).toHaveValue(6000));
    expect(screen.getByLabelText('Hotel internal cost')).toHaveValue(4000);
    expect(screen.getByLabelText('Room type')).toHaveValue('Deluxe Room');

    // Meal plan is added to the room type rather than replacing it.
    await userEvent.type(screen.getByLabelText('Meal plan master'), 'Breakfast Only');
    await waitFor(() => expect(screen.getByLabelText('Hotel selling price')).toHaveValue(6800));
    expect(screen.getByLabelText('Hotel internal cost')).toHaveValue(4500);
  });

  it('never prefills internal cost without the costing permission', async () => {
    auth.permissions.delete('quotations.view_costing');
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel option' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Room type master'), 'Deluxe Room');
    await waitFor(() => expect(screen.getByLabelText('Hotel selling price')).toHaveValue(6000));
    expect(screen.queryByLabelText('Hotel internal cost')).not.toBeInTheDocument();
  });

  it('shows only the selector that matches the service type and clears it on switch', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Service' }));

    // Rows default to sightseeing.
    expect(screen.getByLabelText('Sightseeing master')).toBeInTheDocument();
    expect(screen.queryByLabelText('Airline master')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Sightseeing master'), 'Gobustan Tour');
    await waitFor(() => expect(screen.getByLabelText('Service name')).toHaveValue('Gobustan Tour'));

    await userEvent.selectOptions(screen.getByLabelText('Service type'), 'FLIGHT');
    expect(await screen.findByLabelText('Airline master')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sightseeing master')).not.toBeInTheDocument();
    // The previous link is dropped, so nothing incompatible can be submitted.
    expect(screen.getByLabelText('Airline master')).toHaveValue('');
  });

  it('links a cruise before its cabin and prefills the cabin price', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Service' }));
    await userEvent.selectOptions(screen.getByLabelText('Service type'), 'CRUISE');
    expect(await screen.findByLabelText('Cruise room type master')).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Cruise master'), 'Dream Genting');
    await waitFor(() => expect(screen.getByLabelText('Cruise room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Cruise room type master'), 'Interior');
    await waitFor(() => expect(screen.getByLabelText('Service unit selling')).toHaveValue(18000));
  });

  it('prefills an add-on service price and leaves priceless masters alone', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Service' }));

    await userEvent.selectOptions(screen.getByLabelText('Service type'), 'OTHER_ADD_ON');
    await userEvent.type(await screen.findByLabelText('Add-on service master'), 'Visa Assistance');
    await waitFor(() => expect(screen.getByLabelText('Service unit selling')).toHaveValue(3800));

    // A vehicle has no price of its own, so a typed figure must survive.
    await userEvent.selectOptions(screen.getByLabelText('Service type'), 'VEHICLE_TRANSFER');
    await userEvent.type(await screen.findByLabelText('Vehicle master'), 'Innova Crysta');
    await waitFor(() => expect(screen.getByLabelText('Service name')).toHaveValue('Innova Crysta'));
    expect(screen.getByLabelText('Service unit selling')).toHaveValue(3800);
  });

  it('submits the linked master ids alongside the snapshot fields', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel option' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Room type master'), 'Deluxe Room');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

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

  it('keeps a row usable as free text with no master linked', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel option' }));
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Typed by hand');
    await userEvent.type(screen.getByLabelText('Hotel city'), 'Manali');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels[0]).toMatchObject({ hotelName: 'Typed by hand', hotelId: null });
    });
  });

  it('unlinks a master without erasing the snapshot text', async () => {
    vi.stubGlobal('fetch', masterFetch(builderQuotation()));
    renderBuilderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Hotel option' }));
    await userEvent.type(screen.getByLabelText('Hotel master'), 'Shah Palace Hotel');
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel name')).toHaveValue('Shah Palace Hotel'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear Hotel master' }));
    await waitFor(() => expect(screen.getByLabelText('Room type master')).toBeDisabled());
    expect(screen.getByLabelText('Hotel name')).toHaveValue('Shah Palace Hotel');
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
    await waitFor(() =>
      expect(screen.getByLabelText('Hotel master')).toHaveValue('Shah Palace Hotel'),
    );
    expect(screen.getByLabelText('Room type master')).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText('Airline master')).toHaveValue('Air India'));
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
