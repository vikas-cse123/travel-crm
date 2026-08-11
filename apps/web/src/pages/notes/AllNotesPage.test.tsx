import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { AllNotesPage } from './AllNotesPage';
import type {
  NotesOverview,
  NotesOverviewLead,
  Note,
  UserOption,
} from '@/features/queries/queries.api';

const hasPermissionMock = vi.fn(() => true);
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, hasPermission: hasPermissionMock }),
}));

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const user: UserOption = { id: 'me', fullName: 'Owner', username: 'owner' };

const note = (id: string, content: string, createdAt: string, authorUser = user): Note => ({
  id,
  content,
  leadStage: 'NEW_LEAD',
  createdAt,
  updatedAt: createdAt,
  isCustomerContact: false,
  contactMethod: null,
  contactedAt: null,
  authorUser,
  followUp: null,
});

const lead = (overrides: Partial<NotesOverviewLead> = {}): NotesOverviewLead => ({
  id: '11111111-1111-4111-8111-111111111111',
  queryNumber: 'QRY-000001',
  customerName: 'Aarav Mehta',
  phone: '+91 98765 43210',
  leadStage: 'NEW_LEAD',
  assignedTo: user,
  noteCount: 2,
  latestNote: note('n-latest', 'Customer prefers morning flights', '2026-08-01T10:00:00.000Z'),
  previousNotes: [note('n-prev', 'Confirmed the hotel category', '2026-07-28T09:00:00.000Z')],
  ...overrides,
});

const lookups = {
  countries: ['India'],
  cities: ['Delhi'],
  leadSources: [],
  leadTypes: [],
  leadStages: [{ value: 'NEW_LEAD', label: 'New Lead' }],
  priorities: [],
  serviceTypes: [],
  tripTypes: [],
  currencies: [],
  assignableUsers: [user],
};

const overview = (leads: NotesOverviewLead[] = [lead()]): NotesOverview => ({
  stats: { totalNotes: 8, totalLeads: 4, totalLeadsWithNotes: 3, totalPages: 2 },
  page: 1,
  pageSize: 12,
  leads,
});

function stubNotes(leads: NotesOverviewLead[] = [lead()], stats = overview(leads)) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/queries/notes-overview')) return response(stats);
    if (url.includes('/queries/lookups')) return response(lookups);
    return response({ data: [], pagination: {} });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('Lead Notes dashboard (AllNotesPage)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    hasPermissionMock.mockReturnValue(true);
  });

  it('renders the page with the Lead Notes title and description', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    expect(await screen.findByRole('heading', { name: 'Lead Notes' })).toBeInTheDocument();
    expect(screen.getByText(/Every note logged across your leads/)).toBeInTheDocument();
  });

  it('renders four statistics with unchanged values', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    await screen.findByText('Total Notes');
    expect(screen.getByText('Total Notes')).toBeInTheDocument();
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Total Pages')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders the search, stage and user filters', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    expect(screen.getByLabelText('Search notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter user')).toBeInTheDocument();
  });

  it('search still updates the URL and triggers a refetch', async () => {
    const mock = stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    await userEvent.type(screen.getByLabelText('Search notes'), 'Bangkok');
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).includes('search=Bangkok'))).toBe(true),
    );
  });

  it('stage filter still updates the URL and triggers a refetch', async () => {
    const mock = stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    await screen.findByRole('option', { name: 'New Lead' });
    await userEvent.selectOptions(screen.getByLabelText('Filter stage'), 'NEW_LEAD');
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).includes('stage=NEW_LEAD'))).toBe(true),
    );
  });

  it('user filter still updates the URL and triggers a refetch', async () => {
    const mock = stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    await screen.findByRole('option', { name: 'Owner' });
    await userEvent.selectOptions(screen.getByLabelText('Filter user'), 'me');
    await waitFor(() =>
      expect(mock.mock.calls.some(([url]) => String(url).includes('userId=me'))).toBe(true),
    );
  });

  it('renders note cards with lead name, phone, stage, count, latest note and author', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    expect(await screen.findByText('Aarav Mehta')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getAllByText('New Lead').length).toBeGreaterThan(0);
    expect(screen.getByText('2 notes')).toBeInTheDocument();
    expect(screen.getByText('Latest Note:')).toBeInTheDocument();
    expect(screen.getByText('Customer prefers morning flights')).toBeInTheDocument();
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
  });

  it('shows Previous Notes only when previous notes exist and Show All toggles', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByText('Aarav Mehta');
    expect(screen.getByText('Previous Notes:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show All/ })).toBeInTheDocument();
    // Before expanding, the previous note content is hidden.
    expect(screen.queryByText('Confirmed the hotel category')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show All/ }));
    expect(screen.getByText('Confirmed the hotel category')).toBeInTheDocument();
  });

  it('does not show a Previous Notes row when there are no previous notes', async () => {
    stubNotes([lead({ previousNotes: [] })]);
    renderWithProviders(<AllNotesPage />);
    await screen.findByText('Aarav Mehta');
    expect(screen.queryByText('Previous Notes:')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show All/ })).not.toBeInTheDocument();
  });

  it('View button navigates to the correct lead notes route', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByText('Aarav Mehta');
    const view = screen.getByRole('link', { name: 'View notes for Aarav Mehta' });
    expect(view).toHaveAttribute('href', `/queries/${lead().id}/notes`);
  });

  it('Add button navigates to the correct lead add-note route', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByText('Aarav Mehta');
    const add = screen.getByRole('link', { name: 'Add note for Aarav Mehta' });
    expect(add).toHaveAttribute('href', `/queries/${lead().id}/notes/new`);
  });

  it('renders the empty state when no leads match', async () => {
    stubNotes([]);
    renderWithProviders(<AllNotesPage />);
    expect(await screen.findByText('No notes found')).toBeInTheDocument();
    // Filters remain visible above the empty state.
    expect(screen.getByLabelText('Search notes')).toBeInTheDocument();
  });

  it('links Add Note to the lead-picker page', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    expect(screen.getByRole('link', { name: /Add Note/ })).toHaveAttribute('href', '/notes/new');
  });

  it('hides the Add Note button without the queries.update permission', async () => {
    stubNotes();
    hasPermissionMock.mockReturnValue(false);
    renderWithProviders(<AllNotesPage />);
    await screen.findByRole('heading', { name: 'Lead Notes' });
    expect(screen.queryByRole('link', { name: /Add Note/ })).not.toBeInTheDocument();
  });

  it('uses the shared Masters-style pagination footer', async () => {
    stubNotes([lead()], {
      ...overview(),
      stats: { totalNotes: 8, totalLeads: 4, totalLeadsWithNotes: 3, totalPages: 2 },
    });
    renderWithProviders(<AllNotesPage />);
    await screen.findByText('Aarav Mehta');
    expect(screen.getByText('Showing 1 to 3 of 3 entries')).toBeInTheDocument();
    // Numbered page buttons replace the old "Page X of Y" label.
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument());
  });

  it('action icon buttons have accessible labels', async () => {
    stubNotes();
    renderWithProviders(<AllNotesPage />);
    await screen.findByText('Aarav Mehta');
    expect(screen.getByRole('link', { name: 'View notes for Aarav Mehta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add note for Aarav Mehta' })).toBeInTheDocument();
  });
});
