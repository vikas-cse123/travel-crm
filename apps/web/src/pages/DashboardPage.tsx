import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CreditCard,
  PhoneCall,
  Plane,
  RefreshCw,
  Truck,
} from 'lucide-react';
import {
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  labelForLookup,
  type DashboardPeriod,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { DonutChart } from '@/components/charts/DonutChart';
import { ChartLegend } from '@/components/charts/ChartLegend';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import { MetricBar } from '@/components/charts/MetricBar';
import {
  useDashboardAnalytics,
  useDashboardOperations,
  type DashboardParams,
  type OperationsSection,
} from '@/features/dashboard/dashboard.api';

const money = (value: string | undefined) =>
  value === undefined
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));

const tile = 'rounded-xl border bg-white p-4 shadow-sm';

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <article className={tile}>
      <p className={`text-2xl font-semibold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </article>
  );
}

function Panel({
  title,
  icon: Icon,
  section,
  children,
}: {
  title: string;
  icon: typeof Plane;
  section: OperationsSection<Record<string, unknown>> | undefined;
  children: (items: Record<string, unknown>[]) => React.ReactNode;
}) {
  if (!section) return null;
  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-brand-600" />
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {section.totalCount}
          </span>
        </span>
        <Link
          to={section.viewAllPath}
          className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="divide-y">
        {section.items.length ? (
          children(section.items)
        ) : (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing pending.</p>
        )}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const [tab, setTab] = useState<'analytics' | 'operations'>('analytics');
  const [period, setPeriod] = useState<DashboardPeriod>('THIS_YEAR');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<DashboardParams>({ period: 'THIS_YEAR' });

  const analytics = useDashboardAnalytics(applied);
  const operations = useDashboardOperations(applied);

  const apply = () =>
    setApplied({
      period,
      ...(period === 'CUSTOM' && from ? { from } : {}),
      ...(period === 'CUSTOM' && to ? { to } : {}),
    });

  const data = analytics.data;
  const caps = data?.capabilities;
  const showFinancials = Boolean(caps?.canViewFinancials);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Overview</p>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Analytics and daily operations across leads, quotations and bookings.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-slate-500">
            Period
            <select
              aria-label="Dashboard period"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={period}
              onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            >
              {DASHBOARD_PERIODS.map((value) => (
                <option key={value} value={value}>
                  {DASHBOARD_PERIOD_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          {period === 'CUSTOM' && (
            <>
              <label className="flex flex-col text-xs text-slate-500">
                From
                <input
                  aria-label="Custom from date"
                  type="date"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className="flex flex-col text-xs text-slate-500">
                To
                <input
                  aria-label="Custom to date"
                  type="date"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          )}
          <Button onClick={apply}>Apply</Button>
          <Button
            variant="secondary"
            onClick={() => {
              void analytics.refetch();
              void operations.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <nav className="flex gap-1 rounded-xl border bg-white p-1" aria-label="Dashboard sections">
        {(['analytics', 'operations'] as const).map((name) => (
          <button
            key={name}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
              tab === name ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      {tab === 'analytics' && (
        <div className="space-y-5">
          {analytics.isLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-white" />
          ) : analytics.isError ? (
            <div role="alert" className="rounded-xl border bg-white p-8 text-center text-red-700">
              The dashboard analytics could not be loaded.
            </div>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Total leads" value={data?.leads?.totalLeads ?? 0} />
                <Kpi label="Converted leads" value={data?.leads?.convertedLeads ?? 0} />
                {showFinancials && (
                  <Kpi
                    label="Agency revenue"
                    value={money(data?.financials?.totalCustomerAmount)}
                  />
                )}
                {showFinancials && (
                  <Kpi
                    label="Net profit"
                    value={money(data?.financials?.netProfit)}
                    accent="text-emerald-700"
                  />
                )}
              </section>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {showFinancials && (
                  <Kpi label="Refunds" value={money(data?.financials?.totalRefunded)} />
                )}
                <Kpi label="Win rate" value={`${data?.leads?.winRate ?? 0}%`} />
                <Kpi label="Hot leads" value={data?.leads?.hotLeads ?? 0} />
                <Kpi label="Conversion rate" value={`${data?.leads?.conversionRate ?? 0}%`} />
              </section>

              {data?.quotations && (
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Kpi label="Quotations" value={data.quotations.totalQuotations} />
                  <Kpi label="Total quoted value" value={money(data.quotations.totalQuotedValue)} />
                  <Kpi
                    label="Acceptance rate"
                    value={`${data.quotations.quotationAcceptanceRate}%`}
                  />
                </section>
              )}

              <div className="grid gap-5 lg:grid-cols-2">
                {caps?.canViewLeads && (
                  <section className="rounded-xl border bg-white p-5 shadow-sm">
                    <h2 className="font-semibold">Lead sources</h2>
                    <div className="mt-4 flex items-center gap-6">
                      <DonutChart
                        data={(data?.leadSources ?? []).map((row) => ({
                          label: row.label,
                          value: row.count,
                        }))}
                      />
                      <div className="min-w-0 flex-1">
                        <ChartLegend
                          items={(data?.leadSources ?? []).map((row) => ({
                            label: row.label,
                            value: row.count,
                            hint: `${row.percentage}%`,
                          }))}
                        />
                      </div>
                    </div>
                  </section>
                )}
                {caps?.canViewLeads && (
                  <section className="rounded-xl border bg-white p-5 shadow-sm">
                    <h2 className="font-semibold">Top destination enquiries</h2>
                    <div className="mt-4">
                      <HorizontalBarChart
                        data={(data?.topDestinations ?? []).map((row) => ({
                          label: row.destination,
                          value: row.enquiryCount,
                        }))}
                      />
                    </div>
                  </section>
                )}
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {caps?.canViewLeads && (
                  <section className="rounded-xl border bg-white shadow-sm">
                    <h2 className="border-b px-4 py-3 font-semibold">
                      Top performers — conversion rate
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-4 py-2">#</th>
                            <th className="px-4 py-2">Staff</th>
                            <th className="px-4 py-2">Leads</th>
                            <th className="px-4 py-2">Converted</th>
                            <th className="px-4 py-2">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(data?.staffConversions ?? []).map((row) => (
                            <tr key={row.userId}>
                              <td className="px-4 py-2 text-slate-400">{row.rank}</td>
                              <td className="px-4 py-2 font-medium">{row.displayName}</td>
                              <td className="px-4 py-2">{row.totalLeads}</td>
                              <td className="px-4 py-2">{row.convertedLeads}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-10">{row.conversionRate}%</span>
                                  <div className="w-20">
                                    <MetricBar value={row.conversionRate} tone="emerald" />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!(data?.staffConversions ?? []).length && (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                                No staff activity in this period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {showFinancials && (
                  <section className="rounded-xl border bg-white shadow-sm">
                    <h2 className="border-b px-4 py-3 font-semibold">
                      Top performers — profit earned
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-4 py-2">#</th>
                            <th className="px-4 py-2">Staff</th>
                            <th className="px-4 py-2">Bookings</th>
                            <th className="px-4 py-2">Revenue</th>
                            <th className="px-4 py-2">Net profit</th>
                            <th className="px-4 py-2">Margin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(data?.staffFinancials ?? []).map((row) => (
                            <tr key={row.userId}>
                              <td className="px-4 py-2 text-slate-400">{row.rank}</td>
                              <td className="px-4 py-2 font-medium">{row.displayName}</td>
                              <td className="px-4 py-2">{row.bookingCount}</td>
                              <td className="px-4 py-2">{money(row.revenue)}</td>
                              <td className="px-4 py-2 font-semibold text-emerald-700">
                                {money(row.netProfit)}
                              </td>
                              <td className="px-4 py-2">
                                {Number(row.marginPercentage).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                          {!(data?.staffFinancials ?? []).length && (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                                No booking revenue in this period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'operations' && (
        <div className="space-y-5">
          {operations.isLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-white" />
          ) : operations.isError ? (
            <div role="alert" className="rounded-xl border bg-white p-8 text-center text-red-700">
              The operations lists could not be loaded.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title="Priority follow-ups"
                icon={PhoneCall}
                section={operations.data?.priorityFollowUps}
              >
                {(items) =>
                  items.map((item) => (
                    <Link
                      key={String(item.followUpId)}
                      to={`/queries/${String(item.queryId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {String(item.customerName ?? item.queryNumber ?? 'Lead')}
                          {item.leadType === 'HOT' && (
                            <span className="rounded bg-red-50 px-1.5 text-[10px] font-medium text-red-700">
                              HOT
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">
                          {String(item.queryNumber ?? '')} ·{' '}
                          {String(item.assignedTo ?? 'Unassigned')}
                        </span>
                      </span>
                      {item.overdue ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3" /> Overdue
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Due</span>
                      )}
                    </Link>
                  ))
                }
              </Panel>

              <Panel
                title="Near travel dates"
                icon={CalendarClock}
                section={operations.data?.nearTravelDates}
              >
                {(items) =>
                  items.map((item) => (
                    <Link
                      key={String(item.queryId)}
                      to={`/queries/${String(item.queryId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {String(item.customerName ?? item.queryNumber)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {String(item.destinationSummary ?? '')}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-brand-700">
                        {String(item.daysUntilTravel ?? '—')}d
                      </span>
                    </Link>
                  ))
                }
              </Panel>

              <Panel title="Upcoming trips" icon={Plane} section={operations.data?.upcomingTrips}>
                {(items) =>
                  items.map((item) => (
                    <Link
                      key={String(item.bookingId)}
                      to={`/bookings/${String(item.bookingId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {String(item.bookingNumber)} · {String(item.customerName)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {String(item.destinationSummary ?? '')}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-brand-700">
                        {String(item.daysUntilTravel ?? '—')}d
                      </span>
                    </Link>
                  ))
                }
              </Panel>

              <Panel
                title="Pending completion"
                icon={AlertTriangle}
                section={operations.data?.pendingCompletion}
              >
                {(items) =>
                  items.map((item) => (
                    <Link
                      key={String(item.bookingId)}
                      to={`/bookings/${String(item.bookingId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {String(item.bookingNumber)} · {String(item.customerName)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {labelForLookup(String(item.operationalStatus ?? ''))}
                        </span>
                      </span>
                      {Number(item.daysOverdue ?? 0) > 0 && (
                        <span className="shrink-0 text-xs font-medium text-amber-700">
                          {String(item.daysOverdue)}d overdue
                        </span>
                      )}
                    </Link>
                  ))
                }
              </Panel>

              <Panel
                title="Client payments due"
                icon={CreditCard}
                section={operations.data?.clientPaymentsDue}
              >
                {(items) =>
                  items.map((item) => (
                    <Link
                      key={String(item.scheduleId)}
                      to={`/bookings/${String(item.bookingId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {String(item.bookingNumber)} · {String(item.customerName)}
                        </span>
                        <span className="text-xs text-slate-500">{String(item.label ?? '')}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold">
                          {money(String(item.amount))}
                        </span>
                        {item.overdue ? (
                          <span className="text-xs font-medium text-red-600">Overdue</span>
                        ) : null}
                      </span>
                    </Link>
                  ))
                }
              </Panel>

              <Panel
                title="Vendor payments due"
                icon={Truck}
                section={operations.data?.vendorPaymentsDue}
              >
                {(items) =>
                  items.map((item) => (
                    <Link
                      key={String(item.payableId)}
                      to={`/vendors/${String(item.vendorId)}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {String(item.vendorName)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {String(item.bookingNumber)} · {String(item.payableNumber)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">
                        {money(String(item.outstandingAmount))}
                      </span>
                    </Link>
                  ))
                }
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
