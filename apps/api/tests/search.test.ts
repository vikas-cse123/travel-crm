import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, truncateAll } from './helpers/test-database.js';
import { createAuthClient, registrationPayload } from './helpers/auth-client.js';
import { getMemoryEmailProvider } from '../src/services/email/email.service.js';

let app: Express;
let db: PrismaClient;
beforeAll(async () => {
  db = createTestPrismaClient();
  app = (await import('../src/app.js')).createApp();
});
afterAll(async () => db.$disconnect());
beforeEach(async () => {
  await truncateAll(db);
  getMemoryEmailProvider()?.clear();
});

type Client = ReturnType<typeof createAuthClient>;

async function owner(client: Client, email = 'search@test.in') {
  await client.post('/api/auth/register', registrationPayload({ email }));
  await client.post('/api/auth/verify-email', { otp: getMemoryEmailProvider()?.lastOtp(email) });
}

const flightFixture = {
  search_metadata: { id: 'search_abc', status: 'Success' },
  search_parameters: { engine: 'google_flights', departure_id: 'DEL', arrival_id: 'LON' },
  best_flights: [
    {
      flights: [
        {
          departure_airport: { name: 'Indira Gandhi International Airport', id: 'DEL', date: '2026-09-01', time: '09:00' },
          arrival_airport: { name: 'Heathrow Airport', id: 'LHR', date: '2026-09-01', time: '13:30' },
          duration: 330,
          airplane: 'Airbus A350',
          airline: 'Air India',
          airline_logo: 'https://logo/AI.png',
          travel_class: 'Economy',
          flight_number: 'AI 111',
        },
      ],
      layovers: [],
      total_duration: 330,
      carbon_emissions: { this_flight: 500000, typical_for_this_route: 480000, difference_percent: 4, lowest_route: 460000 },
      price: 412,
      type: 'Round trip',
    },
  ],
  other_flights: [],
  price_insights: {
    lowest_price: 412,
    price_level: 'low',
    typical_price_range: { low_price: 380, high_price: 520 },
  },
};

const hotelFixture = {
  search_metadata: { id: 'search_def', status: 'Success' },
  search_parameters: { engine: 'google_hotels', q: 'Goa', check_in_date: '2026-09-01', check_out_date: '2026-09-05' },
  search_information: { total_results: 120 },
  properties: [
    {
      type: 'hotel',
      name: 'Taj Exotica Goa',
      property_token: 'token-1',
      description: 'Luxury beach resort.',
      city: 'Goa',
      country: 'IN',
      check_in_time: '2:00 PM',
      check_out_time: '11:00 AM',
      price_per_night: { price: '$250', extracted_price: 250 },
      total_price: { price: '$1,000', extracted_price: 1000 },
      hotel_class: '5-star hotel',
      extracted_hotel_class: 5,
      rating: 4.8,
      reviews: 3200,
      amenities: ['Free Wi-Fi', 'Pool'],
      essential_info: ['2 bedrooms', '4 beds'],
    },
  ],
};

describe('GET /api/search', () => {
  it('rejects unauthenticated requests', async () => {
    const client = createAuthClient(app);
    const response = await client.get('/api/search/flights?departure_id=DEL&arrival_id=LON&outbound_date=2026-09-01');
    expect(response.status).toBe(401);
  });

  it('rejects invalid flight query params', async () => {
    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get('/api/search/flights?departure_id=XX&arrival_id=LON');
    expect(response.status).toBe(400);
  });

  it('rejects invalid hotel query params', async () => {
    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get('/api/search/hotels?destination=&check_in_date=2026-09-01');
    expect(response.status).toBe(400);
  });

  it('proxies a flight search and returns every SearchApi field', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(flightFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=LON&outbound_date=2026-09-01&return_date=2026-09-08&currency=USD',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.best_flights[0].price).toBe(412);
    expect(response.body.data.best_flights[0].flights[0].airline).toBe('Air India');
    expect(response.body.data.price_insights.lowest_price).toBe(412);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('engine=google_flights');
    expect(calledUrl.href).toContain('departure_id=DEL');
    expect(calledUrl.href).toContain('return_date=2026-09-08');
    fetchMock.mockRestore();
  });

  it('proxies a hotel search, defaults to gl=in and uses the explicit destination query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(hotelFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', country: 'India', searchQuery: 'Hotels in Delhi, India' }),
    );
    const response = await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05&currency=INR`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.search_information.total_results).toBe(120);
    expect(response.body.data.properties[0].name).toBe('Taj Exotica Goa');
    expect(response.body.data.properties[0].price_per_night.extracted_price).toBe(250);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('engine=google_hotels');
    // Explicit destination query, India locale, no US fallback.
    const decoded = decodeURIComponent(calledUrl.href).replace(/\+/g, ' ');
    expect(decoded).toContain('q=Hotels in Delhi, India');
    expect(calledUrl.href).toContain('gl=in');
    expect(calledUrl.href).toContain('hl=en');
    expect(calledUrl.href).toContain('currency=INR');
    expect(calledUrl.href).not.toContain('gl=us');
    expect(calledUrl.href).toContain('check_in_date=2026-09-01');
    fetchMock.mockRestore();
  });

  it('forwards next_page_token for hotel pagination', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(hotelFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', country: 'India', searchQuery: 'Hotels in Delhi, India' }),
    );
    const response = await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05&next_page_token=CBI%3D`,
    );

    expect(response.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('next_page_token=CBI%3D');
    fetchMock.mockRestore();
  });

  it('falls back to a plain typed destination with an explicit query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(hotelFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/hotels?destination=Goa&check_in_date=2026-09-01&check_out_date=2026-09-05',
    );

    expect(response.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    const decoded = decodeURIComponent(calledUrl.href).replace(/\+/g, ' ');
    expect(decoded).toContain('q=Hotels in Goa');
    expect(calledUrl.href).toContain('gl=in');
    fetchMock.mockRestore();
  });

  it('returns 503 with a clear message when SearchApi fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid engine' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/hotels?destination=Goa&check_in_date=2026-09-01&check_out_date=2026-09-05',
    );
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    vi.restoreAllMocks();
  });
});

describe('GET /api/search/hotels/autocomplete', () => {
  it('requires authentication', async () => {
    const client = createAuthClient(app);
    const response = await client.get('/api/search/hotels/autocomplete?q=Del');
    expect(response.status).toBe(401);
  });

  it('proxies an autocomplete request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestions: [
            { type: 'airport', kgmid: '/m/09f07', title: 'Delhi', subtitle: 'City in India' },
            { type: 'query', title: 'delhi hotels' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get('/api/search/hotels/autocomplete?q=Del');

    expect(response.status).toBe(200);
    expect(response.body.data.suggestions[0].title).toBe('Delhi');
    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('engine=google_hotels_autocomplete');
    expect(calledUrl.href).toContain('q=Del');
    fetchMock.mockRestore();
  });
});
