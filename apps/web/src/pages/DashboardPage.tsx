import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle,
  CreditCard,
  FileText,
  Flame,
  IndianRupee,
  LayoutDashboard,
  MapPin,
  Percent,
  PhoneCall,
  PieChart,
  Plane,
  RefreshCw,
  RotateCcw,
  Target,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
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

/** Strong reference-style KPI card with the value dominating the label. */
function KpiCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  className: string;
}) {
  return (
    <article className={`relative overflow-hidden rounded-lg p-4 shadow-card ${className}`}>
      <Icon
        className="absolute -right-2 -top-2 h-16 w-16 opacity-15"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="relative text-3xl font-bold leading-none">{value}</p>
      <p className="relative mt-2 text-xs font-medium tracking-wide opacity-90">{label}</p>
    </article>
  );
}

/** Coloured section header used across the charts and tables. */
function SectionHeader({
  icon: Icon,
  title,
  className,
}: {
  icon: LucideIcon;
  title: string;
  className: string;
}) {
  return (
    <header className={`flex items-center gap-2 px-4 py-2.5 ${className}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </header>
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
  children: (items: Record<string, unknown>[]) => ReactNode;
}) {
  if (!section) return null;
  return (
    <section className="rounded-xl border bg-card shadow-sm">
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

/**
 * Operations dashboard (Priority follow-ups, travel dates, trips, payments …).
 *
 * Temporarily hidden from the Dashboard UI while Analytics is the focus. This
 * implementation is intentionally retained in full — including its own data
 * hook and every panel — so it can be exposed again later simply by rendering
 * `<OperationsDashboard />` from the Dashboard page.
 */
export function OperationsDashboard({ params }: { params: DashboardParams }) {
  const operations = useDashboardOperations(params);

  return (
    <div className="space-y-5">
      {operations.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card" />
      ) : operations.isError ? (
        <div role="alert" className="rounded-xl border bg-card p-8 text-center text-red-700">
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
                      {String(item.queryNumber ?? '')} · {String(item.assignedTo ?? 'Unassigned')}
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
  );
}

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('THIS_YEAR');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<DashboardParams>({ period: 'THIS_YEAR' });

  const analytics = useDashboardAnalytics(applied);

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
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-card px-3 py-2 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Period</span>
          <select
            aria-label="Dashboard period"
            className="rounded-md border border-slate-300 bg-card px-2 py-1.5 text-sm"
            value={period}
            onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
          >
            {DASHBOARD_PERIODS.map((value) => (
              <option key={value} value={value}>
                {DASHBOARD_PERIOD_LABELS[value]}
              </option>
            ))}
          </select>
          {period === 'CUSTOM' && (
            <>
              <input
                aria-label="Custom from date"
                type="date"
                className="rounded-md border border-slate-300 bg-card px-2 py-1.5 text-sm"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
              <input
                aria-label="Custom to date"
                type="date"
                className="rounded-md border border-slate-300 bg-card px-2 py-1.5 text-sm"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </>
          )}
          <Button size="sm" onClick={apply}>
            Apply
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void analytics.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      {analytics.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card" />
      ) : analytics.isError ? (
        <div role="alert" className="rounded-xl border bg-card p-8 text-center text-red-700">
          The dashboard analytics could not be loaded.
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total Leads"
              value={data?.leads?.totalLeads ?? 0}
              icon={Users}
              className="bg-blue-600 text-white"
            />
            <KpiCard
              label="Converted Leads"
              value={data?.leads?.convertedLeads ?? 0}
              icon={CheckCircle}
              className="bg-emerald-600 text-white"
            />
            {showFinancials && (
              <KpiCard
                label="Agency Revenue"
                value={money(data?.financials?.totalCustomerAmount)}
                icon={IndianRupee}
                className="bg-teal-600 text-white"
              />
            )}
            {showFinancials && (
              <KpiCard
                label="Net Profit"
                value={money(data?.financials?.netProfit)}
                icon={TrendingUp}
                className="bg-amber-500 text-white"
              />
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {showFinancials && (
              <KpiCard
                label="Refunds"
                value={money(data?.financials?.totalRefunded)}
                icon={RotateCcw}
                className="bg-red-100 text-red-800"
              />
            )}
            <KpiCard
              label="Win Rate"
              value={`${data?.leads?.winRate ?? 0}%`}
              icon={Target}
              className="bg-slate-200 text-slate-800"
            />
            <KpiCard
              label="Hot Leads"
              value={data?.leads?.hotLeads ?? 0}
              icon={Flame}
              className="bg-orange-100 text-orange-800"
            />
            <KpiCard
              label="Conversion Rate"
              value={`${data?.leads?.conversionRate ?? 0}%`}
              icon={Percent}
              className="bg-cyan-100 text-cyan-800"
            />
          </section>

          {data?.quotations && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                label="Quotations"
                value={data.quotations.totalQuotations}
                icon={FileText}
                className="bg-blue-100 text-blue-800"
              />
              <KpiCard
                label="Total Quoted Value"
                value={money(data.quotations.totalQuotedValue)}
                icon={Banknote}
                className="bg-violet-100 text-violet-800"
              />
              <KpiCard
                label="Acceptance Rate"
                value={`${data.quotations.quotationAcceptanceRate}%`}
                icon={ThumbsUp}
                className="bg-emerald-100 text-emerald-800"
              />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {caps?.canViewLeads && (
              <section className="overflow-hidden rounded-lg border bg-card shadow-card">
                <SectionHeader
                  icon={PieChart}
                  title="Lead Sources"
                  className="bg-blue-600 text-white"
                />
                <div className="flex flex-col items-center gap-5 p-4 sm:flex-row sm:justify-center sm:gap-8">
                  <DonutChart
                    size={180}
                    data={(data?.leadSources ?? []).map((row) => ({
                      label: row.label,
                      value: row.count,
                    }))}
                  />
                  <div className="w-full min-w-0 flex-1 sm:max-w-[220px]">
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
              <section className="overflow-hidden rounded-lg border bg-card shadow-card">
                <SectionHeader
                  icon={MapPin}
                  title="Top Destination Enquiries"
                  className="bg-teal-600 text-white"
                />
                <div className="p-4">
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

          <div className="grid gap-4 lg:grid-cols-2">
            {caps?.canViewLeads && (
              <section className="overflow-hidden rounded-lg border bg-card shadow-card">
                <SectionHeader
                  icon={TrendingUp}
                  title="Top Performers — Conversion Rate"
                  className="bg-emerald-600 text-white"
                />
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
                    <tbody className="divide-y divide-slate-100">
                      {(data?.staffConversions ?? []).map((row) => (
                        <tr key={row.userId} className="hover:bg-slate-50">
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
              <section className="overflow-hidden rounded-lg border bg-card shadow-card">
                <SectionHeader
                  icon={Wallet}
                  title="Top Performers — Profit Earned"
                  className="bg-amber-400 text-white"
                />
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
                    <tbody className="divide-y divide-slate-100">
                      {(data?.staffFinancials ?? []).map((row) => (
                        <tr key={row.userId} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-400">{row.rank}</td>
                          <td className="px-4 py-2 font-medium">{row.displayName}</td>
                          <td className="px-4 py-2">{row.bookingCount}</td>
                          <td className="px-4 py-2">{money(row.revenue)}</td>
                          <td className="px-4 py-2 font-semibold text-emerald-700">
                            {money(row.netProfit)}
                          </td>
                          <td className="px-4 py-2">{Number(row.marginPercentage).toFixed(1)}%</td>
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
  );
}
