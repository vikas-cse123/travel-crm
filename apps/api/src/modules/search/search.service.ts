import { env, isProduction } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ServiceUnavailableError, ValidationError } from '../../utils/errors.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import type {
  FlightSearchQuery,
  HotelAutocompleteQuery,
  HotelSearchQuery,
  SearchApiUsageStatus,
  SearchApiUsageType,
} from '@interscale/shared';
import { resolveSearchApiKeys, type ResolvedSearchApiKey } from './search-keys.service.js';
import { markSearchApiKeyStatus } from './search-keys.service.js';
import { recordSearchApiUsage } from './search-usage.service.js';

/**
 * Live hotel & flight search proxy for SearchApi (searchapi.io).
 *
 * The SearchAPI key never reaches the browser: the backend resolves the
 * authenticated user's own saved keys (falling back to the server-level
 * SEARCHAPI_API_KEY when the user has none) and uses them only when calling
 * SearchAPI.io. Each user may save several keys; a search starts with the
 * highest-priority ACTIVE key and, ONLY when the provider clearly reports
 * quota/credit exhaustion or an invalid key, automatically falls through to
 * the next enabled key. Network errors, provider internal errors and bad
 * requests keep the existing behaviour and never rotate.
 */

const ENGINE_FLIGHTS = 'google_flights';
const ENGINE_HOTELS = 'google_hotels';
const ENGINE_HOTELS_AUTOCOMPLETE = 'google_hotels_autocomplete';

/**
 * Development/test-only count of outgoing SearchAPI requests, broken down by
 * engine. Lets tests (and a developer) prove exactly how many paid provider
 * calls a single user action produces. No-op for real usage (the counter is
 * purely in-memory and only read via the exported accessors).
 */
const searchApiRequestCounts: Record<string, number> = {};
export function recordSearchApiRequest(engine: string): void {
  searchApiRequestCounts[engine] = (searchApiRequestCounts[engine] ?? 0) + 1;
}
export function getSearchApiRequestCounts(): Record<string, number> {
  return { ...searchApiRequestCounts };
}
export function resetSearchApiRequestCounts(): void {
  for (const key of Object.keys(searchApiRequestCounts)) delete searchApiRequestCounts[key];
}
export function getSearchApiRequestTotal(): number {
  return Object.values(searchApiRequestCounts).reduce((sum, n) => sum + n, 0);
}

/** Why a provider attempt failed. Only quota/invalid-key rotate; the rest surface. */
export type SearchApiFailureCategory =
  'QUOTA_EXHAUSTED' | 'INVALID_KEY' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';

const categoryToUsageStatus = (category: SearchApiFailureCategory): SearchApiUsageStatus => {
  switch (category) {
    case 'QUOTA_EXHAUSTED':
      return 'QUOTA_EXHAUSTED';
    case 'INVALID_KEY':
      return 'INVALID_KEY';
    case 'NETWORK_ERROR':
      return 'NETWORK_ERROR';
    default:
      return 'PROVIDER_ERROR';
  }
};

/** Raised when SearchAPI responds 429 or an explicit quota message. Rotates. */
export class SearchApiQuotaExceededError extends ServiceUnavailableError {
  readonly category: SearchApiFailureCategory = 'QUOTA_EXHAUSTED';
  constructor(message: string) {
    super(message);
    this.name = 'SearchApiQuotaExceededError';
  }
}

/** Raised when SearchAPI rejects the key itself (401/403). Rotates. */
export class SearchApiInvalidKeyError extends ServiceUnavailableError {
  readonly category: SearchApiFailureCategory = 'INVALID_KEY';
  constructor(message = 'SearchAPI rejected the API key.') {
    super(message);
    this.name = 'SearchApiInvalidKeyError';
  }
}

/** Any other provider failure. Surfaced as before — no rotation. */
export class SearchApiProviderError extends ServiceUnavailableError {
  readonly category: SearchApiFailureCategory = 'PROVIDER_ERROR';
  constructor(
    message = 'The live search provider could not complete the request. Please try again.',
  ) {
    super(message);
    this.name = 'SearchApiProviderError';
  }
}

/** Network/timeout failures. Surfaced as before — no rotation. */
export class SearchApiNetworkError extends ServiceUnavailableError {
  readonly category: SearchApiFailureCategory = 'NETWORK_ERROR';
  constructor(
    message = 'The live search provider could not complete the request. Please try again.',
  ) {
    super(message);
    this.name = 'SearchApiNetworkError';
  }
}

/**
 * The known SearchAPI quota/credit-exhaustion signals. A key is treated as
 * exhausted ONLY when the provider clearly reports quota/credit exhaustion —
 * never for bad parameters, validation, network timeouts or provider bugs.
 */
export function isQuotaExhaustionMessage(message: string): boolean {
  return /used all of the searches|searches for the month|monthly (quota|limit)|quota exceeded/i.test(
    message,
  );
}

/** Read a non-2xx SearchApi body so the real provider reason can be logged. */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string } | null;
    if (body?.error) return String(body.error);
  } catch {
    // Non-JSON error body; fall through to the status line.
  }
  return response.statusText || `HTTP ${response.status}`;
}

/**
 * Call SearchApi with the given API key and return the parsed JSON body.
 *
 * `apiKey` is always supplied by the caller (resolved per-user or the server
 * fallback) — this function never reads the key from any other source.
 */
async function callSearchApi(
  apiKey: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(env.SEARCHAPI_BASE_URL);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const engine = String(params.engine ?? 'unknown');
  recordSearchApiRequest(engine);

  if (!isProduction && params.engine === ENGINE_FLIGHTS) {
    // Sanitized outgoing flight parameters for development diagnosis. The API
    // key and any internal token are never logged here.
    logger.info(
      {
        flight_type: url.searchParams.get('flight_type'),
        departure_id: url.searchParams.get('departure_id'),
        arrival_id: url.searchParams.get('arrival_id'),
        outbound_date: url.searchParams.get('outbound_date'),
        return_date: url.searchParams.get('return_date') ?? 'ABSENT',
        sort_by: url.searchParams.get('sort_by'),
        devOnly: true,
      },
      'Flight search outgoing parameters',
    );
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    logger.warn(
      {
        engine: params.engine,
        elapsedMs,
        timedOut,
        reason: error instanceof Error ? error.message : String(error),
        devOnly: !isProduction,
      },
      'SearchApi request could not be completed',
    );
    throw new SearchApiNetworkError();
  }
  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    const providerError = await readErrorBody(response);
    logger.warn(
      {
        status: response.status,
        engine: params.engine,
        providerError,
        elapsedMs,
        devOnly: !isProduction,
      },
      'SearchApi request failed',
    );
    if (response.status === 429) {
      throw new SearchApiQuotaExceededError(
        'SearchAPI monthly quota exhausted. Add a new SearchAPI key or wait for the next cycle.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new SearchApiInvalidKeyError();
    }
    throw new SearchApiProviderError();
  }

  const body = (await response.json()) as Record<string, unknown>;

  if (body.error) {
    const message = String(body.error);
    logger.warn(
      { engine: params.engine, providerError: message, elapsedMs, devOnly: !isProduction },
      'SearchApi returned error',
    );
    if (isQuotaExhaustionMessage(message)) {
      throw new SearchApiQuotaExceededError(
        'SearchAPI monthly quota exhausted. Add a new SearchAPI key or wait for the next cycle.',
      );
    }
    throw new SearchApiProviderError();
  }

  return body;
}

type ProviderParamBuilder<Q> = (query: Q) => Record<string, string | number | undefined>;

/**
 * Run one logical search against SearchAPI with automatic key rotation.
 *
 * - Starts with the first enabled, usable (ACTIVE) key.
 * - On a clearly quota-exhausted or invalid key, marks that key and falls
 *   through to the next enabled key — each key is attempted at most once.
 * - Network/provider errors are surfaced immediately (no rotation).
 * - Every actual provider attempt is recorded in SearchApiUsage, so the Owner
 *   dashboard counts real credit consumption (1 logical search can equal
 *   several provider requests when keys fall through).
 */
async function executeProviderSearch<Q>(
  auth: AuthContext,
  type: SearchApiUsageType,
  engine: string,
  buildParams: ProviderParamBuilder<Q>,
  query: Q,
): Promise<unknown> {
  const keys = await resolveSearchApiKeys(auth);
  if (keys.length === 0) {
    throw new ValidationError(
      'No active SearchAPI key. Add an API key in Settings to use Live Search.',
    );
  }

  let lastRotatableError: SearchApiQuotaExceededError | SearchApiInvalidKeyError | null = null;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as ResolvedSearchApiKey;
    const params = buildParams(query);
    try {
      const body = await callSearchApi(key.plaintext, params);
      await recordSearchApiUsage(auth, {
        type,
        engine,
        status: 'SUCCESS',
        isFallbackAttempt: index > 0,
        searchApiKeyId: key.id,
        maskedKeySuffix: key.maskedSuffix,
      });
      return body;
    } catch (error) {
      const category = (error as { category?: SearchApiFailureCategory }).category;
      await recordSearchApiUsage(auth, {
        type,
        engine,
        status: category ? categoryToUsageStatus(category) : 'PROVIDER_ERROR',
        isFallbackAttempt: index > 0,
        searchApiKeyId: key.id,
        maskedKeySuffix: key.maskedSuffix,
      });
      if (category === 'QUOTA_EXHAUSTED') {
        if (key.id) await markSearchApiKeyStatus(auth, key.id, 'EXHAUSTED');
        lastRotatableError = error as SearchApiQuotaExceededError;
        continue;
      }
      if (category === 'INVALID_KEY') {
        if (key.id) await markSearchApiKeyStatus(auth, key.id, 'INVALID');
        lastRotatableError = error as SearchApiInvalidKeyError;
        continue;
      }
      // Network/provider errors retain existing behaviour: surface, no rotation.
      throw error;
    }
  }

  // Every enabled key was tried and exhausted/invalidated.
  throw lastRotatableError ?? new SearchApiQuotaExceededError('SearchAPI monthly quota exhausted.');
}

/** Build the SearchApi parameter map for a flight search. */
function flightParams(query: FlightSearchQuery): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {
    engine: ENGINE_FLIGHTS,
    departure_id: query.departure_id,
    arrival_id: query.arrival_id,
    outbound_date: query.outbound_date,
    // SearchApi's google_flights engine expects flight_type, not `type`.
    // 1 = one-way, 2 = round trip.
    flight_type: query.type === 1 ? 'one_way' : 'round_trip',
    currency: query.currency,
    hl: query.hl,
    gl: query.gl,
    adults: query.adults,
    children: query.children,
    infants_in_seat: query.infants_in_seat,
    infants_on_lap: query.infants_on_lap,
    travel_class: query.travel_class,
    stops: query.stops,
    max_price: query.max_price,
    min_price: query.min_price,
    airlines: query.airlines,
    sort_by: query.sort_by,
    included_airlines: query.included_airlines,
    excluded_airlines: query.excluded_airlines,
    carry_on_bags: query.carry_on_bags,
    checked_bags: query.checked_bags,
    outbound_times: query.outbound_times,
    return_times: query.return_times,
    max_flight_duration: query.max_flight_duration,
    layover_duration_min: query.layover_duration_min,
    layover_duration_max: query.layover_duration_max,
    included_connecting_airports: query.included_connecting_airports,
    excluded_connecting_airports: query.excluded_connecting_airports,
    emissions: query.emissions,
  };

  // Only send return_date for round-trip searches. For one-way (flight_type
  // one_way) the provider must NOT receive a return_date — it would turn the
  // search into a same-day round trip and return round-trip fares.
  if (query.return_date) params.return_date = query.return_date;
  if (query.departure_token) params.departure_token = query.departure_token;

  return params;
}

/**
 * Parse a canonical destination string into its explicit provider query.
 *
 * The `destination` field is JSON produced by the autocomplete selection, e.g.
 * `{"displayName":"Delhi","country":"India","searchQuery":"Hotels in Delhi, India"}`.
 * It always carries an explicit search query so the provider resolves the right
 * place instead of guessing a country from a bare city name.
 */
function parseDestination(destination: string): {
  displayName: string;
  searchQuery: string;
  country: string | undefined;
} {
  try {
    const parsed = JSON.parse(destination) as {
      displayName?: string;
      searchQuery?: string;
      country?: string;
    };
    const displayName = parsed.displayName?.trim() || parsed.searchQuery?.trim() || 'Hotels';
    const searchQuery =
      parsed.searchQuery?.trim() || (parsed.displayName ? `Hotels in ${displayName}` : 'Hotels');
    return { displayName, searchQuery, country: parsed.country };
  } catch {
    // Plain-text fallback (e.g. a typed city). Prefix so the provider treats it
    // as a destination rather than a bare ambiguous name.
    const trimmed = destination.trim();
    return {
      displayName: trimmed || 'Hotels',
      searchQuery: `Hotels in ${trimmed || 'Destination'}`,
      country: undefined,
    };
  }
}

/** Build the SearchApi parameter map for a hotel search. */
function hotelParams(query: HotelSearchQuery): Record<string, string | number | undefined> {
  const { searchQuery } = parseDestination(query.destination);
  return {
    engine: ENGINE_HOTELS,
    q: searchQuery,
    check_in_date: query.check_in_date,
    check_out_date: query.check_out_date,
    adults: query.adults,
    children: query.children,
    rooms: query.rooms,
    currency: query.currency,
    hl: query.hl,
    gl: query.gl,
    min_price: query.min_price,
    max_price: query.max_price,
    property_type: query.property_type,
    hotel_class: query.hotel_class,
    next_page_token: query.next_page_token,
    sort_by: query.sort_by,
    property_types: query.property_types,
    amenities: query.amenities,
    rating: query.rating,
    free_cancellation: query.free_cancellation,
    special_offers: query.special_offers,
    eco_certified: query.eco_certified,
    brands: query.brands,
    bedrooms: query.bedrooms,
    bathrooms: query.bathrooms,
  };
}

/**
 * In development, log the requested destination vs what the provider actually
 * returned, so a severe mismatch (Delhi, India -> Tampa, US) is obvious.
 * Nearby/suburban results (Gurugram for Delhi) are NOT treated as errors.
 */
function logHotelLocationSanity(
  query: HotelSearchQuery,
  response: { properties?: Array<{ city?: string; country?: string }> },
): void {
  if (isProduction) return;
  const { displayName, searchQuery, country } = parseDestination(query.destination);
  const first = response.properties?.[0];
  logger.info(
    {
      requestedDestination: displayName,
      requestedCountry: country ?? 'unknown',
      searchApiQ: searchQuery,
      searchApiGl: query.gl,
      firstReturnedCity: first?.city ?? 'n/a',
      firstReturnedCountry: first?.country ?? 'n/a',
      returnedCount: response.properties?.length ?? 0,
      devOnly: true,
    },
    'Hotel search location sanity check',
  );

  const firstCountry = first?.country;
  if (country && firstCountry && country.length >= 2 && firstCountry.length >= 2) {
    const requested = country.toUpperCase();
    const returned = firstCountry.toUpperCase();
    const differentCountry =
      requested !== returned && requested !== `${returned}S` && returned !== `${requested}S`;
    if (differentCountry) {
      logger.warn(
        {
          requestedDestination: displayName,
          requestedCountry: country,
          firstReturnedCountry: firstCountry,
        },
        'SearchApi returned properties in a different country than requested',
      );
    }
  }
}

/** Build the SearchApi parameter map for a hotel autocomplete search. */
function autocompleteParams(
  query: HotelAutocompleteQuery,
): Record<string, string | number | undefined> {
  return {
    engine: ENGINE_HOTELS_AUTOCOMPLETE,
    q: query.q,
    hl: query.hl,
  };
}

export const searchService = {
  flights(auth: AuthContext, query: FlightSearchQuery): Promise<unknown> {
    return executeProviderSearch(auth, 'FLIGHT', ENGINE_FLIGHTS, flightParams, query);
  },

  async hotels(auth: AuthContext, query: HotelSearchQuery): Promise<unknown> {
    const body = (await executeProviderSearch(
      auth,
      'HOTEL',
      ENGINE_HOTELS,
      hotelParams,
      query,
    )) as { properties?: Array<{ city?: string; country?: string }> };
    logHotelLocationSanity(query, body);
    return body;
  },

  hotelsAutocomplete(auth: AuthContext, query: HotelAutocompleteQuery): Promise<unknown> {
    return executeProviderSearch(
      auth,
      'AUTOCOMPLETE',
      ENGINE_HOTELS_AUTOCOMPLETE,
      autocompleteParams,
      query,
    );
  },

  /**
   * Validate a SearchAPI key with the smallest reasonable request (a hotel
   * autocomplete query). Returns a discriminated result so the caller can tell
   * "connected", "invalid key" and "quota exhausted" apart without exposing the
   * secret itself.
   */
  async testConnection(apiKey: string): Promise<{ ok: boolean; reason?: string }> {
    const url = new URL(env.SEARCHAPI_BASE_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('engine', ENGINE_HOTELS_AUTOCOMPLETE);
    url.searchParams.set('q', 'hotel');

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      logger.warn(
        {
          elapsedMs,
          reason: error instanceof Error ? error.message : String(error),
          devOnly: !isProduction,
        },
        'SearchApi test connection could not be completed',
      );
      return { ok: false, reason: 'Could not reach SearchAPI.' };
    }

    if (response.ok) return { ok: true };
    if (response.status === 429) {
      return { ok: false, reason: 'quota' };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'invalid' };
  },
};
