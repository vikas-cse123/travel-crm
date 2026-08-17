import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HotelSearchResponse, SearchApiHotelProperty } from '@interscale/shared';
import { apiClient } from '@/api/client';
import { searchKeys, useHotelSearch, type HotelSearchParams } from './search.api';

/**
 * Local results shown per page. The provider's batch size can vary, so
 * pagination is over the local, accumulated list — never the provider pages.
 */
const PAGE_SIZE = 20;

/** Stable identity for a hotel property, used to deduplicate appended batches. */
export function stablePropertyId(property: SearchApiHotelProperty): string {
  return property.property_token ?? property.data_id ?? property.name ?? 'property';
}

/**
 * Sequential, token-based hotel pagination over an accumulated, deduplicated
 * list of loaded properties.
 *
 * - Page 1 is fetched by `useHotelSearch`, keyed by the exact search params, so
 *   re-running the identical search (or returning after switching tabs) reuses
 *   the cached response with zero provider requests.
 * - Subsequent provider batches are fetched on demand using the previous
 *   batch's `next_page_token`, then cached under
 *   `['search','hotels', baseKey, 'page', n]`. Revisiting an already-cached
 *   batch never calls the provider.
 * - All loaded batches are accumulated (deduplicated by property token) into a
 *   single list. Local pagination slices that list, so going page 2 → 1 → 2
 *   makes zero provider requests.
 * - When the user reaches the last loaded page and the provider still has a
 *   `next_page_token`, exactly one more batch is fetched and appended.
 */
export function useHotelPagedSearch(baseParams: HotelSearchParams) {
  const queryClient = useQueryClient();

  // The base search key excludes the token (the token varies per batch).
  const baseKey = useMemo(() => {
    const { next_page_token: _token, ...rest } = baseParams;
    return rest as HotelSearchParams;
  }, [baseParams]);

  const searchKey = useMemo(() => JSON.stringify(baseKey), [baseKey]);

  // Page 1 is an ordinary live query (cached by React Query under the params).
  const page1 = useHotelSearch(baseKey);

  const batchData = useCallback(
    (batch: number): HotelSearchResponse | undefined => {
      if (batch <= 0) return undefined;
      if (batch === 1) return page1.data;
      return queryClient.getQueryData<HotelSearchResponse>(searchKeys.hotelPage(baseKey, batch));
    },
    [page1.data, queryClient, baseKey],
  );

  // Reseed from the React Query cache on mount so returning to a search after a
  // tab switch recognises batches that were already loaded.
  const [batchCount, setBatchCount] = useState<number>(() =>
    detectLoadedBatches(queryClient, baseKey),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // A genuinely new search: reset to page 1, but keep batches already in cache.
  const currentSearchKey = useRef(searchKey);
  if (currentSearchKey.current !== searchKey) {
    currentSearchKey.current = searchKey;
    setCurrentPage(1);
    setBatchCount(detectLoadedBatches(queryClient, baseKey));
    setPageError(null);
    setIsLoadingPage(false);
  }

  /** All distinct properties accumulated across the loaded provider batches. */
  const loadedProperties = useMemo(() => {
    const seen = new Set<string>();
    const properties: SearchApiHotelProperty[] = [];
    for (let batch = 1; batch <= batchCount; batch += 1) {
      const response = batchData(batch);
      for (const property of response?.properties ?? []) {
        const id = stablePropertyId(property);
        if (!seen.has(id)) {
          seen.add(id);
          properties.push(property);
        }
      }
    }
    return properties;
  }, [batchCount, batchData]);

  const loadedCount = loadedProperties.length;
  const maxPage = Math.max(1, Math.ceil(loadedCount / PAGE_SIZE));
  const nextToken = batchData(batchCount)?.pagination?.next_page_token ?? null;
  const hasNext = Boolean(nextToken);
  const totalResults = batchData(1)?.search_information?.total_results;

  /** The slice of loaded properties for the current local page. */
  const pageProperties = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return loadedProperties.slice(start, start + PAGE_SIZE);
  }, [loadedProperties, currentPage]);

  /** Fetch and append one more provider batch. Returns null when nothing to load. */
  const loadMore = useCallback(async (): Promise<HotelSearchResponse | null> => {
    const token = nextToken;
    if (!token || isLoadingPage) return null;
    const nextBatch = batchCount + 1;

    setIsLoadingPage(true);
    setPageError(null);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(baseKey)) {
        if (value !== undefined && value !== '') query.set(key, String(value));
      }
      query.set('next_page_token', token);

      const response = await queryClient.fetchQuery({
        queryKey: searchKeys.hotelPage(baseKey, nextBatch),
        queryFn: ({ signal }) =>
          apiClient.get<HotelSearchResponse>(`/search/hotels?${query.toString()}`, signal),
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
      });
      setBatchCount(nextBatch);
      return response;
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'We could not load more hotels.');
      return null;
    } finally {
      setIsLoadingPage(false);
    }
  }, [baseKey, isLoadingPage, nextToken, batchCount, queryClient]);

  const goToPage = useCallback(
    async (page: number) => {
      if (page < 1 || isLoadingPage) return;
      const max = Math.max(1, Math.ceil(loadedProperties.length / PAGE_SIZE));
      // Already loaded -> pure local navigation, zero provider requests.
      if (page <= max) {
        setCurrentPage(page);
        return;
      }
      // Requested page is beyond what is loaded. Fetch ONE more provider batch
      // if a token exists; otherwise stay put (further navigation is disabled).
      if (!nextToken) return;
      const response = await loadMore();
      if (!response) return;
      const appended = response.properties?.length ?? 0;
      const newMax = Math.max(1, Math.ceil((loadedProperties.length + appended) / PAGE_SIZE));
      setCurrentPage(Math.min(page, newMax));
    },
    [isLoadingPage, loadedProperties.length, nextToken, loadMore],
  );

  return {
    searchKey,
    page1,
    currentPage,
    maxPage,
    loadedProperties,
    pageProperties,
    loadedCount,
    totalResults,
    hasNext,
    isLoadingPage,
    pageError,
    goToPage,
  };
}

/** Count the contiguous provider batches already present in the cache. */
function detectLoadedBatches(
  queryClient: ReturnType<typeof useQueryClient>,
  baseKey: HotelSearchParams,
): number {
  let count = 1;
  while (true) {
    const data = queryClient.getQueryData<HotelSearchResponse>(
      searchKeys.hotelPage(baseKey, count + 1),
    );
    if (!data) return count;
    count += 1;
  }
}
