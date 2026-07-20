import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock3, Flame, Phone, Search, X } from 'lucide-react';
import {
  FOLLOW_UP_OUTCOMES,
  LEAD_STAGES,
  LEAD_TYPES,
  QUERY_PRIORITIES,
  labelForLookup,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useDedicatedFollowUpAction,
  useFollowUpAnalytics,
  useFollowUpList,
  type FollowUpRow,
} from '@/features/follow-ups/follow-ups.api';
import { FollowUpOutcomeBadge } from '@/features/follow-ups/FollowUpOutcomeBadge';
import { FollowUpStatusBadge } from '@/features/follow-ups/FollowUpStatusBadge';
import { useLeadLookups } from '@/features/queries/queries.api';

const fieldClass = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const quickTabs = [
  ['due_today', 'Due Today'],
  ['overdue', 'Overdue'],
  ['upcoming', 'Upcoming'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
] as const;

function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type Action = 'complete' | 'reschedule' | 'cancel';

export function FollowUpsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams({ quick: 'due_today' });
  const list = useFollowUpList(params);
  const analytics = useFollowUpAnalytics();
  const lookups = useLeadLookups();
  const mutation = useDedicatedFollowUpAction();
  const [active, setActive] = useState<{ row: FollowUpRow; action: Action } | null>(null);
  const [outcome, setOutcome] = useState('CONNECTED');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextStage, setNextStage] = useState('');
  const [reason, setReason] = useState('');
  const timezone = list.data?.timezone ?? analytics.data?.timezone ?? 'Asia/Kolkata';
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }),
    [timezone],
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const clear = () => setParams({ quick: 'due_today' });
  const open = (row: FollowUpRow, action: Action) => {
    setActive({ row, action });
    setDate(localInput(row.scheduledAt));
    setNotes(row.notes ?? '');
    setOutcome('CONNECTED');
    setNextDate('');
    setNextStage('');
    setReason('');
  };
  const submit = () => {
    if (!active) return;
    const action = active.action === 'reschedule' ? undefined : active.action;
    const body =
      active.action === 'complete'
        ? {
            outcome,
            notes: notes || undefined,
            nextFollowUp: nextDate ? { scheduledAt: new Date(nextDate) } : undefined,
            nextLeadStage: nextStage || undefined,
          }
        : active.action === 'cancel'
          ? { reason }
          : { scheduledAt: new Date(date), notes: notes || null };
    mutation.mutate(
      { id: active.row.id, ...(action ? { action } : {}), body },
      { onSuccess: () => setActive(null) },
    );
  };
  const metrics = analytics.data;
  const cards = [
    ['Due Today', metrics?.dueToday ?? 0, 'text-blue-700', Clock3],
    ['Overdue', metrics?.overdue ?? 0, 'text-red-700', CalendarClock],
    ['Upcoming', metrics?.upcoming ?? 0, 'text-violet-700', CalendarClock],
    ['Completed Today', metrics?.completedToday ?? 0, 'text-emerald-700', CheckCircle2],
    ['No Follow-Up Scheduled', metrics?.leadsWithNoUpcomingFollowUp ?? 0, 'text-amber-700', Clock3],
    [
      'Hot Leads Requiring Attention',
      metrics?.hotLeadsWithOverdueFollowUps ?? 0,
      'text-red-700',
      Flame,
    ],
  ] as const;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Daily workspace</p>
          <h1 className="text-2xl font-semibold text-slate-950">Follow-ups</h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: timezone }).format(
              new Date(),
            )}{' '}
            · {timezone}
          </p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
          Completion rate <strong>{metrics?.completionRate ?? 0}%</strong>
        </div>
      </header>

      <section aria-label="Follow-up summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value, tone, Icon]) => (
          <article key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <Icon className={`h-5 w-5 ${tone}`} />
            <p className="mt-3 text-2xl font-semibold">{analytics.isLoading ? '—' : value}</p>
            <p className="mt-1 text-xs text-slate-500">{label}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b p-2" aria-label="Quick filters">
          {quickTabs.map(([value, label]) => (
            <button
              key={value}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                (params.get('quick') ?? 'due_today') === value
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => update('quick', value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 border-b p-4 md:grid-cols-3 xl:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search follow-ups"
              className={`${fieldClass} pl-9`}
              placeholder="Lead, customer, phone, destination…"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Assigned salesperson"
            className={fieldClass}
            value={params.get('assignedToId') ?? ''}
            onChange={(event) => update('assignedToId', event.target.value)}
          >
            <option value="">All salespeople</option>
            {lookups.data?.assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            className={fieldClass}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {['PENDING', 'MISSED', 'COMPLETED', 'CANCELLED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Outcome"
            className={fieldClass}
            value={params.get('outcome') ?? ''}
            onChange={(event) => update('outcome', event.target.value)}
          >
            <option value="">All outcomes</option>
            {FOLLOW_UP_OUTCOMES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={clear}>
            <X className="h-4 w-4" />
            Clear filters
          </Button>
          <select
            aria-label="Lead stage"
            className={fieldClass}
            value={params.get('leadStage') ?? ''}
            onChange={(event) => update('leadStage', event.target.value)}
          >
            <option value="">All stages</option>
            {LEAD_STAGES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Lead type"
            className={fieldClass}
            value={params.get('leadType') ?? ''}
            onChange={(event) => update('leadType', event.target.value)}
          >
            <option value="">All lead types</option>
            {LEAD_TYPES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Priority"
            className={fieldClass}
            value={params.get('priority') ?? ''}
            onChange={(event) => update('priority', event.target.value)}
          >
            <option value="">All priorities</option>
            {QUERY_PRIORITIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <input
            aria-label="Destination"
            className={fieldClass}
            placeholder="Destination"
            value={params.get('destination') ?? ''}
            onChange={(event) => update('destination', event.target.value)}
          />
          <input
            aria-label="Scheduled from"
            className={fieldClass}
            type="date"
            value={params.get('scheduledFrom') ?? ''}
            onChange={(event) => update('scheduledFrom', event.target.value)}
          />
          <input
            aria-label="Scheduled to"
            className={fieldClass}
            type="date"
            value={params.get('scheduledTo') ?? ''}
            onChange={(event) => update('scheduledTo', event.target.value)}
          />
          <input
            aria-label="Completed from"
            className={fieldClass}
            type="date"
            value={params.get('completedFrom') ?? ''}
            onChange={(event) => update('completedFrom', event.target.value)}
          />
          <input
            aria-label="Completed to"
            className={fieldClass}
            type="date"
            value={params.get('completedTo') ?? ''}
            onChange={(event) => update('completedTo', event.target.value)}
          />
          <input
            aria-label="Created from"
            className={fieldClass}
            type="date"
            value={params.get('createdFrom') ?? ''}
            onChange={(event) => update('createdFrom', event.target.value)}
          />
          <input
            aria-label="Created to"
            className={fieldClass}
            type="date"
            value={params.get('createdTo') ?? ''}
            onChange={(event) => update('createdTo', event.target.value)}
          />
        </div>

        {list.isLoading ? (
          <div aria-label="Loading follow-ups" className="space-y-3 p-5">
            {[1, 2, 3, 4].map((value) => (
              <div key={value} className="h-14 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : list.isError ? (
          <div role="alert" className="p-12 text-center">
            <h2 className="font-semibold">Could not load follow-ups</h2>
            <p className="mt-1 text-sm text-slate-500">Refresh the page or try again shortly.</p>
          </div>
        ) : !list.data?.data.length ? (
          <div className="p-12 text-center">
            <CalendarClock className="mx-auto h-9 w-9 text-slate-300" />
            <h2 className="mt-3 font-semibold">No follow-ups found</h2>
            <p className="text-sm text-slate-500">Try another tab or clear your filters.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1280px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Scheduled Time',
                      'Lead',
                      'Customer',
                      'Phone',
                      'Destination',
                      'Stage / Type',
                      'Priority',
                      'Assigned To',
                      'Status',
                      'Outcome',
                      'Last Contacted',
                      'Actions',
                    ].map((label) => (
                      <th key={label} className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.data.map((row) => (
                    <tr
                      key={row.id}
                      className={row.effectiveStatus === 'MISSED' ? 'bg-red-50/60' : ''}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {formatter.format(new Date(row.scheduledAt))}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          className="font-medium text-brand-700"
                          to={`/queries/${row.query.id}`}
                        >
                          {row.query.queryNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{row.query.customerName}</td>
                      <td className="px-4 py-3">
                        <a
                          className="inline-flex items-center gap-1 text-brand-700"
                          href={`tel:${row.query.phone}`}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {row.query.phone}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {row.query.itinerary.map((item) => item.destination).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {labelForLookup(row.query.leadStage)}
                        <br />
                        <span className="text-xs text-slate-500">
                          {labelForLookup(row.query.leadType)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{labelForLookup(row.query.priority)}</td>
                      <td className="px-4 py-3">{row.assignedTo.fullName}</td>
                      <td className="px-4 py-3">
                        <FollowUpStatusBadge status={row.effectiveStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <FollowUpOutcomeBadge outcome={row.outcomeType} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {row.query.lastContactedAt
                          ? formatter.format(new Date(row.query.lastContactedAt))
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <Actions
                          row={row}
                          canUpdate={hasPermission('followups.update')}
                          onOpen={open}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 lg:hidden">
              {list.data.data.map((row) => (
                <article
                  key={row.id}
                  className={`rounded-xl border p-4 ${row.effectiveStatus === 'MISSED' ? 'border-red-200 bg-red-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        to={`/queries/${row.query.id}`}
                        className="font-semibold text-brand-700"
                      >
                        {row.query.customerName}
                      </Link>
                      <p className="text-xs text-slate-500">{row.query.queryNumber}</p>
                    </div>
                    <FollowUpStatusBadge status={row.effectiveStatus} />
                  </div>
                  <p className="mt-3 font-medium">{formatter.format(new Date(row.scheduledAt))}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {row.query.itinerary.map((item) => item.destination).join(', ') ||
                      'No destination'}{' '}
                    · {row.assignedTo.fullName}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <a href={`tel:${row.query.phone}`} className="text-sm text-brand-700">
                      Call {row.query.phone}
                    </a>
                    <Actions
                      row={row}
                      canUpdate={hasPermission('followups.update')}
                      onOpen={open}
                    />
                  </div>
                </article>
              ))}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span>{list.data.pagination.total} follow-ups</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={list.data.pagination.page <= 1}
                  onClick={() => update('page', String(list.data!.pagination.page - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={list.data.pagination.page >= list.data.pagination.totalPages}
                  onClick={() => update('page', String(list.data!.pagination.page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {active && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${active.action} follow-up`}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-semibold">{labelForLookup(active.action)} follow-up</h2>
                <p className="text-sm text-slate-500">
                  {active.row.query.customerName} · {active.row.query.queryNumber}
                </p>
              </div>
              <button aria-label="Close" onClick={() => setActive(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {active.action === 'complete' && (
                <>
                  <label className="block text-sm font-medium">
                    Outcome
                    <select
                      className={`${fieldClass} mt-1`}
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                    >
                      {FOLLOW_UP_OUTCOMES.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Completion notes
                    <textarea
                      className="mt-1 w-full rounded-lg border p-3 text-sm"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Next follow-up (optional)
                    <input
                      className={`${fieldClass} mt-1`}
                      type="datetime-local"
                      value={nextDate}
                      onChange={(event) => setNextDate(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Next lead stage (optional)
                    <select
                      className={`${fieldClass} mt-1`}
                      value={nextStage}
                      onChange={(event) => setNextStage(event.target.value)}
                    >
                      <option value="">Keep current stage</option>
                      {LEAD_STAGES.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {active.action === 'reschedule' && (
                <>
                  <label className="block text-sm font-medium">
                    New date and time
                    <input
                      className={`${fieldClass} mt-1`}
                      type="datetime-local"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Notes
                    <textarea
                      className="mt-1 w-full rounded-lg border p-3 text-sm"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                </>
              )}
              {active.action === 'cancel' && (
                <label className="block text-sm font-medium">
                  Cancellation reason
                  <textarea
                    autoFocus
                    className="mt-1 w-full rounded-lg border p-3 text-sm"
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setActive(null)}>
                Back
              </Button>
              <Button
                isLoading={mutation.isPending}
                disabled={
                  (active.action === 'cancel' && !reason.trim()) ||
                  (active.action === 'reschedule' && !date) ||
                  (active.action === 'complete' && outcome === 'OTHER' && !notes.trim())
                }
                onClick={submit}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Actions({
  row,
  canUpdate,
  onOpen,
}: {
  row: FollowUpRow;
  canUpdate: boolean;
  onOpen: (row: FollowUpRow, action: Action) => void;
}) {
  if (row.status !== 'PENDING' || !canUpdate)
    return (
      <Link className="text-brand-700" to={`/queries/${row.query.id}`}>
        Open lead
      </Link>
    );
  return (
    <div className="flex flex-wrap gap-2 whitespace-nowrap">
      <button className="font-medium text-emerald-700" onClick={() => onOpen(row, 'complete')}>
        Complete
      </button>
      <button className="font-medium text-brand-700" onClick={() => onOpen(row, 'reschedule')}>
        Reschedule
      </button>
      <button className="font-medium text-red-700" onClick={() => onOpen(row, 'cancel')}>
        Cancel
      </button>
      <Link className="text-slate-600" to={`/queries/${row.query.id}`}>
        Open lead
      </Link>
    </div>
  );
}
