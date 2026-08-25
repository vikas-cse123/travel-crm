import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/providers/QueryProvider';
import { TravelSearchPage } from './TravelSearchPage';
import live from './__moustache-live__.json';

const success = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

describe('LIVE Moustache property data through the upgraded UI', () => {
  it('shows the real room prices, suppliers, cancellation and room details', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.includes('/search/hotels/property')) return success(live);
      if (url.includes('/search/hotels?')) return success({ search_information: { total_results: 10 }, properties: [{ name: 'Moustache Goa Luxuria', property_token: 'live-token', extracted_hotel_class: 0, rating: 4.5, reviews: 120, check_in_time: '2:00 PM', check_out_time: '11:00 AM', city: 'Goa', country: 'IN', images: [] }] });
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    }));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryProvider client={client}><TravelSearchPage /></QueryProvider>);
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest); await user.type(dest, 'Goa');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => expect(screen.getAllByText('Moustache Goa Luxuria').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: /View Rooms & Offers/i })[0]!);
    const dialog = await screen.findByRole('dialog');

    // Real room names returned by the LIVE payload render independently.
    expect(within(dialog).getAllByText('Bed in 18-Bed Mixed Dorm Room').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Budget Double Room').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Deluxe Double Room with Shower').length).toBeGreaterThan(0);
    // Suppliers each render as selectable rows.
    expect(within(dialog).getAllByText('Booking.com').length).toBeGreaterThan(0);
    // REAL prices (before-taxes-only shape) appear as /night + total.
    expect(within(dialog).getAllByText(/₹[0-9,]+/, { selector: 'p' }).length).toBeGreaterThan(0);
    expect(
      within(dialog)
        .queryAllByText((_c: string, el: Element | null) => {
          const t = el?.textContent ?? '';
          return el?.tagName === 'P' && t.includes('total');
        }).length,
    ).toBeGreaterThan(0);

    // Cancellation deadlines render.
    expect(within(dialog).getAllByText(/Free cancellation until/).length).toBeGreaterThan(0);
    expect(calls.filter((u) => u.includes('/search/hotels/property'))).toHaveLength(1);
  });

  it('renders the real rooms with a clean summary card (no API-details viewer)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.includes('/search/hotels/property')) return success(live);
      if (url.includes('/search/hotels?')) return success({ search_information: { total_results: 10 }, properties: [{ name: 'Moustache Goa Luxuria', property_token: 'live-token', extracted_hotel_class: 0, rating: 4.5, reviews: 120, check_in_time: '2:00 PM', check_out_time: '11:00 AM', city: 'Goa', country: 'IN', images: [] }] });
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    }));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryProvider client={client}><TravelSearchPage /></QueryProvider>);
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest); await user.type(dest, 'Goa');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => expect(screen.getAllByText('Moustache Goa Luxuria').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: /View Rooms & Offers/i })[0]!);
    const dialog = await screen.findByRole('dialog');

    // Real rooms render with supplier, guests, prices and cancellation, and the
    // removed API-details viewer is absent from the clean summary cards.
    expect(within(dialog).getAllByText('Bed in 18-Bed Mixed Dorm Room').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Booking.com').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('All API details')).toBeNull();
    expect(within(dialog).queryByLabelText('Search API fields')).toBeNull();
    expect(within(dialog).queryByText('Raw JSON')).toBeNull();

    // The complete Property API response is represented directly in the normal
    // UI: nested price objects, description, amenities and cancellation.
    const dorm = within(dialog).getAllByText('Bed in 18-Bed Mixed Dorm Room')[0]!.closest('article')!;
    expect(within(dorm).getByText('Offer information')).toBeInTheDocument();
    expect(within(dorm).getByText('Room information')).toBeInTheDocument();
    // Nested object labels (data-driven, human-readable).
    expect(within(dorm).getAllByText('Price per night').length).toBeGreaterThan(0);
    expect(within(dorm).getAllByText('Total price').length).toBeGreaterThan(0);
    // Primitive values from the real payload.
    expect(within(dorm).getAllByText('₹1,682').length).toBeGreaterThan(0);
    expect(within(dorm).getAllByText('1682').length).toBeGreaterThan(0);
    expect(within(dorm).getAllByText('Breakfast included · Balcony').length).toBeGreaterThan(0);
    expect(within(dorm).getAllByText('Balcony').length).toBeGreaterThan(0);
    // Booleans render as Yes/No.
    expect(within(dorm).getAllByText(/Yes|No/).length).toBeGreaterThan(0);
    // Supplier appears in the summary AND in the offer data section.
    expect(within(dorm).getAllByText('Booking.com').length).toBeGreaterThan(1);
  });

  it('shows the complete raw API response per room via API Response dropdown, with no extra request', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.includes('/search/hotels/property')) return success(live);
      if (url.includes('/search/hotels?')) return success({ search_information: { total_results: 10 }, properties: [{ name: 'Moustache Goa Luxuria', property_token: 'live-token', extracted_hotel_class: 0, rating: 4.5, reviews: 120, check_in_time: '2:00 PM', check_out_time: '11:00 AM', city: 'Goa', country: 'IN', images: [] }] });
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    }));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryProvider client={client}><TravelSearchPage /></QueryProvider>);
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest); await user.type(dest, 'Goa');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => expect(screen.getAllByText('Moustache Goa Luxuria').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: /View Rooms & Offers/i })[0]!);
    const dialog = await screen.findByRole('dialog');
    const propertyCallsBefore = calls.filter((u) => u.includes('/search/hotels/property')).length;

    const dorm = within(dialog)
      .getAllByText('Bed in 18-Bed Mixed Dorm Room')[0]!
      .closest('article')!;
    const summary = within(dorm).getAllByText('API Response ▼')[0]!;
    await user.click(summary);
    // Complete raw response: nested offers/rooms/prices/metadata, not a reduced object.
    const rawPre = within(dorm).getByText(/featured_offers/, { selector: 'pre' });
    expect(rawPre.textContent).toContain('featured_offers');
    expect(rawPre.textContent).toContain('price_before_taxes');
    expect(rawPre.textContent).toContain('free_cancellation_until');

    // A different room has its own dropdown too.
    expect(within(dialog).getAllByText('API Response ▼').length).toBeGreaterThan(1);

    expect(calls.filter((u) => u.includes('/search/hotels/property')).length).toBe(propertyCallsBefore);
  });

  it('renders the complete Property API response as a structured hotel details UI (Furama-like)', async () => {
    const response = {
      search_metadata: { id: 'search_furama', status: 'Success', total_time_taken: 1.4 },
      search_parameters: { engine: 'google_hotels_property', property_token: 'tok-furama', currency: 'INR', adults: 2 },
      property: {
        name: 'Furama RiverFront',
        type: 'hotel',
        property_token: 'tok-furama',
        data_id: '0xfurama:0x1',
        link: 'https://furama.example',
        description: 'A riverside hotel.',
        address: '405 Havelock Rd, Singapore',
        phone: '+65 6333 8898',
        phone_link: 'tel:+6563338898',
        gps_coordinates: { latitude: 1.29, longitude: 103.84 },
        country: 'SG',
        check_in_time: '3:00 PM',
        check_out_time: '12:00 PM',
        price_per_night: { price: '₹16,201', extracted_price: 16201 },
        total_price: { price: '₹32,402', extracted_price: 32402 },
        price_insights: {
          lowest_price: '₹16,201',
          price_level: 'Low',
          typical_price_range: { low_price: 17390, high_price: 23150 },
        },
        deal: 'Exclusive deal',
        deal_description: 'Save 15% on stays.',
        hotel_class: '4-star hotel',
        extracted_hotel_class: 4,
        rating: 4.6,
        reviews: 16205,
        reviews_histogram: { '5': 12000, '4': 3000, '3': 800, '2': 250, '1': 155 },
        location_rating: 4.5,
        proximity_to_transit_rating: 4.2,
        proximity_to_things_to_do_rating: 4.3,
        airport_access_rating: 3.9,
        reviews_breakdown: [
          { name: 'Cleanliness', total_mentions: 120, positive: 100, neutral: 12, negative: 8 },
          { name: 'Service', total_mentions: 90, positive: 70, neutral: 10, negative: 10 },
        ],
        review_results: {
          reviews: [{ username: 'TravelK', text: 'Great stay by the river.', date: 'a week ago' }],
          on_other_sites: [
            { username: 'Oliver', source: 'Tripadvisor', rating: 4.5, text: 'Nice rooms.', date: '2 weeks ago', link: 'https://tripadvisor.example/rev' },
          ],
        },
        images: [
          { thumbnail: 'https://img.example.com/f-t.jpg', original: 'https://img.example.com/f-o.jpg' },
        ],
        nearby_places: [
          {
            name: 'National Museum of Singapore',
            category: 'Museum',
            rating: 4.6,
            reviews: 16205,
            description: 'A museum.',
            link: 'https://maps.example/museum',
            transportations: [
              { type: 'Walking', duration: '15 min' },
              { type: 'Taxi', duration: '8 min' },
            ],
          },
        ],
        featured_offers: [
          { source: 'Booking.com', num_guests: 2, price_per_night: { price: '₹16,201', extracted_price: 16201 }, rooms: [{ name: 'Superior Room' }] },
        ],
        future_field: 'test',
        future_nested_field: { value: 123 },
      },
      people_also_viewed: [{ name: 'Park Hotel', rating: 4.4, reviews: 8000, distance: '0.4 km away', price_per_night: { price: '₹12,000', extracted_price: 12000 } }],
      vacation_rentals_nearby: [{ name: 'Riverfront Apartment', distance: '0.2 km away', price_per_night: { price: '₹8,000', extracted_price: 8000 } }],
      top_things_to_know: [{ title: 'Great for families' }],
    };
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.includes('/search/hotels/property')) return success(response);
      if (url.includes('/search/hotels?')) return success({ search_information: { total_results: 10 }, properties: [{ name: 'Furama RiverFront', property_token: 'tok-furama', extracted_hotel_class: 4, rating: 4.6, reviews: 16205, check_in_time: '3:00 PM', check_out_time: '12:00 PM', city: 'Singapore', country: 'SG', images: [] }] });
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    }));
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryProvider client={client}><TravelSearchPage /></QueryProvider>);
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const dest = screen.getByLabelText('Destination');
    await user.clear(dest); await user.type(dest, 'Singapore');
    await user.type(screen.getByLabelText('Check-in date'), '2026-09-10');
    await user.type(screen.getByLabelText('Check-out date'), '2026-09-12');
    await user.click(screen.getByRole('button', { name: 'Search hotels' }));
    await waitFor(() => expect(screen.getAllByText('Furama RiverFront').length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: /View Rooms & Offers/i })[0]!);
    const dialog = await screen.findByRole('dialog');

    // Structured sections from the complete response.
    expect(within(dialog).getByText('Hotel Overview')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Furama RiverFront').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('405 Havelock Rd, Singapore').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Price insights')).toBeInTheDocument();
    expect(within(dialog).getByText('Lowest price')).toBeInTheDocument();
    expect(within(dialog).getAllByText('₹16,201').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Exclusive deal')).toBeInTheDocument();
    expect(within(dialog).getByText('Hotel Images')).toBeInTheDocument();
    expect(within(dialog).getByText('Nearby Places (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('National Museum of Singapore')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Walking: 15 min').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Ratings & Reviews')).toBeInTheDocument();
    expect(within(dialog).getAllByText('4.6').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('16,205 reviews')).toBeInTheDocument();
    expect(within(dialog).getByText('Review Breakdown')).toBeInTheDocument();
    expect(within(dialog).getByText('Cleanliness')).toBeInTheDocument();
    expect(within(dialog).getByText('Reviews from Other Sites')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Tripadvisor/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Nearby & Recommended Hotels (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('Park Hotel')).toBeInTheDocument();
    expect(within(dialog).getByText('Vacation Rentals Nearby (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('Riverfront Apartment')).toBeInTheDocument();

    // Search metadata/parameters accessible under the collapsible section.
    await user.click(within(dialog).getByText('Search Information'));
    expect(within(dialog).getByText('Search Metadata')).toBeInTheDocument();
    expect(within(dialog).getByText('Search Parameters')).toBeInTheDocument();

    // Unknown fields render automatically in Additional API Information.
    expect(within(dialog).getByText('Additional API Information')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Future field').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Future nested field').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('123').length).toBeGreaterThan(0);

    // No extra provider request was made to render the details.
    expect(calls.filter((u) => u.includes('/search/hotels/property')).length).toBe(1);
  });
});