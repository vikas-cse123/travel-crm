import { ArrowLeft, ListChecks, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { PERMISSIONS } from '@interscale/shared';
import { useLead, useNotes } from '@/features/queries/queries.api';
import { formatDate, formatDateTime, StagePill } from './NotesUi';

export function LeadNotesPage() {
  const { queryId = '' } = useParams();
  const { hasPermission } = useAuth();
  const lead = useLead(queryId);
  const notes = useNotes(queryId);
  const canAdd = hasPermission(PERMISSIONS.QUERIES_UPDATE);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Notes</p>
          <h1 className="text-2xl font-semibold text-slate-900">Lead Notes</h1>
        </div>
        <nav className="text-sm text-slate-500">
          <Link to="/notes" className="hover:text-brand-700">
            Notes
          </Link>
          <span className="px-1">/</span>
          <span className="text-slate-700">View Notes</span>
        </nav>
      </header>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="font-semibold text-slate-900">
            Notes for Lead: {lead.data?.customerName ?? '…'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {canAdd && (
              <Link to={`/queries/${queryId}/notes/new`}>
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add Note
                </Button>
              </Link>
            )}
            <Link to="/queries">
              <Button size="sm" variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Back to Leads
              </Button>
            </Link>
            <Link to="/notes">
              <Button size="sm" variant="secondary">
                <ListChecks className="h-4 w-4" />
                Back to All Notes
              </Button>
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Note Comment</th>
                <th className="px-4 py-3 font-semibold">Follow-up Date</th>
                <th className="px-4 py-3 font-semibold">Added by</th>
              </tr>
            </thead>
            <tbody>
              {notes.isPending ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Loading notes…
                  </td>
                </tr>
              ) : !notes.data?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No notes found for this lead
                  </td>
                </tr>
              ) : (
                notes.data.map((note) => (
                  <tr key={note.id} className="border-b last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatDateTime(note.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StagePill stage={note.leadStage} />
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <p className="whitespace-pre-wrap break-words">{note.content}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {note.followUp ? formatDate(note.followUp.scheduledAt) : 'N/A'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {note.authorUser.fullName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
