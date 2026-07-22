import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { CitiesPage } from './CitiesPage';
import { CityFormPage } from './CityFormPage';
import { DestinationsPage } from './DestinationsPage';
import { DestinationDetailsPage } from './DestinationDetailsPage';
import { DestinationFormPage } from './DestinationFormPage';
import { NAV_ITEMS } from '@/components/layout/navigation';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const cityId = '11111111-1111-4111-8111-111111111111';
const destinationId = '22222222-2222-4222-8222-222222222222';
const city = {
  id: cityId,
  countryCode: 'IN',
  countryName: 'India',
  name: 'Jaipur',
  airportCode: 'JAI',
  status: 'ACTIVE',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'user-1', fullName: 'Aditi Rao' },
  _count: { destinationLinks: 1 },
};
const destination = {
  id: destinationId,
  countryCode: 'IN',
  countryName: 'India',
  name: 'Rajasthan Highlights',
  destinationType: 'DOMESTIC',
  status: 'ACTIVE',
  inclusions: '<p>Breakfast and <strong>transfers</strong></p>',
  exclusions: '<p>Flights</p>',
  paymentPolicies: null,
  cancellationPolicies: null,
  bookingTerms: '<p>Passport required</p>',
  imageStorageProvider: null,
  imageFileName: null,
  imageMimeType: null,
  imageFileSize: null,
  imageConfirmedAt: null,
  hasImage: false,
  cities: [{ id: 'link-1', cityId, sequence: 0, city }],
  _count: { cities: 1 },
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'user-1', fullName: 'Aditi Rao' },
};
const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});
const lookups = {
  countries: [
    { code: 'IN', name: 'India' },
    { code: 'AE', name: 'United Arab Emirates' },
  ],
  cities: [{ id: cityId, name: 'Jaipur', airportCode: 'JAI', countryCode: 'IN' }],
};

describe('Phase 13A master pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set([
      'masters.cities.view',
      'masters.cities.create',
      'masters.cities.update',
      'masters.cities.delete',
      'masters.destinations.view',
      'masters.destinations.create',
      'masters.destinations.update',
      'masters.destinations.delete',
      'masters.destinations.manage_images',
    ]);
  });

  it('activates every built master beneath the Masters sidebar item', () => {
    const masters = NAV_ITEMS.find((item) => item.label === 'Masters');
    expect(masters).toMatchObject({ available: true, permission: 'masters.view' });
    expect(masters?.children?.map((item) => [item.label, item.available])).toEqual([
      ['Cities', true],
      ['Destinations', true],
      ['Hotels', true],
      ['Airlines', true],
      ['Cruises', true],
      ['Vehicles', true],
      ['Sightseeing', true],
      ['Add-On Services', true],
    ]);
  });

  it('shows city loading, empty, and error states', async () => {
    const never = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => never),
    );
    const loading = renderWithProviders(<CitiesPage />);
    expect(loading.container.querySelector('.animate-pulse')).toBeInTheDocument();
    loading.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/lookups') ? response(lookups) : response(page([])),
      ),
    );
    const empty = renderWithProviders(<CitiesPage />);
    expect(await screen.findByText('No cities found')).toBeInTheDocument();
    empty.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/lookups')
          ? response(lookups)
          : ({
              ok: false,
              status: 500,
              json: async () => ({
                success: false,
                error: { code: 'INTERNAL_ERROR', message: 'failed' },
              }),
            } as Response),
      ),
    );
    renderWithProviders(<CitiesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cities could not be loaded');
  });

  it('renders city actions and sends URL-backed search and country filters', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/lookups') ? response(lookups) : response(page([city])),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CitiesPage />);
    expect((await screen.findAllByText('Jaipur')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Add New City' })).toBeInTheDocument();
    expect(screen.getByLabelText('Archive Jaipur')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search cities'), 'jai');
    await userEvent.selectOptions(screen.getByLabelText('City country'), 'IN');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url).includes('search=jai') && String(url).includes('country=IN'),
        ),
      ).toBe(true),
    );
  });

  it('validates and normalizes the create City form before posting', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes('/lookups')) return response(lookups);
      if (init?.method === 'POST') return response(city);
      return response(city);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <Routes>
        <Route path="/masters/cities/new" element={<CityFormPage />} />
        <Route path="/masters/cities/:cityId" element={<div>Saved city</div>} />
      </Routes>,
      { route: '/masters/cities/new' },
    );
    await screen.findByRole('heading', { name: 'Create City' });
    await userEvent.click(screen.getByRole('button', { name: 'Create City' }));
    expect(await screen.findByText('Select a country.')).toBeInTheDocument();
    expect(await screen.findByText('Enter a city name.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByText('Country *').querySelector('select')!, 'IN');
    await userEvent.type(screen.getByPlaceholderText('Enter city name'), 'Jaipur');
    await userEvent.type(screen.getByPlaceholderText('e.g. DEL'), 'jai');
    await userEvent.click(screen.getByRole('button', { name: 'Create City' }));
    await screen.findByText('Saved city');
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/api/masters/cities') && init?.method === 'POST',
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      countryCode: 'IN',
      name: 'Jaipur',
      airportCode: 'JAI',
    });
  });

  it('hides create, edit, archive, and status controls from a read-only role', async () => {
    auth.permissions = new Set(['masters.cities.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/lookups') ? response(lookups) : response(page([city])),
      ),
    );
    renderWithProviders(<CitiesPage />);
    await screen.findAllByText('Jaipur');
    expect(screen.queryByRole('link', { name: 'Add New City' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit Jaipur')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Archive Jaipur')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('City status')).not.toBeInTheDocument();
  });

  it('renders destination badges and applies type filters', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL) =>
      String(request).includes('/lookups') ? response(lookups) : response(page([destination])),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DestinationsPage />);
    expect((await screen.findAllByText('Rajasthan Highlights')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('DOMESTIC').length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Destination type'), 'INTERNATIONAL');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('destinationType=INTERNATIONAL')),
      ).toBe(true),
    );
  });

  it('renders ordered cities and switches sanitized policy tabs in destination details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(destination)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/destinations/:destinationId" element={<DestinationDetailsPage />} />
      </Routes>,
      { route: `/masters/destinations/${destinationId}` },
    );
    expect((await screen.findAllByText('Rajasthan Highlights')).length).toBeGreaterThan(0);
    expect(screen.getByText('transfers')).toBeInTheDocument();
    expect(screen.getByText('JAI')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Exclusions' }));
    expect(screen.getByText('Flights')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Terms & Conditions' }));
    expect(screen.getByText('Passport required')).toBeInTheDocument();
  });

  it('selects, removes, reorders content, toggles international, and completes image upload', async () => {
    const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes('/lookups')) return response(lookups);
      if (url.endsWith('/image/upload'))
        return response({ uploadUrl: 'https://uploads.example/image', expiresInSeconds: 300 });
      if (url === 'https://uploads.example/image')
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      if (url.endsWith('/image/confirm')) return response({ ...destination, hasImage: true });
      if (url.endsWith('/api/masters/destinations') && init?.method === 'POST')
        return response(destination);
      return response(destination);
    });
    vi.stubGlobal('fetch', fetchMock);
    const rendered = renderWithProviders(
      <Routes>
        <Route path="/masters/destinations/new" element={<DestinationFormPage />} />
        <Route path="/masters/destinations/:destinationId" element={<div>Saved destination</div>} />
      </Routes>,
      { route: '/masters/destinations/new' },
    );
    await screen.findByRole('heading', { name: 'Create Destination' });
    expect(screen.getByText('Select a country to view cities.')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'India' });
    await userEvent.selectOptions(screen.getByText('Country *').querySelector('select')!, 'IN');
    await userEvent.type(
      screen.getByPlaceholderText('e.g. Rajasthan Highlights'),
      'Rajasthan Highlights',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Jaipur JAI' }));
    expect(screen.getByLabelText('Remove Jaipur')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jaipur JAI' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Remove Jaipur'));
    expect(screen.queryByLabelText('Remove Jaipur')).not.toBeInTheDocument();
    expect(screen.getByText('Country *').querySelector('select')).toHaveValue('IN');
    await userEvent.click(await screen.findByRole('button', { name: 'Jaipur JAI' }));
    await userEvent.click(screen.getByLabelText('International'));
    const inclusions = screen.getByRole('textbox', { name: 'Inclusions' });
    inclusions.innerHTML = 'Breakfast';
    fireEvent.input(inclusions);
    const upload = rendered.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(upload, new File(['image'], 'palace.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Destination' }));
    await screen.findByText('Saved destination');
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/api/masters/destinations') && init?.method === 'POST',
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      destinationType: 'INTERNATIONAL',
      cityIds: [cityId],
      inclusions: 'Breakfast',
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/image/upload'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/image/confirm'))).toBe(true);
  });
});
