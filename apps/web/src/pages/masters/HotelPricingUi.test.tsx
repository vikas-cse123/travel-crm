import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { HotelFormPage } from './HotelFormPage';

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
  price: 9800,
  currency: 'INR',
  status: 'ACTIVE',
  isDefaultForCity: false,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
  destination: { id: destinationId, name: 'Azerbaijan' },
  city: { id: cityId, name: 'Baku' },
  roomTypes: [
    {
      id: 'rt-1',
      hotelId,
      name: 'Deluxe Room',
      code: null,
      description: null,
      maxAdults: null,
      maxChildren: null,
      maxOccupancy: null,
      bedType: 'King',
      numberOfBeds: null,
      roomSize: null,
      viewType: null,
      sellingPrice: 6000,
      currency: 'INR',
      internalNotes: null,
      status: 'ACTIVE',
      sortOrder: 0,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
      monthPrices: [],
      seasons: [],
    },
  ],
  mealPlans: [],
  monthPrices: [],
  seasons: [],
};

const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

describe('hotel master pricing UI', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(ALL);
  });

  it('hides the hotel-level Hotel Pricing section on Create', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
        if (url.includes('/masters/destinations')) return response(page([destination]));
        return response(page([]));
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/new" element={<HotelFormPage />} />
      </Routes>,
      { route: '/masters/hotels/new' },
    );

    expect(await screen.findByRole('heading', { name: 'Create Hotel' })).toBeInTheDocument();
    // The separate Hotel Pricing section is gone from the hotel form.
    expect(screen.queryByRole('heading', { name: 'Hotel Pricing' })).not.toBeInTheDocument();
    // Room Type / Meal Plan pricing panels are still present.
    expect(screen.getByRole('heading', { name: 'Room Types' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meal Plans' })).toBeInTheDocument();
  });

  it('shows base price + monthly + seasonal pricing in the Edit Hotel Add Room Type form and persists them', async () => {
    const user = userEvent.setup();
    const roomPosts: Array<Record<string, unknown>> = [];
    const monthPosts: Array<Record<string, unknown>> = [];
    const seasonPosts: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        const method = init?.method ?? 'GET';
        if (method === 'POST') {
          const body = JSON.parse(String(init?.body));
          if (url.includes('/month-prices')) {
            monthPosts.push(body);
            return response(hotel, 201);
          }
          if (url.includes('/seasons')) {
            seasonPosts.push(body);
            return response(hotel, 201);
          }
          if (url.includes('/room-types')) {
            roomPosts.push(body);
            return response(
              {
                ...hotel,
                roomTypes: [
                  ...hotel.roomTypes,
                  { ...hotel.roomTypes[0], id: 'rt-2', name: 'Standard Room', sellingPrice: 5000 },
                ],
              },
              201,
            );
          }
          return response(hotel, 201);
        }
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

    expect(await screen.findByRole('heading', { name: 'Edit Hotel' })).toBeInTheDocument();
    // Existing saved room type is still listed.
    expect(await screen.findByText('Deluxe Room')).toBeInTheDocument();

    // Open the Add Room Type form.
    await user.click(screen.getByRole('button', { name: /add room type/i }));
    const addForm = screen.getByLabelText('Room Types name').closest('div')!;
    await user.type(screen.getByLabelText('Room Types name'), 'Standard Room');
    await user.type(screen.getByLabelText('Room Types base price'), '5000');
    expect(screen.getByLabelText('Room Types base currency')).toHaveValue('INR');

    // Monthly rates within the new room draft.
    await user.click(within(addForm).getByRole('button', { name: 'Add Month' }));
    await user.selectOptions(within(addForm).getByLabelText('Month rate month'), '1');
    await user.type(within(addForm).getByLabelText('Month rate price'), '6000');
    await user.click(within(addForm).getByRole('button', { name: 'Save Month' }));
    expect(within(addForm).getByText('January')).toBeInTheDocument();

    // Seasonal rates within the new room draft.
    await user.click(within(addForm).getByRole('button', { name: 'Add Season' }));
    await user.type(within(addForm).getByLabelText('Season name'), 'Summer');
    fireEvent.change(within(addForm).getByLabelText('Season start date'), {
      target: { value: '2026-04-01' },
    });
    fireEvent.change(within(addForm).getByLabelText('Season end date'), {
      target: { value: '2026-06-30' },
    });
    await user.type(within(addForm).getByLabelText('Season rate'), '7000');
    await user.click(within(addForm).getByRole('button', { name: 'Save Season' }));
    expect(within(addForm).getByText('Summer')).toBeInTheDocument();

    await user.click(within(addForm).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(roomPosts.length).toBe(1));
    expect(roomPosts[0]).toMatchObject({ name: 'Standard Room', sellingPrice: 5000 });
    await waitFor(() => expect(monthPosts.length).toBe(1));
    expect(monthPosts[0]).toMatchObject({ month: 1, price: 6000 });
    await waitFor(() => expect(seasonPosts.length).toBe(1));
    expect(seasonPosts[0]).toMatchObject({ name: 'Summer', price: 7000 });
  });

  it('keeps showing/editing pricing on existing saved room types in Edit Hotel', async () => {
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

    expect(await screen.findByText('Deluxe Room')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle pricing for Deluxe Room' }));
    expect(await screen.findByLabelText('Room type base price')).toHaveValue(6000);
    expect(screen.getByLabelText('Room type base currency')).toHaveValue('INR');
    expect(screen.getByText('Monthly Rates')).toBeInTheDocument();
    expect(screen.getByText('Seasonal Rates')).toBeInTheDocument();
  });
});