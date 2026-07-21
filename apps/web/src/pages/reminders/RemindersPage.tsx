import { Check, Clock3, Plus, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PERMISSIONS,
  REMINDER_PRIORITIES,
  REMINDER_STATUSES,
  REMINDER_TYPES,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useReminderAction,
  useReminderAnalytics,
  useReminders,
} from '@/features/reminders/reminders.api';
import { EmptyState, fieldClass, PageHeader, Pill, SummaryCards } from './ReminderUi';

export function RemindersPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const list = useReminders(params);
  const analytics = useReminderAnalytics();
  const action = useReminderAction();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const act = (id: string, name: 'complete' | 'snooze' | 'cancel') => {
    if (name === 'complete')
      action.mutate({ id, action: name, body: { outcome: 'Completed from reminders list' } });
    if (name === 'cancel' && confirm('Cancel this reminder?'))
      action.mutate({ id, action: name, body: { reason: 'Cancelled from reminders list' } });
    if (name === 'snooze') {
      const until = new Date(Date.now() + 24 * 60 * 60_000);
      action.mutate({
        id,
        action: name,
        body: { until: until.toISOString(), reason: 'Snoozed for one day' },
      });
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Personal productivity"
        title="My Reminders"
        description="Plan follow-ups across leads, customers, quotations, bookings and suppliers."
        action={
          hasPermission(PERMISSIONS.REMINDERS_CREATE) ? (
            <Link to="/reminders/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Reminder
              </Button>
            </Link>
          ) : undefined
        }
      />
      <SummaryCards
        items={[
          { label: 'Total reminders', value: analytics.data?.total ?? 0, tone: 'blue' },
          { label: 'Active', value: analytics.data?.active ?? 0, tone: 'amber' },
          { label: 'Overdue', value: analytics.data?.overdue ?? 0, tone: 'red' },
          { label: 'Completed', value: analytics.data?.completed ?? 0, tone: 'green' },
        ]}
      />
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search reminders"
              className={`${fieldClass} w-full pl-9`}
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
              placeholder="Search title, customer or booking…"
            />
          </label>
          <select
            aria-label="Filter status"
            className={fieldClass}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {REMINDER_STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Filter priority"
            className={fieldClass}
            value={params.get('priority') ?? ''}
            onChange={(event) => update('priority', event.target.value)}
          >
            <option value="">All priorities</option>
            {REMINDER_PRIORITIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Filter type"
            className={fieldClass}
            value={params.get('reminderType') ?? ''}
            onChange={(event) => update('reminderType', event.target.value)}
          >
            <option value="">All types</option>
            {REMINDER_TYPES.map((value) => (
              <option key={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
      </section>
      {list.isPending ? (
        <div
          aria-label="Loading reminders"
          className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500"
        >
          Loading reminders…
        </div>
      ) : list.isError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          Could not load reminders.
        </div>
      ) : !list.data?.data.length ? (
        <EmptyState
          title="No reminders found"
          message="Create a reminder or adjust the filters to see work due here."
          {...(hasPermission(PERMISSIONS.REMINDERS_CREATE)
            ? { action: { to: '/reminders/new', label: 'Create first reminder' } }
            : {})}
        />
      ) : (
        <div className="space-y-3">
          {list.data.data.map((row) => (
            <article key={row.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/reminders/${row.id}`}
                      className="font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {row.title}
                    </Link>
                    <Pill>{row.status}</Pill>
                    <Pill kind="priority">{row.priority}</Pill>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {row.description || row.reminderType.replaceAll('_', ' ')}
                  </p>
                  {row.linkedEntity && (
                    <Link
                      to={row.linkedEntity.href}
                      className="mt-2 inline-block text-sm font-medium text-brand-700"
                    >
                      {row.linkedEntity.type}: {row.linkedEntity.label}
                    </Link>
                  )}
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${row.status === 'OVERDUE' ? 'text-red-600' : 'text-slate-800'}`}
                  >
                    {new Date(row.dueAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned to {row.assignedTo.fullName}
                  </p>
                </div>
              </div>
              {!['COMPLETED', 'CANCELLED'].includes(row.status) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  {hasPermission(PERMISSIONS.REMINDERS_COMPLETE) && (
                    <Button size="sm" variant="secondary" onClick={() => act(row.id, 'complete')}>
                      <Check className="h-4 w-4" />
                      Complete
                    </Button>
                  )}
                  {hasPermission(PERMISSIONS.REMINDERS_SNOOZE) && (
                    <Button size="sm" variant="ghost" onClick={() => act(row.id, 'snooze')}>
                      <Clock3 className="h-4 w-4" />
                      Snooze 1 day
                    </Button>
                  )}
                  {hasPermission(PERMISSIONS.REMINDERS_UPDATE) && (
                    <Button size="sm" variant="ghost" onClick={() => act(row.id, 'cancel')}>
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {list.data && list.data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span>{list.data.pagination.total} reminders</span>
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
      )}
    </div>
  );
}
