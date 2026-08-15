import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HotelSearchResponse } from '@interscale/shared';
import { apiClient } from '@/api/client';
import { searchKeys, useHotelSearch, type HotelSearchParams } from './search.api';

/**
 * Sequential, token-based hotel pagination with per-page caching.
 *
 * SearchApi's `next_page_token` is sequential: you can only open the next page
 * after you have the previous page's token. We never guess or bulk-fetch pages
 * ahead of the user.
 *
 * Architecture:
 *  - Page 1 is loaded by `useHotelSearch`, keyed by the exact search params, so
 *    re-running the identical search (or returning after switching tabs) reuses
 *    the cached response with zero provider requests.
 *  - Pages 2+ are stored in the React Query cache under
 *    `['search','hotels', baseParams, 'page', n]`. Clicking Next fetches page N
 *    with page N-1's token via `fetchQuery`, then caches it. Revisiting an
 *    already-cached page reads from cache (ZERO provider requests).
 *  - `loadedPages` is re-seeded from the cache on (re)mount so a cached page
 *    after a tab switch is recognised as already loaded.
 */
export function useHotelPagedSearch(baseParams: HotelSearchParams) {
  const queryClient = useQueryClient();

  // The base search key excludes the token (the token varies per page).
  const baseKey = useMemo(() => {
    const { next_page_token: _token, ...rest } = baseParams;
    return rest as HotelSearchParams;
  }, [baseParams]);

  const searchKey = useMemo(() => JSON.stringify(baseKey), [baseKey]);

  // Page 1 is an ordinary live query (cached by React Query under the params).
  const page1 = useHotelSearch(baseKey);

  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState<number[]>([1]);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const currentSearchKey = useRef(searchKey);
  if (currentSearchKey.current !== searchKey) {
    currentSearchKey.current = searchKey;
    // A genuinely new search: reset to page 1, but keep pages already in cache.
    setCurrentPage(1);
    setLoadedPages(detectLoadedPages(queryClient, baseKey));
    setPageError(null);
    setIsLoadingPage(false);
  }

  const pageData = useCallback(
    (page: number): HotelSearchResponse | undefined => {
      if (page === 1) return page1.data;
      return queryClient.getQueryData<HotelSearchResponse>(
        searchKeys.hotelPage(baseKey, page),
      );
    },
    [page1.data, queryClient, baseKey],
  );

  const lastPage = Math.max(1, ...loadedPages);
  const nextToken = pageData(lastPage)?.pagination?.next_page_token;
  const hasNext = Boolean(nextToken);
  const totalResults = pageData(1)?.search_information?.total_results;

  /** Total number of property objects actually loaded across all cached pages. */
  const loadedCount = useMemo(() => {
    return loadedPages.reduce((sum, page) => sum + (pageData(page)?.properties?.length ?? 0), 0);
  }, [loadedPages, pageData]);

  const goToPage = useCallback(
    async (page: number) => {
      if (page < 1) return;
      // Already loaded -> zero provider requests.
      if (loadedPages.includes(page)) {
        setCurrentPage(page);
        return;
      }
      // Only allow stepping one page forward with a valid token.
      if (page !== lastPage + 1 || !nextToken) return;
      if (isLoadingPage) return;

      setIsLoadingPage(true);
      setPageError(null);
      try {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(baseKey)) {
          if (value !== undefined && value !== '') query.set(key, String(value));
        }
        query.set('next_page_token', nextToken);

        await queryClient.fetchQuery({
          queryKey: searchKeys.hotelPage(baseKey, page),
          queryFn: ({ signal }) =>
            apiClient.get<HotelSearchResponse>(`/search/hotels?${query.toString()}`, signal),
          staleTime: 10 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
        });
        setLoadedPages((prev) => (prev.includes(page) ? prev : [...prev, page]));
        setCurrentPage(page);
      } catch (error) {
        setPageError(
          error instanceof Error ? error.message : 'We could not load the next page.',
        );
      } finally {
        setIsLoadingPage(false);
      }
    },
    [baseKey, isLoadingPage, lastPage, loadedPages, nextToken, queryClient],
  );

  return {
    searchKey,
    page1,
    currentPage,
    loadedPages,
    loadedCount,
    totalResults,
    hasNext,
    isLoadingPage,
    pageError,
    goToPage,
    pageData,
  };
}

/** Scan the React Query cache for how many contiguous pages are already loaded. */
function detectLoadedPages(
  queryClient: ReturnType<typeof useQueryClient>,
  baseKey: HotelSearchParams,
): number[] {
  const pages: number[] = [1];
  let page = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = queryClient.getQueryData<HotelSearchResponse>(
      searchKeys.hotelPage(baseKey, page),
    );
    if (!data) break;
    pages.push(page);
    page += 1;
  }
  return pages;
}
