import { useMemo, useState } from 'react';
import { CalendarRange, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import { formatDateTime12Hour } from '@/utils/dateTime';
import {
  useSearchApiUsageSummary,
  useSearchApiUsageUserDetail,
} from '@/features/search/search.api';

const tile = 'rounded-xl border bg-card p-4 shadow-sm';
const cell = 'whitespace-nowrap px-3 py-2 text-sm text-slate-700';
const head = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';

type RangeKey = 'today' | '7d' | '30d' | 'month' | 'custom';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  custom: 'Custom range',
};

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function rangeFor(
  key: RangeKey,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  const today = new Date();
  if (key === 'today') return { from: toIsoDate(today), to: toIsoDate(today) };
  if (key === '7d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: toIsoDate(from), to: toIsoDate(today) };
  }
  if (key === '30d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: toIsoDate(from), to: toIsoDate(today) };
  }
  if (key === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toIsoDate(from), to: toIsoDate(today) };
  }
  // custom
  if (customFrom && customTo) return { from: customFrom, to: customTo };
  if (customFrom) return { from: customFrom, to: toIsoDate(today) };
  return { to: toIsoDate(today) };
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'brand' | 'emerald' | 'amber' | 'red';
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-700'
          : 'text-slate-900';
  return (
    <article className={tile}>
      <p className={`text-2xl font-semibold ${color}`}>
        {new Intl.NumberFormat('en-IN').format(value)}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </article>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="border-b px-4 py-3 text-sm font-semibold text-slate-800">{title}</header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'Success',
  QUOTA_EXHAUSTED: 'Quota exhausted',
  INVALID_KEY: 'Invalid key',
  PROVIDER_ERROR: 'Provider error',
  NETWORK_ERROR: 'Network error',
};

const STATUS_TONES: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  QUOTA_EXHAUSTED: 'bg-amber-50 text-amber-700',
  INVALID_KEY: 'bg-red-50 text-red-700',
  PROVIDER_ERROR: 'bg-red-50 text-red-700',
  NETWORK_ERROR: 'bg-slate-100 text-slate-600',
};

export function SearchUsagePage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const range = useMemo(
    () => rangeFor(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const summary = useSearchApiUsageSummary(range);
  const userDetail = useSearchApiUsageUserDetail(selectedUserId, range);

  const activeRangeLabel =
    rangeKey === 'custom'
      ? range.from && range.to
        ? `${range.from} → ${range.to}`
        : (range.from ?? `→ ${range.to}`)
      : RANGE_LABELS[rangeKey];

  if (summary.isError) {
    return (
      <div role="alert" className="rounded-xl bg-card p-12 text-center text-red-700">
        SearchAPI usage could not be loaded.
      </div>
    );
  }

  const data = summary.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Search Usage</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor SearchAPI credit consumption across your team.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['today', '7d', '30d', 'month', 'custom'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRangeKey(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                rangeKey === key
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-card text-slate-600 hover:bg-slate-50'
              }`}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
          {rangeKey === 'custom' && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-2 py-1">
              <input
                aria-label="Custom range from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs text-slate-700"
              />
              <span className="text-slate-400">→</span>
              <input
                aria-label="Custom range to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs text-slate-700"
              />
            </div>
          )}
          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
            {activeRangeLabel}
          </span>
        </div>
      </div>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Total requests" value={data.totals.total} />
            <Kpi label="Flights" value={data.totals.flights} />
            <Kpi label="Hotels" value={data.totals.hotels} />
            <Kpi label="Successful" value={data.totals.successful} tone="emerald" />
            <Kpi label="Failed / exhausted" value={data.totals.failed} tone="amber" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <Card title="Usage by team member">
                {data.byUser.length === 0 ? (
                  <p className="text-sm text-slate-500">No usage in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className={head}>User</th>
                          <th className={head}>Flights</th>
                          <th className={head}>Hotels</th>
                          <th className={head}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.byUser.map((user) => (
                          <tr
                            key={user.userId}
                            className="cursor-pointer transition-colors hover:bg-slate-50"
                            onClick={() =>
                              setSelectedUserId((current) =>
                                current === user.userId ? null : user.userId,
                              )
                            }
                          >
                            <td className={cell}>
                              <div className="font-medium text-slate-900">{user.name}</div>
                              <div className="text-xs text-slate-400">{user.email}</div>
                            </td>
                            <td className={cell}>{user.flights}</td>
                            <td className={cell}>{user.hotels}</td>
                            <td className={`${cell} font-semibold text-slate-900`}>{user.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-xs text-slate-400">
                      Click a row to see that user&apos;s recent requests.
                    </p>
                  </div>
                )}
              </Card>

              {selectedUserId && userDetail.data && (
                <Card title={`${userDetail.data.name} — usage detail`}>
                  <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Kpi label="Flights" value={userDetail.data.totals.flights} />
                    <Kpi label="Hotels" value={userDetail.data.totals.hotels} />
                    <Kpi label="Total provider requests" value={userDetail.data.totals.total} />
                  </div>
                  <p className="mb-2 text-xs text-slate-500">
                    {userDetail.data.email} · {userDetail.data.totals.successful} successful,{' '}
                    {userDetail.data.totals.failed} failed
                  </p>
                  {userDetail.data.recent.length === 0 ? (
                    <p className="text-sm text-slate-500">No provider requests in this period.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className={head}>When</th>
                            <th className={head}>Type</th>
                            <th className={head}>Outcome</th>
                            <th className={head}>Key</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {userDetail.data.recent.map((row) => (
                            <tr key={row.id}>
                              <td className={cell}>{formatDateTime12Hour(row.createdAt)}</td>
                              <td className={cell}>{row.type}</td>
                              <td className={cell}>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    STATUS_TONES[row.status] ?? 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {STATUS_LABELS[row.status] ?? row.status}
                                  {row.isFallbackAttempt ? ' (fallback)' : ''}
                                </span>
                              </td>
                              <td className={`${cell} font-mono text-xs`}>
                                {row.maskedKeySuffix ? `****${row.maskedKeySuffix}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {userDetail.data.hasMore ? (
                        <p className="mt-2 text-xs text-slate-400">
                          Showing the most recent 20 requests.
                        </p>
                      ) : null}
                    </div>
                  )}
                </Card>
              )}

              <Card title="Usage over time">
                {data.daily.length === 0 ? (
                  <p className="text-sm text-slate-500">No usage in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className={head}>Date</th>
                          <th className={head}>Flights</th>
                          <th className={head}>Hotels</th>
                          <th className={head}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.daily.map((day) => (
                          <tr key={day.date}>
                            <td className={cell}>
                              {new Intl.DateTimeFormat('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              }).format(new Date(`${day.date}T00:00:00Z`))}
                            </td>
                            <td className={cell}>{day.flights}</td>
                            <td className={cell}>{day.hotels}</td>
                            <td className={`${cell} font-semibold text-slate-900`}>{day.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card title="Requests by service">
                <HorizontalBarChart
                  data={data.byService.filter((row) => !/autocomplete/i.test(row.label))}
                />
              </Card>
              <Card title="Usage by key">
                {data.byKey.length === 0 ? (
                  <p className="text-sm text-slate-500">No usage in this period.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.byKey.map((key) => (
                      <li
                        key={key.maskedKey}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                      >
                        <span className="font-mono text-sm text-slate-800">{key.maskedKey}</span>
                        <div className="text-right">
                          <span className="block text-sm font-semibold text-slate-900">
                            {new Intl.NumberFormat('en-IN').format(key.requests)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              STATUS_TONES[key.status] ?? 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {key.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          {data.byUser.length === 0 && data.daily.length === 0 && data.totals.total === 0 ? (
            <EmptyState
              icon={Search}
              title="No SearchAPI usage recorded"
              description="Provider requests are tracked automatically as your team uses Live Search."
            />
          ) : null}
        </>
      )}
    </div>
  );
}
