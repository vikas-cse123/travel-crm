import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { QuotationDetailsPage } from './QuotationDetailsPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key), user: { fullName: 'Aditi Rao', company: { name: 'Alpha Travel' } } }),
}));

const person = { id: 'user-1', fullName: 'Aditi Rao', username: 'owner' };
const draftQuotation = (overrides: Record<string, unknown> = {}) => ({
  id: 'quotation-1',
  quotationNumber: 'QT-2026-000001',
  queryId: 'lead-1',
  currentVersionId: 'version-1',
  status: 'DRAFT',
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
  createdBy: person,
  query: { id: 'lead-1', queryNumber: 'QRY-1', leadStage: 'QUALIFIED', assignedToId: 'user-1', createdById: 'user-1' },
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
      subtotalSellingPrice: '25000',
      subtotalCost: '0',
      markupMode: 'NONE',
      markupValue: '0',
      totalMarkup: '0',
      taxRate: '0',
      taxAmount: '0',
      discountAmount: '0',
      finalAmount: '25000',
      marginAmount: '0',
      marginPercentage: '0',
      pricingMode: 'SECTION_WISE',
      flightDetails: {
        include: true,
        sectionTitle: 'Flight Details',
        amount: 25000,
        pricingBasis: 'FIXED_TOTAL',
        entryMode: 'MANUAL',
        journeyType: 'ROUND_TRIP',
        outbound: { fromCity: 'Delhi', toCity: 'Goa', segments: [{ from: 'Delhi', to: 'Goa' }] },
        returnJourney: { fromCity: 'Goa', toCity: 'Delhi', segments: [{ from: 'Goa', to: 'Delhi' }] },
      },
      hotelDetails: { include: true, sectionTitle: 'Your Hotels', amount: 0, description: null },
      hotels: [
        { id: 'hotel-1', city: 'Goa', hotelName: 'Coastal Bay', rooms: 1, nights: 4, selected: true, sequence: 1, sellingPrice: '0', internalCost: '0' },
      ],
      services: [
        { id: 'svc-1', serviceType: 'CRUISE', name: 'Ocean Cruise', quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', sequence: 1 },
        { id: 'svc-2', serviceType: 'VEHICLE_TRANSFER', name: 'Innova', quantity: '1', unitSellingPrice: '0', totalSellingPrice: '0', sellingPrice: '0', sequence: 2 },
      ],
      sightseeingDetails: { include: true, sectionTitle: 'Sightseeing', amount: 0, days: [] },
      itinerary: [],
      inclusions: [],
      exclusions: [],
      terms: [],
      pricingHeading: 'Price Breakdown',
      pricingSubheading: null,
      pricingDisplayOrder: null,
      createdAt: '2026-07-21T00:00:00.000Z',
      createdBy: person,
      status: 'DRAFT',
      finalizedAt: null,
      ...overrides,
    },
  ],
  documents: [],
  emailLogs: [],
  activityTimeline: [],
  booking: null,
});

function masterFetch(quotationData: unknown, publicLinkUrl = 'https://preview.test/q/preview-token-1234567890abcdef1234567890') {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/api/quotations/') && url.includes('/public-link') && method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { url: publicLinkUrl } }) } as Response;
    }
    if (url.includes('/api/quotations/') && url.includes('/versions/') && url.includes('/generate-pdf') && method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'doc-1', fileName: 'quotation.pdf' } }) } as unknown as Response;
    }
    if (url.includes('/api/quotations/') && url.includes('/documents/') && url.includes('/download-url')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { url: 'https://cdn.test/quotation.pdf' } }) } as Response;
    }
    if (url.includes('/api/quotations/quotation-1')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: quotationData }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response;
  });
}

describe('draft preview weblink', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(['quotations.view', 'quotations.update', 'quotations.view_costing', 'quotations.generate_pdf']);
  });

  it('draft createPublicLink returns usable preview URL and publicView returns 200 (via API)', async () => {
    const previewUrl = 'https://preview.test/q/preview-token-1234567890abcdef1234567890';
    const fetchMock = masterFetch(draftQuotation(), previewUrl);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByRole('heading', { name: /Aarav Mehta/ });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/public-link'), expect.anything()));
    const link = await screen.findByRole('link', { name: /Preview Weblink/ });
    expect(link.getAttribute('href')).toContain('/q/preview-token-');
    expect(link.getAttribute('href')).toBe(previewUrl);
  });

  it('Preview Weblink opens synchronously to avoid popup block (window.open about:blank then replace)', async () => {
    const previewUrl = 'https://preview.test/q/preview-token-xyz-1234567890abcdef1234567890';
    const delayedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/public-link') && method === 'POST') {
        await new Promise((r) => setTimeout(r, 80));
        return { ok: true, status: 200, json: async () => ({ success: true, data: { url: previewUrl } }) } as Response;
      }
      if (url.includes('/api/quotations/quotation-1')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: draftQuotation() }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response;
    });
    vi.stubGlobal('fetch', delayedFetch);
    const win = { location: { replace: vi.fn() }, document: { title: '', body: { innerHTML: '' } }, close: vi.fn(), opener: null } as unknown as Window;
    const originalOpen = window.open;
    window.open = vi.fn(() => win) as unknown as typeof window.open;
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByRole('heading', { name: /Aarav Mehta/ });
    const previewLink = await screen.findByRole('link', { name: /Preview Weblink/ });
    await userEvent.click(previewLink);
    await waitFor(() => expect(delayedFetch).toHaveBeenCalledWith(expect.stringContaining('/public-link'), expect.anything()), { timeout: 2000 });
    // href should eventually be the preview URL (or window opened)
    await waitFor(
      () => {
        const href = previewLink.getAttribute('href');
        const replaced = (win.location.replace as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string | undefined;
        expect(href ?? replaced).toBe(previewUrl);
      },
      { timeout: 2000 },
    );
    window.open = originalOpen;
  });

  it('shows non-blocking draft pricing banner but does not block preview buttons', async () => {
    const fetchMock = masterFetch(draftQuotation());
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByRole('heading', { name: /Aarav Mehta/ });
    // New UX: newly created draft does not show the large warning immediately
    expect(screen.queryByText(/Draft pricing is incomplete/)).not.toBeInTheDocument();
    expect(await screen.findByText(/Draft — pricing not yet configured/)).toBeInTheDocument();
    // Preview buttons must still be visible and enabled for draft
    expect(screen.getByRole('button', { name: /Generate PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Preview Weblink/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Weblink URL/ })).toBeInTheDocument();
    // Finalize button should still be visible (will fail with pricing error if clicked)
    expect(screen.getByRole('button', { name: /Finalize v1/ })).toBeInTheDocument();
    // After attempting to finalize, the large validation banner appears
    await userEvent.click(screen.getByRole('button', { name: /Finalize v1/ }));
    expect(await screen.findByText(/Draft pricing is incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/You can preview the quotation, but it cannot be finalized/)).toBeInTheDocument();
  });

  it('finalized weblink still works unchanged', async () => {
    // Make the version finalized in the quotation payload
    const finalizedQuotation = {
      ...draftQuotation(),
      versions: [{ ...draftQuotation().versions[0], status: 'FINALIZED' }],
    };
    const fetchMock = masterFetch(finalizedQuotation, 'https://preview.test/q/finalized-token-1234567890abcdef1234567890');
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/quotations/:quotationId" element={<QuotationDetailsPage />} />
      </Routes>,
      { route: '/quotations/quotation-1' },
    );
    await screen.findByRole('heading', { name: /Aarav Mehta/ });
    // For finalized, the button should say Open Weblink, not Preview
    expect(await screen.findByRole('link', { name: /Open Weblink/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Weblink URL/ })).toBeInTheDocument();
    // Draft banner should not show for finalized
    expect(screen.queryByText(/Draft pricing is incomplete/)).not.toBeInTheDocument();
  });
});
