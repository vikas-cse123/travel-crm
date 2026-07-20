import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { FollowUpsPage } from './FollowUpsPage';

const auth = vi.hoisted(() => ({ permissions: new Set(['followups.view', 'followups.update']) }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ hasPermission: (key: string) => auth.permissions.has(key) }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const user = { id: 'u1', fullName: 'Owner User', username: 'owner' };
const row = {
  id: '11111111-1111-4111-8111-111111111111',
  queryId: '22222222-2222-4222-8222-222222222222',
  scheduledAt: '2026-07-20T04:30:00.000Z',
  status: 'PENDING',
  effectiveStatus: 'MISSED',
  outcomeType: null,
  outcome: null,
  notes: 'Confirm resort category',
  completionNotes: null,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  assignedTo: user,
  createdBy: user,
  query: {
    id: '22222222-2222-4222-8222-222222222222',
    queryNumber: 'QRY-2026-000007',
    customerName: 'Nina Shah',
    phone: '+91 90000 00000',
    leadStage: 'CONTACTED',
    leadType: 'HOT',
    priority: 'URGENT',
    lastContactedAt: null,
    itinerary: [{ destination: 'Maldives' }],
  },
};
const analytics = {
  timezone: 'Asia/Kolkata',
  dueToday: 2,
  overdue: 1,
  upcoming: 4,
  completedToday: 3,
  completedThisWeek: 6,
  cancelled: 1,
  missed: 1,
  averageCompletionDelayMinutes: 12,
  completionRate: 75,
  byOutcome: {},
  bySalesperson: [],
  leadsWithNoUpcomingFollowUp: 5,
  hotLeadsWithOverdueFollowUps: 1,
};
const lookups = {
  assignableUsers: [user],
  leadStages: [],
  leadTypes: [],
  priorities: [],
  countries: [],
  cities: [],
  leadSources: [],
  serviceTypes: [],
  tripTypes: [],
  currencies: [],
};
const list = {
  data: [row],
  timezone: 'Asia/Kolkata',
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

function stubData(
  fetchMock = vi.fn(async (input: RequestInfo | URL, _options?: RequestInit) => {
    const url = String(input);
    if (url.includes('/analytics')) return response(analytics);
    if (url.includes('/queries/lookups')) return response(lookups);
    return response(list);
  }),
) {
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Phase 7 follow-up workspace', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    auth.permissions = new Set(['followups.view', 'followups.update']);
  });

  it('renders analytics, overdue styling, lead details and a telephone link', async () => {
    stubData();
    renderWithProviders(<FollowUpsPage />, { route: '/follow-ups?quick=overdue' });
    expect(await screen.findByRole('heading', { name: 'Follow-ups' })).toBeInTheDocument();
    expect(await screen.findAllByText('Nina Shah')).not.toHaveLength(0);
    expect(screen.getAllByText('Missed')[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /90000 00000/ })[0]).toHaveAttribute(
      'href',
      'tel:+91 90000 00000',
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getAllByText('Hot Leads Requiring Attention')[0]).toBeInTheDocument();
  });

  it('renders loading, empty and error states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const pending = renderWithProviders(<FollowUpsPage />);
    expect(screen.getByLabelText('Loading follow-ups')).toBeInTheDocument();
    pending.unmount();
    const emptyFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/analytics')) return response(analytics);
      if (url.includes('/queries/lookups')) return response(lookups);
      return response({ ...list, data: [], pagination: { ...list.pagination, total: 0 } });
    });
    vi.stubGlobal('fetch', emptyFetch);
    const empty = renderWithProviders(<FollowUpsPage />);
    expect(await screen.findByText('No follow-ups found')).toBeInTheDocument();
    empty.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            json: async () => ({
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'failed' },
            }),
          }) as Response,
      ),
    );
    renderWithProviders(<FollowUpsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load follow-ups');
  });

  it('synchronizes quick filters, search, assignee and lead filters with the URL', async () => {
    const fetchMock = stubData();
    renderWithProviders(<FollowUpsPage />);
    await screen.findAllByText('Nina Shah');
    await userEvent.click(screen.getByRole('button', { name: 'Upcoming' }));
    await userEvent.type(screen.getByLabelText('Search follow-ups'), 'Maldives');
    await userEvent.selectOptions(screen.getByLabelText('Assigned salesperson'), 'u1');
    await userEvent.selectOptions(screen.getByLabelText('Lead stage'), 'CONTACTED');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => {
          const value = String(url);
          return (
            value.includes('quick=upcoming') &&
            value.includes('search=Maldives') &&
            value.includes('assignedToId=u1') &&
            value.includes('leadStage=CONTACTED')
          );
        }),
      ).toBe(true),
    );
  });

  it('supports structured completion with next follow-up in one dialog', async () => {
    const fetchMock = stubData();
    renderWithProviders(<FollowUpsPage />);
    await screen.findAllByText('Nina Shah');
    await userEvent.click(screen.getAllByRole('button', { name: 'Complete' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'complete follow-up' });
    expect(dialog).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText('Outcome'), 'INTERESTED');
    await userEvent.type(within(dialog).getByLabelText('Completion notes'), 'Customer is ready');
    await userEvent.type(
      within(dialog).getByLabelText('Next follow-up (optional)'),
      '2026-07-23T10:30',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, options]) => {
          if (!String(url).includes('/complete')) return false;
          const body = JSON.parse(String((options as RequestInit | undefined)?.body));
          return body.outcome === 'INTERESTED' && Boolean(body.nextFollowUp?.scheduledAt);
        }),
      ).toBe(true),
    );
  });

  it('hides mutation actions when followups.update is absent', async () => {
    auth.permissions = new Set(['followups.view']);
    stubData();
    renderWithProviders(<FollowUpsPage />);
    await screen.findAllByText('Nina Shah');
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open lead' })[0]).toBeInTheDocument();
  });
});
