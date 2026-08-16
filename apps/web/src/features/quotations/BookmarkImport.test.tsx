import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { LiveSearchBookmark } from '@interscale/shared';
import { QueryProvider } from '@/providers/QueryProvider';
import {
  BookmarkLoadField,
  flightBookmarkToDetails,
  hotelBookmarkToDetails,
} from '@/features/quotations/BookmarkImport';

const success = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ success: true, data }),
});

const notFound = () => ({
  ok: false,
  status: 404,
  statusText: 'Not Found',
  json: async () => ({
    success: false,
    data: null,
    error: { code: 'NOT_FOUND', message: 'Bookmark not found or you do not have access.' },
  }),
});

const flightBookmark = (overrides: Partial<LiveSearchBookmark> = {}): LiveSearchBookmark => ({
  id: 'bm-1',
  type: 'FLIGHT',
  provider: 'SEARCHAPI',
  fingerprint: 'fp-1',
  bookmarkCode: 'FLT-000456',
  title: 'DEL → SIN',
  currency: 'INR',
  searchParams: { departure_id: 'DEL', arrival_id: 'SIN', outbound_date: '2026-09-05', currency: 'INR' },
  createdAt: '2026-08-16T10:00:00.000Z',
  snapshot: {
    flight: {
      airline: 'Air India',
      flightNumbers: ['AI 2115'],
      price: 18777,
      currency: 'INR',
      type: 'One way',
      totalDuration: 355,
      segments: [
        {
          departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-05', time: '09:05' },
          arrival_airport: { name: 'Singapore', id: 'SIN', date: '2026-09-05', time: '17:45' },
          duration: 355,
          airplane: 'A321',
          airline: 'Air India',
          travel_class: 'Economy',
          flight_number: 'AI 2115',
        },
      ],
    },
  },
  ...overrides,
});

const hotelBookmark = (overrides: Partial<LiveSearchBookmark> = {}): LiveSearchBookmark => ({
  id: 'bm-2',
  type: 'HOTEL',
  provider: 'SEARCHAPI',
  fingerprint: 'fp-2',
  bookmarkCode: 'HTL-000123',
  title: 'Taj Exotica Goa',
  currency: 'INR',
  searchParams: {
    destination: 'Goa',
    check_in_date: '2026-09-05',
    check_out_date: '2026-09-07',
    rooms: 1,
    currency: 'INR',
  },
  createdAt: '2026-08-16T10:00:00.000Z',
  snapshot: {
    hotel: {
      name: 'Taj Exotica Goa',
      propertyType: 'hotel',
      city: 'Goa',
      country: 'IN',
      stars: 5,
      rating: 4.8,
      reviews: 3200,
      description: 'Luxury beach resort.',
      pricePerNight: { price: '₹14,578', extracted_price: 14578 },
      totalPrice: { price: '₹29,156', extracted_price: 29156 },
      checkInTime: '2:00 PM',
      checkOutTime: '11:00 AM',
      images: [
        { thumbnail: 'https://img/a.jpg', original: 'https://img/a-orig.jpg' },
        { thumbnail: 'https://img/b.jpg' },
      ],
    },
  },
  ...overrides,
});

describe('flightBookmarkToDetails', () => {
  it('copies airline, flight number, airports, times, price, currency and class', () => {
    const details = flightBookmarkToDetails(flightBookmark());

    expect(details.include).toBe(true);
    expect(details.entryMode).toBe('MANUAL');
    expect(details.journeyType).toBe('ONEWAY_OUTBOUND');
    expect(details.amount).toBe(18777);
    expect(details.outbound.fromCity).toBe('Delhi');
    expect(details.outbound.toCity).toBe('Singapore');
    expect(details.outbound.segments).toHaveLength(1);

    const segment = details.outbound.segments[0]!;
    expect(segment.airlineName).toBe('Air India');
    expect(segment.flightNumber).toBe('AI 2115');
    expect(segment.from).toBe('Delhi');
    expect(segment.to).toBe('Singapore');
    expect(segment.departureDate).toBe('2026-09-05');
    expect(segment.departureTime).toBe('09:05');
    expect(segment.arrivalDate).toBe('2026-09-05');
    expect(segment.arrivalTime).toBe('17:45');
    expect(segment.travelClass).toBe('Economy');
    // Preserves the segment's stored duration (355 min = 5h 55m).
    expect(segment.duration).toBe('5h 55m');
  });

  it('preserves every segment of a connecting flight', () => {
    const details = flightBookmarkToDetails(
      flightBookmark({
        snapshot: {
          flight: {
            airline: 'THAI',
            flightNumbers: ['TG 324', 'TG 401'],
            price: 29690,
            currency: 'INR',
            type: 'One way',
            segments: [
              {
                departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-05', time: '10:10' },
                arrival_airport: { name: 'Bangkok', id: 'BKK', date: '2026-09-05', time: '13:20' },
                duration: 190,
                airline: 'THAI',
                travel_class: 'Economy',
                flight_number: 'TG 324',
              },
              {
                departure_airport: { name: 'Bangkok', id: 'BKK', date: '2026-09-05', time: '15:00' },
                arrival_airport: { name: 'Singapore', id: 'SIN', date: '2026-09-05', time: '17:45' },
                duration: 165,
                airline: 'THAI',
                travel_class: 'Economy',
                flight_number: 'TG 401',
              },
            ],
          },
        },
      }),
    );

    expect(details.outbound.segments).toHaveLength(2);
    expect(details.outbound.segments[0]!.flightNumber).toBe('TG 324');
    expect(details.outbound.segments[1]!.flightNumber).toBe('TG 401');
    expect(details.outbound.fromCity).toBe('Delhi');
    expect(details.outbound.toCity).toBe('Singapore');
  });

  it('splits a round-trip bookmark into outbound and return journeys', () => {
    const details = flightBookmarkToDetails(
      flightBookmark({
        searchParams: { departure_id: 'DEL', arrival_id: 'SIN', outbound_date: '2026-09-05', return_date: '2026-09-12', type: 2, currency: 'INR' },
        snapshot: {
          flight: {
            airline: 'Air India',
            flightNumbers: ['AI 2118', 'AI 2119'],
            price: 59370,
            currency: 'INR',
            type: 'Round trip',
            segments: [
              {
                departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-05', time: '00:55' },
                arrival_airport: { name: 'Singapore', id: 'SIN', date: '2026-09-05', time: '09:20' },
                duration: 355,
                airline: 'Air India',
                travel_class: 'Economy',
                flight_number: 'AI 2118',
              },
              {
                departure_airport: { name: 'Singapore', id: 'SIN', date: '2026-09-12', time: '10:00' },
                arrival_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-12', time: '12:00' },
                duration: 120,
                airline: 'Air India',
                travel_class: 'Economy',
                flight_number: 'AI 2119',
              },
            ],
          },
        },
      }),
    );

    expect(details.journeyType).toBe('ROUND_TRIP');
    expect(details.outbound.segments).toHaveLength(1);
    expect(details.outbound.segments[0]!.flightNumber).toBe('AI 2118');
    expect(details.returnJourney.segments).toHaveLength(1);
    expect(details.returnJourney.segments[0]!.flightNumber).toBe('AI 2119');
    expect(details.outbound.toCity).toBe('Singapore');
    expect(details.returnJourney.fromCity).toBe('Singapore');
  });
});

describe('hotelBookmarkToDetails', () => {
  it('maps hotel name, city, dates, price, currency, nights and images', () => {
    const { hotelRow, hotelDetails, primaryImageUrl } = hotelBookmarkToDetails(hotelBookmark());

    expect(hotelRow.hotelName).toBe('Taj Exotica Goa');
    expect(hotelRow.city).toBe('Goa');
    expect(hotelRow.nights).toBe(2);
    expect(hotelRow.sellingPrice).toBe(29156);
    // Provider 12-hour times are normalised to the quotation's 24h HH:mm format.
    expect(hotelRow.checkInTime).toBe('14:00');
    expect(hotelRow.checkOutTime).toBe('11:00');
    expect(hotelRow.notes).toBe('Luxury beach resort.');
    expect(hotelDetails.amount).toBe(29156);
    // Images copied from the saved snapshot (no SearchAPI).
    expect(hotelDetails.images).toHaveLength(2);
    expect(hotelDetails.images![0]!.url).toBe('https://img/a-orig.jpg');
    expect(primaryImageUrl).toBe('https://img/a-orig.jpg');
  });

  it('falls back to per-night price when no total price is saved', () => {
    const { hotelRow, hotelDetails } = hotelBookmarkToDetails(
      hotelBookmark({
        snapshot: {
          hotel: {
            name: 'Taj Exotica Goa',
            city: 'Goa',
            pricePerNight: { price: '₹14,578', extracted_price: 14578 },
            images: [],
          },
        },
      }),
    );
    expect(hotelRow.sellingPrice).toBe(14578);
    expect(hotelDetails.amount).toBe(14578);
  });
});

describe('BookmarkLoadField', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function renderField(type: 'FLIGHT' | 'HOTEL', onLoaded = vi.fn()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    const utils = render(
      <QueryProvider client={client}>
        <BookmarkLoadField
          type={type}
          placeholder={type === 'FLIGHT' ? 'FLT-000456' : 'HTL-000123'}
          onLoaded={onLoaded}
        />
      </QueryProvider>,
    );
    return { user, onLoaded, ...utils };
  }

  function stubBookmarkLookup(body: ReturnType<typeof success> | ReturnType<typeof notFound>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/search/bookmarks/by-code/')) return body;
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, data: {} }) };
      }),
    );
  }

  it('loads a valid hotel bookmark and calls onLoaded once', async () => {
    const { user, onLoaded } = renderField('HOTEL');
    stubBookmarkLookup(success(hotelBookmark()));

    await user.type(screen.getByLabelText('Bookmark ID'), 'HTL-000123');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onLoaded).toHaveBeenCalledTimes(1);
      expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ bookmarkCode: 'HTL-000123' }));
    });
    expect(await screen.findByText('✓ Loaded from HTL-000123')).toBeInTheDocument();
  });

  it('rejects a flight bookmark in the hotel section with a clear message', async () => {
    const { user, onLoaded } = renderField('HOTEL');
    stubBookmarkLookup(success(flightBookmark()));

    await user.type(screen.getByLabelText('Bookmark ID'), 'FLT-000456');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onLoaded).not.toHaveBeenCalled();
      expect(screen.getByText('This is a flight bookmark. Enter a hotel bookmark ID.')).toBeInTheDocument();
    });
  });

  it('rejects a hotel bookmark in the flight section with a clear message', async () => {
    const { user, onLoaded } = renderField('FLIGHT');
    stubBookmarkLookup(success(hotelBookmark()));

    await user.type(screen.getByLabelText('Bookmark ID'), 'HTL-000123');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onLoaded).not.toHaveBeenCalled();
      expect(screen.getByText('This is a hotel bookmark. Enter a flight bookmark ID.')).toBeInTheDocument();
    });
  });

  it('shows not-found for an unknown bookmark ID', async () => {
    const { user, onLoaded } = renderField('HOTEL');
    stubBookmarkLookup(notFound());

    await user.type(screen.getByLabelText('Bookmark ID'), 'HTL-999999');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onLoaded).not.toHaveBeenCalled();
      expect(screen.getByText('Bookmark not found or you do not have access.')).toBeInTheDocument();
    });
  });

  it('rejects a malformed ID without making a request', async () => {
    const fetchSpy = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, data: {} }),
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const { user, onLoaded } = renderField('HOTEL');

    await user.type(screen.getByLabelText('Bookmark ID'), 'not-a-code');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    expect(
      await screen.findByText('Enter a valid bookmark ID (e.g. HTL-000123 or FLT-000456).'),
    ).toBeInTheDocument();
    expect(onLoaded).not.toHaveBeenCalled();
    // No by-code lookup request was made for a malformed ID.
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/by-code/'))).toBe(false);
  });
});
