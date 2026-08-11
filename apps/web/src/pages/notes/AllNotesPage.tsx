import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eye,
  NotebookPen,
  Phone,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
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
import { cn } from '@/utils/cn';
import './notes.css';

/** Map a lead stage to the deterministic card accent/tint classes. */
function cardAccent(stage: string | null): string {
  if (!stage) return 'notes-card--new-lead';
  return `notes-card--${stage.toLowerCase().replace(/_/g, '-')}`;
}

function NoteBlock({ note, muted = false }: { note: Note; muted?: boolean }) {
  return (
    <div className={muted ? 'rounded-md bg-slate-50 p-3' : ''}>
      <div className="flex items-center justify-between gap-2">
        <StagePill stage={note.leadStage} />
        <span className="text-xs text-slate-500">{formatDateTime(note.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-brand-300 pl-3 text-sm text-slate-800">
        {note.content}
      </p>
      <p className="mt-1 pl-3 text-xs text-slate-500">{note.authorUser.fullName}</p>
    </div>
  );
}

function LeadNoteCard({ lead }: { lead: NotesOverviewLead }) {
  const [showPrevious, setShowPrevious] = useState(false);
  const latest = lead.latestNote;
  const accent = cardAccent(lead.leadStage);
  return (
    <article className={cn('note-card', accent)}>
      {/* Tinted header zone */}
      <div className="note-card-header">
        <div className="note-card-name-row">
          <h3 className="note-card-name">{lead.customerName}</h3>
          <StagePill stage={lead.leadStage} />
        </div>
        <p className="note-card-phone">
          <Phone aria-hidden="true" /> {lead.phone}
        </p>
        <p className="note-card-count">
          <NotebookPen aria-hidden="true" />
          {lead.noteCount} {lead.noteCount === 1 ? 'note' : 'notes'}
        </p>
      </div>

      {/* White body */}
      <div className="note-card-body">
        {latest ? (
          <>
            <div className="note-card-meta-row">
              <span className="note-card-meta-label">Latest Note:</span>
              <span className="note-card-meta-time">{formatDateTime(latest.createdAt)}</span>
            </div>
            <div className="note-card-panel">{latest.content}</div>
            <p className="note-card-author">
              <UserRound aria-hidden="true" /> {latest.authorUser.fullName}
            </p>
          </>
        ) : (
          <div className="note-card-no-notes">No notes yet.</div>
        )}
      </div>

      {lead.previousNotes.length > 0 && (
        <>
          <hr className="note-card-divider" />
          <div className="note-card-previous">
            <span className="note-card-previous-label">Previous Notes:</span>
            <button
              type="button"
              onClick={() => setShowPrevious((value) => !value)}
              className="note-card-show-all"
            >
              {showPrevious ? (
                <>
                  Hide <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              ) : (
                <>
                  Show All <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
          {showPrevious && (
            <div className="note-card-previous-list space-y-2">
              {lead.previousNotes.map((note) => (
                <NoteBlock key={note.id} note={note} muted />
              ))}
            </div>
          )}
        </>
      )}

      {/* Bottom action area */}
      <div className="note-card-actions">
        <Link
          to={`/queries/${lead.id}/notes`}
          aria-label={`View notes for ${lead.customerName}`}
          title={`View notes for ${lead.customerName}`}
          className="note-action-btn note-action-btn--view"
        >
          <Eye aria-hidden="true" />
        </Link>
        <Link
          to={`/queries/${lead.id}/notes/new`}
          aria-label={`Add note for ${lead.customerName}`}
          title={`Add note for ${lead.customerName}`}
          className="note-action-btn note-action-btn--add"
        >
          <Plus aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/** Four-colour statistics tiles for the All Notes dashboard. */
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
    setParams(next);
  };

  const page = overview.data?.page ?? 1;
  const totalPages = overview.data?.stats.totalPages ?? 1;
  const pageSize = overview.data?.pageSize ?? 12;
  const totalEntries = overview.data?.stats.totalLeadsWithNotes ?? 0;

  return (
    <div className="notes-page">
      <div className="notes-page-header">
        <div>
          <p className="notes-page-breadcrumb">Notes</p>
          <h1 className="notes-page-title">Lead Notes</h1>
          <p className="notes-page-desc">
            Every note logged across your leads, grouped by lead with follow-up reminders.
          </p>
        </div>
        {/* Gated on the permission the POST route itself requires, so the button
            is never offered to someone the server would reject. */}
        {hasPermission(PERMISSIONS.QUERIES_UPDATE) && (
          <Link to="/notes/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add Note
            </Button>
          </Link>
        )}
      </div>

      <NoteStatCards
        totalNotes={overview.data?.stats.totalNotes ?? 0}
        totalLeads={overview.data?.stats.totalLeads ?? 0}
        totalPages={totalPages}
      />

      <section className="notes-filter-bar" aria-label="Filter notes">
        <label className="notes-filter-field">
          <Search className="notes-filter-icon" aria-hidden="true" />
          <input
            aria-label="Search notes"
            className="notes-filter-input"
            value={params.get('search') ?? ''}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search in leads or comments…"
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
      </section>

      {overview.isPending ? (
        <div className="notes-loading" aria-live="polite">
          Loading notes…
        </div>
      ) : overview.isError ? (
        <div role="alert" className="notes-error">
          Could not load notes.
        </div>
      ) : !overview.data?.leads.length ? (
        <div className="notes-empty">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <h2 className="notes-empty-title">No notes found</h2>
          <p className="notes-empty-text">
            Adjust the filters, or add a note from a lead to see it here.
          </p>
        </div>
      ) : (
        <div className="notes-grid">
          {overview.data.leads.map((lead) => (
            <LeadNoteCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      {!overview.isPending && !overview.isError && (
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
