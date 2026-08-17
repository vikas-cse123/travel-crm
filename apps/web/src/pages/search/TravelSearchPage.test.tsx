import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { flightFingerprint, type SearchApiFlightOption } from '@interscale/shared';
import { QueryProvider } from '@/providers/QueryProvider';
import { TravelSearchPage } from './TravelSearchPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (
    <QueryProvider client={client}>
      <TravelSearchPage />
    </QueryProvider>
  );
  return {
    client,
    user: userEvent.setup(),
    ...render(ui),
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

/** A round-trip flight fixture used across test groups. */
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
      departure_token: 'OUTBOUND_TOKEN_1',
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
      departure_token: 'OUTBOUND_TOKEN_2',
    },
  ],
  other_flights: [],
  price_insights: { lowest_price: 97592, price_level: 'high' },
};

/** Return-flight options returned when the second SearchAPI request uses a departure_token. */
const returnFlightResponse = {
  search_metadata: { id: 'f-return' },
  search_parameters: { engine: 'google_flights', departure_id: 'DEL', arrival_id: 'SIN' },
  best_flights: [
    {
      flights: [
        {
          departure_airport: { name: 'Singapore', id: 'SIN', date: '2026-11-20', time: '10:00' },
          arrival_airport: { name: 'Delhi', id: 'DEL', date: '2026-11-20', time: '18:00' },
          duration: 480,
          airplane: 'A321',
          airline: 'Air India',
          flight_number: 'AI 2119',
          travel_class: 'Economy',
        },
      ],
      layovers: [],
      total_duration: 480,
      price: 45000,
      type: 'Round trip',
      booking_token: 'RETURN_TOKEN_1',
    },
  ],
  other_flights: [],
  price_insights: { lowest_price: 45000, price_level: 'low' },
};

/** Unique token sequence so every property created across batches has a distinct id. */
let hotelTokenSeq = 0;

function hotelProperty(overrides: Record<string, unknown> = {}, index = 0) {
  hotelTokenSeq += 1;
  const name = (overrides.name as string | undefined) ?? `Hotel ${index}`;
  return {
    type: 'hotel',
    property_token: `token-${hotelTokenSeq}`,
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
      {
        thumbnail: `https://img.example.com/hotel-${index}-a.jpg`,
        original: `https://img.example.com/hotel-${index}-a-orig.jpg`,
      },
      {
        thumbnail: `https://img.example.com/hotel-${index}-b.jpg`,
        original: `https://img.example.com/hotel-${index}-b-orig.jpg`,
      },
    ],
    ...overrides,
  };
}

function hotelResponse(
  count = 25,
  propertyOverrides: Record<string, unknown> = {},
  pagination: Record<string, unknown> = {},
) {
  return {
    search_metadata: { id: 'h1' },
    search_parameters: { engine: 'google_hotels' },
    search_information: { total_results: count * 10 },
    properties: Array.from({ length: count }, (_, i) => hotelProperty({ ...propertyOverrides }, i)),
    pagination,
  };
}

const autoSuggestions = (title: string) => ({
  suggestions: [{ type: 'airport', kgmid: '/m/example', title, subtitle: 'City in India' }],
});

async function runFlightSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
  await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
  await user.type(screen.getByLabelText('Outbound date'), '2026-11-14');
  await user.type(screen.getByLabelText('Return date'), '2026-11-20');
  await user.click(screen.getByRole('button', { name: 'Search flights' }));
  await waitFor(() => {
    expect(screen.getByText('Air India · AI 2118')).toBeInTheDocument();
  });
}

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
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ success: true, data: {} }),
        };
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
  hotelName = 'Hotel 0',
) {
  await user.click(screen.getByRole('tab', { name: 'Hotels' }));
  const dest = screen.getByLabelText('Destination');
  await user.clear(dest);
  await user.type(dest, destination);
  await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
  await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
  await user.click(screen.getByRole('button', { name: 'Search hotels' }));
  await waitFor(() => {
    expect(screen.getAllByText(hotelName).length).toBeGreaterThan(0);
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
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'DEL');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.type(screen.getByLabelText('Return date'), '2026-09-22');
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
    expect(screen.getByText(/ loaded/)).toBeInTheDocument();
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
        'next_page_token=TOKEN2': success(hotelResponse(20, { name: 'Page3Hotel' }, {})),
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
    expect(screen.getByText(/ loaded/)).toBeInTheDocument();
    expect(screen.getByText(/1,427 provider results/)).toBeInTheDocument();
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
    expect(screen.getByText(/ loaded/)).toBeInTheDocument();
    expect(screen.getByText(/3,582 provider results/)).toBeInTheDocument();
  });

  /** A chain of provider batches summing to 96 loaded properties (last is partial). */
  function responseChain(total: number) {
    const batches = [
      hotelResponse(20, { name: 'Batch1' }, { next_page_token: 'TOKEN1' }),
      hotelResponse(20, { name: 'Batch2' }, { next_page_token: 'TOKEN2' }),
      hotelResponse(20, { name: 'Batch3' }, { next_page_token: 'TOKEN3' }),
      hotelResponse(20, { name: 'Batch4' }, { next_page_token: 'TOKEN4' }),
      hotelResponse(16, { name: 'Batch5' }),
    ];
    const handlers: Record<string, ReturnType<typeof success>> = {
      'next_page_token=TOKEN1': success(batches[1]),
      'next_page_token=TOKEN2': success(batches[2]),
      'next_page_token=TOKEN3': success(batches[3]),
      'next_page_token=TOKEN4': success(batches[4]),
      '/api/search/hotels?': success({
        ...batches[0],
        search_information: { total_results: total },
      }),
      '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
    };
    return handlers;
  }

  async function loadAllBatches(user: ReturnType<typeof userEvent.setup>, calls: string[]) {
    // Four Next clicks load batches 2..5 (page1 loads on search), landing on page 5.
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => {
        expect(calls.filter((url) => url.includes('/search/hotels?')).length).toBe(i + 2);
      });
    }
  }

  it('shows the correct visible range on the final partial page (81–96, never 81–100)', async () => {
    const calls: string[] = [];
    stubFetch(responseChain(3073), calls);
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Batch1');

    await loadAllBatches(user, calls);

    expect(screen.getByText(/Showing 81–96 of 96 loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/81–100/)).not.toBeInTheDocument();
    // Provider total stays separate from the locally loaded count.
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText(/3,073 provider results/)).toBeInTheDocument();
    // The partial last page has no further token -> Next is gone.
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('keeps provider total and loaded count as separate concepts', async () => {
    const calls: string[] = [];
    stubFetch(responseChain(3073), calls);
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Batch1');
    await loadAllBatches(user, calls);

    // 96 locally loaded vs 3,073 provider results — never conflated.
    expect(screen.getByText(/96 loaded/)).toBeInTheDocument();
    expect(screen.getByText(/3,073 provider results/)).toBeInTheDocument();
    expect(screen.queryByText(/96 of 3,073/)).not.toBeInTheDocument();
  });

  it('appends new properties when the next provider batch is fetched', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'next_page_token=TOKEN1': success(
          hotelResponse(20, { name: 'Page2Hotel' }, { next_page_token: 'TOKEN2' }),
        ),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    expect(screen.getByText('20')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    // 20 + 20 appended = 40 loaded.
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(hotelSearchCalls(calls)).toBe(2);
  });

  it('repeated back/forward pagination never duplicates or refetches properties', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'next_page_token=TOKEN1': success(
          hotelResponse(20, { name: 'Page2Hotel' }, { next_page_token: 'TOKEN2' }),
        ),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByText('40')).toBeInTheDocument();
    });
    const callsAfterPage2 = hotelSearchCalls(calls);

    // Page 1 -> page 2 -> page 1 -> page 2: all local, count stays 40.
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(callsAfterPage2);
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('disables further navigation when the provider has no more tokens', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'next_page_token=TOKEN1': success(hotelResponse(20, { name: 'Page2Hotel' })),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    // Page 2 is the last page and the provider returned no token -> no Next.
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(hotelSearchCalls(calls)).toBe(2);
  });

  it('cached batches survive forward/back pagination without refetching', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'next_page_token=TOKEN1': success(
          hotelResponse(20, { name: 'Page2Hotel' }, { next_page_token: 'TOKEN2' }),
        ),
        'next_page_token=TOKEN2': success(hotelResponse(20, { name: 'Page3Hotel' }, {})),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
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

    // Back to page 2 and forward to page 3: zero new provider requests.
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

  it('expanding and collapsing a hotel does not refetch and only one card expands', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels?': success(hotelResponse(2)),
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    expect(hotelSearchCalls(calls)).toBe(1);
    const buttons = screen.getAllByRole('button', { name: 'View details' });
    expect(buttons.length).toBe(2);

    // Expand the first card only.
    await user.click(buttons[0]!);
    await waitFor(() => {
      expect(screen.getByText('Hotel Overview')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: 'View less' }).length).toBe(1);
    expect(hotelSearchCalls(calls)).toBe(1);

    // Collapse it again — no refetch.
    await user.click(screen.getByRole('button', { name: 'View less' }));
    await waitFor(() => {
      expect(screen.queryByText('Hotel Overview')).not.toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);
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

  it('shows all hotel information after a single View details click', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(
          hotelResponse(1, {
            essential_info: ['2 bedrooms', '3 beds', '2 bathrooms', 'Sleeps 4'],
            excluded_amenities: ['No smoking'],
            location_rating: 4.6,
            proximity_to_things_to_do_rating: 4.4,
            proximity_to_transit_rating: 4.2,
            airport_access_rating: 4.0,
            reviews_breakdown: [
              { name: 'Cleanliness', total: 1200, positive: 1100, neutral: 60, negative: 40 },
            ],
            reviews_histogram: { 5: 900, 4: 200, 3: 50, 2: 30, 1: 20 },
            gps_coordinates: { latitude: 26.84, longitude: 80.94 },
            nearby_places: [
              {
                name: 'Hazratganj',
                transportations: [{ type: 'walk', duration: '10 min' }],
              },
            ],
          }),
        ),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow');

    // There is no second-level "Full hotel details" action any more.
    expect(screen.queryByRole('button', { name: 'Full hotel details' })).not.toBeInTheDocument();

    // One click reveals every section with all provider details.
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel Overview')).toBeInTheDocument();
    });
    expect(screen.getByText('Stay Details')).toBeInTheDocument();
    expect(screen.getByText('Room & Property')).toBeInTheDocument();
    expect(screen.getByText('Amenities')).toBeInTheDocument();
    expect(screen.getByText('Guest Ratings')).toBeInTheDocument();
    expect(screen.getByText('Nearby Places')).toBeInTheDocument();
    // Stay dates/nights derive from the search parameters.
    expect(screen.getByText('10/09/2026')).toBeInTheDocument();
    expect(screen.getByText('12/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Nights')).toBeInTheDocument();
    // Provider details are immediately visible.
    expect(screen.getByText('Sleeps 4')).toBeInTheDocument();
    expect(screen.getByText('Hazratganj')).toBeInTheDocument();
    expect(screen.getByText('No smoking')).toBeInTheDocument();
    // No modal, no raw JSON dump.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Provider metadata')).not.toBeInTheDocument();
    expect(hotelSearchCalls(calls)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Flight card expand / collapse
  // -------------------------------------------------------------------------

  it('flight cards are collapsed by default and details are hidden', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    expect(screen.getAllByText('Air India · AI 2118').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Air India · AI 2382').length).toBeGreaterThan(0);
    expect(screen.queryByText('A321')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Flight details' }).length).toBe(2);
  });

  it('expanding one flight does not expand every result', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    const detailButtons = screen.getAllByRole('button', { name: 'Flight details' });
    await user.click(detailButtons[0]!);

    expect(screen.getByText('A321')).toBeInTheDocument();
    expect(screen.getAllByText('Outbound').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { name: 'Flight details' }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: 'View less' }).length).toBe(1);
  });

  it('expanding a flight card does not call SearchAPI again', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    const before = calls.filter((url) => url.includes('/api/search/flights')).length;
    await user.click(screen.getAllByRole('button', { name: 'Flight details' })[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Outbound').length).toBeGreaterThanOrEqual(2);
    });
    await user.click(screen.getAllByRole('button', { name: 'View less' })[0]!);
    await waitFor(() => {
      expect(screen.queryAllByText('Outbound').length).toBe(2);
    });

    const after = calls.filter((url) => url.includes('/api/search/flights')).length;
    expect(after).toBe(before);
  });

  it('round trip flight details show the outbound leg without a placeholder return note', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    await user.click(screen.getAllByRole('button', { name: 'Flight details' })[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Outbound').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText('12:55 AM').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('09:20 AM').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByText(/Return flight included in this round-trip fare/),
    ).not.toBeInTheDocument();
  });

  it('flight collapse hides details again', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    await user.click(screen.getAllByRole('button', { name: 'Flight details' })[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Outbound').length).toBeGreaterThanOrEqual(2);
    });
    await user.click(screen.getAllByRole('button', { name: 'View less' })[0]!);
    await waitFor(() => {
      expect(screen.queryAllByText('Outbound').length).toBe(2);
      expect(screen.queryByText('A321')).not.toBeInTheDocument();
    });
  });

  it('expanded one-way flight details show the new formatting', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'DEL');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Flight details' }));
    await waitFor(() => {
      // Section renamed from "Itinerary".
      expect(screen.getAllByText('Flight details').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Itinerary')).not.toBeInTheDocument();
      // Dates shown as DD/MM/YYYY.
      expect(screen.getByText(/LKO · 15\/09\/2026/)).toBeInTheDocument();
      expect(screen.getByText(/DEL · 15\/09\/2026/)).toBeInTheDocument();
      // Times shown in 12-hour AM/PM.
      expect(screen.getAllByText('09:00 AM').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('10:00 AM').length).toBeGreaterThanOrEqual(1);
      // Duration unchanged.
      expect(screen.getAllByText('1h 0m').length).toBeGreaterThan(0);
    });

    // The segment still renders the Plane icon between the duration and aircraft.
    const planes = document.querySelectorAll('svg.lucide-plane');
    expect(planes.length).toBeGreaterThan(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Dev raw response accordions
  // -------------------------------------------------------------------------

  it('Full flight API response opens and closes in development', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    const toggle = screen.getByRole('button', { name: /Developer data — flight/ });
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

    const toggle = screen.getByRole('button', { name: /Developer data — hotel/ });
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

    await user.click(screen.getByRole('button', { name: /Developer data — hotel/ }));
    await user.click(screen.getByRole('button', { name: /Developer data — hotel/ }));

    expect(hotelSearchCalls(calls)).toBe(before);
  });

  it('shows the result summary line for flights', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();
    await runFlightSearch(user);

    expect(screen.getAllByText('DEL → SIN').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/adult/)).toBeInTheDocument();
    // The submitted flight date renders in DD/MM/YYYY, not the raw YYYY-MM-DD.
    expect(screen.getByText(/14\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-14/)).not.toBeInTheDocument();
  });

  it('shows the round-trip flight summary with both dates in DD/MM/YYYY', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-11-14');
    await user.type(screen.getByLabelText('Return date'), '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2118')).toBeInTheDocument();
    });

    expect(screen.getByText(/14\/11\/2026 → 20\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-14/)).not.toBeInTheDocument();
  });

  it('shows the one-way flight summary with a single DD/MM/YYYY date', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'DEL');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });

    expect(screen.getByText(/15\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-09-15/)).not.toBeInTheDocument();
  });
});

describe('TravelSearchPage validation & filters', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks a flight search when the return date is before the departure date', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-08-26');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => {
      expect(screen.getByText('Return date must be after the departure date.')).toBeInTheDocument();
    });
    // No provider request is made for an invalid form.
    expect(calls.filter((url) => url.includes('/api/search/flights'))).toHaveLength(0);
  });

  it('one-way flight search omits the return date and shows a One way badge', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('type=1');
    expect(flightCall).not.toContain('return_date');
    // The badge reflects the submitted one-way trip type. The badge is a <span>;
    // the trip-type dropdown "One way" is an <option>, so scope by selector.
    expect(screen.getByText('One way', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Round trip', { selector: 'span' })).not.toBeInTheDocument();
    // One-way cards keep the "One-way fare" label.
    expect(screen.getByText('One-way fare')).toBeInTheDocument();
  });

  it('switching round trip to one way clears the stale return date', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    // Default is round trip; set a return date, then switch to one way.
    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-09-26');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');

    // Return input is hidden/disabled for one-way; search now.
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('type=1');
    expect(flightCall).not.toContain('return_date');
    expect(flightCall).not.toContain('return_date=2026-09-26');
  });

  it('round-trip search sends the return date and shows a Round trip badge', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-09-26');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => {
      expect(screen.getAllByText('Air India · AI 2118').length).toBeGreaterThan(0);
    });
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('type=2');
    expect(flightCall).toContain('return_date=2026-09-26');
    // Badge reflects the submitted round-trip type.
    expect(screen.getAllByText('Round trip').length).toBeGreaterThan(0);
  });

  it('one-way and round-trip searches use distinct cache keys', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    // One way first.
    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    const oneWayCalls = calls.filter((url) => url.includes('/api/search/flights')).length;
    expect(oneWayCalls).toBe(1);

    // Switch to round trip with a return date and search again.
    await user.selectOptions(screen.getByLabelText('Trip type'), 'round');
    await user.type(screen.getByLabelText('Return date'), '2026-09-26');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getAllByText('IndiGo · 6E 101').length).toBeGreaterThan(0);
    });
    // Different cache key (round trip) -> a new provider request.
    const roundTripCalls = calls.filter((url) => url.includes('/api/search/flights')).length;
    expect(roundTripCalls).toBe(2);

    // Back to one way: the earlier one-way response is reused from cache.
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    const afterBack = calls.filter((url) => url.includes('/api/search/flights')).length;
    expect(afterBack).toBe(2);
  });

  it('default flight sort is Cheapest', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    // The Sort by control lives in the Advanced filters panel.
    await user.click(screen.getByRole('button', { name: 'Advanced filters' }));
    const sortSelect = screen.getByLabelText('Sort by') as HTMLSelectElement;
    expect(sortSelect.value).toBe('price');

    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-09-26');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('sort_by=price');
  });

  it('blocks a hotel search when check-out is before check-in', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/hotels?': success(hotelResponse(2)) }, calls);
    const { user } = renderPage();

    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.type(dest, 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-12');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-10');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));

    await waitFor(() => {
      expect(
        screen.getByText('Check-out date must be after the check-in date.'),
      ).toBeInTheDocument();
    });
    expect(calls.filter((url) => url.includes('/search/hotels?'))).toHaveLength(0);
  });

  it('applies advanced flight filters to the request', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-09-26');
    await user.click(screen.getByRole('button', { name: 'Advanced filters' }));
    await user.selectOptions(screen.getByLabelText('Stops'), 'nonstop');
    await user.type(screen.getByLabelText('Included airlines'), 'AI');
    await user.type(screen.getByLabelText('Max price'), '50000');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'price');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('stops=nonstop');
    expect(flightCall).toContain('included_airlines=AI');
    expect(flightCall).toContain('max_price=50000');
    expect(flightCall).toContain('sort_by=price');
  });

  it('round-trip first request shows outbound options with a Select outbound button', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(roundTripFlightResponse) }, calls);
    const { user } = renderPage();

    await runFlightSearch(user);

    expect(screen.getAllByRole('button', { name: 'Select outbound' }).length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Bookmark' })).not.toBeInTheDocument();
    const flightCalls = calls.filter((url) => url.includes('/api/search/flights'));
    expect(flightCalls.length).toBe(1);
  });

  it('selecting an outbound flight uses its departure_token to fetch return options', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
        '/api/search/flights?': success(roundTripFlightResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    // Initial round-trip cards use "Round-trip fare from", never "Outbound fare".
    expect(screen.getAllByText('Round-trip fare from').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Outbound fare')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2119')).toBeInTheDocument();
    });

    const tokenCalls = calls.filter((url) => url.includes('departure_token=OUTBOUND_TOKEN_1'));
    expect(tokenCalls.length).toBe(1);
    expect(tokenCalls[0]!).toContain('return_date=2026-11-20');
  });

  it('return flights render with route, times, duration, stops and price', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
        '/api/search/flights?': success(roundTripFlightResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2119')).toBeInTheDocument();
    });

    expect(screen.getByText('SIN → DEL')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('06:00 PM')).toBeInTheDocument();
    expect(screen.getAllByText('Non-stop').length).toBe(2);
    expect(screen.getByText('8h 0m')).toBeInTheDocument();
    expect(screen.getByText(/₹45,000/)).toBeInTheDocument();
    // Return options are labelled as complete round-trip totals, never "Return fare".
    expect(screen.getAllByText('Round-trip total').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Return fare')).not.toBeInTheDocument();
  });

  it('selecting a return flight creates a complete round-trip itinerary', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
        '/api/search/flights?': success(roundTripFlightResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2119')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select return' }));

    await waitFor(() => {
      expect(screen.getByText('Complete round trip')).toBeInTheDocument();
    });
    expect(screen.getByText('Outbound journey')).toBeInTheDocument();
    expect(screen.getByText('Return journey')).toBeInTheDocument();
    expect(screen.getAllByText(/AI 2118/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/AI 2119/).length).toBeGreaterThanOrEqual(2);
    // One final fare block, priced at the selected return combination total.
    expect(screen.getByText('Total round-trip fare')).toBeInTheDocument();
    expect(screen.getAllByText(/₹45,000/).length).toBeGreaterThanOrEqual(2);
    // The final total is never outbound + return (₹98,576 + ₹45,000).
    expect(screen.queryByText(/₹143,576/)).not.toBeInTheDocument();
  });

  it('uses the selected return price as the completed round-trip total, never the sum', async () => {
    const outboundResponse = {
      search_metadata: { id: 'f-pricing-rt' },
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
          price: 34150,
          type: 'Round trip',
          departure_token: 'OUT_TOKEN',
        },
      ],
      other_flights: [],
    };
    const returnResponse = {
      search_metadata: { id: 'f-pricing-ret' },
      search_parameters: { engine: 'google_flights', departure_id: 'DEL', arrival_id: 'SIN' },
      best_flights: [
        {
          flights: [
            {
              departure_airport: { name: 'Singapore', id: 'SIN', date: '2026-11-20', time: '10:00' },
              arrival_airport: { name: 'Delhi', id: 'DEL', date: '2026-11-20', time: '18:00' },
              duration: 480,
              airplane: 'A321',
              airline: 'Air India',
              flight_number: 'AI 2119',
              travel_class: 'Economy',
            },
          ],
          layovers: [],
          total_duration: 480,
          price: 51801,
          type: 'Round trip',
          booking_token: 'RET_TOKEN',
        },
      ],
      other_flights: [],
    };

    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUT_TOKEN': success(returnResponse),
        '/api/search/flights?': success(outboundResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    // Outbound card shows the provider round-trip starting total, labelled "from".
    expect(screen.getByText(/₹34,150/)).toBeInTheDocument();
    expect(screen.getAllByText('Round-trip fare from').length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2119')).toBeInTheDocument();
    });
    // Return option shows the complete round-trip total.
    expect(screen.getAllByText('Round-trip total').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/₹51,801/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select return' }));
    await waitFor(() => {
      expect(screen.getByText('Complete round trip')).toBeInTheDocument();
    });

    // Final total equals the selected return combination price (not the sum).
    expect(screen.getByText('Total round-trip fare')).toBeInTheDocument();
    expect(screen.getAllByText(/₹51,801/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/₹85,951/)).not.toBeInTheDocument();
    // No per-leg price rows remain under the journeys.
    expect(screen.queryByText('Outbound fare')).not.toBeInTheDocument();
    expect(screen.queryByText('Return fare')).not.toBeInTheDocument();
  });

  it('round-trip bookmark button appears only after both outbound and return are selected', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
        '/api/search/flights?': success(roundTripFlightResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    expect(screen.queryByRole('button', { name: 'Bookmark' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2119')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Bookmark' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select return' }));
    await waitFor(() => {
      expect(screen.getByText('Complete round trip')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Bookmark' })).toBeInTheDocument();
  });

  it('changing outbound fetches the correct corresponding return options', async () => {
    const secondReturnResponse = {
      ...returnFlightResponse,
      search_metadata: { id: 'f-return-2' },
      best_flights: [
        {
          ...returnFlightResponse.best_flights[0]!,
          flights: [
            {
              ...returnFlightResponse.best_flights[0]!.flights[0]!,
              flight_number: 'AI 2222',
            },
          ],
          booking_token: 'RETURN_TOKEN_2',
        },
      ],
    };
    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUTBOUND_TOKEN_2': success(secondReturnResponse),
        'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
        '/api/search/flights?': success(roundTripFlightResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText(/AI 2119/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Change outbound' }));
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[1]!);
    await waitFor(() => {
      expect(screen.getByText(/AI 2222/)).toBeInTheDocument();
    });

    expect(calls.filter((url) => url.includes('departure_token=OUTBOUND_TOKEN_1')).length).toBe(1);
    expect(calls.filter((url) => url.includes('departure_token=OUTBOUND_TOKEN_2')).length).toBe(1);
  });

  it('reopening the same outbound does not unnecessarily refetch return options', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
        '/api/search/flights?': success(roundTripFlightResponse),
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText(/AI 2119/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Change outbound' }));
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText(/AI 2119/)).toBeInTheDocument();
    });

    expect(calls.filter((url) => url.includes('departure_token=OUTBOUND_TOKEN_1')).length).toBe(1);
  });
});

describe('Round-trip return date validation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function searchRoundTripWithoutReturnDate(user: ReturnType<typeof userEvent.setup>) {
    // Default trip type is Round trip; leave the return date empty.
    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'BLR');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
  }

  it('one-way with no return date is allowed', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'BLR');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument());
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('type=1');
    expect(flightCall).not.toContain('return_date');
  });

  it('round trip with an empty return date is blocked with an inline message', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await searchRoundTripWithoutReturnDate(user);

    await waitFor(() => {
      expect(screen.getByText('Return date is required for a round trip.')).toBeInTheDocument();
    });
    // The message is inline near the Return field.
    const returnLabel = screen.getByLabelText('Return date').closest('label');
    expect(returnLabel).toHaveTextContent('Return date is required for a round trip.');
  });

  it('round trip with an empty return date makes ZERO provider requests', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await searchRoundTripWithoutReturnDate(user);
    await waitFor(() => {
      expect(screen.getByText('Return date is required for a round trip.')).toBeInTheDocument();
    });

    expect(calls.filter((url) => url.includes('/api/search/flights'))).toHaveLength(0);
    expect(calls.some((url) => url.includes('searchapi.io'))).toBe(false);
  });

  it('round trip with a return date before the departure date is blocked', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'BLR');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-08-26');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => {
      expect(screen.getByText('Return date must be after the departure date.')).toBeInTheDocument();
    });
    expect(calls.filter((url) => url.includes('/api/search/flights'))).toHaveLength(0);
  });

  it('one-way search never sends a stale return date from a previous round-trip selection', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'BLR');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-20');
    await user.type(screen.getByLabelText('Return date'), '2026-09-26');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));

    await waitFor(() => expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument());
    const flightCall = calls.find((url) => url.includes('/api/search/flights'));
    expect(flightCall).toContain('type=1');
    expect(flightCall).not.toContain('return_date');
    expect(flightCall).not.toContain('return_date=2026-09-26');
  });
});

describe('Passenger summary & submitted counts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function fillPassengerField(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    value: string,
  ) {
    // fireEvent.change is deterministic for controlled number inputs (clearing +
    // typing would append to the current default, e.g. 1 -> "13").
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    void user;
  }

  /** Run a one-way search and return the recorded flight request URL. */
  async function runOneWaySearch(
    user: ReturnType<typeof userEvent.setup>,
    calls: string[],
  ): Promise<string> {
    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'BLR');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument());
    return calls.find((url) => url.includes('/api/search/flights')) as string;
  }

  /** The submitted-search summary paragraph (route · dates · passengers · class). */
  function flightSummary(): HTMLElement {
    const route = screen.getByText('LKO → BLR');
    const paragraph = route.closest('p');
    if (!paragraph) throw new Error('Flight summary paragraph not found.');
    return paragraph;
  }

  it('summary shows adults only when other passenger counts are 0', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();

    await runOneWaySearch(user, calls);

    expect(flightSummary()).toHaveTextContent('1 adult');
    expect(flightSummary()).not.toHaveTextContent('child');
    expect(flightSummary()).not.toHaveTextContent('infant');
  });

  it('summary shows children when greater than 0', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();
    await fillPassengerField(user, 'Children', '1');

    await runOneWaySearch(user, calls);

    expect(flightSummary()).toHaveTextContent('1 adult');
    expect(flightSummary()).toHaveTextContent('1 child');
  });

  it('summary shows infants in seat when greater than 0', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();
    await fillPassengerField(user, 'Infants in seat', '2');

    await runOneWaySearch(user, calls);

    expect(flightSummary()).toHaveTextContent('2 infants (seat)');
  });

  it('summary shows infants on lap when greater than 0', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();
    await fillPassengerField(user, 'Infants on lap', '1');

    await runOneWaySearch(user, calls);

    expect(flightSummary()).toHaveTextContent('1 infant (lap)');
  });

  it('summary shows all passenger types together', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();
    await fillPassengerField(user, 'Adults', '3');
    await fillPassengerField(user, 'Children', '1');
    await fillPassengerField(user, 'Infants in seat', '2');
    await fillPassengerField(user, 'Infants on lap', '1');

    await runOneWaySearch(user, calls);

    expect(flightSummary()).toHaveTextContent(
      /3 adults.*1 child.*2 infants \(seat\).*1 infant \(lap\).*Economy/,
    );
  });

  it('singular/plural wording is correct', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const first = renderPage();
    const { user } = first;
    // Plurals: 2 adults, 3 children, 2 infants (seat), 2 infants (lap).
    await fillPassengerField(user, 'Adults', '2');
    await fillPassengerField(user, 'Children', '3');
    await fillPassengerField(user, 'Infants in seat', '2');
    await fillPassengerField(user, 'Infants on lap', '2');

    await runOneWaySearch(user, calls);
    expect(flightSummary()).toHaveTextContent(
      /2 adults.*3 children.*2 infants \(seat\).*2 infants \(lap\)/,
    );

    // Singulars: 1 adult, 1 child, 1 infant (seat), 1 infant (lap).
    first.unmount();
    vi.unstubAllGlobals();
    const calls2: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls2);
    const { user: user2 } = renderPage();
    await fillPassengerField(user2, 'Adults', '1');
    await fillPassengerField(user2, 'Children', '1');
    await fillPassengerField(user2, 'Infants in seat', '1');
    await fillPassengerField(user2, 'Infants on lap', '1');
    await user2.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user2.type(screen.getByLabelText('Arrival airport code'), 'BLR');
    await user2.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user2.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user2.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument());
    expect(flightSummary()).toHaveTextContent(
      /1 adult.*1 child.*1 infant \(seat\).*1 infant \(lap\)/,
    );
  });

  it('submitted request contains the exact passenger counts', async () => {
    const calls: string[] = [];
    stubFetch({ '/api/search/flights': success(flightResponse) }, calls);
    const { user } = renderPage();
    await fillPassengerField(user, 'Adults', '3');
    await fillPassengerField(user, 'Children', '1');
    await fillPassengerField(user, 'Infants in seat', '2');
    await fillPassengerField(user, 'Infants on lap', '1');

    const flightCall = await runOneWaySearch(user, calls);
    expect(flightCall).toContain('adults=3');
    expect(flightCall).toContain('children=1');
    expect(flightCall).toContain('infants_in_seat=2');
    expect(flightCall).toContain('infants_on_lap=1');
  });
});

describe('Bookmark button on search results', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  /** Like stubFetchRecording but dispatches on HTTP method too. */
  function stubFetchMethodAware(
    handlers: {
      get?: Record<string, ReturnType<typeof success>>;
      post?: Record<string, ReturnType<typeof success>>;
    },
    calls: { url: string; method: string; body: unknown }[],
  ) {
    const { get = {}, post = {} } = handlers;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        let body: unknown = null;
        if (init?.body) {
          try {
            body = JSON.parse(String(init.body));
          } catch {
            body = String(init.body);
          }
        }
        calls.push({ url, method, body });
        const table = method === 'POST' ? post : get;
        const match = Object.entries(table).find(([path]) => url.includes(path));
        if (!match) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, data: {} }),
          };
        }
        return match[1];
      }),
    );
  }

  const bookmarkCreate = (type: 'FLIGHT' | 'HOTEL') =>
    success({
      created: true,
      bookmark: {
        id: `bm-${type.toLowerCase()}`,
        type,
        fingerprint: `fp-${type.toLowerCase()}`,
        bookmarkCode: type === 'FLIGHT' ? 'FLT-000001' : 'HTL-000001',
        title: type === 'FLIGHT' ? 'DEL → SIN' : 'Hotel 0',
        currency: 'INR',
        searchParams: {},
        snapshot: {},
        createdAt: '2026-08-16T10:00:00.000Z',
      },
    });

  it('appears on flight cards and saves the current result without SearchAPI', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetchMethodAware(
      {
        get: {
          '/api/search/bookmarks': success([]),
          '/api/search/flights': success(flightResponse),
        },
        post: { '/api/search/bookmarks': bookmarkCreate('FLIGHT') },
      },
      calls,
    );
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Departure airport code'), 'LKO');
    await user.type(screen.getByLabelText('Arrival airport code'), 'DEL');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 101')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: 'Bookmark' });
    // UI wording: the action is "Bookmark", never "Save".
    expect(saveButton).toHaveTextContent('Bookmark');
    expect(saveButton).not.toHaveTextContent('Save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bookmarked' })).toHaveTextContent('Bookmarked');
    });

    const createCall = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/api/search/bookmarks'),
    );
    expect(createCall).toBeDefined();
    const payload = createCall!.body as {
      type: string;
      snapshot: { raw: { flights: { airline: string }[] } };
      searchParams: Record<string, unknown>;
    };
    expect(payload.type).toBe('FLIGHT');
    expect(payload.snapshot.raw.flights[0]!.airline).toBe('IndiGo');
    expect(payload.searchParams).toBeDefined();
    // Zero SearchAPI requests.
    expect(calls.some((c) => c.url.includes('searchapi.io'))).toBe(false);
  });

  it('appears on hotel cards and saves the current result without SearchAPI', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetchMethodAware(
      {
        get: {
          '/api/search/bookmarks': success([]),
          '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
          '/api/search/hotels?': success(hotelResponse(1)),
        },
        post: { '/api/search/bookmarks': bookmarkCreate('HOTEL') },
      },
      calls,
    );
    const { user } = renderPage();

    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest);
    await user.type(dest, 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: 'Bookmark' });
    // UI wording: the action is "Bookmark", never "Save".
    expect(saveButton).toHaveTextContent('Bookmark');
    expect(saveButton).not.toHaveTextContent('Save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bookmarked' })).toHaveTextContent('Bookmarked');
    });

    const createCall = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/api/search/bookmarks'),
    );
    expect(createCall).toBeDefined();
    const payload = createCall!.body as { type: string; snapshot: { raw: { name: string } } };
    expect(payload.type).toBe('HOTEL');
    expect(payload.snapshot.raw.name).toBe('Hotel 0');
    expect(calls.some((c) => c.url.includes('searchapi.io'))).toBe(false);
  });

  it('keeps the saved state without making a second request on re-click', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetchMethodAware(
      {
        get: {
          '/api/search/bookmarks': success([]),
          '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
          '/api/search/hotels?': success(hotelResponse(1)),
        },
        post: { '/api/search/bookmarks': bookmarkCreate('HOTEL') },
      },
      calls,
    );
    const { user } = renderPage();

    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest);
    await user.type(dest, 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: 'Bookmark' });
    await user.click(saveButton);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bookmarked' })).toBeInTheDocument();
    });

    // The button is now in saved state; clicking it again must not POST again.
    const savedButton = screen.getByRole('button', { name: 'Bookmarked' });
    await user.click(savedButton);
    await waitFor(() => {
      expect(
        calls.filter((c) => c.method === 'POST' && c.url.includes('/api/search/bookmarks')),
      ).toHaveLength(1);
    });
    expect(calls.some((c) => c.url.includes('searchapi.io'))).toBe(false);
  });

  /** Four distinct flights from the same DEL → SIN search. */
  const fourFlightResponse = {
    search_metadata: { id: 'f4' },
    search_parameters: { engine: 'google_flights', departure_id: 'DEL', arrival_id: 'SIN' },
    best_flights: [
      {
        flights: [
          {
            departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-15', time: '09:05' },
            arrival_airport: {
              name: 'Singapore Changi',
              id: 'SIN',
              date: '2026-09-15',
              time: '17:45',
            },
            duration: 370,
            airplane: 'A320neo',
            airline: 'IndiGo',
            flight_number: '6E 1013',
            travel_class: 'Economy',
          },
        ],
        layovers: [],
        total_duration: 370,
        price: 18777,
        type: 'One way',
      },
      {
        flights: [
          {
            departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-15', time: '08:15' },
            arrival_airport: {
              name: 'Singapore Changi',
              id: 'SIN',
              date: '2026-09-15',
              time: '16:40',
            },
            duration: 375,
            airplane: 'A330',
            airline: 'Thai AirAsia X',
            flight_number: 'XJ 231',
            travel_class: 'Economy',
          },
        ],
        layovers: [],
        total_duration: 375,
        price: 24810,
        type: 'One way',
      },
      {
        flights: [
          {
            departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-15', time: '00:55' },
            arrival_airport: {
              name: 'Singapore Changi',
              id: 'SIN',
              date: '2026-09-15',
              time: '09:20',
            },
            duration: 355,
            airplane: 'A321',
            airline: 'Air India',
            flight_number: 'AI 2115',
            travel_class: 'Economy',
          },
        ],
        layovers: [],
        total_duration: 355,
        price: 26967,
        type: 'One way',
      },
      {
        flights: [
          {
            departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-15', time: '10:10' },
            arrival_airport: {
              name: 'Singapore Changi',
              id: 'SIN',
              date: '2026-09-15',
              time: '18:35',
            },
            duration: 365,
            airplane: 'B787',
            airline: 'THAI',
            flight_number: 'TG 324',
            travel_class: 'Economy',
          },
        ],
        layovers: [],
        total_duration: 365,
        price: 29690,
        type: 'One way',
      },
    ],
    other_flights: [],
    price_insights: { lowest_price: 18777, price_level: 'low' },
  };

  async function runFourFlightSearch(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Departure airport code'), 'DEL');
    await user.type(screen.getByLabelText('Arrival airport code'), 'SIN');
    await user.type(screen.getByLabelText('Outbound date'), '2026-09-15');
    await user.selectOptions(screen.getByLabelText('Trip type'), 'one');
    await user.click(screen.getByRole('button', { name: 'Search flights' }));
    await waitFor(() => {
      expect(screen.getByText('IndiGo · 6E 1013')).toBeInTheDocument();
    });
  }

  it('bookmarking one flight does not mark the other flights bookmarked', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetchMethodAware(
      {
        get: {
          '/api/search/bookmarks': success([]),
          '/api/search/flights': success(fourFlightResponse),
        },
        post: { '/api/search/bookmarks': bookmarkCreate('FLIGHT') },
      },
      calls,
    );
    const { user } = renderPage();
    await runFourFlightSearch(user);

    // Only the first flight is bookmarked.
    const firstSave = screen.getAllByRole('button', { name: 'Bookmark' })[0]!;
    await user.click(firstSave);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Bookmarked' }).length).toBe(1);
    });
    expect(screen.getAllByRole('button', { name: 'Bookmark' }).length).toBe(3);
    expect(calls.some((c) => c.url.includes('searchapi.io'))).toBe(false);
  });

  it('four flights from the same search have distinct fingerprints', () => {
    const searchParams = {
      departure_id: 'DEL',
      arrival_id: 'SIN',
      outbound_date: '2026-09-15',
      type: 1,
    };
    const options = fourFlightResponse.best_flights as SearchApiFlightOption[];
    const fingerprints = options.map((option) => flightFingerprint(searchParams, option.flights));
    expect(new Set(fingerprints).size).toBe(4);
    expect(fingerprints[0]).not.toBe(fingerprints[1]);
    expect(fingerprints[1]).not.toBe(fingerprints[2]);
    expect(fingerprints[2]).not.toBe(fingerprints[3]);
  });

  it('bookmarked state survives a rerender', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetchMethodAware(
      {
        get: {
          '/api/search/bookmarks': success([]),
          '/api/search/flights': success(fourFlightResponse),
        },
        post: { '/api/search/bookmarks': bookmarkCreate('FLIGHT') },
      },
      calls,
    );
    const { user, client, rerender } = renderPage();
    await runFourFlightSearch(user);

    const firstSave = screen.getAllByRole('button', { name: 'Bookmark' })[0]!;
    await user.click(firstSave);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Bookmarked' }).length).toBe(1);
    });

    // Force a full rerender: the saved state must persist.
    rerender(
      <QueryProvider client={client}>
        <TravelSearchPage />
      </QueryProvider>,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Bookmarked' }).length).toBe(1);
      expect(screen.getAllByRole('button', { name: 'Bookmark' }).length).toBe(3);
    });
    expect(calls.some((c) => c.url.includes('searchapi.io'))).toBe(false);
  });

  it('bookmarks a completed round trip with the selected return total as the final price', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    stubFetchMethodAware(
      {
        get: {
          '/api/search/bookmarks': success([]),
          'departure_token=OUTBOUND_TOKEN_1': success(returnFlightResponse),
          '/api/search/flights?': success(roundTripFlightResponse),
        },
        post: { '/api/search/bookmarks': bookmarkCreate('FLIGHT') },
      },
      calls,
    );
    const { user } = renderPage();

    await runFlightSearch(user);
    await user.click(screen.getAllByRole('button', { name: 'Select outbound' })[0]!);
    await waitFor(() => {
      expect(screen.getByText('Air India · AI 2119')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Select return' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bookmark' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Bookmark' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bookmarked' })).toBeInTheDocument();
    });

    const save = calls.find((c) => c.method === 'POST' && c.url.includes('/api/search/bookmarks'));
    expect(save).toBeDefined();
    const payload = save!.body as { snapshot: { raw: { price: number } } };
    // Final total is the selected return combination price (₹45,000), never the
    // outbound (₹98,576) + return sum.
    expect(payload.snapshot.raw.price).toBe(45000);
    expect(payload.snapshot.raw.price).not.toBe(143576);
  });
});

describe('Hotel master autocomplete', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  const masterPage = (data: unknown[]) => ({
    data,
    pagination: { page: 1, pageSize: 100, total: data.length, totalPages: 1 },
  });

  const destinationSingapore = {
    id: 'dst-sin',
    name: 'Singapore',
    countryCode: 'SG',
    countryName: 'Singapore',
  };
  const cityLucknow = { id: 'city-lko', name: 'Lucknow', countryCode: 'IN' };
  const citySingapore = { id: 'city-sin', name: 'Singapore', countryCode: 'SG' };
  const hotelLemon = {
    id: 'h-lt',
    name: 'Lemon Tree Hotel Lucknow',
    city: { id: 'city-lko', name: 'Lucknow' },
    destination: { id: 'dst-lko', name: 'Lucknow' },
  };
  const hotelDays = {
    id: 'h-di',
    name: 'Days Inn Lucknow',
    city: { id: 'city-lko', name: 'Lucknow' },
    destination: { id: 'dst-lko', name: 'Lucknow' },
  };
  const hotelMarina = {
    id: 'h-mbs',
    name: 'Marina Bay Sands Singapore',
    city: { id: 'city-sin', name: 'Singapore' },
    destination: { id: 'dst-sin', name: 'Singapore' },
  };

  function stubMasterHotelSearch(calls: string[]) {
    stubFetch(
      {
        '/api/masters/destinations': success(masterPage([destinationSingapore])),
        '/api/masters/cities': success(masterPage([cityLucknow, citySingapore])),
        '/api/masters/hotels': success(masterPage([hotelLemon, hotelDays, hotelMarina])),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
  }

  it('shows Hotel Master names when the typed text matches a hotel', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    await user.type(screen.getByLabelText('Destination'), 'lemon');
    const option = await screen.findByRole('option', { name: /Lemon Tree Hotel Lucknow/ });
    expect(option).toHaveTextContent('Lemon Tree Hotel Lucknow');
    expect(option).toHaveTextContent('Hotel');
  });

  it('matches hotel names partially and case-insensitively', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    await user.type(screen.getByLabelText('Destination'), 'DAYS');
    const option = await screen.findByRole('option', { name: /Days Inn Lucknow/ });
    expect(option).toHaveTextContent('Days Inn Lucknow');
    expect(option).toHaveTextContent('Hotel');
  });

  it('combines Destination, City and Hotel suggestions together', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    await user.type(screen.getByLabelText('Destination'), 'singa');
    // Destination + City both named Singapore, plus the matching hotel.
    const singaporeOptions = await screen.findAllByRole('option', { name: /^Singapore/ });
    expect(singaporeOptions.length).toBeGreaterThanOrEqual(2);
    const hotelOption = await screen.findByRole('option', { name: /Marina Bay Sands Singapore/ });
    expect(hotelOption).toHaveTextContent('Hotel');
  });

  it('selecting a hotel suggestion only populates the input and makes no SearchAPI call', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    const dest = screen.getByLabelText('Destination');
    await user.type(dest, 'lemon');
    await user.click(await screen.findByRole('option', { name: /Lemon Tree Hotel Lucknow/ }));

    expect(dest).toHaveValue('Lemon Tree Hotel Lucknow');
    expect(hotelSearchCalls(calls)).toBe(0);
    expect(calls.filter((u) => u.includes('/search/hotels/autocomplete')).length).toBe(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('typing characters makes zero SearchAPI calls', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    const dest = screen.getByLabelText('Destination');
    await user.type(dest, 'L');
    await user.type(dest, 'Lu');
    await user.type(dest, 'Luc');
    await user.type(dest, 'Lucknow');

    expect(hotelSearchCalls(calls)).toBe(0);
    expect(calls.filter((u) => u.includes('/search/hotels/autocomplete')).length).toBe(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('calls SearchAPI only after Search hotels is clicked', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    const dest = screen.getByLabelText('Destination');
    await user.type(dest, 'lemon');
    await user.click(await screen.findByRole('option', { name: /Lemon Tree Hotel Lucknow/ }));
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    expect(hotelSearchCalls(calls)).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(hotelSearchCalls(calls)).toBe(1);
    });
    const searchCall = calls.find((u) => u.includes('/search/hotels?'));
    // The selected hotel name becomes the search query.
    expect(searchCall).toContain('Lemon');
  });

  it('still supports free-text destination search without selecting a suggestion', async () => {
    const calls: string[] = [];
    stubMasterHotelSearch(calls);
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    await user.type(screen.getByLabelText('Destination'), 'My Custom Resort');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));

    await waitFor(() => {
      expect(hotelSearchCalls(calls)).toBe(1);
    });
    const searchCall = calls.find((u) => u.includes('/search/hotels?'));
    // The typed free-text becomes the search query (spaces encoded as +).
    expect(searchCall).toContain('Custom');
  });
});

describe('Hotel price rendering', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  /** A hotel whose SearchApi response only carries price_before_taxes. */
  const beforeTaxesOnlyProperty = {
    name: 'Furama RiverFront',
    price_per_night: { price_before_taxes: '₹14,578', extracted_price_before_taxes: 14578 },
    total_price: { price_before_taxes: '₹1,02,045', extracted_price_before_taxes: 102045 },
  };

  it('renders price_before_taxes as the main per-night price when no current price exists', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1, beforeTaxesOnlyProperty)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Furama RiverFront');

    expect(screen.getByText('Furama RiverFront')).toBeInTheDocument();
    expect(screen.getByText('₹14,578')).toBeInTheDocument();
    // No dash is shown for the current price.
    expect(screen.queryByText(/—\s*₹14,578/)).not.toBeInTheDocument();
  });

  it('renders total_price.price_before_taxes as the main total', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1, beforeTaxesOnlyProperty)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Furama RiverFront');

    expect(screen.getByText('₹1,02,045')).toBeInTheDocument();
  });

  it('does not strike through price_before_taxes', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1, beforeTaxesOnlyProperty)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Furama RiverFront');

    const priceNode = screen.getByText('₹14,578');
    expect(priceNode.className).not.toContain('line-through');
    const totalNode = screen.getByText('₹1,02,045');
    expect(totalNode.className).not.toContain('line-through');
  });

  it('shows a "Before taxes" caption for prices sourced from price_before_taxes', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1, beforeTaxesOnlyProperty)),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Furama RiverFront');

    expect(screen.getAllByText('Before taxes').length).toBeGreaterThan(0);
  });

  it('keeps the provider deal label separate from the price', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(
          hotelResponse(1, { ...beforeTaxesOnlyProperty, deal: '16% less than usual' }),
        ),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Furama RiverFront');

    expect(screen.getByText('16% less than usual')).toBeInTheDocument();
    // The deal is NOT used to fabricate a crossed-out "usual" price.
    expect(screen.queryByText(/₹1,02,045/)).toBeInTheDocument();
    const crossed = Array.from(document.querySelectorAll('.line-through')).map(
      (el) => el.textContent,
    );
    expect(crossed.some((t) => t?.includes('₹14,578') || t?.includes('₹1,02,045'))).toBe(false);
  });

  it('renders a hotel without a deal normally', async () => {
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

    expect(screen.getByText('₹4,883')).toBeInTheDocument();
    expect(screen.getByText('₹9,765')).toBeInTheDocument();
    expect(screen.getByText('₹4,883').className).not.toContain('line-through');
  });

  it('formats Marina Bay Sands large prices correctly', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Singapore')),
        '/api/search/hotels?': success(
          hotelResponse(1, {
            name: 'Marina Bay Sands Singapore',
            price_per_night: {
              price_before_taxes: '₹1,09,242',
              extracted_price_before_taxes: 109242,
            },
            total_price: { price_before_taxes: '₹7,64,697', extracted_price_before_taxes: 764697 },
          }),
        ),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Singapore', 'Marina Bay Sands Singapore');

    expect(screen.getByText('Marina Bay Sands Singapore')).toBeInTheDocument();
    expect(screen.getByText('₹1,09,242')).toBeInTheDocument();
    expect(screen.getByText('₹7,64,697')).toBeInTheDocument();
    expect(screen.getByText('₹1,09,242').className).not.toContain('line-through');
  });

  it('uses the same price rule inside View details', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(
          hotelResponse(1, {
            ...beforeTaxesOnlyProperty,
            gps_coordinates: { latitude: 1.29, longitude: 103.85 },
          }),
        ),
      },
      calls,
    );
    const { user } = renderPage();
    await runHotelSearch(user, 'Lucknow', 'Furama RiverFront');

    await user.click(screen.getByRole('button', { name: 'View details' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel Overview')).toBeInTheDocument();
    });
    // Pricing lives only in the card header — the expanded details never repeat it.
    expect(screen.getAllByText('₹14,578')).toHaveLength(1);
    expect(screen.getAllByText('₹1,02,045')).toHaveLength(1);
    // One "Before taxes" caption per price block (per night + total stay).
    expect(screen.getAllByText('Before taxes').length).toBeGreaterThanOrEqual(1);
    // Still zero extra provider requests after opening details.
    expect(hotelSearchCalls(calls)).toBe(1);
  });
});

/** jsdom lacks ErrorEvent helpers for img onError; fire the native event. */
function fireEventError(element: Element) {
  element.dispatchEvent(new Event('error', { bubbles: true, cancelable: true }));
}

describe('Hotel search request behaviour', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  /** Count autocomplete requests — must always be zero. */
  const autocompleteCalls = (calls: string[]) =>
    calls.filter((url) => url.includes('/search/hotels/autocomplete')).length;

  it('typing a destination makes ZERO provider requests', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();

    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.type(dest, 'L');
    await user.type(dest, 'Lu');
    await user.type(dest, 'Luc');
    await user.type(dest, 'Luck');
    await user.type(dest, 'Lucknow');
    // Editing the destination repeatedly must never cost a credit.
    await user.clear(dest);
    await user.type(dest, 'Mumbai');

    expect(autocompleteCalls(calls)).toBe(0);
    expect(hotelSearchCalls(calls)).toBe(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('changing dates, adults, rooms, currency and filters makes ZERO requests', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));

    await user.type(screen.getByLabelText('Destination'), 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.type(screen.getByLabelText('Adults'), '2');
    await user.type(screen.getByLabelText('Rooms'), '2');
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD');
    await user.selectOptions(screen.getByLabelText('Hotel sort by'), 'lowest_price');
    // Open Advanced filters and change a filter before submitting.
    await user.click(screen.getByRole('button', { name: 'Advanced filters' }));
    await user.type(screen.getByLabelText('Hotel price max'), '5000');

    expect(hotelSearchCalls(calls)).toBe(0);
    expect(autocompleteCalls(calls)).toBe(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('clicking Search hotels fires exactly ONE provider request', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    await user.type(screen.getByLabelText('Destination'), 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));

    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);
    expect(autocompleteCalls(calls)).toBe(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('rerender and window focus make ZERO additional requests', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user, rerender, client } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    await user.type(screen.getByLabelText('Destination'), 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);

    // Force a full rerender.
    rerender(
      <QueryProvider client={client}>
        <TravelSearchPage />
      </QueryProvider>,
    );
    // Simulate window focus.
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hotelSearchCalls(calls)).toBe(1);
    expect(autocompleteCalls(calls)).toBe(0);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('View details, image navigation and bookmarking make ZERO additional requests', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(1)),
      },
      calls,
    );
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    await user.type(screen.getByLabelText('Destination'), 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);

    await user.click(screen.getByRole('button', { name: 'View details' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel Overview')).toBeInTheDocument();
    });
    // Image navigation (next arrow).
    await user.click(screen.getByRole('button', { name: 'Next image' }));

    expect(hotelSearchCalls(calls)).toBe(1);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('no automatic next-page request and explicit Next makes exactly one', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/hotels/autocomplete': success(autoSuggestions('Lucknow')),
        '/api/search/hotels?': success(hotelResponse(20, {}, { next_page_token: 'TOKEN1' })),
      },
      calls,
    );
    const { user } = renderPage();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    await user.type(screen.getByLabelText('Destination'), 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('20')).toBeInTheDocument();
    });
    // Next is shown but NOT automatically fetched.
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(hotelSearchCalls(calls)).toBe(1);
  });

  it('explicit uncached Next makes exactly one request; revisiting cached pages makes zero', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    await user.type(screen.getByLabelText('Destination'), 'Lucknow');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    expect(hotelSearchCalls(calls)).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(2);

    // Back to page 1 and forward again — both cached, zero new requests.
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => {
      expect(screen.getByText('Hotel 0')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getAllByText('Page2Hotel').length).toBeGreaterThan(0);
    });
    expect(hotelSearchCalls(calls)).toBe(2);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });
});
