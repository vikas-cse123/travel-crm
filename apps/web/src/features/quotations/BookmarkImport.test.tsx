import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { AirlineInput, LiveSearchBookmark } from '@interscale/shared';
import { QueryProvider } from '@/providers/QueryProvider';
import type { Airline } from '@/features/masters/masters.api';
import {
  BookmarkLoadField,
  deriveAirlineIataCode,
  findMatchingAirline,
  flightBookmarkSegmentAirlines,
  flightBookmarkToDetails,
  hotelBookmarkToDetails,
  normalizeAirlineName,
  resolveFlightSegmentAirlines,
  type FlightSegmentAirlineRef,
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
  searchParams: {
    departure_id: 'DEL',
    arrival_id: 'SIN',
    outbound_date: '2026-09-05',
    currency: 'INR',
  },
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
                departure_airport: {
                  name: 'Bangkok',
                  id: 'BKK',
                  date: '2026-09-05',
                  time: '15:00',
                },
                arrival_airport: {
                  name: 'Singapore',
                  id: 'SIN',
                  date: '2026-09-05',
                  time: '17:45',
                },
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
            flightNumbers: ['AI 2118', 'AI 2119'],
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
                travel_class: 'Economy',
                flight_number: 'AI 2118',
              },
              {
                departure_airport: {
                  name: 'Singapore',
                  id: 'SIN',
                  date: '2026-09-12',
                  time: '10:00',
                },
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

  it('includes every segment of a connecting return journey', () => {
    const details = flightBookmarkToDetails(
      flightBookmark({
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
            flightNumbers: ['AI 2118', 'AI 2119', 'AI 2120'],
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
                travel_class: 'Economy',
                flight_number: 'AI 2118',
              },
              {
                departure_airport: {
                  name: 'Singapore',
                  id: 'SIN',
                  date: '2026-09-12',
                  time: '10:00',
                },
                arrival_airport: { name: 'Mumbai', id: 'BOM', date: '2026-09-12', time: '13:00' },
                duration: 180,
                airline: 'Air India',
                travel_class: 'Economy',
                flight_number: 'AI 2119',
              },
              {
                departure_airport: { name: 'Mumbai', id: 'BOM', date: '2026-09-12', time: '15:00' },
                arrival_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-12', time: '17:00' },
                duration: 150,
                airline: 'Air India',
                travel_class: 'Economy',
                flight_number: 'AI 2120',
              },
            ],
          },
        },
      }),
    );

    expect(details.journeyType).toBe('ROUND_TRIP');
    expect(details.amount).toBe(59370);
    expect(details.outbound.segments).toHaveLength(1);
    expect(details.returnJourney.segments).toHaveLength(2);
    expect(details.returnJourney.segments[0]!.flightNumber).toBe('AI 2119');
    expect(details.returnJourney.segments[1]!.flightNumber).toBe('AI 2120');
  });
});

describe('flight bookmark airline resolution', () => {
  function airline(overrides: Partial<Airline> = {}): Airline {
    return {
      id: 'air-1',
      name: 'IndiGo',
      iataCode: '6E',
      icaoCode: null,
      countryCode: null,
      countryName: null,
      website: null,
      internalNotes: null,
      status: 'ACTIVE',
      hasLogo: false,
      logoFileName: null,
      logoMimeType: null,
      logoConfirmedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      createdBy: { id: 'u1', fullName: 'Tester' },
      isGlobal: false,
      isOwnedByCurrentTenant: true,
      canEdit: true,
      canHide: true,
      canRestore: true,
      source: 'TENANT',
      ...overrides,
    };
  }

  it('derives an IATA code from the flight number', () => {
    expect(deriveAirlineIataCode('6E 101')).toBe('6E');
    expect(deriveAirlineIataCode('AI 2115')).toBe('AI');
    expect(deriveAirlineIataCode('AI2115')).toBe('AI');
    expect(deriveAirlineIataCode(null)).toBeNull();
    expect(deriveAirlineIataCode('BUS')).toBeNull();
  });

  it('normalizes airline names case-insensitively', () => {
    expect(normalizeAirlineName('IndiGo')).toBe('indigo');
    expect(normalizeAirlineName('INDIGO')).toBe('indigo');
    expect(normalizeAirlineName('  Indigo ')).toBe('indigo');
  });

  it('matches an existing airline by IATA code first', () => {
    const airlines = [
      airline({ id: 'a1', name: 'Air India', iataCode: 'AI' }),
      airline({ id: 'a2', name: 'IndiGo', iataCode: '6E' }),
    ];
    // Bookmark says "Indigo" but the flight number code is 6E -> code match wins.
    const matched = findMatchingAirline({ name: 'Indigo', iataCode: '6E' }, airlines);
    expect(matched?.id).toBe('a2');
  });

  it('matches an existing airline by normalized name when there is no code', () => {
    const airlines = [airline({ id: 'a1', name: 'THAI', iataCode: 'TG' })];
    expect(findMatchingAirline({ name: 'thai', iataCode: null }, airlines)?.id).toBe('a1');
    expect(findMatchingAirline({ name: 'Air India', iataCode: null }, airlines)).toBeNull();
  });

  it('enumerates every segment with leg/index/name/code/logo', () => {
    const refs = flightBookmarkSegmentAirlines(
      flightBookmark({
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
                arrival_airport: {
                  name: 'Singapore',
                  id: 'SIN',
                  date: '2026-09-05',
                  time: '09:20',
                },
                duration: 355,
                airline: 'Air India',
                airline_logo: 'https://img/ai.png',
                travel_class: 'Economy',
                flight_number: 'AI 2118',
              },
              {
                departure_airport: {
                  name: 'Singapore',
                  id: 'SIN',
                  date: '2026-09-12',
                  time: '10:00',
                },
                arrival_airport: { name: 'Delhi', id: 'DEL', date: '2026-09-12', time: '12:00' },
                duration: 120,
                airline: 'IndiGo',
                travel_class: 'Economy',
                flight_number: '6E 2109',
              },
            ],
          },
        },
      }),
    );

    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      leg: 'outbound',
      segmentIndex: 0,
      name: 'Air India',
      iataCode: 'AI',
      logoUrl: 'https://img/ai.png',
    });
    expect(refs[1]).toMatchObject({
      leg: 'returnJourney',
      segmentIndex: 0,
      name: 'IndiGo',
      iataCode: '6E',
    });
  });

  it('uses an existing airline master record without creating another', async () => {
    const existing = airline({ id: 'existing-indigo', name: 'IndiGo', iataCode: '6E' });
    const create = vi.fn(async () => airline({ id: 'new', name: 'IndiGo', iataCode: '6E' }));
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'Indigo', iataCode: '6E', logoUrl: null },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [existing],
      createAirline: create,
      canManageMedia: false,
    });

    expect(create).not.toHaveBeenCalled();
    expect(resolved.get('indigo')).toEqual({ airlineId: 'existing-indigo', airlineName: 'IndiGo' });
  });

  it('creates a missing airline automatically and returns its id', async () => {
    const created = airline({ id: 'new-air', name: 'IndiGo', iataCode: '6E' });
    const create = vi.fn(async () => created);
    const onAirlineCreated = vi.fn();
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: null },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: false,
      onAirlineCreated,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'IndiGo', iataCode: '6E' }),
    );
    expect(onAirlineCreated).toHaveBeenCalledWith(created);
    expect(resolved.get('indigo')).toEqual({ airlineId: 'new-air', airlineName: 'IndiGo' });
  });

  it('creates an airline exactly once when multiple segments share it', async () => {
    const create = vi.fn(async () => airline({ id: 'one', name: 'Air India', iataCode: 'AI' }));
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'Air India', iataCode: 'AI', logoUrl: null },
      { leg: 'outbound', segmentIndex: 1, name: 'Air India', iataCode: 'AI', logoUrl: null },
      { leg: 'returnJourney', segmentIndex: 0, name: 'AIR INDIA', iataCode: 'AI', logoUrl: null },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: false,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(resolved.get('air india')?.airlineId).toBe('one');
  });

  it('repeated loading of the same bookmark reuses the same master record', async () => {
    const created = airline({ id: 'created-indigo', name: 'IndiGo', iataCode: '6E' });
    const create = vi.fn(async () => created);
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: null },
    ];

    // First import creates the airline.
    const first = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: false,
    });
    expect(first.get('indigo')?.airlineId).toBe('created-indigo');
    expect(create).toHaveBeenCalledTimes(1);

    // Second import sees the (now existing) master record and does not create again.
    const second = await resolveFlightSegmentAirlines(refs, {
      airlines: [created],
      createAirline: create,
      canManageMedia: false,
    });
    expect(second.get('indigo')?.airlineId).toBe('created-indigo');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('resolves each segment of a connecting flight independently', async () => {
    const create = vi.fn(async (input: AirlineInput) =>
      airline({ id: `id-${input.name}`, name: input.name, iataCode: null }),
    );
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'THAI', iataCode: 'TG', logoUrl: null },
      { leg: 'outbound', segmentIndex: 1, name: 'IndiGo', iataCode: '6E', logoUrl: null },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: false,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(resolved.get('thai')?.airlineId).toBe('id-THAI');
    expect(resolved.get('indigo')?.airlineId).toBe('id-IndiGo');
  });

  it('creates a missing airline and imports the provider logo through the master import endpoint', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({ url, body: init?.body });
        if (url.includes('/logo/import')) {
          return success({ id: 'new-air', name: 'IndiGo', iataCode: '6E', hasLogo: true });
        }
        return success({});
      }),
    );

    const create = vi.fn(async () => airline({ id: 'new-air', name: 'IndiGo', iataCode: '6E' }));
    const refs: FlightSegmentAirlineRef[] = [
      {
        leg: 'outbound',
        segmentIndex: 0,
        name: 'IndiGo',
        iataCode: '6E',
        logoUrl: 'https://www.gstatic.com/flights/airline_logos/70px/6E.png',
      },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: true,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(resolved.get('indigo')?.airlineId).toBe('new-air');
    const importCall = calls.find((call) => call.url.includes('/logo/import'));
    expect(importCall).toBeDefined();
    expect(importCall!.url).toContain('/masters/airlines/new-air/logo/import');
    expect(JSON.parse(String(importCall!.body))).toEqual({
      url: 'https://www.gstatic.com/flights/airline_logos/70px/6E.png',
    });
    vi.unstubAllGlobals();
  });

  it('adds a logo to an existing airline that has none', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({ url, body: init?.body });
        if (url.includes('/logo/import')) {
          return success({ id: 'existing-indigo', name: 'IndiGo', iataCode: '6E', hasLogo: true });
        }
        return success({});
      }),
    );

    const existing = airline({ id: 'existing-indigo', name: 'IndiGo', iataCode: '6E', hasLogo: false });
    const create = vi.fn();
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: 'https://img/indigo.png' },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [existing],
      createAirline: create,
      canManageMedia: true,
    });

    expect(create).not.toHaveBeenCalled();
    expect(resolved.get('indigo')?.airlineId).toBe('existing-indigo');
    const importCall = calls.find((call) => call.url.includes('/logo/import'));
    expect(importCall!.url).toContain('/masters/airlines/existing-indigo/logo/import');
    vi.unstubAllGlobals();
  });

  it('does not re-upload a logo when the existing airline already has one', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({ url, body: init?.body });
        return success({});
      }),
    );

    const existing = airline({ id: 'existing-indigo', name: 'IndiGo', iataCode: '6E', hasLogo: true });
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: 'https://img/indigo.png' },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [existing],
      createAirline: vi.fn(),
      canManageMedia: true,
    });

    expect(resolved.get('indigo')?.airlineId).toBe('existing-indigo');
    expect(calls.some((call) => call.url.includes('/logo/import'))).toBe(false);
    vi.unstubAllGlobals();
  });

  it('still creates and selects the airline when the logo import fails', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({ url, body: init?.body });
        if (url.includes('/logo/import')) {
          return {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: async () => ({
              success: false,
              data: null,
              error: { code: 'VALIDATION', message: 'The remote airline logo could not be downloaded.' },
            }),
          };
        }
        return success({});
      }),
    );

    const created = airline({ id: 'new-air', name: 'IndiGo', iataCode: '6E' });
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: 'https://img/indigo.png' },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: async () => created,
      canManageMedia: true,
    });

    expect(resolved.get('indigo')).toEqual({ airlineId: 'new-air', airlineName: 'IndiGo' });
    expect(calls.some((call) => call.url.includes('/logo/import'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does not duplicate the airline or the logo upload across repeated loads', async () => {
    const importCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/logo/import')) {
          importCalls.push(url);
          return success({ id: 'created-indigo', name: 'IndiGo', iataCode: '6E', hasLogo: true });
        }
        return success({});
      }),
    );

    const created = airline({ id: 'created-indigo', name: 'IndiGo', iataCode: '6E' });
    const create = vi.fn(async () => created);
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: 'https://img/indigo.png' },
    ];

    // First load: airline is created and its logo imported once.
    const first = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: true,
    });
    expect(first.get('indigo')?.airlineId).toBe('created-indigo');
    expect(create).toHaveBeenCalledTimes(1);
    expect(importCalls).toHaveLength(1);

    // Second load: the master now has the airline with a logo, so nothing is
    // created again and no logo is re-imported.
    const second = await resolveFlightSegmentAirlines(refs, {
      airlines: [airline({ id: 'created-indigo', name: 'IndiGo', iataCode: '6E', hasLogo: true })],
      createAirline: create,
      canManageMedia: true,
    });
    expect(second.get('indigo')?.airlineId).toBe('created-indigo');
    expect(create).toHaveBeenCalledTimes(1);
    expect(importCalls).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('keeps the segment unlinked but preserves the name when creation fails', async () => {
    const create = vi.fn(async () => {
      throw new Error('Forbidden');
    });
    const refs: FlightSegmentAirlineRef[] = [
      { leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: null },
    ];

    const resolved = await resolveFlightSegmentAirlines(refs, {
      airlines: [],
      createAirline: create,
      canManageMedia: false,
    });

    expect(resolved.get('indigo')).toEqual({ airlineId: null, airlineName: 'IndiGo' });
  });

  it('never leaves a valid-airline segment without an airline id', async () => {
    const created = airline({ id: 'resolved', name: 'IndiGo', iataCode: '6E' });
    const resolved = await resolveFlightSegmentAirlines(
      [{ leg: 'outbound', segmentIndex: 0, name: 'IndiGo', iataCode: '6E', logoUrl: null }],
      { airlines: [], createAirline: async () => created, canManageMedia: false },
    );
    const details = flightBookmarkToDetails(flightBookmark());
    // The initial mapping still starts unlinked...
    expect(details.outbound.segments[0]!.airlineId).toBeNull();
    // ...but resolution always yields a usable airline id for valid data.
    expect(resolved.get('indigo')?.airlineId).toBe('resolved');
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
    // Images copied from the saved snapshot (no SearchAPI). The bookmark's
    // preferred URL is preserved verbatim and its thumbnail candidate is kept
    // as the fallback for the same image.
    expect(hotelDetails.images).toHaveLength(2);
    expect(hotelDetails.images![0]!.url).toBe('https://img/a-orig.jpg');
    expect(hotelDetails.images![0]!.thumbnailUrl).toBe('https://img/a.jpg');
    expect(hotelDetails.images![1]!.url).toBe('https://img/b.jpg');
    expect(hotelDetails.images![1]!.thumbnailUrl).toBeNull();
    expect(primaryImageUrl).toBe('https://img/a-orig.jpg');
  });

  it('keeps every valid bookmark image in order, dropping only unusable values and exact duplicates', () => {
    const { hotelDetails } = hotelBookmarkToDetails(
      hotelBookmark({
        snapshot: {
          hotel: {
            name: 'Taj Exotica Goa',
            city: 'Goa',
            images: [
              { thumbnail: 'https://img/1-thumb.jpg', original: 'https://img/1.jpg' },
              // Same URL twice (thumbnail === original): kept once.
              { thumbnail: 'https://img/1-thumb.jpg', original: 'https://img/1.jpg' },
              // No usable URL at all: dropped.
              {},
              { thumbnail: '', original: '' },
              // Thumbnail-only image: still imported.
              { thumbnail: 'https://img/2-thumb.jpg' },
              // Duplicate of an already-imported URL: dropped.
              { original: 'https://img/1.jpg' },
              // A different CDN/domain is a legitimate image, not a duplicate.
              { original: 'https://other-cdn.example/hotel-3.jpg' },
            ],
          },
        },
      }),
    );

    expect(hotelDetails.images).toEqual([
      { url: 'https://img/1.jpg', thumbnailUrl: 'https://img/1-thumb.jpg', alt: 'Taj Exotica Goa' },
      { url: 'https://img/2-thumb.jpg', thumbnailUrl: null, alt: 'Taj Exotica Goa' },
      {
        url: 'https://other-cdn.example/hotel-3.jpg',
        thumbnailUrl: null,
        alt: 'Taj Exotica Goa',
      },
    ]);
    expect(hotelDetails.pdfImageUrl).toBe('https://img/1.jpg');
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
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ success: true, data: {} }),
        };
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
      expect(onLoaded).toHaveBeenCalledWith(
        expect.objectContaining({ bookmarkCode: 'HTL-000123' }),
      );
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
      expect(
        screen.getByText('This is a flight bookmark. Enter a hotel bookmark ID.'),
      ).toBeInTheDocument();
    });
  });

  it('rejects a hotel bookmark in the flight section with a clear message', async () => {
    const { user, onLoaded } = renderField('FLIGHT');
    stubBookmarkLookup(success(hotelBookmark()));

    await user.type(screen.getByLabelText('Bookmark ID'), 'HTL-000123');
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onLoaded).not.toHaveBeenCalled();
      expect(
        screen.getByText('This is a hotel bookmark. Enter a flight bookmark ID.'),
      ).toBeInTheDocument();
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
