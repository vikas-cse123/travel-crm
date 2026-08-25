import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/providers/QueryProvider';
import { BookmarksPage } from './BookmarksPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryProvider client={client}>
        <BookmarksPage />
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

const flightBookmark = {
  id: 'bm-1',
  type: 'FLIGHT',
  provider: 'SEARCHAPI',
  fingerprint: 'fp-1',
  bookmarkCode: 'FLT-000456',
  title: 'DEL → SIN',
  currency: 'INR',
  createdAt: '2026-08-16T10:00:00.000Z',
  searchParams: {
    departure_id: 'DEL',
    arrival_id: 'SIN',
    outbound_date: '2026-09-05',
    currency: 'INR',
  },
  snapshot: {
    flight: {
      airline: 'Air India',
      airlineLogo: 'https://logo/AI.png',
      flightNumbers: ['AI 2115'],
      price: 16792,
      currency: 'INR',
      type: 'One way',
      segments: [
        {
          departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-05', time: '00:55' },
          arrival_airport: { name: 'Singapore', id: 'SIN', date: '2026-09-05', time: '09:20' },
          duration: 355,
          airline: 'Air India',
          flight_number: 'AI 2115',
          travel_class: 'Economy',
        },
      ],
    },
  },
};

const hotelBookmark = {
  id: 'bm-2',
  type: 'HOTEL',
  provider: 'SEARCHAPI',
  fingerprint: 'fp-2',
  bookmarkCode: 'HTL-000123',
  title: 'Taj Exotica Goa',
  currency: 'INR',
  createdAt: '2026-08-16T11:00:00.000Z',
  searchParams: { destination: 'Goa', currency: 'INR' },
  snapshot: {
    hotel: {
      name: 'Taj Exotica Goa',
      propertyType: 'hotel',
      city: 'Goa',
      country: 'IN',
      rating: 4.8,
      reviews: 3200,
      pricePerNight: { price: '₹25,000', extracted_price: 25000 },
      totalPrice: { price: '₹50,000', extracted_price: 50000 },
      images: [
        {
          thumbnail: 'https://img.example.com/a.jpg',
          original: 'https://img.example.com/a-orig.jpg',
        },
        { thumbnail: 'https://img.example.com/b.jpg' },
      ],
      checkInTime: '2:00 PM',
      checkOutTime: '11:00 AM',
    },
  },
};

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

/** Stub that mimics the backend's ?type= filtering for the bookmark list. */
function stubBookmarkFetch(bookmarks: unknown[], calls: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.includes('/api/search/bookmarks/') && url.includes('/api/search/bookmarks')) {
        // delete / detail paths handled by caller-specific handlers via override
      }
      if (url.includes('/api/search/bookmarks?type=FLIGHT')) {
        return success(bookmarks.filter((b) => (b as { type: string }).type === 'FLIGHT'));
      }
      if (url.includes('/api/search/bookmarks?type=HOTEL')) {
        return success(bookmarks.filter((b) => (b as { type: string }).type === 'HOTEL'));
      }
      if (url.includes('/api/search/bookmarks')) {
        return success(bookmarks);
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ success: true, data: {} }),
      };
    }),
  );
}

describe('BookmarksPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows saved flights and hotels loaded only from the DB', async () => {
    const calls: string[] = [];
    stubBookmarkFetch([flightBookmark, hotelBookmark], calls);
    renderPage();

    expect(await screen.findByText('DEL → SIN')).toBeInTheDocument();
    expect(await screen.findByText('Taj Exotica Goa')).toBeInTheDocument();

    // No SearchAPI request was made.
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
    expect(calls.every((u) => u.includes('/api/search/bookmarks'))).toBe(true);
  });

  it('shows a public Bookmark ID with a copy button on every card', async () => {
    const calls: string[] = [];
    stubBookmarkFetch([flightBookmark, hotelBookmark], calls);
    const { user } = renderPage();

    expect(await screen.findByText('DEL → SIN')).toBeInTheDocument();
    expect(await screen.findByText('Taj Exotica Goa')).toBeInTheDocument();

    // Flight and hotel cards each expose their human-readable bookmark code.
    expect(screen.getByText('FLT-000456')).toBeInTheDocument();
    expect(screen.getByText('HTL-000123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy bookmark ID FLT-000456' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy bookmark ID HTL-000123' })).toBeInTheDocument();

    // Copying is local-only — zero network/API requests.
    const callsBefore = calls.length;
    await user.click(screen.getByRole('button', { name: 'Copy bookmark ID HTL-000123' }));
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(calls.length).toBe(callsBefore);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('labels saved prices as historical, not current', async () => {
    const calls: string[] = [];
    stubBookmarkFetch([flightBookmark, hotelBookmark], calls);
    renderPage();

    await screen.findByText('DEL → SIN');
    // "Saved price" labels appear for both cards.
    expect(screen.getAllByText('Saved price').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Saved .* Aug 2026/).length).toBeGreaterThan(0);
    // It must NOT be labelled "Current price".
    expect(screen.queryByText(/Current price/i)).not.toBeInTheDocument();
  });

  it('opens saved flight View details using the DB snapshot', async () => {
    const calls: string[] = [];
    stubBookmarkFetch([flightBookmark], calls);
    const { user } = renderPage();

    await screen.findByText('DEL → SIN');
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await waitFor(() => {
      // Section renamed from "Itinerary".
      expect(screen.getByText('Flight details')).toBeInTheDocument();
      expect(screen.queryByText('Itinerary')).not.toBeInTheDocument();
      // Segment detail (departure time) is only rendered when expanded.
      expect(screen.getByText('12:55 AM')).toBeInTheDocument();
      expect(screen.getByText('09:20 AM')).toBeInTheDocument();
      // Dates shown as DD/MM/YYYY.
      expect(screen.getByText(/DEL · 05\/09\/2026/)).toBeInTheDocument();
      expect(screen.getByText(/SIN · 05\/09\/2026/)).toBeInTheDocument();
      expect(screen.getByText(/Singapore/)).toBeInTheDocument();
    });
    expect(calls.every((u) => u.includes('/api/search/bookmarks'))).toBe(true);
  });

  it('navigates saved hotel images locally without any API call', async () => {
    const calls: string[] = [];
    stubBookmarkFetch([hotelBookmark], calls);
    const { user } = renderPage();

    await screen.findByText('Taj Exotica Goa');
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('a-orig.jpg');

    await user.click(screen.getByRole('button', { name: 'Next image' }));
    await waitFor(() => {
      expect((document.querySelector('img') as HTMLImageElement).src).toContain('b.jpg');
    });
    // Image navigation must not trigger any request beyond the bookmark list.
    const bookmarkCalls = calls.filter((u) => u.includes('/api/search/bookmarks')).length;
    expect(bookmarkCalls).toBe(1);
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('filters by Flights and Hotels', async () => {
    const calls: string[] = [];
    stubBookmarkFetch([flightBookmark, hotelBookmark], calls);
    const { user } = renderPage();

    await screen.findByText('DEL → SIN');
    await user.click(screen.getByRole('tab', { name: 'Flights' }));
    await waitFor(() => {
      expect(screen.getByText('DEL → SIN')).toBeInTheDocument();
    });
    expect(screen.queryByText('Taj Exotica Goa')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    await waitFor(() => {
      expect(screen.getByText('Taj Exotica Goa')).toBeInTheDocument();
    });
    expect(screen.queryByText('DEL → SIN')).not.toBeInTheDocument();
  });

  it('deletes a bookmark', async () => {
    const calls: string[] = [];
    stubFetch(
      {
        '/api/search/bookmarks/bm-1': success({ deleted: true }),
        '/api/search/bookmarks': success([flightBookmark]),
      },
      calls,
    );
    const { user } = renderPage();

    await screen.findByText('DEL → SIN');
    await user.click(screen.getAllByRole('button', { name: /Remove bookmark/i })[0]!);
    await waitFor(() => {
      expect(calls.some((u) => u.includes('/api/search/bookmarks/bm-1'))).toBe(true);
    });
    // Deletion is DB-only; no SearchAPI call.
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('renders a bookmarked hotel price from price_before_taxes like the live card', async () => {
    const beforeTaxesBookmark = {
      ...hotelBookmark,
      snapshot: {
        hotel: {
          ...hotelBookmark.snapshot.hotel,
          name: 'Furama RiverFront',
          pricePerNight: { price_before_taxes: '₹14,578', extracted_price_before_taxes: 14578 },
          totalPrice: { price_before_taxes: '₹1,02,045', extracted_price_before_taxes: 102045 },
          deal: '16% less than usual',
        },
      },
    };
    const calls: string[] = [];
    stubBookmarkFetch([beforeTaxesBookmark], calls);
    renderPage();

    await screen.findByText('Furama RiverFront');
    // price_before_taxes is the main price, not struck through and no dash.
    const perNight = screen.getByText('₹14,578');
    expect(perNight.className).not.toContain('line-through');
    expect(screen.getByText('₹1,02,045').className).not.toContain('line-through');
    expect(screen.getAllByText('Before taxes').length).toBeGreaterThan(0);
    // Deal stays separate.
    expect(screen.getByText('16% less than usual')).toBeInTheDocument();
    // It is labelled as a saved price.
    expect(screen.getAllByText(/saved/i).length).toBeGreaterThan(0);
    // Zero SearchAPI requests.
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
    expect(calls.every((u) => u.includes('/api/search/bookmarks'))).toBe(true);
  });

  it('renders a bookmarked flight entirely from the DB snapshot', async () => {
    const indigoBookmark = {
      ...flightBookmark,
      id: 'bm-indigo',
      title: 'DEL → SIN',
      snapshot: {
        flight: {
          airline: 'IndiGo',
          airlineLogo: 'https://logo/6E.png',
          flightNumbers: ['6E 1013'],
          price: 18777,
          currency: 'INR',
          type: 'One way',
          totalDuration: 370,
          segments: [
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
        },
      },
    };
    const calls: string[] = [];
    stubBookmarkFetch([indigoBookmark], calls);
    renderPage();

    await screen.findByText('DEL → SIN');
    expect(screen.getByText(/IndiGo · 6E 1013/)).toBeInTheDocument();
    expect(screen.getByText(/DEL 09:05 AM/)).toBeInTheDocument();
    expect(screen.getByText(/SIN 05:45 PM/)).toBeInTheDocument();
    expect(screen.getByText('Non-stop')).toBeInTheDocument();
    expect(screen.getByText('Economy')).toBeInTheDocument();
    expect(screen.getByText('One way')).toBeInTheDocument();
    expect(screen.getByText(/₹18,777/)).toBeInTheDocument();
    expect(screen.getAllByText(/Saved price/).length).toBeGreaterThan(0);
    // Zero SearchAPI requests.
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
    expect(calls.every((u) => u.includes('/api/search/bookmarks'))).toBe(true);
  });

  it('shows Price unavailable instead of ₹0.00 when a saved flight has no price', async () => {
    const noPriceBookmark = {
      ...flightBookmark,
      id: 'bm-noprice',
      snapshot: {
        flight: {
          ...flightBookmark.snapshot.flight,
          price: undefined,
        },
      },
    };
    const calls: string[] = [];
    stubBookmarkFetch([noPriceBookmark], calls);
    renderPage();

    await screen.findByText('DEL → SIN');
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument();
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  it('handles a legacy/incomplete flight bookmark without fabricating values', async () => {
    const legacyBookmark = {
      ...flightBookmark,
      id: 'bm-legacy',
      title: 'Flight',
      snapshot: {
        flight: {
          airline: '—',
          flightNumbers: [],
          price: 0,
          currency: 'INR',
          type: 'One way',
          segments: [],
        },
      },
    };
    const calls: string[] = [];
    stubBookmarkFetch([legacyBookmark], calls);
    renderPage();

    await screen.findByText('Flight');
    expect(screen.getByText('Incomplete saved data')).toBeInTheDocument();
    // A legacy ₹0 price must never be presented as a real fare.
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/₹0/)).not.toBeInTheDocument();
    expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
  });

  describe('Saved date filter', () => {
    const withDate = (
      bookmark: typeof flightBookmark | typeof hotelBookmark,
      createdAt: string,
      id: string,
      type = 'FLIGHT',
    ) => ({
      ...bookmark,
      id,
      type,
      createdAt,
      title: `${bookmark.title} ${id}`,
    });

    const all = [
      withDate(flightBookmark, '2026-08-10T09:00:00.000Z', 'bm-f1'),
      withDate(
        {
          ...hotelBookmark,
          snapshot: {
            hotel: { ...hotelBookmark.snapshot.hotel, name: 'Taj Exotica Goa bm-h1' },
          },
        },
        '2026-08-12T09:00:00.000Z',
        'bm-h1',
        'HOTEL',
      ),
      withDate(flightBookmark, '2026-08-16T09:00:00.000Z', 'bm-f2'),
    ];

    it('filters by Saved date From only', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date from'), '2026-08-12');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await waitFor(() => {
        expect(screen.getByText('Taj Exotica Goa bm-h1')).toBeInTheDocument();
        expect(screen.getByText('DEL → SIN bm-f2')).toBeInTheDocument();
      });
      expect(screen.queryByText('DEL → SIN bm-f1')).not.toBeInTheDocument();
    });

    it('filters by Saved date To only', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date to'), '2026-08-12');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await waitFor(() => {
        expect(screen.getByText('DEL → SIN bm-f1')).toBeInTheDocument();
        expect(screen.getByText('Taj Exotica Goa bm-h1')).toBeInTheDocument();
      });
      expect(screen.queryByText('DEL → SIN bm-f2')).not.toBeInTheDocument();
    });

    it('filters by an inclusive From/To range', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date from'), '2026-08-11');
      await user.type(screen.getByLabelText('Saved date to'), '2026-08-16');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await waitFor(() => {
        expect(screen.getByText('Taj Exotica Goa bm-h1')).toBeInTheDocument();
        expect(screen.getByText('DEL → SIN bm-f2')).toBeInTheDocument();
      });
      expect(screen.queryByText('DEL → SIN bm-f1')).not.toBeInTheDocument();
    });

    it('Clear restores all bookmarks', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date from'), '2026-08-16');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() => {
        expect(screen.queryByText('DEL → SIN bm-f1')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Clear' }));
      await waitFor(() => {
        expect(screen.getByText('DEL → SIN bm-f1')).toBeInTheDocument();
        expect(screen.getByText('Taj Exotica Goa bm-h1')).toBeInTheDocument();
        expect(screen.getByText('DEL → SIN bm-f2')).toBeInTheDocument();
      });
    });

    it('applies the date filter together with the Flights/Hotels tabs', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date from'), '2026-08-12');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await user.click(screen.getByRole('tab', { name: 'Hotels' }));
      await waitFor(() => {
        expect(screen.getByText('Taj Exotica Goa bm-h1')).toBeInTheDocument();
      });
      expect(screen.queryByText('DEL → SIN bm-f2')).not.toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Flights' }));
      await waitFor(() => {
        expect(screen.getByText('DEL → SIN bm-f2')).toBeInTheDocument();
      });
      expect(screen.queryByText('Taj Exotica Goa bm-h1')).not.toBeInTheDocument();
    });

    it('shows a validation error for an invalid range instead of filtering', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date from'), '2026-08-16');
      await user.type(screen.getByLabelText('Saved date to'), '2026-08-12');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(
        await screen.findByText('From date must be on or before the To date.'),
      ).toBeInTheDocument();
      // Nothing was filtered out.
      expect(screen.getByText('DEL → SIN bm-f1')).toBeInTheDocument();
      expect(screen.getByText('DEL → SIN bm-f2')).toBeInTheDocument();
    });

    it('shows the no-results state for a date range with no bookmarks', async () => {
      stubBookmarkFetch(all, []);
      const { user } = renderPage();
      await screen.findByText('DEL → SIN bm-f1');

      await user.type(screen.getByLabelText('Saved date from'), '2026-09-01');
      await user.type(screen.getByLabelText('Saved date to'), '2026-09-30');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(
        await screen.findByText('No bookmarks found for this date range.'),
      ).toBeInTheDocument();
    });
  });

  describe('Local bookmark search', () => {
    const makeHotel = (
      id: string,
      name: string,
      city: string,
      bookmarkCode: string,
      createdAt = '2026-08-31T10:00:00.000Z',
    ) => ({
      ...hotelBookmark,
      id,
      bookmarkCode,
      title: name,
      createdAt,
      snapshot: {
        hotel: { ...hotelBookmark.snapshot.hotel, name, city },
      },
    });

    const lemon = makeHotel('bm-lemon', 'Lemon Tree Hotel Lucknow', 'Lucknow', 'HTL-000201');
    const piccadily = makeHotel(
      'bm-picc',
      'The Piccadily Lucknow',
      'Lucknow',
      'HTL-000202',
      '2026-09-01T10:00:00.000Z',
    );
    const manglam = makeHotel('bm-mang', 'Manglam Inn', 'Srinagar', 'HTL-000203');

    it('filters loaded hotel bookmarks locally, case-insensitively, with zero API calls', async () => {
      const calls: string[] = [];
      stubBookmarkFetch([lemon, piccadily, manglam], calls);
      const { user } = renderPage();

      await user.click(screen.getByRole('tab', { name: 'Hotels' }));
      await screen.findByText('Lemon Tree Hotel Lucknow');
      expect(screen.getByPlaceholderText('Search saved hotels...')).toBeInTheDocument();

      const search = screen.getByLabelText('Search saved bookmarks');
      const callsBefore = calls.length;

      // "lemon" → only Lemon Tree.
      await user.type(search, 'lemon');
      expect(screen.getByText('Lemon Tree Hotel Lucknow')).toBeInTheDocument();
      expect(screen.queryByText('The Piccadily Lucknow')).not.toBeInTheDocument();
      expect(screen.queryByText('Manglam Inn')).not.toBeInTheDocument();

      // Case-insensitive: "LUCKNOW" → both Lucknow hotels.
      await user.clear(search);
      await user.type(search, 'LUCKNOW');
      expect(screen.getByText('Lemon Tree Hotel Lucknow')).toBeInTheDocument();
      expect(screen.getByText('The Piccadily Lucknow')).toBeInTheDocument();
      expect(screen.queryByText('Manglam Inn')).not.toBeInTheDocument();

      // Search matches the bookmark ID too.
      await user.clear(search);
      await user.type(search, 'HTL-000201');
      expect(screen.getByText('Lemon Tree Hotel Lucknow')).toBeInTheDocument();
      expect(screen.queryByText('The Piccadily Lucknow')).not.toBeInTheDocument();

      // "manglam" → only Manglam Inn.
      await user.clear(search);
      await user.type(search, 'manglam');
      expect(screen.getByText('Manglam Inn')).toBeInTheDocument();
      expect(screen.queryByText('Lemon Tree Hotel Lucknow')).not.toBeInTheDocument();

      // Typing must never trigger a network/API request — filtering is local.
      expect(calls.length).toBe(callsBefore);
      expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
    });

    it('shows a clean "No saved hotels found" state and clearing restores all hotels', async () => {
      const calls: string[] = [];
      stubBookmarkFetch([lemon, piccadily, manglam], calls);
      const { user } = renderPage();

      await user.click(screen.getByRole('tab', { name: 'Hotels' }));
      await screen.findByText('Lemon Tree Hotel Lucknow');

      const search = screen.getByLabelText('Search saved bookmarks');
      const callsBefore = calls.length;
      await user.type(search, 'zzz-no-match');
      expect(await screen.findByText('No saved hotels found')).toBeInTheDocument();
      expect(screen.queryByText('Lemon Tree Hotel Lucknow')).not.toBeInTheDocument();
      expect(calls.length).toBe(callsBefore);

      await user.clear(search);
      expect(screen.getByText('Lemon Tree Hotel Lucknow')).toBeInTheDocument();
      expect(screen.getByText('The Piccadily Lucknow')).toBeInTheDocument();
      expect(screen.getByText('Manglam Inn')).toBeInTheDocument();
    });

    it('keeps the saved-date filter working together with search', async () => {
      stubBookmarkFetch([lemon, piccadily, manglam], []);
      const { user } = renderPage();

      await user.click(screen.getByRole('tab', { name: 'Hotels' }));
      await screen.findByText('Lemon Tree Hotel Lucknow');

      // Date range that excludes The Piccadily Lucknow (saved 1 Sep 2026).
      await user.type(screen.getByLabelText('Saved date from'), '2026-08-30');
      await user.type(screen.getByLabelText('Saved date to'), '2026-08-31');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() => {
        expect(screen.queryByText('The Piccadily Lucknow')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Lemon Tree Hotel Lucknow')).toBeInTheDocument();
      expect(screen.getByText('Manglam Inn')).toBeInTheDocument();

      // Search narrows the already date-filtered list.
      await user.type(screen.getByLabelText('Search saved bookmarks'), 'lucknow');
      expect(screen.getByText('Lemon Tree Hotel Lucknow')).toBeInTheDocument();
      expect(screen.queryByText('Manglam Inn')).not.toBeInTheDocument();
      expect(screen.queryByText('The Piccadily Lucknow')).not.toBeInTheDocument();
    });

    it('searches saved flights locally by airline, flight number and airport', async () => {
      const calls: string[] = [];
      stubBookmarkFetch([flightBookmark, hotelBookmark], calls);
      const { user } = renderPage();

      await screen.findByText('DEL → SIN');
      await screen.findByText('Taj Exotica Goa');

      const search = screen.getByLabelText('Search saved bookmarks');
      const callsBefore = calls.length;

      // Origin / destination match.
      await user.type(search, 'SIN');
      expect(screen.getByText('DEL → SIN')).toBeInTheDocument();
      expect(screen.queryByText('Taj Exotica Goa')).not.toBeInTheDocument();

      // Airline + flight number match, case-insensitively.
      await user.clear(search);
      await user.type(search, 'ai 2115');
      expect(screen.getByText('DEL → SIN')).toBeInTheDocument();

      // Invalid query → shared empty state.
      await user.clear(search);
      await user.type(search, 'zzz');
      expect(await screen.findByText('No saved items found')).toBeInTheDocument();

      expect(calls.length).toBe(callsBefore);
      expect(calls.some((u) => u.includes('searchapi.io'))).toBe(false);
    });
  });

  describe('Saved timestamp', () => {
    const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' } as const;
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true } as const;
    const expected = (createdAt: string) => {
      const d = new Date(createdAt);
      const date = d.toLocaleDateString('en-IN', dateOptions);
      const time = d.toLocaleTimeString('en-US', timeOptions);
      return `Saved ${date} • ${time}`;
    };

    it('shows the exact bookmark creation date AND time on hotel and flight cards', async () => {
      stubBookmarkFetch([flightBookmark, hotelBookmark], []);
      renderPage();

      await screen.findByText('DEL → SIN');
      await screen.findByText('Taj Exotica Goa');

      // Both values come from the bookmarks' actual createdAt timestamps.
      expect(screen.getByText(expected(flightBookmark.createdAt))).toBeInTheDocument();
      expect(screen.getByText(expected(hotelBookmark.createdAt))).toBeInTheDocument();

      // No raw ISO timestamp is shown anywhere.
      expect(screen.queryByText(/2026-08-16T10:00:00/)).not.toBeInTheDocument();
      expect(screen.queryByText(/2026-08-17T15:12:34/)).not.toBeInTheDocument();

      // The saved time is the creation timestamp, NOT the hotel check-in time
      // (hotel check-in here is 2:00 PM; the saved hotel time ends in :12).
      expect(screen.getByText('2:00 PM / 11:00 AM')).toBeInTheDocument();
      const hotelDate = new Date(hotelBookmark.createdAt).toLocaleDateString('en-IN', dateOptions);
      expect(screen.queryByText(`Saved ${hotelDate} • 2:00 PM`)).not.toBeInTheDocument();
    });

    it('keeps the same saved timestamp after a page reload', async () => {
      stubBookmarkFetch([hotelBookmark], []);
      renderPage();
      await screen.findByText('Taj Exotica Goa');
      const first = expected(hotelBookmark.createdAt);
      expect(screen.getByText(first)).toBeInTheDocument();

      // Re-render (simulating a reload from the same saved data).
      stubBookmarkFetch([hotelBookmark], []);
      renderPage();
      await screen.findByText('Taj Exotica Goa');
      expect(screen.getByText(first)).toBeInTheDocument();
    });
  });


  it('groups multiple bookmarked rooms of the same hotel under one hotel', async () => {
    const room = (id: string, code: string, roomTypeId: string, roomName: string, supplier: string, total: number) => ({
      ...hotelBookmark,
      id,
      bookmarkCode: code,
      snapshot: {
        ...hotelBookmark.snapshot,
        hotel: {
          ...hotelBookmark.snapshot.hotel,
          hotelId: 'hotel-group-1',
          roomTypeId,
          selectedRoom: {
            roomName,
            supplier,
            pricePerNight: Math.round(total / 7),
            totalPrice: total,
            freeCancellation: true,
            offerLink: 'https://book.example/' + id,
          },
        },
      },
    });
    const groupedRooms = [
      room('g1', 'HTL-000201', 'rt-1', 'Basic 8 Bed Mixed Dorm', 'Booking.com', 4763),
      room('g2', 'HTL-000202', 'rt-2', 'Standard 12 Bed Mixed Dorm', 'Agoda', 5040),
      room('g3', 'HTL-000203', 'rt-3', 'Deluxe Room', 'Expedia', 6300),
    ];
    const calls: string[] = [];
    stubBookmarkFetch(groupedRooms, calls);
    renderPage();
    const hotelName = hotelBookmark.snapshot.hotel!.name!;
    // The hotel appears EXACTLY ONCE, with all rooms grouped underneath.
    const names = await screen.findAllByText(hotelName);
    expect(names).toHaveLength(1);
    expect(screen.getByText('Basic 8 Bed Mixed Dorm')).toBeInTheDocument();
    expect(screen.getByText('Standard 12 Bed Mixed Dorm')).toBeInTheDocument();
    expect(screen.getByText('Deluxe Room')).toBeInTheDocument();
    // Each grouped room keeps its own supplier + API Response dropdown + total.
    expect(screen.getByText('Supplier: Booking.com')).toBeInTheDocument();
    expect(screen.getByText('Supplier: Agoda')).toBeInTheDocument();
    expect(screen.getAllByText('API Response ▼').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Total: 4763').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total: 5040').length).toBeGreaterThan(0);
  });

  it('renders the complete stored API response as readable Complete API Details', async () => {
    const saved = {
      ...hotelBookmark,
      id: 'complete-1',
      bookmarkCode: 'HTL-000301',
      snapshot: {
        ...hotelBookmark.snapshot,
        raw: {
          response: {
            search_metadata: { id: 'search_abc', status: 'Success' },
            search_parameters: { engine: 'google_hotels_property', property_token: 'tok-1' },
            property: {
              name: 'Hotel Golden Deluxe',
              property_token: 'tok-1',
              data_id: '0x1:0x2',
              link: 'https://golden.example',
              address: '123 Main St, Goa',
              phone: '+91 90000 00000',
              phone_link: 'tel:+919000000000',
              gps_coordinates: { latitude: 15.29, longitude: 73.96 },
              country: 'IN',
              check_in_time: '2:00 PM',
              check_out_time: '11:00 AM',
              price_per_night: { price_before_taxes: '₹4,500', extracted_price_before_taxes: 4500 },
              total_price: { price_before_taxes: '₹9,000', extracted_price_before_taxes: 9000 },
              hotel_class: '4-star hotel',
              rating: 4.3,
              reviews: 1200,
              reviews_histogram: { '1': 40, '5': 800 },
              location_rating: 4.0,
              nearby_places: [
                {
                  name: 'Beach',
                  category: 'Point of interest',
                  rating: 4.5,
                  transportations: [{ type: 'Taxi', duration: '10 min' }],
                },
              ],
              images: [
                { thumbnail: 'https://img.example.com/t.jpg', original: 'https://img.example.com/o.jpg' },
              ],
              featured_offers: [
                {
                  source: 'Booking.com',
                  num_guests: 2,
                  price_per_night: { price: '₹4,500', extracted_price: 4500 },
                  rooms: [{ name: 'Deluxe Room' }],
                },
              ],
              // A field the renderer has never seen — must appear automatically.
              future_api_field: { nested_future: 'test value' },
            },
            people_also_viewed: [{ name: 'Other Hotel' }],
          },
        },
      },
    };
    const calls: string[] = [];
    stubBookmarkFetch([saved], calls);
    renderPage();
    await screen.findByText('Complete API Details');
    expect(screen.getAllByText('Hotel Golden Deluxe').length).toBeGreaterThan(0);
    // Readable sections from the stored response.
    expect(screen.getByText('Search Metadata')).toBeInTheDocument();
    expect(screen.getByText('Search Parameters')).toBeInTheDocument();
    expect(screen.getByText('Property Information')).toBeInTheDocument();
    expect(screen.getByText('Nearby Places')).toBeInTheDocument();
    expect(screen.getByText('Nearby / Recommended Hotels')).toBeInTheDocument();
    // Nested data is not omitted: prices, ratings, reviews histogram, offers.
    expect(screen.getAllByText('Price Per Night').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹4,500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Location rating').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reviews Histogram').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Offers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deluxe Room').length).toBeGreaterThan(0);
    // Unknown nested field renders automatically (data-driven).
    expect(screen.getAllByText('Future API field').length).toBeGreaterThan(0);
    expect(screen.getAllByText('test value').length).toBeGreaterThan(0);
  });
});