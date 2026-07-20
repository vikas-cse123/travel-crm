import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

/**
 * The application's query-client configuration.
 *
 * Kept out of QueryProvider.tsx so that file exports only a component, which is
 * what Fast Refresh requires.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry a rejection the server made deliberately.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
