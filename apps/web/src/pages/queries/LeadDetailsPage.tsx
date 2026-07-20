import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  CalendarPlus,
  Edit3,
  MessageSquarePlus,
  UserRoundCog,
} from 'lucide-react';
import { labelForLookup } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useFollowUpAction,
  useFollowUps,
  useArchiveLead,
  useLead,
  useLeadAction,
  useLeadLookups,
  useNoteAction,
  useNotes,
  useTimeline,
} from '@/features/queries/queries.api';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const localDateTimeValue = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const Info = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 text-sm text-slate-900">{children || '—'}</dd>
  </div>
);
export function LeadDetailsPage() {
  const { queryId = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const lead = useLead(queryId);
  const notes = useNotes(queryId);
  const followUps = useFollowUps(queryId);
  const timeline = useTimeline(queryId);
  const lookups = useLeadLookups();
  const action = useLeadAction(queryId);
  const archive = useArchiveLead(queryId);
  const noteAction = useNoteAction(queryId);
  const followUpAction = useFollowUpAction(queryId);
  const [note, setNote] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [outcome, setOutcome] = useState('');
  const [stage, setStage] = useState('');
  const [stageReason, setStageReason] = useState('');
  const [assignee, setAssignee] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [completingFollowUpId, setCompletingFollowUpId] = useState<string | null>(null);
  const [completionOutcome, setCompletionOutcome] = useState('');
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [editingFollowUpAt, setEditingFollowUpAt] = useState('');
  const [editingFollowUpNotes, setEditingFollowUpNotes] = useState('');
  if (lead.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  if (lead.isError || !lead.data)
    return (
      <div className="rounded-xl bg-white p-12 text-center">
        <h1 className="text-xl font-semibold">Lead unavailable</h1>
        <p className="mt-2 text-slate-500">It may not exist or is outside your visibility scope.</p>
        <Link className="mt-4 inline-block text-brand-700" to="/queries">
          Back to leads
        </Link>
      </div>
    );
  const q = lead.data;
  const money = (v: string | null) =>
    v
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: q.currency }).format(
          Number(v),
        )
      : '—';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/queries" className="rounded-lg p-2 hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">Leads / {q.queryNumber}</p>
            <h1 className="text-2xl font-semibold">{q.customerName}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {hasPermission('queries.update') && (
            <Link to={`/queries/${q.id}/edit`}>
              <Button variant="secondary">
                <Edit3 className="h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
          {hasPermission('queries.delete') && (
            <Button
              variant="danger"
              isLoading={archive.isPending}
              onClick={() => {
                if (window.confirm(`Archive ${q.queryNumber}?`)) {
                  archive.mutate(undefined, { onSuccess: () => navigate('/queries') });
                }
              }}
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                  {labelForLookup(q.leadStage)}
                </span>
                <span className="ml-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
                  {labelForLookup(q.leadType)} · {labelForLookup(q.priority)}
                </span>
              </div>
              <span className="text-sm text-slate-500">
                Created {new Date(q.createdAt).toLocaleString()}
              </span>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Lead ID">{q.queryNumber}</Info>
              <Info label="Phone">{q.phone}</Info>
              <Info label="Email">{q.email}</Info>
              <Info label="Lead source">{labelForLookup(q.leadSource)}</Info>
              <Info label="Assignee">{q.assignedTo?.fullName ?? 'Unassigned'}</Info>
              <Info label="Creator">{q.createdBy.fullName}</Info>
              <Info label="Last contacted">
                {q.lastContactedAt ? new Date(q.lastContactedAt).toLocaleString() : 'Never'}
              </Info>
              <Info label="Next follow-up">
                {q.nextFollowUpAt ? new Date(q.nextFollowUpAt).toLocaleString() : 'None'}
              </Info>
            </dl>
          </section>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Travel and travellers</h2>
            <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Dates">
                {q.travelStartDate
                  ? `${new Date(q.travelStartDate).toLocaleDateString()} – ${q.travelEndDate ? new Date(q.travelEndDate).toLocaleDateString() : 'Open'}`
                  : 'Flexible'}
              </Info>
              <Info label="Departure">
                {[q.departureCity, q.departureCountry].filter(Boolean).join(', ')}
              </Info>
              <Info label="Traveller summary">{q.travellerSummary}</Info>
              <Info label="Services">
                {q.services.map((s) => labelForLookup(s.serviceType)).join(', ')}
              </Info>
            </dl>
            <div className="mt-5 space-y-2">
              {q.itinerary.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
                    {row.sequence}
                  </span>
                  <strong>
                    {row.destination}, {row.country}
                  </strong>
                  <span>{row.nights} nights</span>
                  <span className="text-slate-500">
                    {row.arrivalDate
                      ? new Date(row.arrivalDate).toLocaleDateString()
                      : 'Dates open'}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Commercial information</h2>
            <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Expected amount">{money(q.expectedAmount)}</Info>
              <Info label="Budget">
                {q.budgetMin || q.budgetMax ? `${money(q.budgetMin)} – ${money(q.budgetMax)}` : '—'}
              </Info>
              <Info label="Expected margin">{money(q.expectedMargin)}</Info>
              <Info label="Quotation">{q.quotationRequired ? 'Required' : 'Not required'}</Info>
              <Info label="Trip type">{q.tripType}</Info>
              <Info label="Booking placeholder">{q.bookingStatusPlaceholder}</Info>
              <Info label="Updated">{new Date(q.updatedAt).toLocaleString()}</Info>
            </dl>
          </section>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Timeline</h2>
            {timeline.isLoading ? (
              <div className="mt-4 h-32 animate-pulse rounded bg-slate-100" />
            ) : (
              <div className="mt-4 space-y-4">
                {timeline.data?.data.map((entry) => (
                  <div
                    key={`${entry.type}-${entry.id}`}
                    className="relative border-l-2 border-slate-200 pl-4"
                  >
                    <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand-500" />
                    <p className="text-sm font-medium">{entry.title}</p>
                    <p className="text-sm text-slate-600">{entry.description}</p>
                    <p className="text-xs text-slate-400">
                      {entry.actor?.fullName ?? 'System'} ·{' '}
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Lead actions</h2>
            {hasPermission('queries.update') && (
              <div className="mt-4 space-y-3">
                <select
                  aria-label="New stage"
                  className={inputClass}
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  <option value="">Change stage…</option>
                  {lookups.data?.leadStages.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {['LOST', 'CANCELLED', 'INVALID'].includes(stage) && (
                  <input
                    aria-label="Stage reason"
                    className={inputClass}
                    placeholder="Reason required"
                    value={stageReason}
                    onChange={(e) => setStageReason(e.target.value)}
                  />
                )}
                <Button
                  fullWidth
                  disabled={
                    !stage || (['LOST', 'CANCELLED', 'INVALID'].includes(stage) && !stageReason)
                  }
                  isLoading={action.isPending}
                  onClick={() =>
                    action.mutate(
                      {
                        path: 'stage',
                        body: {
                          stage,
                          reason: stageReason || undefined,
                          lostReason: stage === 'LOST' ? stageReason : undefined,
                        },
                      },
                      {
                        onSuccess: () => {
                          setStage('');
                          setStageReason('');
                        },
                      },
                    )
                  }
                >
                  Update stage
                </Button>
              </div>
            )}
            {hasPermission('queries.assign') && (
              <div className="mt-5 border-t pt-4">
                <label className="text-sm font-medium">Reassign lead</label>
                <select
                  className={`${inputClass} mt-2`}
                  value={assignee || q.assignedToId || ''}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {lookups.data?.assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
                <Button
                  className="mt-2"
                  fullWidth
                  variant="secondary"
                  onClick={() =>
                    action.mutate({
                      path: 'assignment',
                      body: { assignedToId: assignee || null, movePendingFollowUps: true },
                    })
                  }
                >
                  <UserRoundCog className="h-4 w-4" />
                  Assign
                </Button>
              </div>
            )}
          </section>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <MessageSquarePlus className="h-4 w-4" />
              Notes
            </h2>
            {hasPermission('queries.update') && (
              <div className="mt-3">
                <textarea
                  aria-label="New note"
                  className={inputClass}
                  rows={3}
                  placeholder="Add a private lead note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={!note.trim()}
                  isLoading={noteAction.isPending}
                  onClick={() =>
                    noteAction.mutate({ content: note }, { onSuccess: () => setNote('') })
                  }
                >
                  Add note
                </Button>
              </div>
            )}
            <div className="mt-4 space-y-3">
              {notes.data?.map((item) => (
                <article key={item.id} className="rounded-lg bg-slate-50 p-3">
                  {editingNoteId === item.id ? (
                    <div className="space-y-2">
                      <textarea
                        aria-label={`Edit note ${item.id}`}
                        className={inputClass}
                        rows={3}
                        value={editingNoteText}
                        onChange={(event) => setEditingNoteText(event.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!editingNoteText.trim()}
                          isLoading={noteAction.isPending}
                          onClick={() =>
                            noteAction.mutate(
                              { noteId: item.id, content: editingNoteText },
                              {
                                onSuccess: () => {
                                  setEditingNoteId(null);
                                  setEditingNoteText('');
                                },
                              },
                            )
                          }
                        >
                          Save note
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {item.authorUser.fullName} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                  {hasPermission('queries.update') && (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        className="text-brand-700"
                        onClick={() => {
                          setEditingNoteId(item.id);
                          setEditingNoteText(item.content);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-700"
                        onClick={() => {
                          if (window.confirm('Delete this note?'))
                            noteAction.mutate({ noteId: item.id, remove: true });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarPlus className="h-4 w-4" />
              Follow-Ups
            </h2>
            {hasPermission('queries.update') && (
              <div className="mt-3">
                <input
                  aria-label="Schedule follow-up"
                  className={inputClass}
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                />
                <textarea
                  aria-label="Follow-up note"
                  className={`${inputClass} mt-2`}
                  rows={2}
                  placeholder="Purpose / note"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                />
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={!followUpAt}
                  onClick={() =>
                    followUpAction.mutate(
                      { body: { scheduledAt: new Date(followUpAt), notes: outcome || undefined } },
                      {
                        onSuccess: () => {
                          setFollowUpAt('');
                          setOutcome('');
                        },
                      },
                    )
                  }
                >
                  Schedule
                </Button>
              </div>
            )}
            <div className="mt-4 space-y-3">
              {followUps.data?.map((item) => (
                <article key={item.id} className="rounded-lg border p-3">
                  <div className="flex justify-between">
                    <strong className="text-sm">
                      {new Date(item.scheduledAt).toLocaleString()}
                    </strong>
                    <span className="text-xs font-medium">{item.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.outcome ?? item.notes ?? 'No details'}
                  </p>
                  <p className="text-xs text-slate-400">Assigned to {item.assignedTo.fullName}</p>
                  {item.status === 'PENDING' &&
                    hasPermission('queries.update') &&
                    (editingFollowUpId === item.id ? (
                      <div className="mt-3 space-y-2">
                        <input
                          aria-label={`Edit follow-up date ${item.id}`}
                          className={inputClass}
                          type="datetime-local"
                          value={editingFollowUpAt}
                          onChange={(event) => setEditingFollowUpAt(event.target.value)}
                        />
                        <textarea
                          aria-label={`Edit follow-up notes ${item.id}`}
                          className={inputClass}
                          rows={2}
                          value={editingFollowUpNotes}
                          onChange={(event) => setEditingFollowUpNotes(event.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!editingFollowUpAt}
                            isLoading={followUpAction.isPending}
                            onClick={() =>
                              followUpAction.mutate(
                                {
                                  followUpId: item.id,
                                  body: {
                                    scheduledAt: new Date(editingFollowUpAt),
                                    notes: editingFollowUpNotes || null,
                                  },
                                },
                                {
                                  onSuccess: () => {
                                    setEditingFollowUpId(null);
                                    setEditingFollowUpAt('');
                                    setEditingFollowUpNotes('');
                                  },
                                },
                              )
                            }
                          >
                            Save follow-up
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingFollowUpId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : completingFollowUpId === item.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          aria-label={`Completion outcome ${item.id}`}
                          className={inputClass}
                          rows={2}
                          placeholder="Completion outcome *"
                          value={completionOutcome}
                          onChange={(event) => setCompletionOutcome(event.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!completionOutcome.trim()}
                            isLoading={followUpAction.isPending}
                            onClick={() =>
                              followUpAction.mutate(
                                {
                                  followUpId: item.id,
                                  action: 'complete',
                                  body: { outcome: completionOutcome },
                                },
                                {
                                  onSuccess: () => {
                                    setCompletingFollowUpId(null);
                                    setCompletionOutcome('');
                                  },
                                },
                              )
                            }
                          >
                            Save completion
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCompletingFollowUpId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-3 text-xs">
                        <button
                          className="text-emerald-700"
                          onClick={() => setCompletingFollowUpId(item.id)}
                        >
                          Complete
                        </button>
                        <button
                          className="text-brand-700"
                          onClick={() => {
                            setEditingFollowUpId(item.id);
                            setEditingFollowUpAt(localDateTimeValue(item.scheduledAt));
                            setEditingFollowUpNotes(item.notes ?? '');
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-700"
                          onClick={() =>
                            followUpAction.mutate({
                              followUpId: item.id,
                              action: 'cancel',
                              body: { reason: 'Cancelled by user' },
                            })
                          }
                        >
                          Cancel
                        </button>
                        <button
                          className="text-red-700"
                          onClick={() => {
                            if (window.confirm('Delete this follow-up?'))
                              followUpAction.mutate({
                                followUpId: item.id,
                                action: 'delete',
                              });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
