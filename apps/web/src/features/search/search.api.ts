import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateBookmarkInput,
  FlightSearchResponse,
  HotelAutocompleteResponse,
  HotelSearchResponse,
  LiveSearchBookmark,
  LiveSearchBookmarkType,
  LiveSearchTestResult,
  SearchApiKeysResponse,
  SearchApiUsageSummary,
  SearchApiUsageUserDetail,
  SearchUsageRange,
  UpdateSearchApiKeyInput,
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
  keys: ['search', 'keys'] as const,
  usageSummary: (range: string) => ['search', 'usage', 'summary', range] as const,
  usageUser: (userId: string, range: string) =>
    ['search', 'usage', 'users', userId, range] as const,
  bookmarks: (type?: LiveSearchBookmarkType) => ['search', 'bookmarks', type ?? 'all'] as const,
  bookmark: (id: string) => ['search', 'bookmarks', 'id', id] as const,
  bookmarkByCode: (code: string) => ['search', 'bookmarks', 'by-code', code] as const,
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
  infants_in_seat?: number;
  infants_on_lap?: number;
  travel_class?: string;
  stops?: string;
  departure_token?: string;
  // Advanced filters (mirrors the SearchAPI google_flights parameters).
  sort_by?: string;
  included_airlines?: string;
  excluded_airlines?: string;
  max_price?: number;
  carry_on_bags?: number;
  checked_bags?: number;
  outbound_times?: string;
  return_times?: string;
  max_flight_duration?: number;
  layover_duration_min?: number;
  layover_duration_max?: number;
  included_connecting_airports?: string;
  excluded_connecting_airports?: string;
  emissions?: number;
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
  // Advanced filters (mirrors the SearchAPI google_hotels parameters).
  sort_by?: string;
  property_types?: string;
  amenities?: string;
  rating?: number;
  free_cancellation?: string;
  special_offers?: string;
  eco_certified?: string;
  brands?: string;
  bedrooms?: number;
  bathrooms?: number;
  min_price?: number;
  max_price?: number;
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
    // Paid provider data: never auto-retry or refetch on mount.
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Fetch the return-flight options for a selected outbound flight using its
 * `departure_token`. The original search parameters are preserved so the
 * second request stays in the same search context.
 */
export function useReturnFlightSearch(
  params: FlightSearchParams,
  departureToken: string | undefined,
) {
  const enabled = Boolean(
    params.departure_id && params.arrival_id && params.outbound_date && departureToken,
  );
  const queryParams = { ...params, departure_token: departureToken };
  return useQuery({
    queryKey: searchKeys.flights(queryParams),
    queryFn: ({ signal }) =>
      apiClient.get<FlightSearchResponse>(
        `/search/flights?${toQuery(queryParams as unknown as Record<string, unknown>)}`,
        signal,
      ),
    enabled,
    staleTime: SEARCH_STALE_MS,
    gcTime: SEARCH_GC_MS,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Page 1 of a live hotel search. Disabled until every required field is present. */
export function useHotelSearch(params: HotelSearchParams) {
  const enabled = Boolean(
    params.destination && params.check_in_date && params.check_out_date && !params.next_page_token,
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
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Live destination suggestions. Debounced, cached by normalized query, and
 * disabled until 3+ characters so typing never burns a provider call per key.
 * Provider autocomplete responses are paid API data: keep them fresh long,
 * never auto-retry, and never refetch on mount/focus.
 */
export function useHotelAutocomplete(raw: string) {
  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase();
  const enabled = normalized.length >= 3;
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    if (!enabled) return;
    const handle = window.setTimeout(() => setDebounced(trimmed), 700);
    return () => window.clearTimeout(handle);
  }, [enabled, trimmed]);
  const q = enabled ? debounced.trim().toLowerCase() || normalized : '';
  return useQuery({
    queryKey: searchKeys.hotelAutocomplete(q),
    queryFn: ({ signal }) =>
      apiClient.get<HotelAutocompleteResponse>(
        `/search/hotels/autocomplete?${toQuery({ q })}`,
        signal,
      ),
    enabled: Boolean(q),
    staleTime: SEARCH_STALE_MS,
    gcTime: SEARCH_GC_MS,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

// ---------------------------------------------------------------------------
// Per-user SearchAPI key management (multiple keys)
// ---------------------------------------------------------------------------

/** The current user's saved SearchAPI keys (masked previews). */
export function useSearchApiKeys() {
  return useQuery({
    queryKey: searchKeys.keys,
    queryFn: ({ signal }) => apiClient.get<SearchApiKeysResponse>('/search/keys', signal),
    staleTime: 60 * 1000,
  });
}

/** Add another SearchAPI key for the current user. */
export function useAddSearchApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiClient.post<SearchApiKeysResponse>('/search/keys', { apiKey }),
    onSuccess: (result) => {
      queryClient.setQueryData(searchKeys.keys, result);
    },
  });
}

/** Remove one of the current user's SearchAPI keys. */
export function useRemoveSearchApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => apiClient.delete<SearchApiKeysResponse>(`/search/keys/${keyId}`),
    onSuccess: (result) => {
      queryClient.setQueryData(searchKeys.keys, result);
    },
  });
}

/** Enable/disable a key or change its priority (order). */
export function useUpdateSearchApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keyId, ...patch }: { keyId: string } & UpdateSearchApiKeyInput) =>
      apiClient.patch<SearchApiKeysResponse>(`/search/keys/${keyId}`, patch),
    onSuccess: (result) => {
      queryClient.setQueryData(searchKeys.keys, result);
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

// ---------------------------------------------------------------------------
// Owner SearchAPI usage dashboard
// ---------------------------------------------------------------------------

function usageRangeQuery(range: SearchUsageRange): string {
  const query = new URLSearchParams();
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  return query.toString();
}

/** Company-wide SearchAPI usage (Owner only; the backend enforces the role). */
export function useSearchApiUsageSummary(range: SearchUsageRange) {
  const rangeKey = `${range.from ?? ''}|${range.to ?? ''}`;
  return useQuery({
    queryKey: searchKeys.usageSummary(rangeKey),
    queryFn: ({ signal }) =>
      apiClient.get<SearchApiUsageSummary>(
        `/search/usage/summary?${usageRangeQuery(range)}`,
        signal,
      ),
    staleTime: 60 * 1000,
  });
}

/** Per-user SearchAPI usage detail (Owner only). */
export function useSearchApiUsageUserDetail(userId: string | null, range: SearchUsageRange) {
  const rangeKey = `${range.from ?? ''}|${range.to ?? ''}`;
  return useQuery({
    queryKey: searchKeys.usageUser(userId ?? 'none', rangeKey),
    queryFn: ({ signal }) =>
      apiClient.get<SearchApiUsageUserDetail>(
        `/search/usage/users/${userId}?${usageRangeQuery(range)}`,
        signal,
      ),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Bookmarks (DB only — never calls SearchAPI)
// ---------------------------------------------------------------------------

/** List the current user's bookmarks. DB only. */
export function useBookmarks(type?: LiveSearchBookmarkType) {
  return useQuery({
    queryKey: searchKeys.bookmarks(type),
    queryFn: ({ signal }) =>
      apiClient.get<LiveSearchBookmark[]>(
        `/search/bookmarks${type ? `?type=${type}` : ''}`,
        signal,
      ),
    staleTime: 60 * 1000,
  });
}

/** Save a bookmark from an already-cached result. No SearchAPI call. */
export function useCreateBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookmarkInput) =>
      apiClient.post<{ bookmark: LiveSearchBookmark; created: boolean }>(
        '/search/bookmarks',
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['search', 'bookmarks'] });
    },
  });
}

/**
 * Look up a bookmark by its public code (e.g. HTL-000123) — DB only, never
 * SearchAPI. Disabled until the code is non-empty and well-formed.
 */
export function useBookmarkByCode(code: string) {
  const trimmed = code.trim().toUpperCase();
  const enabled = /^[A-Z]{3}-\d{6}$/.test(trimmed);
  return useQuery({
    queryKey: searchKeys.bookmarkByCode(trimmed),
    queryFn: ({ signal }) =>
      apiClient.get<LiveSearchBookmark>(
        `/search/bookmarks/by-code/${encodeURIComponent(trimmed)}`,
        signal,
      ),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/** Delete a bookmark. No SearchAPI call. */
export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ deleted: boolean }>(`/search/bookmarks/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['search', 'bookmarks'] });
    },
  });
}
