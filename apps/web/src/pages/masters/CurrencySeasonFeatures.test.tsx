import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { HotelFormPage } from './HotelFormPage';
import { AddOnServiceFormPage } from './AddOnServiceFormPage';
import { VehicleFormPage } from './VehicleFormPage';
import { SightseeingFormPage } from './SightseeingFormPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () =>
      status < 400 ? { success: true, data } : { success: false, error: { message: 'boom' } },
  }) as Response;

const ALL = [
  'masters.hotels.view',
  'masters.hotels.create',
  'masters.hotels.update',
  'masters.hotels.manage_costing',
  'masters.vehicles.view',
  'masters.vehicles.create',
  'masters.vehicles.update',
  'masters.sightseeing.view',
  'masters.sightseeing.create',
  'masters.sightseeing.update',
  'masters.add_on_services.view',
  'masters.add_on_services.create',
  'masters.add_on_services.update',
];

const destinationId = '11111111-1111-4111-8111-111111111111';
const cityId = '22222222-2222-4222-8222-222222222222';
const hotelId = '33333333-3333-4333-8333-333333333333';

const destination = {
  id: destinationId,
  name: 'Azerbaijan',
  cities: [{ id: 'dc-1', cityId, sequence: 1, city: { id: cityId, name: 'Baku' } }],
};
const hotel = {
  id: hotelId,
  destinationId,
  cityId,
  name: 'Shah Palace Hotel',
  starCategory: 4,
  starRating: 4.3,
  reviewLink: null,
  address: null,
  description: null,
  amenities: null,
  price: 10000,
  currency: 'INR',
  status: 'ACTIVE',
  isDefaultForCity: false,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
  destination: { id: destinationId, name: 'Azerbaijan' },
  city: { id: cityId, name: 'Baku' },
  roomTypes: [],
  mealPlans: [],
  seasons: [
    {
      id: 'season-1',
      hotelId,
      name: 'Peak Season',
      startDate: '2026-12-20',
      endDate: '2027-01-05',
      price: 15000,
      currency: 'USD',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
  ],
};

const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

/** Wait for the destination select to load its options, then pick one. */
async function pickDestination(user: ReturnType<typeof userEvent.setup>, value: string) {
  const select = await screen.findByLabelText('Destination *');
  await waitFor(() =>
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1),
  );
  await user.selectOptions(select, value);
}

async function pickCity(user: ReturnType<typeof userEvent.setup>, value: string) {
  const select = screen.getByLabelText('City *');
  await waitFor(() => expect(select).toBeEnabled());
  await user.selectOptions(select, value);
}

describe('master currency selector and hotel seasons', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(ALL);
  });

  it('defaults new hotel price currency to INR and persists the selected currency', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        expect(body.currency).toBe('USD');
        return response({ ...hotel, price: 12000, currency: 'USD' }, 201);
      }
      if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
      if (url.includes('/masters/destinations')) return response(page([destination]));
      return response(page([]));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/new" element={<HotelFormPage />} />
      </Routes>,
      { route: '/masters/hotels/new' },
    );

    const currencySelect = await screen.findByLabelText('Hotel price currency');
    expect(currencySelect).toHaveValue('INR');
    await user.selectOptions(currencySelect, 'USD');
    await user.type(screen.getByLabelText('Hotel Name *'), 'Shah Palace Hotel');
    await pickDestination(user, destinationId);
    await pickCity(user, cityId);
    await user.click(screen.getByRole('button', { name: /create hotel/i }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
  });

  it('loads existing seasons and adds a new season via the API', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.includes('/seasons')) {
        const body = JSON.parse(String(init?.body));
        expect(body.name).toBe('Summer');
        expect(body.currency).toBe('USD');
        expect(body.price).toBe(9000);
        return response(
          {
            ...hotel,
            seasons: [
              ...hotel.seasons,
              {
                id: 'season-2',
                hotelId,
                name: 'Summer',
                startDate: '2026-06-01',
                endDate: '2026-06-30',
                price: 9000,
                currency: 'USD',
              },
            ],
          },
          201,
        );
      }
      if (url.includes(`/masters/hotels/${hotelId}`)) return response(hotel);
      if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
      if (url.includes('/masters/destinations')) return response(page([destination]));
      return response(page([hotel]));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/:hotelId/edit" element={<HotelFormPage />} />
      </Routes>,
      { route: `/masters/hotels/${hotelId}/edit` },
    );

    expect(await screen.findByText('Peak Season')).toBeInTheDocument();
    expect(screen.getByText(/20 Dec 2026/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add season/i }));
    await user.type(screen.getByLabelText('Season name'), 'Summer');
    fireEvent.change(screen.getByLabelText('Season start date'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Season end date'), {
      target: { value: '2026-06-30' },
    });
    await user.type(screen.getByLabelText('Season rate'), '9000');
    await user.selectOptions(screen.getByLabelText('Season currency'), 'USD');
    await user.click(screen.getByRole('button', { name: /save season/i }));

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(
          ([request, init]) =>
            init?.method === 'POST' && String(request).includes('/seasons'),
        ),
      ).toBe(true),
    );
  });

  it('shows an overlap warning for a season that collides with an existing range', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes(`/masters/hotels/${hotelId}`)) return response(hotel);
        if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
        if (url.includes('/masters/destinations')) return response(page([destination]));
        return response(page([hotel]));
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/:hotelId/edit" element={<HotelFormPage />} />
      </Routes>,
      { route: `/masters/hotels/${hotelId}/edit` },
    );

    await screen.findByText('Peak Season');
    await user.click(screen.getByRole('button', { name: /add season/i }));
    await user.type(screen.getByLabelText('Season name'), 'Collision');
    fireEvent.change(screen.getByLabelText('Season start date'), {
      target: { value: '2026-12-25' },
    });
    fireEvent.change(screen.getByLabelText('Season end date'), {
      target: { value: '2027-01-10' },
    });

    expect(
      await screen.findByText(/overlaps another season of this hotel/i),
    ).toBeInTheDocument();
  });

  it('persists a non-default currency for a vehicle price', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        expect(body.currency).toBe('USD');
        expect(body.price).toBe(500);
        return response({ id: 'v-1', currency: 'USD', price: 500 });
      }
      return response(page([]));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderWithProviders(
      <Routes>
        <Route path="/masters/vehicles/new" element={<VehicleFormPage />} />
      </Routes>,
      { route: '/masters/vehicles/new' },
    );

    await user.type(screen.getByLabelText('Vehicle Name *'), 'Sedan');
    await user.type(screen.getByLabelText('Vehicle Type *'), 'Sedan');
    await user.type(screen.getByRole('spinbutton', { name: 'Capacity (persons)' }), '4');
    await user.type(screen.getByLabelText('Vehicle price'), '500');
    await user.selectOptions(screen.getByLabelText('Vehicle price currency'), 'USD');
    await user.click(screen.getByRole('button', { name: /create vehicle/i }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
  });

  it('persists currency for an add-on service price', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        expect(body.currency).toBe('EUR');
        return response({ id: 'a-1', currency: 'EUR' });
      }
      return response(page([]));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderWithProviders(
      <Routes>
        <Route path="/masters/add-on-services/new" element={<AddOnServiceFormPage />} />
      </Routes>,
      { route: '/masters/add-on-services/new' },
    );

    await user.type(screen.getByLabelText(/service name/i), 'Visa Assistance');
    await user.type(screen.getByLabelText('Add-on service price'), '3000');
    await user.selectOptions(screen.getByLabelText('Add-on service price currency'), 'EUR');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
  });

  it('captures a currency per sightseeing pricing row', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        expect(body.pricing).toEqual([{ label: 'Adult', price: 2000, currency: 'USD' }]);
        return response({ id: 's-1' });
      }
      if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
      if (url.includes('/masters/destinations')) return response(page([destination]));
      return response(page([]));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderWithProviders(
      <Routes>
        <Route path="/masters/sightseeing/new" element={<SightseeingFormPage />} />
      </Routes>,
      { route: '/masters/sightseeing/new' },
    );

    await pickDestination(user, destinationId);
    await pickCity(user, cityId);
    await user.type(screen.getByLabelText('Title *'), 'Old City Walk');
    await user.click(screen.getByRole('button', { name: /add price category/i }));
    await user.type(screen.getByLabelText(/category/i), 'Adult');
    await user.type(screen.getByLabelText('Pricing 1 price'), '2000');
    await user.selectOptions(screen.getByLabelText('Pricing 1 currency'), 'USD');
    await user.click(screen.getByRole('button', { name: /create sightseeing/i }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
  });
});