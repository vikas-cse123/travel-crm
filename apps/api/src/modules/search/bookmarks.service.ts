import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import type {
  CreateBookmarkInput,
  FlightBookmarkSnapshot,
  HotelBookmarkSnapshot,
  LiveSearchBookmarkSnapshot,
  SearchApiFlightSegment,
  SearchApiImage,
  SearchApiLayover,
  SearchApiNearbyPlace,
  SearchApiPrice,
  SearchApiReviewBreakdown,
  SearchApiCarbonEmissions,
} from '@interscale/shared';
import {
  LIVE_SEARCH_BOOKMARK_PROVIDER,
  flightFingerprint,
  hotelFingerprint,
  type LiveSearchBookmark,
  type LiveSearchBookmarkType,
} from '@interscale/shared';

/**
 * Live Search bookmarks.
 *
 * A bookmark stores a complete snapshot of what the agent saw, so it can be
 * rendered later without any SearchAPI call. Bookmarks are user-owned and
 * tenant-scoped: the owning user/company is derived from the authenticated
 * AuthContext, never from the request body.
 *
 * Duplicate prevention: a stable `fingerprint` is derived from the result and
 * its search context, and a `@@unique([userId, fingerprint])` constraint makes
 * repeated clicks idempotent (the existing row is updated instead of a new one).
 */

const TITLE_MAX = 300;

/**
 * Next public bookmark code for a type, e.g. `HTL-000123` / `FLT-000456`.
 *
 * The numeric suffix advances from the highest existing code of that type so a
 * code is never reused, even after a bookmark is deleted. The value is unique
 * because the column has a global unique constraint; on a rare concurrent race
 * the caller retries with the next number.
 */
async function nextBookmarkCode(type: 'FLIGHT' | 'HOTEL'): Promise<string> {
  const prefix = type === 'HOTEL' ? 'HTL' : 'FLT';
  const rows = await prisma.liveSearchBookmark.findMany({
    where: { type },
    select: { bookmarkCode: true },
  });
  let max = 0;
  for (const row of rows) {
    const match = /^[A-Z]{3}-(\d{6})$/.exec(row.bookmarkCode);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(6, '0')}`;
}

function toDto(bookmark: {
  id: string;
  type: string;
  provider: string;
  fingerprint: string;
  bookmarkCode: string;
  title: string;
  currency: string;
  searchParams: Prisma.JsonValue;
  snapshot: Prisma.JsonValue;
  createdAt: Date;
}): LiveSearchBookmark {
  return {
    id: bookmark.id,
    type: bookmark.type as LiveSearchBookmarkType,
    provider: bookmark.provider,
    fingerprint: bookmark.fingerprint,
    bookmarkCode: bookmark.bookmarkCode,
    title: bookmark.title,
    currency: bookmark.currency,
    searchParams: (bookmark.searchParams ?? {}) as Record<string, unknown>,
    snapshot: bookmark.snapshot as LiveSearchBookmarkSnapshot,
    createdAt: bookmark.createdAt.toISOString(),
  };
}

interface RawFlightOption {
  flights?: Array<{
    departure_airport?: { id?: string; name?: string; date?: string; time?: string };
    arrival_airport?: { id?: string; name?: string; date?: string; time?: string };
    duration?: number;
    airplane?: string;
    airline?: string;
    airline_logo?: string;
    travel_class?: string;
    flight_number?: string;
    is_overnight?: boolean;
    extensions?: string[];
    detected_extensions?: Record<string, unknown>;
  }>;
  layovers?: SearchApiLayover[];
  total_duration?: number;
  carbon_emissions?: SearchApiCarbonEmissions;
  price?: number;
  type?: string;
  extensions?: string[];
  departure_token?: string;
  booking_token?: string;
}

function buildFlightBookmark(
  searchParams: Record<string, unknown>,
  currency: string,
  option: RawFlightOption,
): { snapshot: LiveSearchBookmarkSnapshot; title: string; fingerprint: string } {
  const segments: SearchApiFlightSegment[] =
    option.flights?.map((segment) => ({
      departure_airport: {
        name: segment.departure_airport?.name ?? '—',
        id: segment.departure_airport?.id ?? '—',
        ...(segment.departure_airport?.date
          ? { date: segment.departure_airport.date }
          : {}),
        ...(segment.departure_airport?.time
          ? { time: segment.departure_airport.time }
          : {}),
      },
      arrival_airport: {
        name: segment.arrival_airport?.name ?? '—',
        id: segment.arrival_airport?.id ?? '—',
        ...(segment.arrival_airport?.date ? { date: segment.arrival_airport.date } : {}),
        ...(segment.arrival_airport?.time ? { time: segment.arrival_airport.time } : {}),
      },
      duration: segment.duration ?? 0,
      ...(segment.airplane ? { airplane: segment.airplane } : {}),
      airline: segment.airline ?? '—',
      ...(segment.airline_logo ? { airline_logo: segment.airline_logo } : {}),
      ...(segment.travel_class ? { travel_class: segment.travel_class } : {}),
      flight_number: segment.flight_number ?? '—',
      ...(segment.is_overnight ? { is_overnight: segment.is_overnight } : {}),
      ...(segment.extensions ? { extensions: segment.extensions } : {}),
      ...(segment.detected_extensions
        ? { detected_extensions: segment.detected_extensions }
        : {}),
    })) ?? [];

  const first = segments[0];
  const last = segments[segments.length - 1];
  const arrivalId =
    typeof searchParams.arrival_id === 'string' ? searchParams.arrival_id : undefined;
  const isRoundTrip =
    (option.type?.toLowerCase().includes('round') ?? false) &&
    Boolean(arrivalId) &&
    last?.arrival_airport.id === first?.departure_airport.id;
  const title =
    first && last
      ? isRoundTrip
        ? `${first.departure_airport.id} → ${arrivalId} → ${first.departure_airport.id}`
        : `${first.departure_airport.id} → ${last.arrival_airport.id}`
      : (option.flights?.[0]?.airline ?? 'Flight');

  const flight: FlightBookmarkSnapshot = {
    airline: option.flights?.[0]?.airline ?? '—',
    ...(option.flights?.[0]?.airline_logo
      ? { airlineLogo: option.flights[0].airline_logo }
      : {}),
    flightNumbers: segments.map((s) => s.flight_number).filter(Boolean),
    ...(typeof option.price === 'number' ? { price: option.price } : {}),
    currency,
    ...(option.total_duration !== undefined ? { totalDuration: option.total_duration } : {}),
    ...(option.type ? { type: option.type } : {}),
    segments,
    ...(option.layovers ? { layovers: option.layovers } : {}),
    ...(option.carbon_emissions ? { carbonEmissions: option.carbon_emissions } : {}),
    ...(option.extensions ? { extensions: option.extensions } : {}),
    ...(option.departure_token ? { departureToken: option.departure_token } : {}),
    ...(option.booking_token ? { bookingToken: option.booking_token } : {}),
  };

  const fingerprint = flightFingerprint(searchParams, segments);

  return { snapshot: { flight, raw: option }, title: title.slice(0, TITLE_MAX), fingerprint };
}

interface RawHotelProperty {
  name?: string;
  type?: string;
  property_token?: string;
  data_id?: string;
  images?: SearchApiImage[];
  city?: string;
  country?: string;
  extracted_hotel_class?: number;
  rating?: number;
  reviews?: number;
  description?: string;
  amenities?: string[];
  excluded_amenities?: string[];
  essential_info?: string[];
  price_per_night?: SearchApiPrice;
  total_price?: SearchApiPrice;
  deal?: string;
  check_in_time?: string;
  check_out_time?: string;
  nearby_places?: SearchApiNearbyPlace[];
  location_rating?: number;
  proximity_to_transit_rating?: number;
  proximity_to_things_to_do_rating?: number;
  airport_access_rating?: number;
  reviews_histogram?: Record<string, number>;
  reviews_breakdown?: SearchApiReviewBreakdown[];
  gps_coordinates?: { latitude?: number; longitude?: number };
  link?: string;
}

function buildHotelBookmark(
  searchParams: Record<string, unknown>,
  property: RawHotelProperty,
): { snapshot: LiveSearchBookmarkSnapshot; title: string; fingerprint: string } {
  const hotel: HotelBookmarkSnapshot = {
    name: property.name ?? 'Property',
    ...(property.type ? { propertyType: property.type } : {}),
    ...(property.property_token ? { propertyToken: property.property_token } : {}),
    ...(property.data_id ? { dataId: property.data_id } : {}),
    ...(property.images ? { images: property.images } : {}),
    ...(property.city ? { city: property.city } : {}),
    ...(property.country ? { country: property.country } : {}),
    ...(property.extracted_hotel_class
      ? { stars: property.extracted_hotel_class }
      : {}),
    ...(property.rating !== undefined ? { rating: property.rating } : {}),
    ...(property.reviews !== undefined ? { reviews: property.reviews } : {}),
    ...(property.description ? { description: property.description } : {}),
    ...(property.amenities ? { amenities: property.amenities } : {}),
    ...(property.excluded_amenities
      ? { excludedAmenities: property.excluded_amenities }
      : {}),
    ...(property.essential_info ? { essentialInfo: property.essential_info } : {}),
    ...(property.price_per_night ? { pricePerNight: property.price_per_night } : {}),
    ...(property.total_price ? { totalPrice: property.total_price } : {}),
    ...(property.deal ? { deal: property.deal } : {}),
    ...(property.check_in_time ? { checkInTime: property.check_in_time } : {}),
    ...(property.check_out_time ? { checkOutTime: property.check_out_time } : {}),
    ...(property.nearby_places ? { nearbyPlaces: property.nearby_places } : {}),
    ...(property.location_rating !== undefined
      ? { locationRating: property.location_rating }
      : {}),
    ...(property.proximity_to_transit_rating !== undefined
      ? { transitRating: property.proximity_to_transit_rating }
      : {}),
    ...(property.proximity_to_things_to_do_rating !== undefined
      ? { thingsToDoRating: property.proximity_to_things_to_do_rating }
      : {}),
    ...(property.airport_access_rating !== undefined
      ? { airportAccessRating: property.airport_access_rating }
      : {}),
    ...(property.reviews_histogram ? { reviewsHistogram: property.reviews_histogram } : {}),
    ...(property.reviews_breakdown ? { reviewsBreakdown: property.reviews_breakdown } : {}),
    ...(property.gps_coordinates &&
    property.gps_coordinates.latitude !== undefined &&
    property.gps_coordinates.longitude !== undefined
      ? {
          coordinates: {
            latitude: property.gps_coordinates.latitude,
            longitude: property.gps_coordinates.longitude,
          },
        }
      : {}),
    ...(property.link ? { providerLink: property.link } : {}),
  };

  const fingerprint = hotelFingerprint(
    searchParams,
    property.property_token ?? property.data_id ?? property.name ?? '',
  );

  return {
    snapshot: { hotel, raw: property },
    title: (property.name ?? 'Property').slice(0, TITLE_MAX),
    fingerprint,
  };
}

export const bookmarksService = {
  async list(auth: AuthContext, type?: LiveSearchBookmarkType): Promise<LiveSearchBookmark[]> {
    const rows = await prisma.liveSearchBookmark.findMany({
      where: {
        companyId: auth.companyId,
        userId: auth.userId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  },

  async get(auth: AuthContext, id: string): Promise<LiveSearchBookmark> {
    const row = await prisma.liveSearchBookmark.findFirst({
      where: { id, companyId: auth.companyId, userId: auth.userId },
    });
    if (!row) throw new NotFoundError('Bookmark not found.');
    return toDto(row);
  },

  /**
   * Look up a bookmark by its public code (e.g. `HTL-000123`).
   *
   * Tenant policy: the lookup is scoped to the caller's company, so any
   * verified user of the same tenant can load a colleague's bookmark into a
   * quotation, while a different tenant can never resolve (or even observe) it.
   * Bookmarks remain user-owned for listing; this read is deliberately
   * company-scoped so the quotation flow works across agents in a team.
   */
  async getByCode(auth: AuthContext, bookmarkCode: string): Promise<LiveSearchBookmark> {
    const row = await prisma.liveSearchBookmark.findFirst({
      where: { bookmarkCode, companyId: auth.companyId },
    });
    if (!row) throw new NotFoundError('Bookmark not found or you do not have access.');
    return toDto(row);
  },

  /**
   * Create (or idempotently return) a bookmark. The snapshot is built purely
   * from the already-cached result the client sends — no SearchAPI call.
   */
  async create(
    auth: AuthContext,
    input: CreateBookmarkInput,
  ): Promise<{ bookmark: LiveSearchBookmark; created: boolean }> {
    const currency =
      typeof input.searchParams.currency === 'string'
        ? input.searchParams.currency.toUpperCase()
        : 'INR';

    let title: string;
    let snapshot: LiveSearchBookmarkSnapshot;
    let fingerprint: string;

    if (input.type === 'FLIGHT') {
      if (input.snapshot.flight) {
        // The client already sent a normalized flight snapshot. Use it directly
        // and derive the title/fingerprint from it.
        const flight = input.snapshot.flight;
        const first = flight.segments[0];
        const last = flight.segments[flight.segments.length - 1];
        title = first && last ? `${first.departure_airport.id} → ${last.arrival_airport.id}` : 'Flight';
        fingerprint = flightFingerprint(input.searchParams, flight.segments);
        snapshot = { flight, raw: input.snapshot.raw };
      } else {
        const raw = (input.snapshot.raw ?? {}) as RawFlightOption;
        const built = buildFlightBookmark(input.searchParams, currency, raw);
        title = built.title;
        snapshot = built.snapshot;
        fingerprint = built.fingerprint;
      }
    } else {
      if (input.snapshot.hotel) {
        const hotel = input.snapshot.hotel;
        title = (hotel.name ?? 'Property').slice(0, TITLE_MAX);
        fingerprint = hotelFingerprint(
          input.searchParams,
          hotel.propertyToken ?? hotel.dataId ?? hotel.name ?? '',
        );
        snapshot = { hotel, raw: input.snapshot.raw };
      } else {
        const raw = (input.snapshot.raw ?? {}) as RawHotelProperty;
        const built = buildHotelBookmark(input.searchParams, raw);
        title = built.title;
        snapshot = built.snapshot;
        fingerprint = built.fingerprint;
      }
    }

    // A round-trip flight bookmark is only valid when it contains both an
    // outbound and a return journey.
    if (input.type === 'FLIGHT') {
      const isRoundTrip = input.searchParams.type === 2 || input.searchParams.type === '2';
      if (isRoundTrip) {
        const flightSegments = snapshot.flight?.segments ?? [];
        const arrivalId =
          typeof input.searchParams.arrival_id === 'string' ? input.searchParams.arrival_id : null;
        const hasReturn =
          Boolean(arrivalId) &&
          flightSegments.some((segment) => segment.departure_airport?.id === arrivalId);
        if (!hasReturn) {
          throw new ValidationError(
            'Round-trip flight bookmarks must include a return journey.',
          );
        }
      }
    }

    const existing = await prisma.liveSearchBookmark.findUnique({
      where: { userId_fingerprint: { userId: auth.userId, fingerprint } },
    });

    if (existing) {
      // Idempotent: update the existing bookmark rather than creating a duplicate.
      const updated = await prisma.liveSearchBookmark.update({
        where: { id: existing.id },
        data: {
          searchParams: input.searchParams as Prisma.InputJsonValue,
          snapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      return { bookmark: toDto(updated), created: false };
    }

    // Generate the public code. The column is globally unique; on an unlikely
    // concurrent race, retry with the next number.
    let bookmarkCode = await nextBookmarkCode(input.type);
    let row;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        row = await prisma.liveSearchBookmark.create({
          data: {
            companyId: auth.companyId,
            userId: auth.userId,
            type: input.type,
            provider: LIVE_SEARCH_BOOKMARK_PROVIDER,
            fingerprint,
            bookmarkCode,
            title,
            currency,
            searchParams: input.searchParams as Prisma.InputJsonValue,
            snapshot: snapshot as Prisma.InputJsonValue,
          },
        });
        break;
      } catch (error) {
        const isUniqueViolation =
          error instanceof Error &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002';
        if (!isUniqueViolation || attempt === 4) throw error;
        bookmarkCode = await nextBookmarkCode(input.type);
      }
    }

    return { bookmark: toDto(row!), created: true };
  },

  async remove(auth: AuthContext, id: string): Promise<void> {
    const result = await prisma.liveSearchBookmark.deleteMany({
      where: { id, companyId: auth.companyId, userId: auth.userId },
    });
    if (result.count === 0) throw new NotFoundError('Bookmark not found.');
  },
};
