import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Phone, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  useLeadLookups,
  useNotesOverview,
  type Note,
  type NotesOverviewLead,
} from '@/features/queries/queries.api';
import { PageHeader } from '../reminders/ReminderUi';
import { formatDateTime, NoteStatCards, StagePill } from './NotesUi';

const fieldClass =
  'h-10 w-full rounded-lg border border-slate-300 bg-card px-3 text-sm text-slate-800 outline-none focus:border-brand-500';

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
      <p className="mt-1 pl-3 text-xs text-slate-500">👤 {note.authorUser.fullName}</p>
    </div>
  );
}

function LeadCard({ lead }: { lead: NotesOverviewLead }) {
  const [showPrevious, setShowPrevious] = useState(false);
  const latest = lead.latestNote;
  return (
    <article className="flex flex-col rounded-xl border border-l-4 border-l-brand-400 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{lead.customerName}</h3>
        <StagePill stage={lead.leadStage} />
      </div>
      <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
        <Phone className="h-3.5 w-3.5" /> {lead.phone}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">
        {lead.noteCount} {lead.noteCount === 1 ? 'note' : 'notes'}
      </p>

      <div className="mt-3 border-t pt-3">
        {latest ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Latest Note:</span>
              <span className="text-xs text-slate-500">{formatDateTime(latest.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-brand-400 pl-3 text-sm text-slate-800">
              {latest.content}
            </p>
            <p className="mt-1 pl-3 text-xs text-slate-500">👤 {latest.authorUser.fullName}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No notes yet.</p>
        )}
      </div>

      {lead.previousNotes.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <button
            type="button"
            onClick={() => setShowPrevious((value) => !value)}
            className="flex items-center gap-1 text-sm font-semibold text-brand-700"
          >
            Previous Notes:
            {showPrevious ? (
              <>
                Hide <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Show All <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
          {showPrevious && (
            <div className="mt-2 space-y-2">
              {lead.previousNotes.map((note) => (
                <NoteBlock key={note.id} note={note} muted />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2 pt-2">
        <Link
          to={`/queries/${lead.id}/notes`}
          aria-label={`View all notes for ${lead.customerName}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-200 text-brand-600 hover:bg-brand-50"
        >
          <Eye className="h-4 w-4" />
        </Link>
        <Link
          to={`/queries/${lead.id}/notes/new`}
          aria-label={`Add note for ${lead.customerName}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export function AllNotesPage() {
  const [params, setParams] = useSearchParams();
  const overview = useNotesOverview(params);
  const lookups = useLeadLookups();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const page = overview.data?.page ?? 1;
  const totalPages = overview.data?.stats.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Notes"
        title="Lead Notes"
        description="Every note logged across your leads, grouped by lead with follow-up reminders."
      />

      <NoteStatCards
        totalNotes={overview.data?.stats.totalNotes ?? 0}
        totalLeads={overview.data?.stats.totalLeads ?? 0}
        totalPages={totalPages}
      />

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-3">
        <label className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            aria-label="Search notes"
            className={`${fieldClass} pl-9`}
            value={params.get('search') ?? ''}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search in leads or comments…"
          />
        </label>
        <select
          aria-label="Filter stage"
          className={fieldClass}
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
          className={fieldClass}
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
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-slate-500">
          Loading notes…
        </div>
      ) : overview.isError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          Could not load notes.
        </div>
      ) : !overview.data?.leads.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-card px-6 py-14 text-center">
          <h2 className="font-semibold text-slate-800">No notes found</h2>
          <p className="mt-1 text-sm text-slate-500">
            Adjust the filters, or add a note from a lead to see it here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {overview.data.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => update('page', String(page - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => update('page', String(page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
