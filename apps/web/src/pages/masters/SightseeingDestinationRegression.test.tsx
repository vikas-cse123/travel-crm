import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { SightseeingFormPage } from './SightseeingFormPage';

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const destA = '22222222-2222-4222-8222-222222222222';
const destB = '33333333-3333-4333-8333-333333333333';
const cityA = '11111111-1111-4111-8111-111111111111';
const cityB = '44444444-4444-4444-8444-444444444444';
const sightId = '77777777-7777-4777-8777-777777777777';

const destinationA = {
  id: destA,
  name: 'Singapore',
  countryCode: 'SG',
  countryName: 'Singapore',
  destinationType: 'INTERNATIONAL',
  status: 'ACTIVE',
  cities: [
    { id: 'link-a', cityId: cityA, sequence: 0, city: { id: cityA, name: 'Singapore City', airportCode: 'SIN' } },
  ],
  _count: { cities: 1 },
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
};

const destinationB = {
  ...destinationA,
  id: destB,
  name: 'Thailand',
  cities: [
    { id: 'link-b', cityId: cityB, sequence: 0, city: { id: cityB, name: 'Bangkok', airportCode: 'BKK' } },
  ],
};

const baseSightseeing = {
  id: sightId,
  title: 'Marina Bay Tour',
  sequence: 1,
  estimatedHours: 2,
  suggestedStartTime: null,
  description: '<p>Old description</p>',
  remarks: null,
  pricing: null,
  status: 'ACTIVE',
  hasImage: false,
  images: [],
  imageFileName: null,
  imageMimeType: null,
  imageConfirmedAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  destination: { id: destA, name: 'Singapore' },
  city: { id: cityA, name: 'Singapore City' },
  createdBy: { id: 'u1', fullName: 'Aditi Rao' },
  updatedBy: null,
};

const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

const ALL = [
  'masters.sightseeing.view',
  'masters.sightseeing.create',
  'masters.sightseeing.update',
  'masters.sightseeing.manage_media',
];

/**
 * Regression: editing a Sightseeing record must never clear its Destination.
 *
 * Root cause was an async-options race — the edit form `reset()` ran when the
 * detail loaded, but the destinations list (parallel) and the dependent
 * destination-detail cities (sequential) had not loaded yet, so the
 * uncontrolled selects dropped their values to "" and submit either failed
 * validation or forced a re-select.
 */
describe('Sightseeing destination persistence (regression)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(ALL);
  });

  function stubApi(opts: {
    sightseeing?: unknown;
    delayDestinationsMs?: number;
    onPatch?: (body: Record<string, unknown>) => unknown;
  }) {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request);
        const method = (init?.method ?? 'GET').toUpperCase();
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, url, body });
        if (url.includes(`/masters/destinations/${destB}`)) return response(destinationB);
        if (url.includes(`/masters/destinations/${destA}`)) return response(destinationA);
        if (url.includes('/masters/destinations')) {
          if (opts.delayDestinationsMs) await new Promise((r) => setTimeout(r, opts.delayDestinationsMs));
          return response(page([destinationA, destinationB]));
        }
        if (url.includes(`/masters/sightseeing/${sightId}`) && method === 'PATCH') {
          const next = opts.onPatch
            ? opts.onPatch(body as Record<string, unknown>)
            : {
                ...baseSightseeing,
                ...(opts.sightseeing as Record<string, unknown> | undefined),
                description: (body as Record<string, unknown>).description,
              };
          return response(next);
        }
        if (url.includes(`/masters/sightseeing/${sightId}`))
          return response(opts.sightseeing ?? baseSightseeing);
        if (url.includes('/masters/sightseeing')) return response(page([baseSightseeing]));
        return response(page([]));
      }),
    );
    return calls;
  }

  function renderEdit(route = `/masters/sightseeing/${sightId}/edit`) {
    return renderWithProviders(
      <Routes>
        <Route path="/masters/sightseeing/:sightseeingId/edit" element={<SightseeingFormPage />} />
        <Route path="/masters/sightseeing/:sightseeingId" element={<div>Saved sightseeing</div>} />
      </Routes>,
      { route },
    );
  }

  it('1-5: updating Description keeps Destination A and reload still shows A', async () => {
    const user = userEvent.setup();
    // Persist server-side so a reload returns the same destination.
    let stored: Record<string, unknown> = { ...baseSightseeing };
    stubApi({
      delayDestinationsMs: 300,
      onPatch: (body) => {
        stored = {
          ...stored,
          title: body.title,
          description: body.description,
          destination:
            body.destinationId === destA
              ? { id: destA, name: 'Singapore' }
              : { id: body.destinationId, name: 'Changed' },
          city: body.cityId === cityA ? { id: cityA, name: 'Singapore City' } : stored.city,
        };
        return stored;
      },
    });

    // 1. Existing Sightseeing with Destination A is opened.
    const first = renderEdit();
    const destSelect = (await screen.findByLabelText(/destination/i)) as HTMLSelectElement;
    await waitFor(() => expect(destSelect.value).toBe(destA), { timeout: 8000 });
    const citySelect = screen.getByLabelText(/city/i) as HTMLSelectElement;
    await waitFor(() => expect(citySelect.value).toBe(cityA), { timeout: 8000 });

    // 2-3. User updates another field and submits without touching Destination.
    await user.click(screen.getByRole('button', { name: /update sightseeing/i }));

    // 4. Update persists Destination A (detail page reached = success, no re-select).
    expect(await screen.findByText('Saved sightseeing')).toBeInTheDocument();
    expect(stored.destination).toEqual({ id: destA, name: 'Singapore' });
    first.unmount();

    // 5. Reloading the edit page still shows Destination A.
    vi.unstubAllGlobals();
    stubApi({ sightseeing: stored });
    renderEdit();
    const reloaded = (await screen.findByLabelText(/destination/i)) as HTMLSelectElement;
    await waitFor(() => expect(reloaded.value).toBe(destA), { timeout: 8000 });
  });

  it('intentionally changing Destination still works', async () => {
    const user = userEvent.setup();
    let patched: Record<string, unknown> | null = null;
    stubApi({
      onPatch: (body) => {
        patched = body;
        return { ...baseSightseeing, destination: { id: destB, name: 'Thailand' } };
      },
    });
    renderEdit();

    const destSelect = (await screen.findByLabelText(/destination/i)) as HTMLSelectElement;
    await waitFor(() => expect(destSelect.value).toBe(destA), { timeout: 8000 });
    await user.selectOptions(destSelect, destB);

    // Switching destination clears the now-invalid city (existing behavior).
    const citySelect = screen.getByLabelText(/city/i) as HTMLSelectElement;
    await waitFor(() => expect(citySelect).toHaveTextContent('Bangkok'), { timeout: 8000 });
    expect(citySelect.value).toBe('');
    await user.selectOptions(citySelect, cityB);

    await user.click(screen.getByRole('button', { name: /update sightseeing/i }));
    await waitFor(() => expect(patched !== null).toBe(true), { timeout: 8000 });
    expect((patched as unknown as Record<string, unknown>).destinationId).toBe(destB);
    expect((patched as unknown as Record<string, unknown>).cityId).toBe(cityB);
  });
});
