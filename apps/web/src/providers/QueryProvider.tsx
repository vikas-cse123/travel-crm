import { useState } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './query-client';

interface QueryProviderProps {
  children: React.ReactNode;
  /**
   * Optional client override. Tests inject a retry-free client so an expected
   * error response asserts immediately instead of waiting out backoff.
   */
  client?: QueryClient;
}

/**
 * TanStack Query owns all server state; nothing is mirrored into a client store.
 * The default client is created inside the component so each render tree — and
 * each test — gets an isolated cache.
 */
export function QueryProvider({ children, client }: QueryProviderProps) {
  const [fallbackClient] = useState(createQueryClient);
  return <QueryClientProvider client={client ?? fallbackClient}>{children}</QueryClientProvider>;
}
