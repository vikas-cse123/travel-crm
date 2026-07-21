import { Check, ExternalLink, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  useReminderAction,
  useReminderAnalytics,
  useReminders,
} from '@/features/reminders/reminders.api';
import { EmptyState, fieldClass, PageHeader, Pill, SummaryCards } from './ReminderUi';

export function BookingRemindersPage() {
  const [params, setParams] = useSearchParams();
  const list = useReminders(params, true);
  const analytics = useReminderAnalytics(true);
  const action = useReminderAction(true);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Booking operations"
        title="Booking Reminders"
        description="Travel, payment, document and supplier follow-ups generated from live bookings."
      />
      <SummaryCards
        items={[
          { label: 'Total reminders', value: analytics.data?.total ?? 0, tone: 'blue' },
          { label: 'Pending', value: analytics.data?.pending ?? 0, tone: 'amber' },
          { label: 'Sent', value: analytics.data?.sent ?? 0, tone: 'red' },
          { label: 'Completed', value: analytics.data?.completed ?? 0, tone: 'green' },
        ]}
      />
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="relative sm:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search booking reminders"
              className={`${fieldClass} w-full pl-9`}
              placeholder="Search booking or customer…"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            className={fieldClass}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>OVERDUE</option>
            <option>SNOOZED</option>
            <option>COMPLETED</option>
            <option>CANCELLED</option>
          </select>
        </div>
      </section>
      {list.isPending ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
          Loading booking reminders…
        </div>
      ) : !list.data?.data.length ? (
        <EmptyState
          title="No booking reminders"
          message="Booking automation will add travel, payment and operational reminders here."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.data.data.map((row) => {
            const booking = row.linkedEntity;
            const travelDate = row.reminderType === 'BOOKING_TRAVEL' ? new Date(row.dueAt) : null;
            return (
              <article key={row.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Pill>{row.status}</Pill>
                      <Pill kind="priority">{row.priority}</Pill>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-slate-900">{row.title}</h2>
                    {booking && (
                      <p className="mt-1 text-sm font-medium text-brand-700">{booking.label}</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
                    <p className="text-xs text-slate-500">Due</p>
                    <p className="text-sm font-semibold">
                      {new Date(row.dueAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Reminder type</dt>
                    <dd className="font-medium">{row.reminderType.replaceAll('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Assignee</dt>
                    <dd className="font-medium">{row.assignedTo.fullName}</dd>
                  </div>
                  {travelDate && (
                    <div>
                      <dt className="text-xs text-slate-500">Travel countdown</dt>
                      <dd className="font-medium">
                        {Math.max(0, Math.ceil((travelDate.getTime() - Date.now()) / 86_400_000))}{' '}
                        days
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-500">Source</dt>
                    <dd className="font-medium">{row.source.replaceAll('_', ' ')}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  {!['COMPLETED', 'CANCELLED'].includes(row.status) && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          action.mutate({
                            id: row.id,
                            action: 'complete',
                            body: { outcome: 'Booking reminder completed' },
                          })
                        }
                      >
                        <Check className="h-4 w-4" />
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          confirm('Cancel this booking reminder?') &&
                          action.mutate({
                            id: row.id,
                            action: 'cancel',
                            body: { reason: 'Cancelled from booking reminders' },
                          })
                        }
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </>
                  )}
                  {booking && (
                    <Link to={booking.href}>
                      <Button size="sm" variant="secondary">
                        <ExternalLink className="h-4 w-4" />
                        View booking
                      </Button>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
