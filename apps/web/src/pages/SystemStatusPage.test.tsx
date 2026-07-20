import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/providers/QueryProvider';
import { SystemStatusPage } from './SystemStatusPage';

function renderPage() {
  // Retries off: these tests assert the rendered outcome of a single response,
  // not the retry policy, so backoff would only add latency.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryProvider client={client}>
      <SystemStatusPage />
    </QueryProvider>,
  );
}

/** Build a fetch stub that answers the two health endpoints. */
function stubFetch(handlers: Record<string, { ok: boolean; body: unknown }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const match = Object.entries(handlers).find(([path]) => url.endsWith(path));
      if (!match) throw new Error(`Unexpected fetch: ${url}`);
      const [, response] = match;
      return {
        ok: response.ok,
        status: response.ok ? 200 : 503,
        statusText: response.ok ? 'OK' : 'Service Unavailable',
        json: async () => response.body,
      } as Response;
    }),
  );
}

describe('SystemStatusPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the loading state before the checks resolve', () => {
    stubFetch({
      '/api/health/db': { ok: true, body: { success: true, data: {} } },
      '/api/health': { ok: true, body: { success: true, data: {} } },
    });

    renderPage();

    expect(screen.getAllByText('Checking').length).toBeGreaterThan(0);
  });

  it('renders healthy details for the API and database', async () => {
    stubFetch({
      '/api/health/db': {
        ok: true,
        body: {
          success: true,
          data: { database: 'up', latencyMs: 3.2, timestamp: '2026-01-01T00:00:00.000Z' },
        },
      },
      '/api/health': {
        ok: true,
        body: {
          success: true,
          data: {
            status: 'ok',
            service: 'interscale-api',
            version: '0.1.0',
            environment: 'test',
            uptimeSeconds: 12,
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Healthy')).toHaveLength(2);
    });

    expect(screen.getByText('interscale-api')).toBeInTheDocument();
    expect(screen.getByText('3.2 ms')).toBeInTheDocument();
  });

  it('surfaces the error state when the database is unreachable', async () => {
    stubFetch({
      '/api/health/db': {
        ok: false,
        body: {
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unreachable.' },
        },
      },
      '/api/health': {
        ok: true,
        body: {
          success: true,
          data: {
            status: 'ok',
            service: 'interscale-api',
            version: '0.1.0',
            environment: 'test',
            uptimeSeconds: 12,
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Database is unreachable.');
    });
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('renders the product name', () => {
    stubFetch({
      '/api/health/db': { ok: true, body: { success: true, data: {} } },
      '/api/health': { ok: true, body: { success: true, data: {} } },
    });

    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Interscale Travel CRM', level: 1 }),
    ).toBeInTheDocument();
  });
});
