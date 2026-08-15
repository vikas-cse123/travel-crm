import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FlightSearchResponse,
  HotelAutocompleteResponse,
  HotelSearchResponse,
  LiveSearchKeyStatus,
  LiveSearchTestResult,
} from '@interscale/shared';
import { apiClient } from '@/api/client';

/**
 * Live search hooks.
 *
 * Every query is keyed by the exact search parameters, so re-running an
 * identical search reuses the cached provider response instead of calling
 * SearchApi again. Image navigation and View details are purely client-side
 * and never touch these queries — they only read from the stored response.
 *
 * Hotel pagination uses SearchApi's `next_page_token`: page 1 is fetched by
 * `useHotelSearch`, and each subsequent page by `useHotelSearchNextPage` with
 * the previous page's token. Already-fetched pages are cached by their page
 * number and never re-requested.
 */
export const searchKeys = {
  all: ['search'] as const,
  flights: (params: unknown) => ['search', 'flights', params] as const,
  hotels: (params: unknown) => ['search', 'hotels', params] as const,
  hotelPage: (params: unknown, page: number) => ['search', 'hotels', params, 'page', page] as const,
  hotelAutocomplete: (q: string) => ['search', 'hotels', 'autocomplete', q] as const,
  keyStatus: ['search', 'keys', 'status'] as const,
};

export interface FlightSearchParams {
  departure_id: string;
  arrival_id: string;
  outbound_date: string;
  return_date?: string;
  type?: number;
  currency?: string;
  adults?: number;
  children?: number;
  travel_class?: string;
  stops?: string;
  departure_token?: string;
}

/**
 * The canonical, unambiguous destination for a hotel search.
 *
 * Produced by the autocomplete selection. `destination` is the JSON.stringify
 * of this object and is what the backend uses to build the explicit provider
 * query (e.g. "Hotels in Delhi, India").
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

export interface HotelSearchParams {
  destination: string;
  check_in_date: string;
  check_out_date: string;
  adults?: number;
  rooms?: number;
  currency?: string;
  next_page_token?: string;
}

/** Serialise a destination into the value stored on the search params. */
export function destinationToParam(destination: HotelDestination): string {
  return JSON.stringify(destination);
}

/** Parse a stored destination param back into its parts (safe fallback). */
export function destinationFromParam(raw: string): HotelDestination {
  try {
    const parsed = JSON.parse(raw) as HotelDestination;
    if (parsed && typeof parsed.displayName === 'string') return parsed;
  } catch {
    // fall through to the plain-text fallback below
  }
  const displayName = raw.trim();
  return {
    displayName,
    searchQuery: `Hotels in ${displayName || 'Destination'}`,
  };
}

/** One-time freshness window: within it a cached search is served without a refetch. */
const SEARCH_STALE_MS = 10 * 60 * 1000;
/** Keep completed searches in the cache so the user can return to them. */
const SEARCH_GC_MS = 30 * 60 * 1000;

function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

/** Live flight search. Disabled until every required field is present. */
export function useFlightSearch(params: FlightSearchParams) {
  const enabled = Boolean(params.departure_id && params.arrival_id && params.outbound_date);
  return useQuery({
    queryKey: searchKeys.flights(params),
    queryFn: ({ signal }) =>
      apiClient.get<FlightSearchResponse>(
        `/search/flights?${toQuery(params as unknown as Record<string, unknown>)}`,
        signal,
      ),
    enabled,
    staleTime: SEARCH_STALE_MS,
    gcTime: SEARCH_GC_MS,
  });
}

/** Page 1 of a live hotel search. Disabled until every required field is present. */
export function useHotelSearch(params: HotelSearchParams) {
  const enabled = Boolean(
    params.destination &&
      params.check_in_date &&
      params.check_out_date &&
      !params.next_page_token,
  );
  return useQuery({
    queryKey: searchKeys.hotels(params),
    queryFn: ({ signal }) =>
      apiClient.get<HotelSearchResponse>(
        `/search/hotels?${toQuery(params as unknown as Record<string, unknown>)}`,
        signal,
      ),
    enabled,
    staleTime: SEARCH_STALE_MS,
    gcTime: SEARCH_GC_MS,
  });
}

/**
 * Fetch a specific hotel result page using the previous page's
 * `next_page_token`. Keyed by (params, page) so an already-fetched page is
 * served from cache without another provider request.
 */
export function useHotelSearchPage(params: HotelSearchParams, page: number) {
  const base = { ...params };
  delete base.next_page_token;
  const enabled = Boolean(base.destination && base.check_in_date && base.check_out_date);
  return useQuery({
    queryKey: searchKeys.hotelPage(base, page),
    queryFn: ({ signal }) =>
      apiClient.get<HotelSearchResponse>(
        `/search/hotels?${toQuery({
          ...base,
          next_page_token: params.next_page_token,
        } as unknown as Record<string, unknown>)}`,
        signal,
      ),
    enabled: enabled && Boolean(params.next_page_token),
    staleTime: SEARCH_STALE_MS,
    gcTime: SEARCH_GC_MS,
  });
}

/** Live destination suggestions. Disabled for very short input. */
export function useHotelAutocomplete(q: string) {
  const trimmed = q.trim();
  const enabled = trimmed.length >= 2;
  return useQuery({
    queryKey: searchKeys.hotelAutocomplete(trimmed),
    queryFn: ({ signal }) =>
      apiClient.get<HotelAutocompleteResponse>(
        `/search/hotels/autocomplete?${toQuery({ q: trimmed })}`,
        signal,
      ),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Per-user SearchAPI key management
// ---------------------------------------------------------------------------

/** The current user's saved Live Search key status (masked preview). */
export function useSearchApiKeyStatus() {
  return useQuery({
    queryKey: searchKeys.keyStatus,
    queryFn: ({ signal }) => apiClient.get<LiveSearchKeyStatus>('/search/keys', signal),
    staleTime: 60 * 1000,
  });
}

/** Save or replace the current user's SearchAPI key. */
export function useSaveSearchApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiClient.post<LiveSearchKeyStatus>('/search/keys', { apiKey }),
    onSuccess: (result) => {
      queryClient.setQueryData(searchKeys.keyStatus, result);
    },
  });
}

/** Remove the current user's SearchAPI key. */
export function useRemoveSearchApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<LiveSearchKeyStatus>('/search/keys'),
    onSuccess: (result) => {
      queryClient.setQueryData(searchKeys.keyStatus, result);
    },
  });
}

/** Test the provided (or saved) SearchAPI key without exposing it. */
export function useTestSearchApiKey() {
  return useMutation({
    mutationFn: (apiKey: string | null) =>
      apiClient.post<LiveSearchTestResult>('/search/keys/test', { apiKey: apiKey ?? undefined }),
  });
}
