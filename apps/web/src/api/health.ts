import { useQuery } from '@tanstack/react-query';
import type { DbHealthResponse, HealthResponse } from '@interscale/shared';
import { apiClient } from './client';

export const healthKeys = {
  all: ['health'] as const,
  api: () => [...healthKeys.all, 'api'] as const,
  db: () => [...healthKeys.all, 'db'] as const,
};

// Retry policy is owned by the query client in QueryProvider, so it stays
// consistent across features and can be overridden wholesale in tests.

export function useApiHealth() {
  return useQuery({
    queryKey: healthKeys.api(),
    queryFn: ({ signal }) => apiClient.get<HealthResponse>('/health', signal),
  });
}

export function useDatabaseHealth() {
  return useQuery({
    queryKey: healthKeys.db(),
    queryFn: ({ signal }) => apiClient.get<DbHealthResponse>('/health/db', signal),
  });
}
