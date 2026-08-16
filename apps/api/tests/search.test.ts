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

  it('rejects a flight when the return date is before the departure date', async () => {
    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=SIN&outbound_date=2026-09-20&return_date=2026-08-26&type=2',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a hotel when check-out is before check-in', async () => {
    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/hotels?destination=Delhi&check_in_date=2026-09-12&check_out_date=2026-09-10',
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('forwards advanced flight filters to SearchAPI', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(flightFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=LON&outbound_date=2026-09-01&type=2&sort_by=price&stops=nonstop&included_airlines=AI&max_price=50000&carry_on_bags=1&checked_bags=2&emissions=1',
    );
    expect(response.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('sort_by=price');
    expect(calledUrl.href).toContain('stops=nonstop');
    expect(calledUrl.href).toContain('included_airlines=AI');
    expect(calledUrl.href).toContain('max_price=50000');
    expect(calledUrl.href).toContain('carry_on_bags=1');
    expect(calledUrl.href).toContain('checked_bags=2');
    expect(calledUrl.href).toContain('emissions=1');
    expect(calledUrl.href).toContain('flight_type=round_trip');
    fetchMock.mockRestore();
  });

  it('one-way flight search sends flight_type=one_way and no return_date', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(flightFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=SIN&outbound_date=2026-09-05&type=1&adults=1&travel_class=economy&currency=INR&sort_by=price',
    );
    expect(response.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('flight_type=one_way');
    expect(calledUrl.href).toContain('outbound_date=2026-09-05');
    expect(calledUrl.href).toContain('adults=1');
    expect(calledUrl.href).toContain('travel_class=economy');
    expect(calledUrl.href).toContain('currency=INR');
    expect(calledUrl.href).toContain('sort_by=price');
    // A one-way search must never carry a return_date (which would turn it into
    // a same-day round trip and return round-trip fares).
    expect(calledUrl.href).not.toContain('return_date');
    expect(calledUrl.href).not.toContain('departure_token');
    fetchMock.mockRestore();
  });

  it('round-trip flight search sends flight_type=round_trip and the selected return_date', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(flightFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=SIN&outbound_date=2026-09-05&return_date=2026-09-10&type=2&adults=1&currency=INR',
    );
    expect(response.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('flight_type=round_trip');
    expect(calledUrl.href).toContain('outbound_date=2026-09-05');
    expect(calledUrl.href).toContain('return_date=2026-09-10');
    fetchMock.mockRestore();
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

describe('SearchAPI request accounting', () => {
  beforeEach(async () => {
    await truncateAll(db);
    const { resetSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    resetSearchApiRequestCounts();
  });

  async function mockSearchApi(body: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('one hotel search request consumes exactly one google_hotels provider call', async () => {
    const fetchMock = await mockSearchApi(hotelFixture);
    const client = createAuthClient(app);
    await owner(client);
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', country: 'India', searchQuery: 'Hotels in Delhi, India' }),
    );
    const response = await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05&currency=INR`,
    );
    expect(response.status).toBe(200);
    const { getSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    const counts = getSearchApiRequestCounts();
    expect(counts.google_hotels ?? 0).toBe(1);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(1);
    fetchMock.mockRestore();
  });

  it('a single autocomplete request consumes exactly one google_hotels_autocomplete provider call', async () => {
    const fetchMock = await mockSearchApi({
      suggestions: [{ type: 'airport', kgmid: '/m/09f07', title: 'Delhi', subtitle: 'City in India' }],
    });
    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get('/api/search/hotels/autocomplete?q=Del');
    expect(response.status).toBe(200);
    const { getSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    const counts = getSearchApiRequestCounts();
    expect(counts.google_hotels_autocomplete ?? 0).toBe(1);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(1);
    fetchMock.mockRestore();
  });

  it('counts each distinct autocomplete term as one provider call', async () => {
    const fetchMock = await mockSearchApi({
      suggestions: [{ type: 'airport', kgmid: '/m/09f07', title: 'Delhi', subtitle: 'City in India' }],
    });
    const client = createAuthClient(app);
    await owner(client);
    for (const q of ['De', 'Del', 'Delhi']) {
      await client.get(`/api/search/hotels/autocomplete?q=${q}`);
    }
    const { getSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    const counts = getSearchApiRequestCounts();
    expect(counts.google_hotels_autocomplete ?? 0).toBe(3);
    fetchMock.mockRestore();
  });

  it('autocomplete plus one hotel search together consume exactly two provider calls', async () => {
    const fetchMock = await mockSearchApi(hotelFixture);
    const client = createAuthClient(app);
    await owner(client);
    await client.get('/api/search/hotels/autocomplete?q=Del');
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', country: 'India', searchQuery: 'Hotels in Delhi, India' }),
    );
    await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05&currency=INR`,
    );
    const { getSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    const counts = getSearchApiRequestCounts();
    expect(counts.google_hotels_autocomplete ?? 0).toBe(1);
    expect(counts.google_hotels ?? 0).toBe(1);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(2);
    fetchMock.mockRestore();
  });
});

describe('GET/POST/DELETE /api/search/keys', () => {
  it('requires authentication', async () => {
    const client = createAuthClient(app);
    expect((await client.get('/api/search/keys')).status).toBe(401);
  });

  it('returns no key status initially', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys1@test.in');
    const response = await client.get('/api/search/keys');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ hasKey: false, maskedKey: null });
    expect(typeof response.body.data.serverFallbackAvailable).toBe('boolean');
  });

  it('saves a key and returns only a masked preview', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys2@test.in');
    const response = await client.post('/api/search/keys', { apiKey: 'user-secret-key-ABCD' });
    expect(response.status).toBe(200);
    expect(response.body.data.hasKey).toBe(true);
    expect(response.body.data.maskedKey).toContain('••••');
    expect(response.body.data.maskedKey).toContain('ABCD');
    expect(response.body.data.maskedKey).not.toContain('user-secret-key');
  });

  it('never returns the raw secret in status', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys3@test.in');
    await client.post('/api/search/keys', { apiKey: 'raw-secret-value-12345' });
    const response = await client.get('/api/search/keys');
    expect(response.status).toBe(200);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('raw-secret-value-12345');
    // Only a masked tail is ever exposed.
    expect(response.body.data.maskedKey).toMatch(/^•+2345$/);
  });

  it('requires a non-empty key on save', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys4@test.in');
    const response = await client.post('/api/search/keys', { apiKey: '   ' });
    expect(response.status).toBe(400);
  });

  it('removes a saved key', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys5@test.in');
    await client.post('/api/search/keys', { apiKey: 'some-key-to-remove' });
    expect((await client.get('/api/search/keys')).body.data.hasKey).toBe(true);

    const remove = await client.delete('/api/search/keys');
    expect(remove.status).toBe(200);
    expect(remove.body.data.hasKey).toBe(false);

    const after = await client.get('/api/search/keys');
    expect(after.body.data.hasKey).toBe(false);
    expect(after.body.data.maskedKey).toBeNull();
  });

  it('keeps each user key isolated from other users', async () => {
    const userA = createAuthClient(app);
    const userB = createAuthClient(app);
    await owner(userA, 'keysA@test.in');
    await owner(userB, 'keysB@test.in');

    await userA.post('/api/search/keys', { apiKey: 'user-A-only-secret' });
    expect((await userA.get('/api/search/keys')).body.data.hasKey).toBe(true);
    // User B sees no key.
    expect((await userB.get('/api/search/keys')).body.data.hasKey).toBe(false);
    const rawB = JSON.stringify((await userB.get('/api/search/keys')).body);
    expect(rawB).not.toContain('user-A-only-secret');
  });

  it('uses the user saved key in preference to the server fallback for searches', async () => {
    // Server fallback key is available in tests; a saved user key must win.
    const client = createAuthClient(app);
    await owner(client, 'keysprec@test.in');
    await client.post('/api/search/keys', { apiKey: 'user-key-precedence' });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(hotelFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', searchQuery: 'Hotels in Delhi, India' }),
    );
    const response = await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05`,
    );
    expect(response.status).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('api_key=user-key-precedence');
    fetchMock.mockRestore();
  });

  it('falls back to the server key when the user has no saved key', async () => {
    // In the test environment a server fallback key is configured, so a user
    // without a personal key should still search using the server key.
    const client = createAuthClient(app);
    await owner(client, 'keysfallback@test.in');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(hotelFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', searchQuery: 'Hotels in Delhi, India' }),
    );
    const response = await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05`,
    );
    expect(response.status).toBe(200);
    // A key is sent (the server fallback), never blank.
    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('api_key=');
    expect(calledUrl.href).not.toContain('api_key=&');
    fetchMock.mockRestore();
  });

  it('maps a SearchAPI 429 to an isolated quota error without affecting other endpoints', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys429@test.in');
    await client.post('/api/search/keys', { apiKey: 'quota-user-key' });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'quota' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', searchQuery: 'Hotels in Delhi, India' }),
    );
    const response = await client.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05`,
    );
    expect(response.status).toBe(503);
    expect(response.body.error.message).toContain('quota');
    fetchMock.mockRestore();

    // Other CRM endpoints still work.
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
  });
});

describe('Live Search coexistence with quotation creation', () => {
  it('quotation creation still works with the Search module mounted', async () => {
    const client = createAuthClient(app);
    await owner(client, 'coexist@test.in');

    // Create a lead via the normal CRM flow.
    const leadResponse = await client.post('/api/queries', {
      customerName: 'Coexist Customer',
      phone: '+91 90000 90000',
      leadSource: 'REFERRAL',
      leadType: 'WARM',
      leadStage: 'NEW_LEAD',
      priority: 'MEDIUM',
      rooms: 1,
      adults: 2,
      childrenWithBed: 0,
      childrenWithoutBed: 0,
      infants: 0,
      extraBeds: 0,
      currency: 'INR',
      services: ['HOTEL'],
      itinerary: [{ country: 'India', destination: 'Goa', nights: 2, sequence: 1 }],
    });
    expect(leadResponse.status).toBe(201);
    const leadId = leadResponse.body.data.id as string;

    // Create a quotation from that lead — the same flow reported as broken.
    const quotation = await client.post('/api/quotations', { queryId: leadId });
    expect(quotation.status).toBe(201);
    expect(quotation.body.data.quotationNumber).toBeTruthy();
  });
});

describe('Bookmarks', () => {
  const flightPayload = {
    type: 'FLIGHT',
    searchParams: {
      departure_id: 'DEL',
      arrival_id: 'SIN',
      outbound_date: '2026-09-05',
      type: 1,
      adults: 1,
      travel_class: 'economy',
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
          },
        ],
      },
    },
  };

  const hotelPayload = {
    type: 'HOTEL',
    searchParams: {
      destination: 'Delhi',
      check_in_date: '2026-09-05',
      check_out_date: '2026-09-07',
      adults: 2,
      rooms: 1,
      currency: 'INR',
    },
    snapshot: {
      hotel: {
        name: 'Taj Exotica Goa',
        propertyType: 'hotel',
        propertyToken: 'token-1',
        city: 'Goa',
        country: 'IN',
        rating: 4.8,
        reviews: 3200,
        pricePerNight: { price: '₹25,000', extracted_price: 25000 },
        totalPrice: { price: '₹50,000', extracted_price: 50000 },
        images: [
          { thumbnail: 'https://img/a.jpg', original: 'https://img/a-orig.jpg' },
          { thumbnail: 'https://img/b.jpg' },
        ],
      },
    },
  };

  it('creates a flight bookmark', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmflight@test.in');
    const response = await client.post('/api/search/bookmarks', flightPayload);
    expect(response.status).toBe(200);
    expect(response.body.data.bookmark.type).toBe('FLIGHT');
    expect(response.body.data.bookmark.title).toBe('DEL → SIN');
    expect(response.body.data.bookmark.snapshot.flight.price).toBe(16792);
    // A flight bookmark receives a FLT-xxxxxx public code.
    expect(response.body.data.bookmark.bookmarkCode).toMatch(/^FLT-\d{6}$/);
  });

  it('creates a hotel bookmark', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmhotel@test.in');
    const response = await client.post('/api/search/bookmarks', hotelPayload);
    expect(response.status).toBe(200);
    expect(response.body.data.bookmark.type).toBe('HOTEL');
    expect(response.body.data.bookmark.snapshot.hotel.name).toBe('Taj Exotica Goa');
    // A hotel bookmark receives an HTL-xxxxxx public code.
    expect(response.body.data.bookmark.bookmarkCode).toMatch(/^HTL-\d{6}$/);
  });

  it('persists the snapshot and never calls SearchAPI during bookmark ops', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = createAuthClient(app);
    await owner(client, 'bmnofetch@test.in');

    const created = await client.post('/api/search/bookmarks', flightPayload);
    expect(created.status).toBe(200);
    const id = created.body.data.bookmark.id as string;

    const list = await client.get('/api/search/bookmarks');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].snapshot.flight.segments).toHaveLength(1);

    const detail = await client.get(`/api/search/bookmarks/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.snapshot.flight.flightNumbers).toContain('AI 2115');

    const removed = await client.delete(`/api/search/bookmarks/${id}`);
    expect(removed.status).toBe(200);

    // No provider request should have been made for any bookmark operation.
    const providerCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('searchapi.io'),
    );
    expect(providerCalls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it('is idempotent for an exact duplicate', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmdup@test.in');
    const first = await client.post('/api/search/bookmarks', flightPayload);
    const second = await client.post('/api/search/bookmarks', flightPayload);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.created).toBe(true);
    expect(second.body.data.created).toBe(false);
    expect(first.body.data.bookmark.id).toBe(second.body.data.bookmark.id);
    const list = await client.get('/api/search/bookmarks');
    expect(list.body.data).toHaveLength(1);
  });

  it('builds a complete flight snapshot from the raw result the frontend sends', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmraw@test.in');

    // Mirrors the frontend payload: the raw SearchApi option, not pre-built fields.
    const raw = flightFixture.best_flights[0];
    const response = await client.post('/api/search/bookmarks', {
      type: 'FLIGHT',
      searchParams: {
        departure_id: 'DEL',
        arrival_id: 'LON',
        outbound_date: '2026-09-01',
        type: 2,
        adults: 1,
        currency: 'INR',
      },
      snapshot: { raw },
    });
    expect(response.status).toBe(200);
    const flight = response.body.data.bookmark.snapshot.flight;

    expect(flight.airline).toBe('Air India');
    expect(flight.flightNumbers).toContain('AI 111');
    expect(flight.price).toBe(412);
    expect(flight.currency).toBe('INR');
    expect(flight.type).toBe('Round trip');
    expect(flight.totalDuration).toBe(330);
    expect(flight.segments).toHaveLength(1);
    expect(flight.segments[0].departure_airport.id).toBe('DEL');
    expect(flight.segments[0].departure_airport.name).toBe('Indira Gandhi International Airport');
    expect(flight.segments[0].departure_airport.time).toBe('09:00');
    expect(flight.segments[0].arrival_airport.id).toBe('LHR');
    expect(flight.segments[0].arrival_airport.time).toBe('13:30');
    expect(flight.segments[0].duration).toBe(330);
    expect(flight.segments[0].airplane).toBe('Airbus A350');
    expect(flight.segments[0].travel_class).toBe('Economy');
    expect(flight.carbonEmissions.this_flight).toBe(500000);

    // The raw provider snapshot is also retained for inspection.
    expect(response.body.data.bookmark.snapshot.raw.price).toBe(412);
  });

  it('never defaults a missing flight price to ₹0 and preserves INR', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmprice@test.in');

    const noPriceRaw = {
      ...flightFixture.best_flights[0],
      price: undefined,
    };
    const noPrice = await client.post('/api/search/bookmarks', {
      type: 'FLIGHT',
      searchParams: { departure_id: 'DEL', arrival_id: 'LON', outbound_date: '2026-09-01', currency: 'INR' },
      snapshot: { raw: noPriceRaw },
    });
    expect(noPrice.status).toBe(200);
    expect(noPrice.body.data.bookmark.snapshot.flight.price).toBeUndefined();

    const withPrice = await client.post('/api/search/bookmarks', {
      type: 'FLIGHT',
      searchParams: { departure_id: 'DEL', arrival_id: 'LON', outbound_date: '2026-09-01', currency: 'INR' },
      snapshot: { raw: flightFixture.best_flights[0] },
    });
    expect(withPrice.status).toBe(200);
    expect(withPrice.body.data.bookmark.snapshot.flight.price).toBe(412);
    expect(withPrice.body.data.bookmark.snapshot.flight.currency).toBe('INR');
  });

  it('assigns distinct fingerprints to different flights from the same search', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmfp@test.in');

    const searchParams = { departure_id: 'DEL', arrival_id: 'SIN', outbound_date: '2026-09-05', type: 1, currency: 'INR' };
    const flights = [
      { flights: [{ departure_airport: { id: 'DEL', date: '2026-09-05' }, arrival_airport: { id: 'SIN', date: '2026-09-05' }, flight_number: '6E 1013' }], price: 18777 },
      { flights: [{ departure_airport: { id: 'DEL', date: '2026-09-05' }, arrival_airport: { id: 'SIN', date: '2026-09-05' }, flight_number: 'XJ 231' }], price: 24810 },
      { flights: [{ departure_airport: { id: 'DEL', date: '2026-09-05' }, arrival_airport: { id: 'SIN', date: '2026-09-05' }, flight_number: 'AI 2115' }], price: 26967 },
      { flights: [{ departure_airport: { id: 'DEL', date: '2026-09-05' }, arrival_airport: { id: 'SIN', date: '2026-09-05' }, flight_number: 'TG 324' }], price: 29690 },
    ];

    const fingerprints: string[] = [];
    for (const raw of flights) {
      const response = await client.post('/api/search/bookmarks', {
        type: 'FLIGHT',
        searchParams,
        snapshot: { raw },
      });
      expect(response.status).toBe(200);
      fingerprints.push(response.body.data.bookmark.fingerprint);
    }

    // Four distinct itineraries -> four distinct fingerprints.
    expect(new Set(fingerprints).size).toBe(4);
    // Same itinerary re-submitted -> same fingerprint (idempotent).
    const again = await client.post('/api/search/bookmarks', {
      type: 'FLIGHT',
      searchParams,
      snapshot: { raw: flights[0] },
    });
    expect(again.body.data.bookmark.fingerprint).toBe(fingerprints[0]);
    expect(again.body.data.created).toBe(false);

    const list = await client.get('/api/search/bookmarks');
    expect(list.body.data).toHaveLength(4);
  });

  it('scopes bookmarks to the owning user', async () => {
    const userA = createAuthClient(app);
    const userB = createAuthClient(app);
    await owner(userA, 'bmscopeA@test.in');
    await owner(userB, 'bmscopeB@test.in');

    await userA.post('/api/search/bookmarks', flightPayload);
    const listA = await userA.get('/api/search/bookmarks');
    expect(listA.body.data).toHaveLength(1);

    // User B sees no bookmarks from User A.
    const listB = await userB.get('/api/search/bookmarks');
    expect(listB.body.data).toHaveLength(0);

    // User B cannot read or delete User A's bookmark.
    const id = listA.body.data[0].id as string;
    expect((await userB.get(`/api/search/bookmarks/${id}`)).status).toBe(404);
    expect((await userB.delete(`/api/search/bookmarks/${id}`)).status).toBe(404);
  });

  it('isolates bookmarks between tenants', async () => {
    const tenantA = createAuthClient(app);
    const tenantB = createAuthClient(app);
    await owner(tenantA, 'bmtenantA@test.in');
    await owner(tenantB, 'bmtenantB@test.in');

    await tenantA.post('/api/search/bookmarks', hotelPayload);
    const listB = await tenantB.get('/api/search/bookmarks');
    expect(listB.body.data).toHaveLength(0);
    const listA = await tenantA.get('/api/search/bookmarks');
    expect(listA.body.data).toHaveLength(1);
  });

  it('deletes a bookmark', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmdelete@test.in');
    const created = await client.post('/api/search/bookmarks', flightPayload);
    const id = created.body.data.bookmark.id as string;

    const removed = await client.delete(`/api/search/bookmarks/${id}`);
    expect(removed.status).toBe(200);
    expect((await client.get(`/api/search/bookmarks/${id}`)).status).toBe(404);
  });

  it('filters bookmarks by type', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmfilter@test.in');
    await client.post('/api/search/bookmarks', flightPayload);
    await client.post('/api/search/bookmarks', hotelPayload);

    const flights = await client.get('/api/search/bookmarks?type=FLIGHT');
    expect(flights.body.data).toHaveLength(1);
    expect(flights.body.data[0].type).toBe('FLIGHT');

    const hotels = await client.get('/api/search/bookmarks?type=HOTEL');
    expect(hotels.body.data).toHaveLength(1);
    expect(hotels.body.data[0].type).toBe('HOTEL');
  });

  it('assigns unique, type-prefixed bookmark codes', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmcode@test.in');

    const first = await client.post('/api/search/bookmarks', hotelPayload);
    const second = await client.post('/api/search/bookmarks', {
      ...hotelPayload,
      searchParams: { ...hotelPayload.searchParams, check_in_date: '2026-10-01' },
      snapshot: {
        hotel: { ...hotelPayload.snapshot.hotel, propertyToken: 'token-2', name: 'Another Hotel' },
      },
    });
    const flight = await client.post('/api/search/bookmarks', flightPayload);

    expect(first.body.data.bookmark.bookmarkCode).toMatch(/^HTL-\d{6}$/);
    expect(second.body.data.bookmark.bookmarkCode).toMatch(/^HTL-\d{6}$/);
    expect(flight.body.data.bookmark.bookmarkCode).toMatch(/^FLT-\d{6}$/);

    const codes = [
      first.body.data.bookmark.bookmarkCode,
      second.body.data.bookmark.bookmarkCode,
      flight.body.data.bookmark.bookmarkCode,
    ];
    expect(new Set(codes).size).toBe(3);
    // Hotel codes share an HTL- prefix and differ from the FLT- prefix.
    expect(codes[0]).not.toBe(codes[1]);
    expect(codes[0].startsWith('HTL-')).toBe(true);
    expect(codes[2].startsWith('FLT-')).toBe(true);
  });

  it('keeps the same bookmark code when an exact duplicate is re-created', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmcodestable@test.in');

    const first = await client.post('/api/search/bookmarks', flightPayload);
    const second = await client.post('/api/search/bookmarks', flightPayload);

    expect(second.body.data.created).toBe(false);
    expect(second.body.data.bookmark.id).toBe(first.body.data.bookmark.id);
    expect(second.body.data.bookmark.bookmarkCode).toBe(first.body.data.bookmark.bookmarkCode);
  });

  it('looks up a bookmark by its public code with a full snapshot', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = createAuthClient(app);
    await owner(client, 'bmbycode@test.in');

    const created = await client.post('/api/search/bookmarks', hotelPayload);
    const code = created.body.data.bookmark.bookmarkCode as string;

    const lookup = await client.get(`/api/search/bookmarks/by-code/${code}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.bookmarkCode).toBe(code);
    expect(lookup.body.data.type).toBe('HOTEL');
    expect(lookup.body.data.snapshot.hotel.name).toBe('Taj Exotica Goa');
    expect(lookup.body.data.snapshot.hotel.images).toHaveLength(2);

    // The lookup is DB-only — zero SearchAPI requests.
    const providerCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('searchapi.io'),
    );
    expect(providerCalls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it('rejects an unknown bookmark code without leaking existence', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmbycodenotfound@test.in');
    const lookup = await client.get('/api/search/bookmarks/by-code/HTL-999999');
    expect(lookup.status).toBe(404);
  });

  it('does not allow a different tenant to look up a bookmark by code', async () => {
    const tenantA = createAuthClient(app);
    const tenantB = createAuthClient(app);
    await owner(tenantA, 'bmbycodetA@test.in');
    await owner(tenantB, 'bmbycodetB@test.in');

    const created = await tenantA.post('/api/search/bookmarks', flightPayload);
    const code = created.body.data.bookmark.bookmarkCode as string;

    // Tenant B cannot resolve Tenant A's bookmark code.
    const lookup = await tenantB.get(`/api/search/bookmarks/by-code/${code}`);
    expect(lookup.status).toBe(404);

    // Tenant A can.
    const own = await tenantA.get(`/api/search/bookmarks/by-code/${code}`);
    expect(own.status).toBe(200);
  });

  it('allows a colleague in the same tenant to load a bookmark by code', async () => {
    const userA = createAuthClient(app);
    const userB = createAuthClient(app);
    await owner(userA, 'bmbycodecolA@test.in');
    await owner(userB, 'bmbycodecolB@test.in');

    // Move userB into userA's company so they are colleagues in one tenant.
    const userARow = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'bmbycodecola@test.in' },
      select: { companyId: true },
    });
    await db.user.update({
      where: { normalizedEmail: 'bmbycodecolb@test.in' },
      data: { companyId: userARow.companyId },
    });

    const created = await userA.post('/api/search/bookmarks', hotelPayload);
    const code = created.body.data.bookmark.bookmarkCode as string;

    // Company-scoped read: another user in the same tenant can load it.
    const lookup = await userB.get(`/api/search/bookmarks/by-code/${code}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.snapshot.hotel.name).toBe('Taj Exotica Goa');
  });
});
