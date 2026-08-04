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
import { buildQuotationDescription, normalizeWhatsAppPhone } from './quotationContact';
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
    expect((await screen.findAllByText('QT-2026-000001')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aarav Mehta').length).toBeGreaterThan(0);
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
    // Responsive heights: mobile 300, tablet 330, desktop 360.
    expect(hero.className).toContain('min-h-[300px]');
    expect(hero.className).toContain('sm:min-h-[330px]');
    expect(hero.className).toContain('md:min-h-[360px]');
    expect(hero.className).toContain('items-center');
    // Balanced positioning shows more of the image without stretching it.
    expect(hero.style.backgroundPosition).toBe('center 45%');
    expect(hero.style.backgroundImage).toContain('https://storage.example.test/bali-hero.jpg');
    // The dark overlay stays ~40-50%, never the whole-hero opacity.
    expect(hero.style.backgroundImage).toContain('rgba(15,23,42,0.5)');

    // Hero values are preserved.
    expect(screen.getByRole('heading', { name: 'Bali' })).toBeInTheDocument();
    expect(screen.getAllByText('4 Nights / 5 Days').length).toBeGreaterThan(0);
    // Summary and price cards still sit below the hero.
    expect(screen.getByText('Total Package Price')).toBeInTheDocument();
  });

  it('lays the summary and price cards above the hero overlap', async () => {
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

    // The summary cards are siblings of the hero, outside its overflow-hidden box.
    const header = screen.getByRole('banner');
    const summarySection = screen.getByText('Traveler Name').closest('section');
    expect(summarySection).not.toBeNull();
    expect(header.contains(summarySection)).toBe(false);

    // The content wrapper lifts the cards above the hero via relative + z-index.
    const contentWrapper = summarySection?.parentElement;
    expect(contentWrapper?.className).toContain('relative');
    expect(contentWrapper?.className).toContain('z-10');
    // Controlled responsive overlap: smaller on mobile, largest on desktop.
    expect(contentWrapper?.className).toContain('-mt-6');
    expect(contentWrapper?.className).toContain('sm:-mt-10');
    expect(contentWrapper?.className).toContain('lg:-mt-16');

    // Every first-row summary field and the price card stay fully in the document.
    expect(screen.getByText('Traveler Name')).toBeInTheDocument();
    expect(screen.getByText('Travel Date')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Travelers')).toBeInTheDocument();
    expect(screen.getByText('Total Package Price')).toBeInTheDocument();
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
    // Section intro renders sanitized rich text (no raw <p>).
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
    // Array meals normalize to booleans; WITH_TRANSFER adds no (Hotel) suffix.
    expect(screen.getByText('Breakfast, Dinner')).toBeInTheDocument();
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
          { id: 's-addon', serviceType: 'TRAVEL_INSURANCE', name: 'Travel Insurance', description: '<p><strong>Cover</strong> for the trip.</p>', dayNumber: null, city: null, quantity: '1', unitSellingPrice: '1500', totalSellingPrice: '1500', sellingPrice: '1500', taxCategory: null, notes: null, sequence: 1 },
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

    const single = encodeURIComponent('QT-000034 - Singapore Package for Vikas Singh');
    const duplicate = encodeURIComponent('for Vikas Singh for Vikas Singh');

    const whatsappHref = screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href') ?? '';
    expect(whatsappHref).toContain(single);
    expect(whatsappHref).not.toContain(duplicate);

    const emailHref = screen.getByRole('link', { name: /Email/ }).getAttribute('href') ?? '';
    expect(emailHref).toContain(encodeURIComponent('Quotation Inquiry (ID: QT-000034 - Singapore Package for Vikas Singh)'));
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

  it('sets the browser tab title from the quotation title and restores it on leave', async () => {
    document.title = 'Interscale Travel CRM';
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
    expect(document.title).toBe('Interscale Travel CRM');
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

/** Activate a builder tab by its nav-button label (tabs mount only when active). */
const openTab = async (name: string) =>
  userEvent.click(await screen.findByRole('button', { name }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText(/services\.0\.name: String must contain at least 1 character/),
    ).toBeInTheDocument();
    // Unchecking Cruise clears the stale error and saves without cruise rows.
    await userEvent.click(screen.getByLabelText('Include Cruise in Quotation'));
    expect(screen.queryByText(/services\.0\.name/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await waitFor(() => {
      const list = document.querySelector(`datalist[id="${picker.getAttribute('list')}"]`);
      const labels = Array.from(list?.querySelectorAll('option') ?? []).map((option) =>
        option.getAttribute('value'),
      );
      expect(labels).toContain('City Tour');
    });
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

  it('does not require sightseeing fields when the section is disabled', async () => {
    const fetchMock = masterFetch(builderQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Sightseeing');
    await userEvent.click(screen.getByLabelText('Include Sightseeing in Quotation'));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText(/hotels\.0\.hotelName: String must contain at least 1 character/),
    ).toBeInTheDocument();

    // Turning Hotel off clears the stale hotel errors immediately.
    await userEvent.click(screen.getByLabelText('Include Hotel in Quotation'));
    expect(
      screen.queryByText(/hotels\.0\.hotelName: String must contain at least 1 character/),
    ).not.toBeInTheDocument();

    // Saving now succeeds with hotels: [].
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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

  it('does not prefill when the destination has no default hotel or it is inactive', async () => {
    const quotation = stayQuotation([{ destination: 'Singapore', nights: 2 }]);
    // Not marked default.
    let fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([{ ...singaporeDefaultHotel(), isDefaultForCity: false }]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() => expect(screen.getByLabelText('Hotel master')).toHaveValue(''));
    cleanup();

    // Marked default but inactive.
    fetchMock = masterFetch(quotation, {
      '/masters/hotels': page([{ ...singaporeDefaultHotel(), status: 'INACTIVE' }]),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() => expect(screen.getByLabelText('Hotel master')).toHaveValue(''));
  });

  it('adds one default hotel row per destination and skips destinations without a default', async () => {
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

    // Only Singapore has a default → the Dubai row is not created at all.
    cleanup();
    const partialMock = masterFetch(quotation, {
      '/masters/hotels': page([singaporeDefaultHotel()]),
    });
    vi.stubGlobal('fetch', partialMock);
    renderBuilderPage();
    await openTab('Hotel');
    await waitFor(() => expect(screen.getAllByLabelText('Hotel master').length).toBe(1));
    expect(screen.getByLabelText('Hotel master')).toHaveValue(
      'Aloft Singapore Novena by Marriott',
    );
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.hotels[0].hotelId).toBe('aaaaaa44-4444-4444-8444-444444444444');
      expect(body.hotels[0].hotelName).toBe('Alternative Hotel');
    });
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
      'QT-000001 - Singapore Package for Alma Desouza',
    );
  });

  it('does not repeat a lead name that the title already contains', () => {
    expect(buildQuotationDescription('QT-000034', 'Singapore Package for Vikas Singh', 'Vikas Singh')).toBe(
      'QT-000034 - Singapore Package for Vikas Singh',
    );
  });

  it('avoids the duplicate even when the title capitalisation differs', () => {
    expect(
      buildQuotationDescription('QT-000034', 'Singapore Package for VIKAS SINGH', 'Vikas Singh'),
    ).toBe('QT-000034 - Singapore Package for VIKAS SINGH');
  });

  it('avoids the duplicate with extra surrounding and internal whitespace', () => {
    expect(
      buildQuotationDescription('QT-000034', 'Singapore Package for Vikas  Singh', '  Vikas Singh '),
    ).toBe('QT-000034 - Singapore Package for Vikas  Singh');
  });

  it('appends the lead name when the title does not contain it', () => {
    expect(buildQuotationDescription('QT-000034', 'Singapore Holiday', 'Vikas Singh')).toBe(
      'QT-000034 - Singapore Holiday for Vikas Singh',
    );
  });

  it('drops a missing lead name cleanly', () => {
    expect(buildQuotationDescription('QT-000001', 'Singapore Package', null)).toBe(
      'QT-000001 - Singapore Package',
    );
  });

  it('drops a missing title cleanly', () => {
    expect(buildQuotationDescription('QT-000001', null, 'Alma Desouza')).toBe(
      'QT-000001 for Alma Desouza',
    );
  });

  it('falls back to the quotation id only', () => {
    expect(buildQuotationDescription('QT-000001', null, null)).toBe('QT-000001');
  });

  it('never emits undefined, null, dangling hyphens or dangling "for"', () => {
    expect(buildQuotationDescription('QT-000001', '  ', '')).toBe('QT-000001');
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
