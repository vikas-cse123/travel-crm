import { Archive, Bell, CheckCheck, Mail, MailOpen, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  useNotificationAction,
  useNotificationAnalytics,
  useNotifications,
} from '@/features/reminders/reminders.api';
import { EmptyState, fieldClass, PageHeader, Pill, SummaryCards } from './ReminderUi';

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const list = useNotifications(params);
  const analytics = useNotificationAnalytics();
  const action = useNotificationAction();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Personal inbox"
        title="Notifications"
        description="Reminder alerts, escalations and booking events addressed only to you."
        action={
          <Button variant="secondary" onClick={() => action.mutate({ action: 'read-all' })}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        }
      />
      <SummaryCards
        items={[
          { label: 'Total', value: analytics.data?.total ?? 0, tone: 'blue', icon: Bell },
          { label: 'Unread', value: analytics.data?.unread ?? 0, tone: 'amber', icon: Mail },
          {
            label: 'Reminder alerts',
            value: analytics.data?.reminderAlerts ?? 0,
            tone: 'red',
            icon: Bell,
          },
          {
            label: 'Escalations',
            value: analytics.data?.escalations ?? 0,
            tone: 'green',
            icon: CheckCheck,
          },
        ]}
      />
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search notifications"
              className={`${fieldClass} w-full pl-9`}
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
              placeholder="Search notifications…"
            />
          </label>
          <select
            className={fieldClass}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">Active notifications</option>
            <option>UNREAD</option>
            <option>READ</option>
            <option>ARCHIVED</option>
          </select>
        </div>
      </section>
      {list.isPending ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-slate-500">
          Loading notifications…
        </div>
      ) : !list.data?.data.length ? (
        <EmptyState
          title="You're all caught up"
          message="New reminder alerts and escalations will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {list.data.data.map((row) => (
            // Wraps on phones: the actions block takes the full row width, so
            // it drops to its own line under the icon + text instead of
            // squeezing them. From sm up it sits inline exactly as before.
            <article
              key={row.id}
              className={`flex flex-wrap gap-3 border-b p-4 last:border-b-0 sm:flex-nowrap sm:gap-4 ${row.status === 'UNREAD' ? 'bg-brand-50/50' : ''}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${row.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : row.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
              >
                <Bell className="h-5 w-5" />
              </div>
              {/* basis-64 keeps the text a readable width on the wrapped mobile
                  row; sm:basis-0 restores the original desktop flex sizing. */}
              <div className="min-w-0 flex-1 basis-64 sm:basis-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 break-words font-semibold text-slate-900">{row.title}</h2>
                  <Pill>{row.status}</Pill>
                  <span className="text-xs font-medium text-slate-500">
                    {row.category.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-slate-600">{row.message}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {new Date(row.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:items-start sm:gap-1">
                {row.actionUrl && (
                  <Link to={row.actionUrl}>
                    <Button size="sm" variant="secondary">
                      Open
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={row.status === 'UNREAD' ? 'Mark read' : 'Mark unread'}
                  onClick={() =>
                    action.mutate({
                      id: row.id,
                      action: row.status === 'UNREAD' ? 'read' : 'unread',
                    })
                  }
                >
                  {row.status === 'UNREAD' ? (
                    <MailOpen className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Archive"
                  onClick={() => action.mutate({ id: row.id, action: 'archive' })}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
