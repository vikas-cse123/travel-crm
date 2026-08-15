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
export const flightSearchQuerySchema = z.object({
  departure_id: iataCode,
  arrival_id: iataCode,
  outbound_date: searchDate,
  return_date: searchDate.optional(),
  /** 1 = one-way, 2 = round trip. Defaults to round trip. */
  type: z.coerce.number().int().min(1).max(2).default(2),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
  hl: z.string().trim().min(2).max(10).default('en'),
  gl: z.string().trim().min(2).max(5).default('us'),
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
export const hotelSearchQuerySchema = z.object({
  destination: z
    .string()
    .trim()
    .min(1, 'A destination is required.')
    .max(300),
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
