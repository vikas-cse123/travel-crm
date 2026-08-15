import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/providers/QueryProvider';
import { TravelSearchPage } from './TravelSearchPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryProvider client={client}>
        <TravelSearchPage />
      </QueryProvider>,
    ),
  };
}

const success = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ success: true, data }),
});

const flightResponse = {
  search_metadata: { id: 'f1' },
  search_parameters: { engine: 'google_flights' },
  best_flights: [
    {
      flights: [
        {
          departure_airport: { name: 'Lucknow', id: 'LKO', date: '2026-09-15', time: '09:00' },
          arrival_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-15', time: '10:00' },
          duration: 60,
          airplane: 'A320',
          airline: 'IndiGo',
          flight_number: '6E 101',
          travel_class: 'Economy',
        },
      ],
      layovers: [],
      total_duration: 60,
      price: 4850,
      type: 'One way',
    },
  ],
  other_flights: [],
  price_insights: { lowest_price: 4850, price_level: 'low' },
};

function hotelProperty(overrides: Record<string, unknown> = {}, index = 0) {
  const name = (overrides.name as string | undefined) ?? `Hotel ${index}`;
  return {
    type: 'hotel',
    property_token: `token-${index}`,
    name,
    description: 'A nice place to stay.',
    city: 'Lucknow',
    country: 'IN',
    check_in_time: '2:00 PM',
    check_out_time: '11:00 AM',
    price_per_night: { price: '₹4,883', extracted_price: 4883 },
    total_price: { price: '₹9,765', extracted_price: 9765 },
    extracted_hotel_class: 4,
    rating: 4.5,
    reviews: 1200,
    amenities: ['Free Wi-Fi', 'Pool', 'Parking'],
    link: `https://example.com/hotel-${index}`,
    images: [
      { thumbnail: `https://img.example.com/hotel-${index}-a.jpg`, original: `https://img.example.com/hotel-${index}-a-orig.jpg` },
      { thumbnail: `https://img.example.com/hotel-${index}-b.jpg`, original: `https://img.example.com/hotel-${index}-b-orig.jpg` },
    ],
    ...overrides,
  };
}

function hotelResponse(count = 25, propertyOverrides: Record<string, unknown> = {}, pagination: Record<string, unknown> = {}) {
  return {
    search_metadata: { id: 'h1' },
    search_parameters: { engine: 'google_hotels' },
    search_information: { total_results: count * 10 },
    properties: Array.from({ length: count }, (_, i) =>
      hotelProperty({ ...propertyOverrides }, i),
    ),
    pagination,
  };
}

const autoSuggestions = (title: string) => ({
  suggestions: [
    { type: 'airport', kgmid: '/m/example', title, subtitle: 'City in India' },
  ],
});

/**
 * Track every URL the page fetches.
 *
 * Handlers are matched by URL substring, first match wins — so token-specific
 * keys must be registered before the generic `/search/hotels?` key.
 */
function stubFetch(handlers: Record<string, ReturnType<typeof success>>, calls: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      const match = Object.entries(handlers).find(([path]) => url.includes(path));
      if (!match) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, data: {} }) };
      }
      return match[1];
    }),
  );
}

/** Count hotel SEARCH calls, excluding autocomplete requests. */
function hotelSearchCalls(calls: string[]): number {
  return calls.filter((url) => url.includes('/search/hotels?')).length;
}

async function runHotelSearch(
  user: ReturnType<typeof userEvent.setup>,
  destination: string,
) {
  await user.click(screen.getByRole('tab', { name: 'Hotels' }));
  const dest = screen.getByLabelText('Destination');
  await user.clear(dest);
  await user.type(dest, destination);
  await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
  await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
  await user.click(screen.getByRole('button', { name: 'Search hotels' }));
  await waitFor(() => {
    expect(screen.getByText('Hotel 0')).toBeInTheDocument();
  });
}

describe('TravelSearchPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Flights as the default tab with INR as the default currency', () => {
    const calls: string[] = [];
    stubFetch({}, calls);
    renderPage();

    const flightsTab = screen.getByRole('tab', { name: 'Flights' });
    expect(flightsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Hotels' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByLabelText('Currency')).toHaveValue('INR');
  });

  it('preserves the selected currency across tabs', async () => {
    const { user } = renderPage();
    stubFetch({}, []);

    await user.selectOptions(screen.getByLabelText('Currency'), 'USD');
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
  });

  it('renders flight search results', async () => {
    const calls: string[] = [];
    stubFetch(
      { '/api/search/flights': success(flightResponse) },
      calls,
    );
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'DEL');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/₹4,850/).length).toBeGreaterThan(0);
  });

  it('renders hotel search results', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(3)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.getByText('Hotel 1')).toBeInTheDocument();
  });

  it('shows the destination summary and room/adult counts for hotels', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.getAllByText('Lucknow').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 room/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Image carousel
  // -------------------------------------------------------------------------

  it('falls back to the thumbnail when the original fails', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    // Original is preferred, so the first image shown is the original.
    const img = screen.getByAltText('Hotel 0') as HTMLImageElement;
    expect(img.src).toContain('hotel-0-a-orig.jpg');
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();

    // Original fails -> fall back to the thumbnail of the same image.
    fireEventError(img);
    await waitFor(() => {
      const current = screen.getByAltText('Hotel 0') as HTMLImageElement;
      expect(current.src).toContain('hotel-0-a.jpg');
    });
  });

  it('advances to the next image after all candidates of the current one fail', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    let img = screen.getByAltText('Hotel 0') as HTMLImageElement;
    expect(img.src).toContain('hotel-0-a-orig.jpg');
    // Original fails -> thumbnail.
    fireEventError(img);
    await waitFor(() => {
      img = screen.getByAltText('Hotel 0') as HTMLImageElement;
      expect(img.src).toContain('hotel-0-a.jpg');
    });
    // Thumbnail also fails -> next image.
    fireEventError(img);
    await waitFor(() => {
      const current = screen.getByAltText('Hotel 0') as HTMLImageElement;
      expect(current.src).toContain('hotel-0-b-orig.jpg');
    });
  });

  it('navigates multiple property images without another SearchAPI request', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(hotelSearchCalls(calls)).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Next image' }));
    await user.click(screen.getByRole('button', { name: 'Previous image' }));
    await user.click(screen.getByRole('button', { name: 'Image 1' }));

    expect(hotelSearchCalls(calls)).toBe(1);
  });

  it('hides image navigation when there is a single image', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(
          hotelResponse(1, {
            images: [{ thumbnail: 'https://img.example.com/single.jpg' }],
          }),
        ),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous image' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Hotel token pagination
  // -------------------------------------------------------------------------

  it('stores the next page token from the first request', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText(/properties loaded/)).toBeInTheDocument();
    // A valid next_page_token exists -> Next is shown.
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('Next uses the next_page_token and caches the new page', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        'next_page_token=TOKEN1': success(
          hotelResponse(20, { name: 'Page2Hotel' }, { next_page_token: 'TOKEN2' }),
        ),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(hotelSearchCalls(calls)).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(2);

    const page2Request = calls.find((url) => url.includes('next_page_token=TOKEN1'));
    expect(page2Request).toBeTruthy();
  });

  it('Previous returns to page 1 from cache with zero new requests', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        'next_page_token=TOKEN1': success(
          hotelResponse(20, { name: 'Page2Hotel' }, { next_page_token: 'TOKEN2' }),
        ),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    // Page 1 + Page 2 = exactly two provider requests.
    const callsAfterPage2 = hotelSearchCalls(calls);
    expect(callsAfterPage2).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(callsAfterPage2);

    // And Next again uses the cached page 2 -> zero new requests.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(callsAfterPage2);
  });

  it('revisiting an already-loaded page makes zero provider requests', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        'next_page_token=TOKEN1': success(
          hotelResponse(20, { name: 'Page2Hotel' }, { next_page_token: 'TOKEN2' }),
        ),
        'next_page_token=TOKEN2': success(
          hotelResponse(20, { name: 'Page3Hotel' }, {}),
        ),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page3Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(3);

    // Back to page 2, then to page 3 again: zero requests.
    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole('button', { name: '3' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page3Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(3);
  });

  it('does not show a Next button when no next_page_token exists', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(3)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('distinguishes loaded properties from provider total', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success({
          ...hotelResponse(3),
          search_information: { total_results: 1427 },
        }),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/properties loaded/)).toBeInTheDocument();
    expect(screen.getByText(/1,427 available from provider/)).toBeInTheDocument();
  });

  it('does not claim provider total as locally available', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success({
          ...hotelResponse(20),
          search_information: { total_results: 3582 },
        }),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText(/properties loaded/)).toBeInTheDocument();
    expect(screen.getByText(/3,582 available from provider/)).toBeInTheDocument();
  });

  it('makes a new API request when search parameters change', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(2)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    expect(hotelSearchCalls(calls)).toBe(1);

    // Change destination and search again.
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest);
    await user.type(dest, 'Goa');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Hotel View details
  // -------------------------------------------------------------------------

  it('opening hotel details does not call SearchAPI again', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(
          hotelResponse(1, {
            gps_coordinates: { latitude: 26.84, longitude: 80.94 },
            nearby_places: [{ name: 'Hazratganj', transportations: [] }],
          }),
        ),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    await user.click(screen.getByRole('button', { name: 'View details' }));
    await waitFor(() => {
      expect(screen.getByText('Hazratganj')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);

    await user.click(screen.getByRole('button', { name: 'View less' }));
    await waitFor(() => {
      expect(screen.queryByText('Hazratganj')).not.toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Flight card expand / collapse
  // -------------------------------------------------------------------------

  const roundTripFlightResponse = {
    search_metadata: { id: 'f2' },
    search_parameters: { engine: 'google_flights', departure_id: 'DEL', arrival_id: 'SIN' },
    best_flights: [
      {
        flights: [
          {
            departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-11-14', time: '00:55' },
            arrival_airport: { name: 'Singapore', id: 'SIN', date: '2026-11-14', time: '09:20' },
            duration: 355,
            airplane: 'A321',
            airline: 'Air India',
            flight_number: 'AI 2118',
            travel_class: 'Economy',
          },
        ],
        layovers: [],
        total_duration: 355,
        price: 98576,
        type: 'Round trip',
      },
      {
        flights: [
          {
            departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-11-14', time: '13:25' },
            arrival_airport: { name: 'Singapore', id: 'SIN', date: '2026-11-14', time: '21:55' },
            duration: 360,
            airplane: 'A321',
            airline: 'Air India',
            flight_number: 'AI 2382',
            travel_class: 'Economy',
          },
        ],
        layovers: [],
        total_duration: 360,
        price: 98576,
        type: 'Round trip',
      },
    ],
    other_flights: [],
    price_insights: { lowest_price: 97592, price_level: 'high' },
  };

  async function runFlightSearch(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-11-14');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2118')).toBeInTheDocument();
    });
  }

  it('flight cards are collapsed by default and details are hidden', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    expect(screen.getAllByText('Air India · AI 2118').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Air India · AI 2382').length).toBeGreaterThan(0);
    expect(screen.queryByText('A321')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View details' }).length).toBe(2);
  });

  it('expanding one flight does not expand every result', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    const detailButtons = screen.getAllByRole('button', { name: 'View details' });
    await user.click(detailButtons[0]!);

    expect(screen.getByText('A321')).toBeInTheDocument();
    expect(screen.getByText('Outbound')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View details' }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: 'View less' }).length).toBe(1);
  });

  it('expanding a flight card does not call SearchAPI again', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    const before = calls.filter((url) => url.includes('/api/search/flights')).length;
    await user.click(screen.getAllByRole("button", { name: "View details" })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Outbound')).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole("button", { name: "View less" })[0]!);
    await waitFor(() => {
      expect(screen.queryByText('Outbound')).not.toBeInTheDocument();
    });

    const after = calls.filter((url) => url.includes('/api/search/flights')).length;
    expect(after).toBe(before);
  });

  it('round trip flight details show the outbound leg and a return note', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    await user.click(screen.getAllByRole("button", { name: "View details" })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Outbound')).toBeInTheDocument();
    });
    expect(screen.getByText('Return')).toBeInTheDocument();
    expect(screen.getByText('00:55')).toBeInTheDocument();
    expect(screen.getByText('09:20')).toBeInTheDocument();
    expect(screen.getByText(/Return flight included in this round-trip fare/)).toBeInTheDocument();
  });

  it('flight collapse hides details again', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    await user.click(screen.getAllByRole("button", { name: "View details" })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Outbound')).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole("button", { name: "View less" })[0]!);
    await waitFor(() => {
      expect(screen.queryByText('Outbound')).not.toBeInTheDocument();
      expect(screen.queryByText('A321')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Dev raw response accordions
  // -------------------------------------------------------------------------

  it('Full flight API response opens and closes in development', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    const toggle = screen.getByRole('button', { name: /Full flight API response/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"best_flights"/)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('Full hotel API response opens and closes in development', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    const toggle = screen.getByRole('button', { name: /Full hotel API response/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/"properties"/)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening the dev raw response does not make another SearchAPI request', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    const before = hotelSearchCalls(calls);

    await user.click(screen.getByRole('button', { name: /Full hotel API response/ }));
    await user.click(screen.getByRole('button', { name: /Full hotel API response/ }));

    expect(hotelSearchCalls(calls)).toBe(before);
  });

  it('shows the result summary line for flights', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    expect(screen.getByText('DEL → SIN')).toBeInTheDocument();
    expect(screen.getByText(/adult/)).toBeInTheDocument();
  });
});

/** jsdom lacks ErrorEvent helpers for img onError; fire the native event. */
function fireEventError(element: Element) {
  element.dispatchEvent(new Event('error', { bubbles: true, cancelable: true }));
}
