import { z } from 'zod';

/**
 * Live hotel & flight search against SearchApi (searchapi.io).
 *
 * The CRM never exposes the SearchApi key to the browser: the API proxies the
 * query server-side and returns the parsed SearchApi response verbatim so the
 * UI can render every field the provider sends back.
 */

// ---------------------------------------------------------------------------
// Flights — engine=google_flights
// ---------------------------------------------------------------------------

/**
 * Values accepted by SearchApi's google_flights engine. These are lowercase on
 * purpose — the provider rejects the uppercase Google-UI spellings.
 */
export const FLIGHT_TRAVEL_CLASSES = [
  'economy',
  'premium_economy',
  'business',
  'first_class',
] as const;

/** Values accepted by SearchApi's google_flights engine. */
export const FLIGHT_STOPS = ['any', 'nonstop', 'one_stop_or_fewer', 'two_stops_or_fewer'] as const;

/** Values accepted by SearchApi's google_flights sort_by parameter. */
export const FLIGHT_SORT_BY = [
  'top_flights',
  'price',
  'departure_time',
  'arrival_time',
  'duration',
  'emissions',
] as const;

/**
 * Time range used by outbound_times / return_times. Four comma-separated
 * numbers: departure-start, departure-end, arrival-start, arrival-end (hours,
 * 0–23). e.g. "4,18,2,18".
 */
const timeRange = z
  .string()
  .trim()
  .regex(/^\d{1,2},\d{1,2},\d{1,2},\d{1,2}$/, 'Time range must be "start,end,start,end" hours.')
  .refine(
    (value) =>
      value.split(',').every((part) => {
        const n = Number(part);
        return Number.isInteger(n) && n >= 0 && n <= 23;
      }),
    { message: 'Time range hours must be between 0 and 23.' },
  );

const iataCode = z
  .string()
  .trim()
  .min(3)
  .max(4)
  .transform((value) => value.toUpperCase());

const searchDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD.');

/** Query schema for GET /api/search/flights. */
export const flightSearchQuerySchema = z
  .object({
    departure_id: iataCode,
    arrival_id: iataCode,
    outbound_date: searchDate,
    return_date: searchDate.optional(),
    /** 1 = one-way, 2 = round trip. Defaults to round trip. */
    type: z.coerce.number().int().min(1).max(2).default(2),
    currency: z.string().trim().length(3).toUpperCase().default('INR'),
    hl: z.string().trim().min(2).max(10).default('en'),
    gl: z.string().trim().min(2).max(5).default('in'),
    adults: z.coerce.number().int().min(1).max(9).default(1),
    children: z.coerce.number().int().min(0).max(9).default(0),
    infants_in_seat: z.coerce.number().int().min(0).max(9).default(0),
    infants_on_lap: z.coerce.number().int().min(0).max(9).default(0),
    travel_class: z.enum(FLIGHT_TRAVEL_CLASSES).optional(),
    stops: z.enum(FLIGHT_STOPS).optional(),
    departure_token: z.string().trim().optional(),
    max_price: z.coerce.number().int().min(1).optional(),
    min_price: z.coerce.number().int().min(0).optional(),
    airlines: z.string().trim().optional(),
    // Advanced filters (all optional; only supported SearchApi params exposed).
    sort_by: z.enum(FLIGHT_SORT_BY).optional(),
    included_airlines: z.string().trim().optional(),
    excluded_airlines: z.string().trim().optional(),
    carry_on_bags: z.coerce.number().int().min(0).max(9).optional(),
    checked_bags: z.coerce.number().int().min(0).max(9).optional(),
    outbound_times: timeRange.optional(),
    return_times: timeRange.optional(),
    max_flight_duration: z.coerce.number().int().min(60).max(2880).optional(),
    layover_duration_min: z.coerce.number().int().min(30).max(1800).optional(),
    layover_duration_max: z.coerce.number().int().min(30).max(1800).optional(),
    included_connecting_airports: z.string().trim().optional(),
    excluded_connecting_airports: z.string().trim().optional(),
    /** 1 = only flights with lower-than-typical emissions. */
    emissions: z.coerce.number().int().min(0).max(1).optional(),
  })
  .refine((data) => !data.return_date || data.return_date >= data.outbound_date, {
    path: ['return_date'],
    message: 'Return date must be after the departure date.',
  });

export type FlightSearchQuery = z.infer<typeof flightSearchQuerySchema>;

/** SearchApi "airport" object used by both request and response sides. */
export interface SearchApiAirport {
  name: string;
  id: string;
  date?: string;
  time?: string;
}

/** A single flight leg inside a flight option. */
export interface SearchApiFlightSegment {
  departure_airport: SearchApiAirport;
  arrival_airport: SearchApiAirport;
  duration: number;
  airplane?: string;
  airline: string;
  airline_logo?: string;
  travel_class?: string;
  flight_number: string;
  is_overnight?: boolean;
  extensions?: string[];
  detected_extensions?: Record<string, unknown>;
}

/** A layover between two segments of the same option. */
export interface SearchApiLayover {
  duration: number;
  name: string;
  id: string;
  is_overnight?: boolean;
}

export interface SearchApiCarbonEmissions {
  this_flight?: number;
  typical_for_this_route?: number;
  difference_percent?: number;
  lowest_route?: number;
}

/** One bookable flight option ("best" or "other"). */
export interface SearchApiFlightOption {
  flights: SearchApiFlightSegment[];
  layovers?: SearchApiLayover[];
  total_duration: number;
  carbon_emissions?: SearchApiCarbonEmissions;
  price: number;
  type?: string;
  extensions?: string[];
  airline_logo?: string;
  departure_token?: string;
  booking_token?: string;
}

export interface SearchApiPriceInsights {
  lowest_price?: number;
  price_level?: string;
  typical_price_range?: { low_price: number; high_price: number };
  price_history?: { price: number; iso_date: string }[];
}

/** Default currency for live searches. */
export const SEARCH_DEFAULT_CURRENCY = 'INR';

/** Raw response body returned by SearchApi for engine=google_flights. */
export interface FlightSearchResponse {
  search_metadata?: Record<string, unknown>;
  search_parameters?: Record<string, unknown>;
  best_flights?: SearchApiFlightOption[];
  other_flights?: SearchApiFlightOption[];
  price_insights?: SearchApiPriceInsights;
  airports?: unknown;
  airlines?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Hotels — engine=google_hotels
// ---------------------------------------------------------------------------

export const HOTEL_PROPERTY_TYPES = ['hotel', 'vacation_rental'] as const;

/**
 * Exact SearchAPI google_hotels `property_types` numeric values
 * (comma-separated in the request). Grouped hotel vs vacation rental.
 */
export const HOTEL_PROPERTY_TYPE_IDS = {
  hotels: [
    { id: 12, label: 'Beach hotels' },
    { id: 13, label: 'Boutique hotels' },
    { id: 14, label: 'Hostels' },
    { id: 15, label: 'Inns' },
    { id: 16, label: 'Motels' },
    { id: 17, label: 'Resorts' },
    { id: 18, label: 'Spa hotels' },
    { id: 19, label: 'Bed and breakfasts' },
    { id: 20, label: 'Other' },
    { id: 21, label: 'Apartment hotels' },
  ],
  vacationRentals: [
    { id: 1, label: 'Apartments' },
    { id: 2, label: 'Bungalows' },
    { id: 3, label: 'Cabins' },
    { id: 4, label: 'Chalets' },
    { id: 5, label: 'Cottages' },
    { id: 6, label: 'Gîtes' },
    { id: 7, label: 'Holiday villages' },
    { id: 8, label: 'Houses' },
    { id: 9, label: 'Houseboats' },
    { id: 10, label: 'Villas' },
    { id: 11, label: 'Other' },
    { id: 21, label: 'Apartment hotels' },
  ],
} as const;

/**
 * Exact SearchAPI google_hotels `amenities` numeric values
 * (comma-separated in the request).
 */
export const HOTEL_AMENITY_IDS = [
  { id: 1, label: 'Free parking' },
  { id: 3, label: 'Parking' },
  { id: 4, label: 'Indoor pool' },
  { id: 5, label: 'Outdoor pool' },
  { id: 6, label: 'Pool' },
  { id: 7, label: 'Fitness centre' },
  { id: 8, label: 'Restaurant' },
  { id: 9, label: 'Free breakfast' },
  { id: 10, label: 'Spa' },
  { id: 11, label: 'Beach access' },
  { id: 12, label: 'Kid-friendly' },
  { id: 15, label: 'Bar' },
  { id: 19, label: 'Pet-friendly' },
  { id: 22, label: 'Room service' },
  { id: 35, label: 'Free Wi-Fi' },
  { id: 40, label: 'Air-conditioned' },
  { id: 52, label: 'All-inclusive available' },
  { id: 53, label: 'Wheelchair accessible' },
  { id: 61, label: 'EV charger' },
] as const;

/** SearchAPI hotel sort_by values mapped to user-friendly labels. */
export const HOTEL_SORT_OPTIONS = [
  { value: 'relevance', label: 'Recommended' },
  { value: 'lowest_price', label: 'Price low → high' },
  { value: 'highest_rating', label: 'Highest rated' },
  { value: 'most_reviewed', label: 'Most reviewed' },
] as const;

/** SearchAPI flight sort_by values mapped to user-friendly labels. Cheapest first (default). */
export const FLIGHT_SORT_OPTIONS = [
  { value: 'price', label: 'Cheapest' },
  { value: 'top_flights', label: 'Recommended / Best' },
  { value: 'departure_time', label: 'Departure time' },
  { value: 'arrival_time', label: 'Arrival time' },
  { value: 'duration', label: 'Shortest duration' },
  { value: 'emissions', label: 'Lowest emissions' },
] as const;

/** Guest-rating options mapped to the exact SearchAPI `rating` values. */
export const HOTEL_RATING_OPTIONS = [
  { value: 7, label: '3.5+ stars' },
  { value: 8, label: '4.0+ stars' },
  { value: 9, label: '4.5+ stars' },
] as const;

/**
 * A canonical destination selected from autocomplete.
 *
 * `displayName` is what the user chose (e.g. "Delhi"); `searchQuery` is the
 * explicit, unambiguous provider query built from it (e.g. "Hotels in Delhi,
 * India"). `kgmid` is the Knowledge Graph id returned by the autocomplete
 * engine, kept so a Hotels Only / provider filter can target it later.
 */
export interface HotelDestination {
  displayName: string;
  searchQuery: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  kgmid?: string;
}

/** Query schema for GET /api/search/hotels. */
export const hotelSearchQuerySchema = z
  .object({
    destination: z.string().trim().min(1, 'A destination is required.').max(300),
    check_in_date: searchDate,
    check_out_date: searchDate,
    adults: z.coerce.number().int().min(1).max(9).default(2),
    children: z.coerce.number().int().min(0).max(9).default(0),
    rooms: z.coerce.number().int().min(1).max(9).default(1),
    currency: z.string().trim().length(3).toUpperCase().default('INR'),
    hl: z.string().trim().min(2).max(10).default('en'),
    /** Country context. Travel CRM defaults to India; the destination query is
     * explicit so this is a hint rather than the only disambiguator. */
    gl: z.string().trim().min(2).max(5).default('in'),
    min_price: z.coerce.number().int().min(0).optional(),
    max_price: z.coerce.number().int().min(1).optional(),
    property_type: z.enum(HOTEL_PROPERTY_TYPES).optional(),
    hotel_class: z.coerce.number().int().min(1).max(5).optional(),
    /** Sequential token for the next result page. */
    next_page_token: z.string().trim().optional(),
    // Advanced filters (all optional; only supported SearchApi params exposed).
    sort_by: z.enum(['relevance', 'lowest_price', 'highest_rating', 'most_reviewed']).optional(),
    property_types: z.string().trim().optional(),
    amenities: z.string().trim().optional(),
    /** 7 = 3.5+, 8 = 4.0+, 9 = 4.5+ stars (guest rating). */
    rating: z.coerce.number().int().min(7).max(9).optional(),
    free_cancellation: z.enum(['true', 'false']).optional(),
    special_offers: z.enum(['true', 'false']).optional(),
    eco_certified: z.enum(['true', 'false']).optional(),
    brands: z.string().trim().optional(),
    bedrooms: z.coerce.number().int().min(0).max(20).optional(),
    bathrooms: z.coerce.number().int().min(0).max(20).optional(),
  })
  .refine((data) => data.check_out_date > data.check_in_date, {
    path: ['check_out_date'],
    message: 'Check-out date must be after the check-in date.',
  });

export type HotelSearchQuery = z.infer<typeof hotelSearchQuerySchema>;

/** Query schema for GET /api/search/hotels/autocomplete. */
export const hotelAutocompleteQuerySchema = z.object({
  q: z.string().trim().min(1, 'Type a destination to search.').max(120),
  // The autocomplete engine expects a full locale like "en-US", not "en".
  hl: z.string().trim().min(2).max(10).default('en-US'),
});

export type HotelAutocompleteQuery = z.infer<typeof hotelAutocompleteQuerySchema>;

/** One suggestion returned by engine=google_hotels_autocomplete. */
export interface HotelAutocompleteSuggestion {
  type?: string;
  kgmid?: string;
  ludocid?: string;
  title?: string;
  subtitle?: string;
  thumbnail?: string;
}

/** Raw response body returned by SearchApi for engine=google_hotels_autocomplete. */
export interface HotelAutocompleteResponse {
  suggestions?: HotelAutocompleteSuggestion[];
  error?: string;
}

export interface SearchApiPrice {
  price?: string;
  extracted_price?: number;
  price_before_taxes?: string;
  extracted_price_before_taxes?: number;
}

export interface SearchApiTransportation {
  type: string;
  duration: string;
}

export interface SearchApiNearbyPlace {
  name: string;
  transportations?: SearchApiTransportation[];
}

export interface SearchApiImage {
  thumbnail?: string;
  original?: string;
}

export interface SearchApiReviewBreakdown {
  name?: string;
  description?: string;
  total?: number;
  positive?: number;
  neutral?: number;
  negative?: number;
}

/** One property returned by engine=google_hotels. */
export interface SearchApiHotelProperty {
  type?: string;
  property_token?: string;
  data_id?: string;
  name?: string;
  link?: string;
  description?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  city?: string;
  country?: string;
  check_in_time?: string;
  check_out_time?: string;
  price_per_night?: SearchApiPrice;
  total_price?: SearchApiPrice;
  deal?: string;
  deal_description?: string;
  nearby_places?: SearchApiNearbyPlace[];
  hotel_class?: string;
  extracted_hotel_class?: number;
  images?: SearchApiImage[];
  rating?: number;
  reviews?: number;
  reviews_histogram?: Record<string, number>;
  location_rating?: number;
  proximity_to_things_to_do_rating?: number;
  proximity_to_transit_rating?: number;
  airport_access_rating?: number;
  reviews_breakdown?: SearchApiReviewBreakdown[];
  amenities?: string[];
  excluded_amenities?: string[];
  essential_info?: string[];
}

/** Raw response body returned by SearchApi for engine=google_hotels. */
export interface HotelSearchResponse {
  search_metadata?: Record<string, unknown>;
  search_parameters?: Record<string, unknown>;
  search_information?: { total_results?: number };
  properties?: SearchApiHotelProperty[];
  pagination?: { records_from?: number; records_to?: number; next_page_token?: string };
  error?: string;
}

/** Generic metadata wrapper the API returns for any live search. */
export interface SearchApiMetadata {
  id?: string;
  status?: string;
  created_at?: string;
  request_time_taken?: number;
  parsing_time_taken?: number;
  total_time_taken?: number;
  request_url?: string;
  html_url?: string;
  json_url?: string;
}

/** Result of the Test connection action. */
export interface LiveSearchTestResult {
  connected: boolean;
  reason?: 'invalid' | 'quota';
}

// ---------------------------------------------------------------------------
// Multiple SearchAPI keys per user
// ---------------------------------------------------------------------------

export const SEARCH_API_KEY_STATUSES = ['ACTIVE', 'EXHAUSTED', 'INVALID', 'DISABLED'] as const;
export type SearchApiKeyStatus = (typeof SEARCH_API_KEY_STATUSES)[number];

/** One saved SearchAPI key as exposed to the client. The secret is never sent. */
export interface SearchApiKeyRecord {
  id: string;
  /** Masked preview, e.g. "••••abcd". Never the full key. */
  maskedKey: string;
  status: SearchApiKeyStatus;
  /** Lower number = higher priority. Ties break on insertion order. */
  priority: number;
  createdAt: string;
}

/** Response for GET /api/search/keys. */
export interface SearchApiKeysResponse {
  keys: SearchApiKeyRecord[];
  /** Whether a server-level SEARCHAPI_API_KEY fallback is configured. */
  serverFallbackAvailable: boolean;
}

/** Body for PATCH /api/search/keys/:id — enable/disable or reorder. */
export const updateSearchApiKeySchema = z
  .object({
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    priority: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .refine((value) => value.status !== undefined || value.priority !== undefined, {
    message: 'Provide a status or a priority to update.',
  });
export type UpdateSearchApiKeyInput = z.infer<typeof updateSearchApiKeySchema>;

// ---------------------------------------------------------------------------
// Owner SearchAPI usage dashboard
// ---------------------------------------------------------------------------

export const SEARCH_API_USAGE_TYPES = ['FLIGHT', 'HOTEL', 'AUTOCOMPLETE'] as const;
export type SearchApiUsageType = (typeof SEARCH_API_USAGE_TYPES)[number];

export const SEARCH_API_USAGE_STATUSES = [
  'SUCCESS',
  'QUOTA_EXHAUSTED',
  'INVALID_KEY',
  'PROVIDER_ERROR',
  'NETWORK_ERROR',
] as const;
export type SearchApiUsageStatus = (typeof SEARCH_API_USAGE_STATUSES)[number];

/** Query for the usage endpoints — an inclusive YYYY-MM-DD date range. */
export const searchUsageRangeSchema = z.object({
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD.')
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD.')
    .optional(),
});
export type SearchUsageRange = z.infer<typeof searchUsageRangeSchema>;

/** Aggregated company-wide SearchAPI usage for the Owner dashboard. */
export interface SearchApiUsageSummary {
  range: { from: string; to: string };
  totals: {
    total: number;
    flights: number;
    hotels: number;
    autocomplete: number;
    successful: number;
    failed: number;
  };
  byService: Array<{ label: string; value: number }>;
  byUser: Array<{
    userId: string;
    name: string;
    email: string;
    flights: number;
    hotels: number;
    autocomplete: number;
    total: number;
  }>;
  daily: Array<{
    date: string;
    flights: number;
    hotels: number;
    autocomplete: number;
    total: number;
  }>;
  byKey: Array<{ maskedKey: string; requests: number; status: string }>;
}

/** One recent provider request in a user's detail view. */
export interface SearchApiUsageActivityRow {
  id: string;
  type: SearchApiUsageType;
  status: SearchApiUsageStatus;
  isFallbackAttempt: boolean;
  maskedKeySuffix: string | null;
  createdAt: string;
}

/** Per-user detail: totals plus the most recent provider requests. */
export interface SearchApiUsageUserDetail {
  userId: string;
  name: string;
  email: string;
  totals: {
    flights: number;
    hotels: number;
    autocomplete: number;
    total: number;
    successful: number;
    failed: number;
  };
  recent: SearchApiUsageActivityRow[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export const LIVE_SEARCH_BOOKMARK_TYPES = ['FLIGHT', 'HOTEL'] as const;
export type LiveSearchBookmarkType = (typeof LIVE_SEARCH_BOOKMARK_TYPES)[number];
export const LIVE_SEARCH_BOOKMARK_PROVIDER = 'SEARCHAPI';

/**
 * Normalized display snapshot for a flight bookmark. Enough to render the
 * result entirely from the DB — never requires another SearchAPI call.
 */
export interface FlightBookmarkSnapshot {
  airline: string;
  airlineLogo?: string | null;
  flightNumbers: string[];
  /** Optional: omit when the provider returned no price rather than defaulting to 0. */
  price?: number;
  currency: string;
  totalDuration?: number;
  type?: string; // "One way" | "Round trip"
  segments: SearchApiFlightSegment[];
  layovers?: SearchApiLayover[];
  carbonEmissions?: SearchApiCarbonEmissions;
  extensions?: string[];
  departureToken?: string | null;
  bookingToken?: string | null;
  baggagePolicyUrl?: string | null;
  passengerAssistanceUrl?: string | null;
}

/** Normalized display snapshot for a hotel bookmark. */
export interface HotelBookmarkSnapshot {
  name: string;
  propertyType?: string;
  propertyToken?: string | null;
  dataId?: string | null;
  images?: SearchApiImage[];
  city?: string;
  country?: string;
  stars?: number;
  rating?: number;
  reviews?: number;
  description?: string;
  amenities?: string[];
  excludedAmenities?: string[];
  essentialInfo?: string[];
  pricePerNight?: SearchApiPrice | null;
  totalPrice?: SearchApiPrice | null;
  deal?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  nearbyPlaces?: SearchApiNearbyPlace[];
  locationRating?: number;
  transitRating?: number;
  thingsToDoRating?: number;
  airportAccessRating?: number;
  reviewsHistogram?: Record<string, number>;
  reviewsBreakdown?: SearchApiReviewBreakdown[];
  coordinates?: { latitude: number; longitude: number } | null;
  providerLink?: string | null;
}

/** The full snapshot stored on a bookmark: normalized + original provider data. */
export interface LiveSearchBookmarkSnapshot {
  flight?: FlightBookmarkSnapshot | null;
  hotel?: HotelBookmarkSnapshot | null;
  /** The original provider result object, for debugging/inspection only. */
  raw?: unknown;
}

/** Request body for creating a bookmark from an existing cached result. */
export const createBookmarkSchema = z.object({
  type: z.enum(LIVE_SEARCH_BOOKMARK_TYPES),
  /** The search parameters that produced this result. */
  searchParams: z.record(z.string(), z.unknown()),
  /** Normalized + raw snapshot of the saved result. */
  snapshot: z.custom<LiveSearchBookmarkSnapshot>(
    (value) => typeof value === 'object' && value !== null,
  ),
});

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

/** Query schema for GET /api/search/bookmarks. */
export const bookmarkListQuerySchema = z.object({
  type: z.enum(LIVE_SEARCH_BOOKMARK_TYPES).optional(),
});

export type BookmarkListQuery = z.infer<typeof bookmarkListQuerySchema>;

/** A bookmark as returned to the client (no secrets, DB-only). */
export interface LiveSearchBookmark {
  id: string;
  type: LiveSearchBookmarkType;
  provider: string;
  /** Stable identity of the saved result, computed identically on web + API. */
  fingerprint: string;
  /** Public, human-readable bookmark code, e.g. HTL-000123 / FLT-000456. */
  bookmarkCode: string;
  title: string;
  currency: string;
  searchParams: Record<string, unknown>;
  snapshot: LiveSearchBookmarkSnapshot;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Bookmark fingerprints (shared so web and API compute identical values)
// ---------------------------------------------------------------------------

function stableString(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Deterministic, environment-agnostic hash used for bookmark fingerprints.
 * Purely JS (no node:crypto / SubtleCrypto) so it runs identically in the
 * browser and on the API.
 */
export function hashFingerprint(...parts: unknown[]): string {
  const str = parts.map((part) => stableString(part)).join('\u0000');
  // FNV-1a 32-bit -> 8 hex chars.
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Stable fingerprint for a flight itinerary. Includes the search context plus
 * every segment's identity (airports, date, flight number) so two different
 * flights from the same search (6E 1013 vs XJ 231) produce different values.
 */
export function flightFingerprint(
  searchParams: Record<string, unknown>,
  segments: SearchApiFlightSegment[],
): string {
  return hashFingerprint(
    LIVE_SEARCH_BOOKMARK_PROVIDER,
    'FLIGHT',
    searchParams,
    segments.map((s) => [
      s.departure_airport?.id,
      s.departure_airport?.date,
      s.arrival_airport?.id,
      s.arrival_airport?.date,
      s.flight_number,
    ]),
  );
}

/** Stable fingerprint for a hotel, based on its provider token/name. */
export function hotelFingerprint(
  searchParams: Record<string, unknown>,
  propertyTokenOrName: string,
): string {
  return hashFingerprint(LIVE_SEARCH_BOOKMARK_PROVIDER, 'HOTEL', searchParams, propertyTokenOrName);
}
