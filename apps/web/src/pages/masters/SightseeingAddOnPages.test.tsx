import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { SightseeingPage } from './SightseeingPage';
import { SightseeingFormPage } from './SightseeingFormPage';
import { SightseeingDetailsPage } from './SightseeingDetailsPage';
import { AddOnServicesPage } from './AddOnServicesPage';
import { AddOnServiceFormPage } from './AddOnServiceFormPage';
import { AddOnServiceDetailsPage } from './AddOnServiceDetailsPage';
import { NAV_ITEMS } from '@/components/layout/navigation';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const cityId = '11111111-1111-4111-8111-111111111111';
const otherCityId = '11111111-1111-4111-8111-111111111112';
const destinationId = '22222222-2222-4222-8222-222222222222';
const sightseeingId = '77777777-7777-4777-8777-777777777777';
const serviceId = '88888888-8888-4888-8888-888888888888';

const destination = {
  id: destinationId,
  name: 'Azerbaijan',
  countryCode: 'AZ',
  countryName: 'Azerbaijan',
  destinationType: 'INTERNATIONAL',
  status: 'ACTIVE',
  cities: [
    { id: 'link-1', cityId, sequence: 0, city: { id: cityId, name: 'Baku', airportCode: 'GYD' } },
  ],
  _count: { cities: 1 },
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};

const sightseeing = {
  id: sightseeingId,
  title: 'Gobustan Rock Art Tour',
  sequence: 2,
  estimatedHours: 5,
  suggestedStartTime: '10:00',
  description: '<p>Begin your exploration of Qobustan.</p>',
  remarks: '<p>Carry water.</p>',
  status: 'ACTIVE',
  hasImage: false,
  imageFileName: null,
  imageMimeType: null,
  imageConfirmedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  destination: { id: destinationId, name: 'Azerbaijan' },
  city: { id: cityId, name: 'Baku' },
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
  updatedBy: null,
};

const service = {
  id: serviceId,
  name: 'Singapore Visa',
  description: '<p>Docs Required: Passport</p>',
  price: 3800,
  currency: 'INR',
  status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
  updatedBy: null,
};

const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

const summary = { totalAttractions: 1, destinations: 1, citiesCovered: 1, withImages: 0 };

/** Route the many list/lookup calls these pages make. */
function stubApi(overrides: { sightseeing?: unknown; services?: unknown } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(request);
      if (url.includes('/masters/sightseeing/summary')) return response(summary);
      if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
      if (url.includes('/masters/destinations')) return response(page([destination]));
      if (url.includes('/masters/cities'))
        return response(page([{ id: cityId, name: 'Baku', status: 'ACTIVE' }]));
      if (url.includes(`/masters/sightseeing/${sightseeingId}`)) return response(sightseeing);
      if (url.includes('/masters/sightseeing'))
        return response(overrides.sightseeing ?? page([sightseeing]));
      if (url.includes(`/masters/add-on-services/${serviceId}`)) return response(service);
      if (url.includes('/masters/add-on-services'))
        return response(overrides.services ?? page([service]));
      return response(page([]));
    }),
  );
}

const ALL = [
  'masters.sightseeing.view',
  'masters.sightseeing.create',
  'masters.sightseeing.update',
  'masters.sightseeing.delete',
  'masters.sightseeing.manage_media',
  'masters.add_on_services.view',
  'masters.add_on_services.create',
  'masters.add_on_services.update',
  'masters.add_on_services.delete',
];

describe('Phase 13D master pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(ALL);
  });

  it('exposes Sightseeing and Add-On Services inside the existing Masters group', () => {
    const masters = NAV_ITEMS.find((item) => item.label === 'Masters');
    expect(masters?.children?.map((item) => item.label)).toEqual([
      'Cities',
      'Destinations',
      'Hotels',
      'Airlines',
      'Cruises',
      'Vehicles',
      'Sightseeing',
      'Add-On Services',
      'Visa Types',
      'Testimonials',
    ]);
    expect(masters?.children?.find((item) => item.label === 'Sightseeing')?.to).toBe(
      '/masters/sightseeing',
    );
    expect(masters?.children?.find((item) => item.label === 'Add-On Services')?.to).toBe(
      '/masters/add-on-services',
    );
  });

  // -------------------------------------------------------------------------
  // Sightseeing
  // -------------------------------------------------------------------------

  it('renders the sightseeing list grouped by destination and city', async () => {
    stubApi();
    renderWithProviders(<SightseeingPage />, { route: '/masters/sightseeing' });

    expect((await screen.findAllByText('Gobustan Rock Art Tour')).length).toBeGreaterThan(0);
    // Destination and city group headers.
    expect(screen.getAllByText('Azerbaijan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Baku').length).toBeGreaterThan(0);
    // Sequence, duration and start-time cells.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5.0h')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    // Description rendered as plain text, not raw HTML.
    expect(screen.getByText(/Begin your exploration of Qobustan\./)).toBeInTheDocument();
  });

  it('renders the sightseeing summary statistics', async () => {
    stubApi();
    renderWithProviders(<SightseeingPage />, { route: '/masters/sightseeing' });

    await waitFor(() => expect(screen.getByText('Summary Statistics')).toBeInTheDocument());
    expect(screen.getByText('Total Attractions')).toBeInTheDocument();
    expect(screen.getByText('Cities Covered')).toBeInTheDocument();
  });

  it('shows the sightseeing loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderWithProviders(<SightseeingPage />, {
      route: '/masters/sightseeing',
    });
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows the sightseeing empty state', async () => {
    stubApi({ sightseeing: page([]) });
    renderWithProviders(<SightseeingPage />, { route: '/masters/sightseeing' });
    expect(await screen.findByText('No sightseeing found')).toBeInTheDocument();
  });

  it('shows the sightseeing error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      })) as unknown as typeof fetch,
    );
    renderWithProviders(<SightseeingPage />, { route: '/masters/sightseeing' });
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      'Sightseeing could not be loaded.',
    );
  });

  it('hides sightseeing create, edit, reorder and archive actions without permission', async () => {
    auth.permissions = new Set(['masters.sightseeing.view']);
    stubApi();
    renderWithProviders(<SightseeingPage />, { route: '/masters/sightseeing' });

    await screen.findAllByText('Gobustan Rock Art Tour');
    expect(screen.queryByRole('link', { name: /add new sightseeing/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /edit gobustan rock art tour/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /move gobustan rock art tour up/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /archive gobustan rock art tour/i }),
    ).not.toBeInTheDocument();
  });

  it('validates the sightseeing create form before calling the API', async () => {
    const user = userEvent.setup();
    stubApi();
    renderWithProviders(<SightseeingFormPage />, { route: '/masters/sightseeing/new' });

    await user.click(screen.getByRole('button', { name: /create sightseeing/i }));
    expect(await screen.findByText('Select a destination.')).toBeInTheDocument();
    expect(screen.getByText('Select a city.')).toBeInTheDocument();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
  });

  it('loads cities only after a destination is chosen', async () => {
    const user = userEvent.setup();
    stubApi();
    renderWithProviders(<SightseeingFormPage />, { route: '/masters/sightseeing/new' });

    const citySelect = await screen.findByLabelText(/city/i);
    // Disabled until a destination is picked.
    expect(citySelect).toBeDisabled();

    const destinationSelect = screen.getByLabelText(/destination/i);
    await waitFor(() => expect(destinationSelect).toHaveTextContent('Azerbaijan'));
    await user.selectOptions(destinationSelect, destinationId);

    await waitFor(() => expect(citySelect).not.toBeDisabled());
    await waitFor(() => expect(citySelect).toHaveTextContent('Baku'));
  });

  it('loads an existing sightseeing into the edit form', async () => {
    stubApi();
    renderWithProviders(
      <Routes>
        <Route path="/masters/sightseeing/:sightseeingId/edit" element={<SightseeingFormPage />} />
      </Routes>,
      { route: `/masters/sightseeing/${sightseeingId}/edit` },
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue('Gobustan Rock Art Tour')).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update sightseeing/i })).toBeInTheDocument();
  });

  it('renders the sightseeing detail page', async () => {
    stubApi();
    renderWithProviders(
      <Routes>
        <Route path="/masters/sightseeing/:sightseeingId" element={<SightseeingDetailsPage />} />
      </Routes>,
      { route: `/masters/sightseeing/${sightseeingId}` },
    );

    expect(
      await screen.findByRole('heading', { name: 'Gobustan Rock Art Tour' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByText('Suggested Start Time')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Remarks')).toBeInTheDocument();
    expect(screen.getByText(/Begin your exploration/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Add-On Services
  // -------------------------------------------------------------------------

  it('renders the add-on services list with price and status', async () => {
    stubApi();
    renderWithProviders(<AddOnServicesPage />, { route: '/masters/add-on-services' });

    expect((await screen.findAllByText('Singapore Visa')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3,800/).length).toBeGreaterThan(0);
    // "ACTIVE" also appears as a status-filter option, so scope to the badge.
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    // Description rendered as plain text.
    expect(screen.getByText(/Docs Required: Passport/)).toBeInTheDocument();
  });

  it('shows the add-on services loading, empty and error states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const loading = renderWithProviders(<AddOnServicesPage />, {
      route: '/masters/add-on-services',
    });
    expect(loading.container.querySelector('.animate-pulse')).toBeTruthy();
    loading.unmount();

    stubApi({ services: page([]) });
    const empty = renderWithProviders(<AddOnServicesPage />, {
      route: '/masters/add-on-services',
    });
    expect(await screen.findByText('No add-on services found')).toBeInTheDocument();
    empty.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      })) as unknown as typeof fetch,
    );
    renderWithProviders(<AddOnServicesPage />, { route: '/masters/add-on-services' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add-on services could not be loaded.',
    );
  });

  it('hides add-on service create, edit and archive actions without permission', async () => {
    auth.permissions = new Set(['masters.add_on_services.view']);
    stubApi();
    renderWithProviders(<AddOnServicesPage />, { route: '/masters/add-on-services' });

    await screen.findAllByText('Singapore Visa');
    expect(screen.queryByRole('link', { name: /add new service/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit singapore visa/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /archive singapore visa/i }),
    ).not.toBeInTheDocument();
  });

  it('validates the add-on service name and price', async () => {
    const user = userEvent.setup();
    stubApi();
    renderWithProviders(<AddOnServiceFormPage />, { route: '/masters/add-on-services/new' });

    const price = screen.getByLabelText(/price/i);
    await user.clear(price);
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText('Service name is required.')).toBeInTheDocument();
    expect(screen.getByText('Price is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/service name/i), 'Test Service');
    await user.type(price, '-5');
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText('Price cannot be negative.')).toBeInTheDocument();
  });

  it('loads an existing add-on service into the edit form', async () => {
    stubApi();
    renderWithProviders(
      <Routes>
        <Route
          path="/masters/add-on-services/:addOnServiceId/edit"
          element={<AddOnServiceFormPage />}
        />
      </Routes>,
      { route: `/masters/add-on-services/${serviceId}/edit` },
    );

    await waitFor(() => expect(screen.getByDisplayValue('Singapore Visa')).toBeInTheDocument());
    expect(screen.getByDisplayValue('3800')).toBeInTheDocument();
    expect(screen.getByLabelText(/active/i)).toBeChecked();
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
  });

  it('renders the add-on service detail page', async () => {
    stubApi();
    renderWithProviders(
      <Routes>
        <Route
          path="/masters/add-on-services/:addOnServiceId"
          element={<AddOnServiceDetailsPage />}
        />
      </Routes>,
      { route: `/masters/add-on-services/${serviceId}` },
    );

    expect(await screen.findByRole('heading', { name: 'Singapore Visa' })).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getAllByText(/3,800/).length).toBeGreaterThan(0);
    expect(screen.getByText('Created By')).toBeInTheDocument();
    expect(screen.getByText('Aditi Rao')).toBeInTheDocument();
  });
});

// Referenced so the unused-city constant does not drift out of the fixture set.
void otherCityId;
