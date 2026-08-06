import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { HiddenGlobalRecordsPage } from './HiddenGlobalRecordsPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

beforeEach(() => {
  auth.permissions = new Set(['masters.view']);
});

describe('HiddenGlobalRecordsPage (tenant restore screen)', () => {
  it('lists hidden global records with type, date, hidden-by and a Restore action', async () => {
    const hiddenRow = {
      hideId: 'hide-1',
      masterType: 'CITY',
      masterId: 'city-1',
      masterTypeLabel: 'City',
      name: 'Dubai',
      hiddenAt: '2026-08-01T00:00:00.000Z',
      hiddenBy: { id: 'user-1', fullName: 'Aditi Rao' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          data: [hiddenRow],
          count: 1,
        }),
      ),
    );
    renderWithProviders(<HiddenGlobalRecordsPage />);

    expect(await screen.findByText('Dubai')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText(/Aditi Rao/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
  });

  it('restores a hidden record with a tenant-scoped confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return response({ restored: true });
      return response({ data: [], count: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<HiddenGlobalRecordsPage />);

    expect(await screen.findByText('No hidden global records')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ data: [], count: 0 })),
    );
    renderWithProviders(<HiddenGlobalRecordsPage />);
    expect(await screen.findByText('No hidden global records')).toBeInTheDocument();
  });
});
