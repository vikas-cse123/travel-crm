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
          departure_airport: {
            name: 'Indira Gandhi International Airport',
            id: 'DEL',
            date: '2026-09-01',
            time: '09:00',
          },
          arrival_airport: {
            name: 'Heathrow Airport',
            id: 'LHR',
            date: '2026-09-01',
            time: '13:30',
          },
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
      carbon_emissions: {
        this_flight: 500000,
        typical_for_this_route: 480000,
        difference_percent: 4,
        lowest_route: 460000,
      },
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
  search_parameters: {
    engine: 'google_hotels',
    q: 'Goa',
    check_in_date: '2026-09-01',
    check_out_date: '2026-09-05',
  },
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
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=LON&outbound_date=2026-09-01',
    );
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

  it('forwards the departure_token on the second round-trip request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(flightFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createAuthClient(app);
    await owner(client);
    const response = await client.get(
      '/api/search/flights?departure_id=DEL&arrival_id=SIN&outbound_date=2026-09-05&return_date=2026-09-10&type=2&departure_token=DEP_TOK_123&currency=INR',
    );
    expect(response.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(calledUrl.href).toContain('departure_token=DEP_TOK_123');
    expect(calledUrl.href).toContain('flight_type=round_trip');
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
      JSON.stringify({
        displayName: 'Delhi',
        country: 'India',
        searchQuery: 'Hotels in Delhi, India',
      }),
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
      JSON.stringify({
        displayName: 'Delhi',
        country: 'India',
        searchQuery: 'Hotels in Delhi, India',
      }),
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
    return vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
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
      JSON.stringify({
        displayName: 'Delhi',
        country: 'India',
        searchQuery: 'Hotels in Delhi, India',
      }),
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
      suggestions: [
        { type: 'airport', kgmid: '/m/09f07', title: 'Delhi', subtitle: 'City in India' },
      ],
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
      suggestions: [
        { type: 'airport', kgmid: '/m/09f07', title: 'Delhi', subtitle: 'City in India' },
      ],
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
      JSON.stringify({
        displayName: 'Delhi',
        country: 'India',
        searchQuery: 'Hotels in Delhi, India',
      }),
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

describe('GET/POST/PATCH/DELETE /api/search/keys', () => {
  it('requires authentication', async () => {
    const client = createAuthClient(app);
    expect((await client.get('/api/search/keys')).status).toBe(401);
  });

  it('returns no keys initially', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys1@test.in');
    const response = await client.get('/api/search/keys');
    expect(response.status).toBe(200);
    expect(response.body.data.keys).toEqual([]);
    expect(typeof response.body.data.serverFallbackAvailable).toBe('boolean');
  });

  it('saves a key and returns only a masked preview', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys2@test.in');
    const response = await client.post('/api/search/keys', { apiKey: 'user-secret-key-ABCD' });
    expect(response.status).toBe(200);
    const key = response.body.data.key;
    expect(key.maskedKey).toContain('••••');
    expect(key.maskedKey).toContain('ABCD');
    expect(key.maskedKey).not.toContain('user-secret-key');
    // The full key never appears anywhere in the response.
    expect(JSON.stringify(response.body)).not.toContain('user-secret-key-ABCD');
  });

  it('never returns the raw secret in the key list', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys3@test.in');
    await client.post('/api/search/keys', { apiKey: 'raw-secret-value-12345' });
    const response = await client.get('/api/search/keys');
    expect(response.status).toBe(200);
    expect(response.body.data.keys).toHaveLength(1);
    expect(response.body.data.keys[0].maskedKey).toMatch(/^•+2345$/);
    expect(JSON.stringify(response.body)).not.toContain('raw-secret-value-12345');
  });

  it('requires a non-empty key on save', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys4@test.in');
    const response = await client.post('/api/search/keys', { apiKey: '   ' });
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate identical key for the same user', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keysdup@test.in');
    await client.post('/api/search/keys', { apiKey: 'duplicate-key-ABCD' });
    const second = await client.post('/api/search/keys', { apiKey: 'duplicate-key-ABCD' });
    expect(second.status).toBe(409);
    const list = await client.get('/api/search/keys');
    expect(list.body.data.keys).toHaveLength(1);
  });

  it('adds multiple keys and preserves insertion order', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keysmulti@test.in');
    await client.post('/api/search/keys', { apiKey: 'key-one-AAAA' });
    await client.post('/api/search/keys', { apiKey: 'key-two-BBBB' });
    await client.post('/api/search/keys', { apiKey: 'key-three-CCCC' });
    const list = await client.get('/api/search/keys');
    expect(list.body.data.keys.map((k: { maskedKey: string }) => k.maskedKey)).toEqual([
      '••••AAAA',
      '••••BBBB',
      '••••CCCC',
    ]);
  });

  it('removes one key by id', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys5@test.in');
    await client.post('/api/search/keys', { apiKey: 'some-key-AAAA' });
    await client.post('/api/search/keys', { apiKey: 'other-key-BBBB' });
    const list = await client.get('/api/search/keys');
    expect(list.body.data.keys).toHaveLength(2);
    const target = list.body.data.keys[0].id as string;
    const remove = await client.delete(`/api/search/keys/${target}`);
    expect(remove.status).toBe(200);
    const after = await client.get('/api/search/keys');
    expect(after.body.data.keys.map((k: { maskedKey: string }) => k.maskedKey)).toEqual([
      '••••BBBB',
    ]);
  });

  it('enables, disables and reactivates a key', async () => {
    const client = createAuthClient(app);
    await owner(client, 'keys6@test.in');
    await client.post('/api/search/keys', { apiKey: 'toggle-key-AAAA' });
    const list = await client.get('/api/search/keys');
    const id = list.body.data.keys[0].id as string;
    await client.patch(`/api/search/keys/${id}`, { status: 'DISABLED' });
    expect((await client.get('/api/search/keys')).body.data.keys[0].status).toBe('DISABLED');
    await client.patch(`/api/search/keys/${id}`, { status: 'ACTIVE' });
    expect((await client.get('/api/search/keys')).body.data.keys[0].status).toBe('ACTIVE');
  });

  it('keeps each user key isolated from other users', async () => {
    const userA = createAuthClient(app);
    const userB = createAuthClient(app);
    await owner(userA, 'keysA@test.in');
    await owner(userB, 'keysB@test.in');

    await userA.post('/api/search/keys', { apiKey: 'user-A-only-secret' });
    const listA = await userA.get('/api/search/keys');
    expect(listA.body.data.keys).toHaveLength(1);
    // User B sees no key from User A.
    const listB = await userB.get('/api/search/keys');
    expect(listB.body.data.keys).toHaveLength(0);
    expect(JSON.stringify(listB.body)).not.toContain('user-A-only-secret');
    // User B cannot delete or update User A's key.
    const idA = listA.body.data.keys[0].id as string;
    expect((await userB.delete(`/api/search/keys/${idA}`)).status).toBe(404);
    expect((await userB.patch(`/api/search/keys/${idA}`, { status: 'DISABLED' })).status).toBe(404);
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

describe('Multi-key SearchAPI rotation', () => {
  beforeEach(async () => {
    await truncateAll(db);
    const { resetSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    resetSearchApiRequestCounts();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const hotelUrl = () => {
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', searchQuery: 'Hotels in Delhi, India' }),
    );
    return `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05`;
  };

  async function saveKeys(client: Client, keys: string[]) {
    for (const key of keys) {
      const response = await client.post('/api/search/keys', { apiKey: key });
      expect(response.status).toBe(200);
    }
  }

  /** Consumes one mocked provider response per actual outbound request. */
  function mockProvider(...responses: Array<{ status: number; body: unknown }>) {
    const calls: URL[] = [];
    const queue = [...responses];
    const fn = vi.fn(async (input: string | URL) => {
      const next = queue.shift();
      if (!next) throw new Error('Unexpected extra SearchAPI provider call in test.');
      calls.push(input instanceof URL ? input : new URL(String(input)));
      return new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fn);
    return { fn, calls };
  }

  it('first active key succeeds -> exactly 1 provider request', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk1@test.in');
    await saveKeys(client, ['multi-key-A-1111']);
    const { calls } = mockProvider({ status: 200, body: hotelFixture });
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(200);
    expect(calls.length).toBe(1);
    expect(calls[0]!.href).toContain('api_key=multi-key-A-1111');
    const { getSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    expect(Object.values(getSearchApiRequestCounts()).reduce((s, n) => s + n, 0)).toBe(1);
  });

  it('key 1 exhausted -> key 2 succeeds -> exactly 2 provider requests', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk2@test.in');
    await saveKeys(client, ['exhausted-key-AAAA', 'working-key-BBBB']);
    const { calls } = mockProvider(
      { status: 429, body: { error: 'You have used all of the searches for the month' } },
      { status: 200, body: hotelFixture },
    );
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(200);
    expect(calls.length).toBe(2);
    expect(calls[0]!.href).toContain('api_key=exhausted-key-AAAA');
    expect(calls[1]!.href).toContain('api_key=working-key-BBBB');

    // Both attempts are recorded so the Owner dashboard counts 2 requests.
    const usage = await db.searchApiUsage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(usage).toHaveLength(2);
    expect(usage[0]!.status).toBe('QUOTA_EXHAUSTED');
    expect(usage[1]!.status).toBe('SUCCESS');
    expect(usage[1]!.isFallbackAttempt).toBe(true);
  });

  it('key1 + key2 exhausted + key3 succeeds -> exactly 3 provider requests', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk3@test.in');
    await saveKeys(client, ['k1-AAAA', 'k2-BBBB', 'k3-CCCC']);
    const { calls } = mockProvider(
      { status: 429, body: { error: 'quota' } },
      { status: 429, body: { error: 'quota' } },
      { status: 200, body: hotelFixture },
    );
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(200);
    expect(calls.length).toBe(3);
    expect(calls[2]!.href).toContain('api_key=k3-CCCC');
  });

  it('an already-marked EXHAUSTED key is skipped on later searches', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk4@test.in');
    await saveKeys(client, ['exhausted-AAAA', 'good-key-BBBB']);

    const first = mockProvider(
      { status: 429, body: { error: 'quota' } },
      { status: 200, body: hotelFixture },
    );
    const r1 = await client.get(hotelUrl());
    expect(r1.status).toBe(200);
    expect(first.calls.length).toBe(2);
    vi.unstubAllGlobals();

    // Key 1 is EXHAUSTED now; the next search must never call the provider with it.
    const second = mockProvider({ status: 200, body: hotelFixture });
    const r2 = await client.get(hotelUrl());
    expect(r2.status).toBe(200);
    expect(second.calls.length).toBe(1);
    expect(second.calls[0]!.href).toContain('api_key=good-key-BBBB');
    expect(second.calls[0]!.href).not.toContain('api_key=exhausted-AAAA');
  });

  it('disabled keys are skipped without a provider request', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk5@test.in');
    await saveKeys(client, ['disabled-key-AAAA', 'enabled-key-BBBB']);
    const list = await client.get('/api/search/keys');
    const disabledId = list.body.data.keys.find((k: { maskedKey: string }) =>
      k.maskedKey.includes('AAAA'),
    ).id as string;
    await client.patch(`/api/search/keys/${disabledId}`, { status: 'DISABLED' });

    const { calls } = mockProvider({ status: 200, body: hotelFixture });
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(200);
    expect(calls.length).toBe(1);
    expect(calls[0]!.href).toContain('api_key=enabled-key-BBBB');
    expect(calls[0]!.href).not.toContain('api_key=disabled-key-AAAA');
  });

  it('an invalid key falls through to the next valid key', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk6@test.in');
    await saveKeys(client, ['invalid-key-AAAA', 'valid-key-BBBB']);
    const { calls } = mockProvider(
      { status: 401, body: { error: 'Invalid API key' } },
      { status: 200, body: hotelFixture },
    );
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(200);
    expect(calls.length).toBe(2);
    expect(calls[1]!.href).toContain('api_key=valid-key-BBBB');

    // The invalid key is persisted as INVALID so it is skipped later too.
    const list = await client.get('/api/search/keys');
    const invalid = list.body.data.keys.find((k: { maskedKey: string }) =>
      k.maskedKey.includes('AAAA'),
    );
    expect(invalid.status).toBe('INVALID');
  });

  it('network/server errors do NOT mark a key exhausted', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk7@test.in');
    await saveKeys(client, ['server-error-key-AAAA']);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(503);
    vi.unstubAllGlobals();

    // The key stays usable — a network failure never marks it exhausted.
    const list = await client.get('/api/search/keys');
    expect(list.body.data.keys[0].status).toBe('ACTIVE');
    const usage = await db.searchApiUsage.findMany();
    expect(usage[0]!.status).toBe('NETWORK_ERROR');
  });

  it('all keys exhausted -> a clear error is returned', async () => {
    const client = createAuthClient(app);
    await owner(client, 'mk8@test.in');
    await saveKeys(client, ['all1-AAAA', 'all2-BBBB']);
    const { calls } = mockProvider(
      { status: 429, body: { error: 'quota' } },
      { status: 429, body: { error: 'quota' } },
    );
    const response = await client.get(hotelUrl());
    expect(response.status).toBe(503);
    expect(response.body.error.message.toLowerCase()).toContain('quota');
    expect(calls.length).toBe(2);
  });

  it('no key configured -> zero provider requests and a clear message', async () => {
    const { env } = await import('../src/config/env.js');
    const original = env.SEARCHAPI_API_KEY;
    env.SEARCHAPI_API_KEY = undefined;
    try {
      const client = createAuthClient(app);
      await owner(client, 'mk9@test.in');
      const fn = vi.fn(async () => {
        throw new Error('Provider must not be called.');
      });
      vi.stubGlobal('fetch', fn);
      const response = await client.get(hotelUrl());
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('No active SearchAPI key');
      expect(fn).not.toHaveBeenCalled();
    } finally {
      env.SEARCHAPI_API_KEY = original;
    }
  });

  it('a user can never use another user saved key', async () => {
    const userA = createAuthClient(app);
    const userB = createAuthClient(app);
    await owner(userA, 'mkuseA@test.in');
    await owner(userB, 'mkuseB@test.in');
    await userA.post('/api/search/keys', { apiKey: 'user-A-only-secret-9999' });

    const { calls } = mockProvider({ status: 200, body: hotelFixture });
    const response = await userB.get(hotelUrl());
    expect(response.status).toBe(200);
    expect(calls.length).toBe(1);
    // User B uses the server fallback, never User A's key.
    expect(calls[0]!.href).not.toContain('user-A-only-secret-9999');
  });
});

describe('Owner SearchAPI usage dashboard', () => {
  const flightUrl = () =>
    '/api/search/flights?departure_id=DEL&arrival_id=SIN&outbound_date=2026-09-05&return_date=2026-09-10&type=2';

  beforeEach(async () => {
    await truncateAll(db);
    const { resetSearchApiRequestCounts } = await import('../src/modules/search/search.service.js');
    resetSearchApiRequestCounts();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mockOneSuccess(body: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  it('requires authentication', async () => {
    const client = createAuthClient(app);
    expect((await client.get('/api/search/usage/summary')).status).toBe(401);
    expect((await client.get('/api/search/usage/users/abc')).status).toBe(401);
  });

  it('rejects a non-Owner with 403 even when called directly', async () => {
    const ownerClient = createAuthClient(app);
    const colleague = createAuthClient(app);
    await owner(ownerClient, 'usageowner@test.in');
    await owner(colleague, 'usagecolleague@test.in');

    const ownerRow = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'usageowner@test.in' },
      select: { companyId: true },
    });
    const salesRole = await db.role.findFirstOrThrow({
      where: { companyId: ownerRow.companyId, name: 'Sales Executive' },
    });
    await db.user.update({
      where: { normalizedEmail: 'usagecolleague@test.in' },
      data: { companyId: ownerRow.companyId, roleId: salesRole.id },
    });

    // The non-Owner must not see company-wide usage.
    expect((await colleague.get('/api/search/usage/summary')).status).toBe(403);
    const detail = await colleague.get('/api/search/usage/users/abc');
    expect(detail.status).toBe(403);

    // The Owner can.
    const allowed = await ownerClient.get('/api/search/usage/summary');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.totals.total).toBe(0);
  });

  it('scopes usage to the owner tenant', async () => {
    const tenantA = createAuthClient(app);
    const tenantB = createAuthClient(app);
    await owner(tenantA, 'usagetenA@test.in');
    await owner(tenantB, 'usagetenB@test.in');

    const fetchMock = await mockOneSuccess(hotelFixture);
    const destination = encodeURIComponent(
      JSON.stringify({ displayName: 'Delhi', searchQuery: 'Hotels in Delhi, India' }),
    );
    await tenantA.get(
      `/api/search/hotels?destination=${destination}&check_in_date=2026-09-01&check_out_date=2026-09-05`,
    );
    fetchMock.mockRestore();

    const summaryA = await tenantA.get('/api/search/usage/summary');
    expect(summaryA.status).toBe(200);
    expect(summaryA.body.data.totals.total).toBe(1);

    const summaryB = await tenantB.get('/api/search/usage/summary');
    expect(summaryB.body.data.totals.total).toBe(0);
  });

  it('counts every actual provider request, including key fallbacks', async () => {
    const client = createAuthClient(app);
    await owner(client, 'usagecount@test.in');
    await client.post('/api/search/keys', { apiKey: 'count-key-AAAA' });
    await client.post('/api/search/keys', { apiKey: 'count-key-BBBB' });

    const fn = vi.fn(async () => {
      const response = fn.mock.calls.length === 1 ? { error: 'quota' } : flightFixture;
      const status = fn.mock.calls.length === 1 ? 429 : 200;
      return new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fn);

    const response = await client.get(flightUrl());
    expect(response.status).toBe(200);
    expect(fn.mock.calls.length).toBe(2);
    vi.unstubAllGlobals();

    const summary = await client.get('/api/search/usage/summary');
    expect(summary.status).toBe(200);
    // One logical flight search consumed TWO actual provider requests.
    expect(summary.body.data.totals.total).toBe(2);
    expect(summary.body.data.totals.flights).toBe(2);
    expect(summary.body.data.totals.hotels).toBe(0);
    expect(summary.body.data.totals.failed).toBe(1);
    expect(summary.body.data.totals.successful).toBe(1);

    // Per-user aggregation.
    expect(summary.body.data.byUser).toHaveLength(1);
    expect(summary.body.data.byUser[0].flights).toBe(2);
    expect(summary.body.data.byUser[0].total).toBe(2);

    // Daily bucket contains today.
    expect(summary.body.data.daily).toHaveLength(1);
    expect(summary.body.data.daily[0].total).toBe(2);

    // Masked per-key breakdown, never the full key.
    const masked = summary.body.data.byKey.map((row: { maskedKey: string }) => row.maskedKey);
    expect(masked).toContain('••••AAAA');
    expect(masked).toContain('••••BBBB');
    expect(JSON.stringify(summary.body)).not.toContain('count-key-AAAA');

    // User detail exposes recent requests.
    const userId = summary.body.data.byUser[0].userId as string;
    const detail = await client.get(`/api/search/usage/users/${userId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.totals.total).toBe(2);
    expect(detail.body.data.recent).toHaveLength(2);
    expect(detail.body.data.recent[0].type).toBe('FLIGHT');
    expect(detail.body.data.recent[1].status).toBe('QUOTA_EXHAUSTED');
    expect(detail.body.data.recent[1].isFallbackAttempt).toBe(false);
  });

  it('rejects usage queries for a user outside the owner company', async () => {
    const tenantA = createAuthClient(app);
    const tenantB = createAuthClient(app);
    await owner(tenantA, 'usedetailA@test.in');
    await owner(tenantB, 'usedetailB@test.in');

    const rowB = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: 'usedetailb@test.in' },
      select: { id: true },
    });
    // Tenant A's Owner cannot read Tenant B's user detail.
    const detail = await tenantA.get(`/api/search/usage/users/${rowB.id}`);
    expect(detail.status).toBe(404);
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
        type: 1,
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

  it('rejects a round-trip flight bookmark that only contains outbound segments', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmroundtripfail@test.in');

    const response = await client.post('/api/search/bookmarks', {
      type: 'FLIGHT',
      searchParams: {
        departure_id: 'DEL',
        arrival_id: 'SIN',
        outbound_date: '2026-09-05',
        return_date: '2026-09-12',
        type: 2,
        currency: 'INR',
      },
      snapshot: {
        flight: {
          airline: 'Air India',
          flightNumbers: ['AI 2118'],
          price: 59370,
          currency: 'INR',
          type: 'Round trip',
          segments: [
            {
              departure_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-05', time: '00:55' },
              arrival_airport: {
                name: 'Singapore',
                id: 'SIN',
                date: '2026-09-05',
                time: '09:20',
              },
              duration: 355,
              airline: 'Air India',
              flight_number: 'AI 2118',
            },
          ],
        },
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('must include a return journey');
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
      searchParams: {
        departure_id: 'DEL',
        arrival_id: 'LON',
        outbound_date: '2026-09-01',
        currency: 'INR',
      },
      snapshot: { raw: noPriceRaw },
    });
    expect(noPrice.status).toBe(200);
    expect(noPrice.body.data.bookmark.snapshot.flight.price).toBeUndefined();

    const withPrice = await client.post('/api/search/bookmarks', {
      type: 'FLIGHT',
      searchParams: {
        departure_id: 'DEL',
        arrival_id: 'LON',
        outbound_date: '2026-09-01',
        currency: 'INR',
      },
      snapshot: { raw: flightFixture.best_flights[0] },
    });
    expect(withPrice.status).toBe(200);
    expect(withPrice.body.data.bookmark.snapshot.flight.price).toBe(412);
    expect(withPrice.body.data.bookmark.snapshot.flight.currency).toBe('INR');
  });

  it('assigns distinct fingerprints to different flights from the same search', async () => {
    const client = createAuthClient(app);
    await owner(client, 'bmfp@test.in');

    const searchParams = {
      departure_id: 'DEL',
      arrival_id: 'SIN',
      outbound_date: '2026-09-05',
      type: 1,
      currency: 'INR',
    };
    const flights = [
      {
        flights: [
          {
            departure_airport: { id: 'DEL', date: '2026-09-05' },
            arrival_airport: { id: 'SIN', date: '2026-09-05' },
            flight_number: '6E 1013',
          },
        ],
        price: 18777,
      },
      {
        flights: [
          {
            departure_airport: { id: 'DEL', date: '2026-09-05' },
            arrival_airport: { id: 'SIN', date: '2026-09-05' },
            flight_number: 'XJ 231',
          },
        ],
        price: 24810,
      },
      {
        flights: [
          {
            departure_airport: { id: 'DEL', date: '2026-09-05' },
            arrival_airport: { id: 'SIN', date: '2026-09-05' },
            flight_number: 'AI 2115',
          },
        ],
        price: 26967,
      },
      {
        flights: [
          {
            departure_airport: { id: 'DEL', date: '2026-09-05' },
            arrival_airport: { id: 'SIN', date: '2026-09-05' },
            flight_number: 'TG 324',
          },
        ],
        price: 29690,
      },
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
