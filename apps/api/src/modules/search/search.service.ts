import { env, isProduction } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ServiceUnavailableError } from '../../utils/errors.js';
import type {
  FlightSearchQuery,
  HotelAutocompleteQuery,
  HotelSearchQuery,
} from '@interscale/shared';

/**
 * Live hotel & flight search proxy for SearchApi (searchapi.io).
 *
 * The SearchAPI key never reaches the browser: the backend resolves the
 * authenticated user's own saved key (falling back to the server-level
 * SEARCHAPI_API_KEY when the user has not saved one) and uses it only when
 * calling SearchAPI.io. A provider 429 (quota/rate-limit) is surfaced as a
 * distinct, non-fatal error so one user's exhausted key cannot affect other
 * users or unrelated CRM endpoints.
 */

const ENGINE_FLIGHTS = 'google_flights';
const ENGINE_HOTELS = 'google_hotels';
const ENGINE_HOTELS_AUTOCOMPLETE = 'google_hotels_autocomplete';

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
    throw new ServiceUnavailableError(
      'The live search provider could not complete the request. Please try again.',
    );
  }
  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    const providerError = await readErrorBody(response);
    // The provider's explanation is logged for development; production users get
    // a clean message. A 429 (monthly quota / rate limit) is surfaced distinctly
    // so the UI can tell "your SearchAPI key is out of quota" from a bad key.
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
    throw new ServiceUnavailableError(
      'The live search provider could not complete the request. Please try again.',
    );
  }

  const body = (await response.json()) as Record<string, unknown>;

  if (body.error) {
    logger.warn(
      { engine: params.engine, providerError: body.error, elapsedMs, devOnly: !isProduction },
      'SearchApi returned error',
    );
    throw new ServiceUnavailableError('The live search provider could not complete the request.');
  }

  return body;
}

/** Raised when SearchAPI responds 429 (quota/rate-limit). Kept non-fatal and isolated. */
export class SearchApiQuotaExceededError extends ServiceUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'SearchApiQuotaExceededError';
  }
}

/** Build the SearchApi parameter map for a flight search. */
function flightParams(query: FlightSearchQuery): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {
    engine: ENGINE_FLIGHTS,
    departure_id: query.departure_id,
    arrival_id: query.arrival_id,
    outbound_date: query.outbound_date,
    type: query.type,
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
  };

  // SearchApi's google_flights engine requires return_date on every request,
  // including one-way searches. For a one-way (type=1) search without a return
  // date, default it to the outbound date so the provider accepts the request.
  if (query.return_date) params.return_date = query.return_date;
  else if (query.type === 1) params.return_date = query.outbound_date;
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
function autocompleteParams(query: HotelAutocompleteQuery): Record<string, string | number | undefined> {
  return {
    engine: ENGINE_HOTELS_AUTOCOMPLETE,
    q: query.q,
    hl: query.hl,
  };
}

export const searchService = {
  flights(apiKey: string, query: FlightSearchQuery): Promise<unknown> {
    return callSearchApi(apiKey, flightParams(query));
  },

  async hotels(apiKey: string, query: HotelSearchQuery): Promise<unknown> {
    const body = (await callSearchApi(apiKey, hotelParams(query))) as {
      properties?: Array<{ city?: string; country?: string }>;
    };
    logHotelLocationSanity(query, body);
    return body;
  },

  hotelsAutocomplete(apiKey: string, query: HotelAutocompleteQuery): Promise<unknown> {
    return callSearchApi(apiKey, autocompleteParams(query));
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
        { elapsedMs, reason: error instanceof Error ? error.message : String(error), devOnly: !isProduction },
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
