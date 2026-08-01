import { useState } from 'react';
import { ArrowLeft, Eye, ListChecks, Save } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { labelForLookup } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useLead, useNoteAction, useNotes } from '@/features/queries/queries.api';

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500';

export function AddNotePage() {
  const { queryId = '' } = useParams();
  const navigate = useNavigate();
  const lead = useLead(queryId);
  const notes = useNotes(queryId);
  const action = useNoteAction(queryId);

  const [content, setContent] = useState('');
  const [withReminder, setWithReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!content.trim()) {
      setError('Note comment is required.');
      return;
    }
    if (withReminder && !reminderAt) {
      setError('Choose a date and time for the reminder.');
      return;
    }
    setError(null);
    action.mutate(
      {
        content: content.trim(),
        ...(withReminder && reminderAt
            ? {
                reminderAt: new Date(reminderAt).toISOString(),
                ...(reminderNotes.trim() ? { reminderNotes: reminderNotes.trim() } : {}),
              }
            : {}),
      },
      { onSuccess: () => navigate(`/queries/${queryId}/notes`) },
    );
  };

  const name = lead.data?.customerName ?? 'Lead';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Notes</p>
          <h1 className="text-2xl font-semibold text-slate-900">Add Note to Lead</h1>
        </div>
        <nav className="text-sm text-slate-500">
          <Link to="/notes" className="hover:text-brand-700">
            Notes
          </Link>
          <span className="px-1">/</span>
          <span className="text-slate-700">Add Note</span>
        </nav>
      </header>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-brand-600 px-5 py-4 text-white">
          <span className="font-semibold">Add Note for Lead: {name}</span>
          {lead.data?.phone && <span className="text-sm opacity-90">📞 {lead.data.phone}</span>}
          {lead.data?.email && <span className="text-sm opacity-90">✉️ {lead.data.email}</span>}
        </div>

        <div className="space-y-5 p-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-800">Current Stage</label>
            <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {lead.data ? labelForLookup(lead.data.leadStage) : '—'}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Stage is read-only. To change stage, use the stage dropdown in the leads list.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-800">
              Note Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              className={`${fieldClass} min-h-[140px] resize-y`}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write the note for this lead…"
            />
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={withReminder}
                onChange={(event) => setWithReminder(event.target.checked)}
              />
              Create reminder for follow-up
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Check this box if you want to create a reminder for follow-up.
            </p>
            {withReminder && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    Reminder Date &amp; Time <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="datetime-local"
                    className={fieldClass}
                    value={reminderAt}
                    onChange={(event) => setReminderAt(event.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Reminder Note</span>
                  <input
                    type="text"
                    className={fieldClass}
                    value={reminderNotes}
                    onChange={(event) => setReminderNotes(event.target.value)}
                    placeholder="Optional note for the reminder"
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={save} isLoading={action.isPending}>
              <Save className="h-4 w-4" />
              Save Note
            </Button>
            <Link to="/queries">
              <Button variant="secondary" type="button">
                <ArrowLeft className="h-4 w-4" />
                Back to Leads
              </Button>
            </Link>
            <Link to={`/queries/${queryId}/notes`}>
              <Button variant="secondary" type="button">
                <Eye className="h-4 w-4" />
                View Lead Notes
                <span className="ml-1 rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-700">
                  {notes.data?.length ?? 0}
                </span>
              </Button>
            </Link>
            <Link to="/notes" className="ml-auto">
              <Button variant="ghost" type="button">
                <ListChecks className="h-4 w-4" />
                All Notes
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
