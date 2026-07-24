import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { HotelsPage } from './HotelsPage';
import { HotelFormPage } from './HotelFormPage';
import { HotelDetailsPage } from './HotelDetailsPage';
import { AirlinesPage } from './AirlinesPage';
import { AirlineFormPage } from './AirlineFormPage';
import { AirlineDetailsPage } from './AirlineDetailsPage';
import { NAV_ITEMS } from '@/components/layout/navigation';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const hotelId = '33333333-3333-4333-8333-333333333333';
const destinationId = '22222222-2222-4222-8222-222222222222';
const cityId = '11111111-1111-4111-8111-111111111111';

const destination = {
  id: destinationId,
  countryCode: 'AZ',
  countryName: 'Azerbaijan',
  name: 'Azerbaijan',
  destinationType: 'INTERNATIONAL',
  status: 'ACTIVE',
  cities: [
    { id: 'link-1', cityId, sequence: 0, city: { id: cityId, name: 'Baku', airportCode: null } },
  ],
  _count: { cities: 1 },
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};
const hotelSummary = {
  id: hotelId,
  name: 'Shah Palace Hotel',
  starCategory: 4,
  starRating: 4.3,
  status: 'ACTIVE',
  isDefaultForCity: true,
  isFeatured: false,
  hasImage: false,
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdAt: '2026-07-20T00:00:00.000Z',
  destination: { id: destinationId, name: 'Azerbaijan' },
  city: { id: cityId, name: 'Baku' },
  _count: { roomTypes: 1, mealPlans: 0 },
};
const hotel = {
  ...hotelSummary,
  destinationId,
  cityId,
  propertyType: null,
  address: 'Boyuk Qala 47',
  landmark: null,
  postalCode: null,
  latitude: null,
  longitude: null,
  contactName: null,
  phone: null,
  email: null,
  website: null,
  reviewLink: null,
  checkInTime: '14:00',
  checkOutTime: '12:00',
  description: '<p>Great stay</p>',
  amenities: '<p>Pool</p>',
  internalNotes: null,
  externalCode: null,
  sortOrder: 0,
  imageFileName: null,
  imageMimeType: null,
  imageFileSize: null,
  imageConfirmedAt: null,
  destination: { id: destinationId, name: 'Azerbaijan' },
  city: { id: cityId, name: 'Baku' },
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
  roomTypes: [
    {
      id: 'rt-1',
      hotelId,
      name: 'Deluxe Room',
      code: null,
      description: null,
      maxAdults: null,
      maxChildren: null,
      maxOccupancy: 2,
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
    },
  ],
  mealPlans: [],
};
const airlineId = '44444444-4444-4444-8444-444444444444';
const airline = {
  id: airlineId,
  name: 'Air India',
  iataCode: 'AI',
  icaoCode: 'AIC',
  countryCode: 'IN',
  countryName: 'India',
  website: null,
  internalNotes: null,
  status: 'ACTIVE',
  hasLogo: false,
  logoFileName: null,
  logoMimeType: null,
  logoConfirmedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};
const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

const ALL = [
  'masters.hotels.view',
  'masters.hotels.create',
  'masters.hotels.update',
  'masters.hotels.delete',
  'masters.hotels.manage_media',
  'masters.hotels.view_costing',
  'masters.hotels.manage_costing',
  'masters.airlines.view',
  'masters.airlines.create',
  'masters.airlines.update',
  'masters.airlines.delete',
  'masters.airlines.manage_media',
];

describe('Phase 13B master pages', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(ALL);
  });

  it('lists Cities, Destinations, Hotels and Airlines under Masters', () => {
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
  });

  it('renders the hotel list with the default badge and archive action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(page([hotelSummary])),
      ),
    );
    renderWithProviders(<HotelsPage />);
    expect((await screen.findAllByText('Shah Palace Hotel')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Archive Shah Palace Hotel')).toBeInTheDocument();
  });

  it('shows hotel loading, empty and error states', async () => {
    const never = new Promise<Response>(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => never),
    );
    const loading = renderWithProviders(<HotelsPage />);
    expect(loading.container.querySelector('.animate-pulse')).toBeInTheDocument();
    loading.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(page([])),
      ),
    );
    const empty = renderWithProviders(<HotelsPage />);
    expect(await screen.findByText('No hotels found')).toBeInTheDocument();
    empty.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : ({
              ok: false,
              status: 500,
              json: async () => ({ success: false, error: { code: 'X', message: 'fail' } }),
            } as Response),
      ),
    );
    renderWithProviders(<HotelsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Hotels could not be loaded');
  });

  it('hides create and archive controls from a read-only hotel role', async () => {
    auth.permissions = new Set(['masters.hotels.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) =>
        String(request).includes('/masters/destinations')
          ? response(page([destination]))
          : response(page([hotelSummary])),
      ),
    );
    renderWithProviders(<HotelsPage />);
    await screen.findAllByText('Shah Palace Hotel');
    expect(screen.queryByRole('link', { name: 'Add New Hotel' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Archive Shah Palace Hotel')).not.toBeInTheDocument();
  });

  it('validates the hotel form and derives cities from the chosen destination', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = String(request);
        if (url.includes(`/masters/destinations/${destinationId}`)) return response(destination);
        if (url.includes('/masters/destinations')) return response(page([destination]));
        return response(hotel);
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/new" element={<HotelFormPage />} />
      </Routes>,
      { route: '/masters/hotels/new' },
    );
    await screen.findByRole('heading', { name: 'Create Hotel' });
    await userEvent.click(screen.getByRole('button', { name: 'Create Hotel' }));
    expect(await screen.findByText('Select a destination.')).toBeInTheDocument();
    const destinationSelect = screen.getByText('Destination *').querySelector('select')!;
    await userEvent.selectOptions(destinationSelect, destinationId);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Baku' })).toBeInTheDocument());
  });

  it('renders hotel detail and gates costing by permission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(hotel)),
    );
    const view = renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/:hotelId" element={<HotelDetailsPage />} />
      </Routes>,
      { route: `/masters/hotels/${hotelId}` },
    );
    expect((await screen.findAllByText('Shah Palace Hotel')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Room Types' }));
    expect(screen.getByText('Deluxe Room')).toBeInTheDocument();
    expect(screen.getByText(/6000/)).toBeInTheDocument();
    view.unmount();

    // Without view_costing the price must not be rendered.
    auth.permissions = new Set(['masters.hotels.view']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(hotel)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/hotels/:hotelId" element={<HotelDetailsPage />} />
      </Routes>,
      { route: `/masters/hotels/${hotelId}` },
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Room Types' }));
    expect(screen.getByText('Deluxe Room')).toBeInTheDocument();
    expect(screen.queryByText(/6000/)).not.toBeInTheDocument();
  });

  it('renders the airline list and validates the airline create form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(page([airline]))),
    );
    const list = renderWithProviders(<AirlinesPage />);
    expect((await screen.findAllByText('Air India')).length).toBeGreaterThan(0);
    expect(screen.getByText('AI')).toBeInTheDocument();
    list.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(airline)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/airlines/new" element={<AirlineFormPage />} />
        <Route path="/masters/airlines/:airlineId" element={<div>Saved airline</div>} />
      </Routes>,
      { route: '/masters/airlines/new' },
    );
    await screen.findByRole('heading', { name: 'Create Airline' });
    await userEvent.click(screen.getByRole('button', { name: 'Create Airline' }));
    expect(await screen.findByText('Enter an airline name.')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Enter airline name'), 'Air India');
    await userEvent.click(screen.getByRole('button', { name: 'Create Airline' }));
    await screen.findByText('Saved airline');
  });

  it('renders airline detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(airline)),
    );
    renderWithProviders(
      <Routes>
        <Route path="/masters/airlines/:airlineId" element={<AirlineDetailsPage />} />
      </Routes>,
      { route: `/masters/airlines/${airlineId}` },
    );
    expect((await screen.findAllByText('Air India')).length).toBeGreaterThan(0);
    expect(screen.getByText('India')).toBeInTheDocument();
  });
});
