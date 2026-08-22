import { useMemo } from 'react';
import { Eye, NotebookPen, Phone, Plus, Search, UserRound, StickyNote } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import {
  useLeadLookups,
  useNotesOverview,
  type Note,
  type NotesOverviewLead,
} from '@/features/queries/queries.api';
import { formatDateTime, NoteStatCards, StagePill } from './NotesUi';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/AuthProvider';
import './notes.css';

function NoteContent({ content }: { content: string }) {
  return (
    <div className="notes-card-note-block">
      <p className="notes-card-note-text">{content}</p>
    </div>
  );
}

function LeadNoteCard({ lead }: { lead: NotesOverviewLead }) {
  const latest = lead.latestNote;
  return (
    <article className="note-card">
      <div className="note-card-top">
        <div className="note-card-title-row">
          <h3 className="note-card-name" title={lead.customerName}>
            {lead.customerName}
          </h3>
          <StagePill stage={lead.leadStage} />
        </div>
        <div className="note-card-count-badge">
          <StickyNote aria-hidden="true" className="h-3.5 w-3.5" />
          {lead.noteCount} {lead.noteCount === 1 ? 'note' : 'notes'}
        </div>
      </div>

      <div className="note-card-secondary">
        <span className="note-card-secondary-item">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          {lead.phone}
        </span>
        {lead.assignedTo && (
          <span className="note-card-secondary-item">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {lead.assignedTo.fullName}
          </span>
        )}
      </div>

      <div className="note-card-latest">
        <p className="note-card-latest-label">Latest note</p>
        {latest ? (
          <>
            <NoteContent content={latest.content} />
            <p className="note-card-meta">
              Added by {latest.authorUser.fullName} • {formatDateTime(latest.createdAt)}
            </p>
          </>
        ) : (
          <p className="note-card-empty-note">No notes yet.</p>
        )}
      </div>

      <div className="note-card-actions">
        <Link
          to={`/queries/${lead.id}`}
          aria-label={`View lead for ${lead.customerName}`}
          title={`View lead for ${lead.customerName}`}
          className="note-card-action note-card-action--secondary"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View Lead
        </Link>
        <Link
          to={`/queries/${lead.id}/notes`}
          aria-label={`View notes for ${lead.customerName}`}
          title={`View notes for ${lead.customerName}`}
          className="note-card-action note-card-action--secondary"
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
          View Notes
        </Link>
        <Link
          to={`/queries/${lead.id}/notes/new`}
          aria-label={`Add note for ${lead.customerName}`}
          title={`Add note for ${lead.customerName}`}
          className="note-card-action note-card-action--primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Note
        </Link>
      </div>
    </article>
  );
}

export function AllNotesPage() {
  const [params, setParams] = useSearchParams();
  const overview = useNotesOverview(params);
  const lookups = useLeadLookups();
  const { hasPermission } = useAuth();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const page = overview.data?.page ?? 1;
  const totalPages = overview.data?.stats.totalPages ?? 1;
  const pageSize = overview.data?.pageSize ?? 12;
  const totalEntries = overview.data?.stats.totalLeadsWithNotes ?? 0;

  const sortOption = params.get('sort') ?? 'latest';
  const dateFilter = params.get('dateRange') ?? '';

  const rawLeads = overview.data?.leads ?? [];

  const filteredAndSortedLeads = useMemo(() => {
    let filtered = [...rawLeads];

    if (dateFilter) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      filtered = filtered.filter((lead) => {
        if (!lead.latestNote) return false;
        const d = new Date(lead.latestNote.createdAt);
        if (dateFilter === 'today') return d >= startOfDay;
        if (dateFilter === 'week') return d >= startOfWeek;
        if (dateFilter === 'month') return d >= startOfMonth;
        return true;
      });
    }

    if (sortOption === 'oldest') {
      filtered.sort((a, b) => {
        if (!a.latestNote) return 1;
        if (!b.latestNote) return -1;
        return (
          new Date(a.latestNote.createdAt).getTime() - new Date(b.latestNote.createdAt).getTime()
        );
      });
    } else if (sortOption === 'name') {
      filtered.sort((a, b) => a.customerName.localeCompare(b.customerName));
    } else if (sortOption === 'most') {
      filtered.sort((a, b) => b.noteCount - a.noteCount);
    } else {
      filtered.sort((a, b) => {
        if (!a.latestNote) return 1;
        if (!b.latestNote) return -1;
        return (
          new Date(b.latestNote.createdAt).getTime() - new Date(a.latestNote.createdAt).getTime()
        );
      });
    }

    return filtered;
  }, [rawLeads, dateFilter, sortOption]);

  const stats = overview.data?.stats;
  const allNotes = useMemo(() => {
    const notes: Note[] = [];
    for (const lead of rawLeads) {
      if (lead.latestNote) notes.push(lead.latestNote);
      notes.push(...lead.previousNotes);
    }
    return notes;
  }, [rawLeads]);

  const notesToday = useMemo(() => {
    const today = new Date().toDateString();
    return allNotes.filter((n) => new Date(n.createdAt).toDateString() === today).length;
  }, [allNotes]);

  const notesThisWeek = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return allNotes.filter((n) => new Date(n.createdAt) >= startOfWeek).length;
  }, [allNotes]);

  return (
    <div className="notes-page">
      <div className="notes-page-header">
        <div>
          <h1 className="notes-page-title">Lead Notes</h1>
          <p className="notes-page-desc">View and manage notes across your leads.</p>
        </div>
        {hasPermission(PERMISSIONS.QUERIES_UPDATE) && (
          <Link to="/notes/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add Note
            </Button>
          </Link>
        )}
      </div>

      <NoteStatCards
        totalNotes={stats?.totalNotes ?? 0}
        leadsWithNotes={stats?.totalLeadsWithNotes ?? 0}
        notesToday={notesToday}
        notesThisWeek={notesThisWeek}
      />

      <section className="notes-filter-bar" aria-label="Filter notes">
        <label className="notes-filter-field notes-filter-field--search">
          <Search className="notes-filter-icon" aria-hidden="true" />
          <input
            aria-label="Search notes"
            className="notes-filter-input"
            value={params.get('search') ?? ''}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search lead name, phone or note..."
          />
        </label>
        <select
          aria-label="Filter stage"
          className="notes-filter-select"
          value={params.get('stage') ?? ''}
          onChange={(event) => update('stage', event.target.value)}
        >
          <option value="">All Stages</option>
          {lookups.data?.leadStages.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter user"
          className="notes-filter-select"
          value={params.get('userId') ?? ''}
          onChange={(event) => update('userId', event.target.value)}
        >
          <option value="">All Users</option>
          {lookups.data?.assignableUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter date"
          className="notes-filter-select"
          value={dateFilter}
          onChange={(event) => update('dateRange', event.target.value)}
        >
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
        <select
          aria-label="Sort notes"
          className="notes-filter-select"
          value={sortOption}
          onChange={(event) => update('sort', event.target.value)}
        >
          <option value="latest">Latest Note First</option>
          <option value="oldest">Oldest Note First</option>
          <option value="name">Lead Name A–Z</option>
          <option value="most">Most Notes</option>
        </select>
      </section>

      {overview.isPending ? (
        <div className="notes-loading" aria-live="polite">
          Loading notes…
        </div>
      ) : overview.isError ? (
        <div role="alert" className="notes-error">
          Could not load notes.
        </div>
      ) : !filteredAndSortedLeads.length ? (
        <div className="notes-empty">
          <StickyNote className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="notes-empty-title">No notes found</h2>
          <p className="notes-empty-text">
            {params.toString()
              ? 'No notes match your filters. Try adjusting search or filters.'
              : 'Add a note to a lead to start tracking important conversations and updates.'}
          </p>
          {hasPermission(PERMISSIONS.QUERIES_UPDATE) && (
            <Link to="/notes/new" className="notes-empty-cta">
              <Button>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Note
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="notes-grid">
          {filteredAndSortedLeads.map((lead) => (
            <LeadNoteCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      {!overview.isPending && !overview.isError && filteredAndSortedLeads.length > 0 && (
        <div className="notes-pagination">
          <Pagination
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            total={totalEntries}
            onPage={(next) => update('page', String(next))}
          />
        </div>
      )}
    </div>
  );
}
