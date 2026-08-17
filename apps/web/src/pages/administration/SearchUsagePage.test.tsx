import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { SearchUsagePage } from './SearchUsagePage';

const response = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  }) as Response;

const summary = {
  range: { from: '2026-08-01', to: '2026-08-16' },
  totals: { total: 4, flights: 2, hotels: 1, autocomplete: 1, successful: 3, failed: 1 },
  byService: [
    { label: 'Flights', value: 2 },
    { label: 'Hotels', value: 1 },
    { label: 'Autocomplete', value: 1 },
  ],
  byUser: [
    {
      userId: 'user-1',
      name: 'Rahul Tiwari',
      email: 'rahul@agency.test',
      flights: 2,
      hotels: 1,
      autocomplete: 1,
      total: 4,
    },
  ],
  daily: [{ date: '2026-08-16', flights: 2, hotels: 1, autocomplete: 1, total: 4 }],
  byKey: [{ maskedKey: '••••8F3A', requests: 3, status: 'ACTIVE' }],
};

const userDetail = {
  userId: 'user-1',
  name: 'Rahul Tiwari',
  email: 'rahul@agency.test',
  totals: { flights: 2, hotels: 1, autocomplete: 1, total: 4, successful: 3, failed: 1 },
  recent: [
    {
      id: 'u1',
      type: 'FLIGHT',
      status: 'SUCCESS',
      isFallbackAttempt: false,
      maskedKeySuffix: '8F3A',
      createdAt: '2026-08-16T15:40:00.000Z',
    },
    {
      id: 'u2',
      type: 'HOTEL',
      status: 'QUOTA_EXHAUSTED',
      isFallbackAttempt: false,
      maskedKeySuffix: '39BC',
      createdAt: '2026-08-16T15:30:00.000Z',
    },
  ],
  hasMore: false,
};

describe('SearchUsagePage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('renders the summary cards and per-user table from the aggregated API', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/search/usage/summary')) return response(summary);
      return response({});
    });
    vi.stubGlobal('fetch', mock);

    renderWithProviders(<SearchUsagePage />);

    expect(await screen.findByText('Search Usage')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Total requests')).toBeInTheDocument();
    });
    // KPI values.
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    // Per-user row.
    expect(screen.getByText('Rahul Tiwari')).toBeInTheDocument();
    expect(screen.getByText('rahul@agency.test')).toBeInTheDocument();
    // Masked key, never a full key.
    expect(screen.getByText('••••8F3A')).toBeInTheDocument();
    expect(screen.queryByText(/sk-[a-zA-Z0-9]{20,}/)).not.toBeInTheDocument();
  });

  it('expands a user to show their recent provider requests', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/search/usage/summary')) return response(summary);
      if (url.includes('/search/usage/users/user-1')) return response(userDetail);
      return response({});
    });
    vi.stubGlobal('fetch', mock);

    renderWithProviders(<SearchUsagePage />);
    await screen.findByText('Rahul Tiwari');

    await userEvent.click(screen.getByText('Rahul Tiwari'));
    expect(await screen.findByText('Rahul Tiwari — usage detail')).toBeInTheDocument();
    expect(await screen.findByText('Quota exhausted')).toBeInTheDocument();
    expect(screen.getByText('****39BC')).toBeInTheDocument();
  });
});
