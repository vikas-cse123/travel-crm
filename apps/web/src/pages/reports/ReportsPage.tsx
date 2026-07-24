import { useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import {
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  type DashboardPeriod,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import {
  useBookingReport,
  useClientPaymentReport,
  useDestinationReport,
  useLeadReport,
  useLeadSourceReport,
  useQuotationReport,
  useReportExport,
  useReportSummary,
  useStaffConversionReport,
  useStaffFinancialReport,
  useVendorPayableReport,
  type ListParams,
  type ReportCapabilities,
  type ReportParams,
} from '@/features/reports/reports.api';

const money = (value: string | undefined | null) =>
  value === undefined || value === null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));

const tile = 'rounded-xl border bg-white p-4 shadow-sm';
const cell = 'whitespace-nowrap px-3 py-2 text-sm text-slate-700';
const head = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';

type TabKey =
  | 'overview'
  | 'leads'
  | 'quotations'
  | 'bookings'
  | 'client-payments'
  | 'vendor-payables'
  | 'staff'
  | 'sources';

const TAB_LABELS: Record<TabKey, string> = {
  overview: 'Overview',
  leads: 'Leads',
  quotations: 'Quotations',
  bookings: 'Bookings',
  'client-payments': 'Client Payments',
  'vendor-payables': 'Vendor Payables',
  staff: 'Staff Performance',
  sources: 'Sources & Destinations',
};

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <article className={tile}>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </article>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <header className="border-b px-4 py-3 text-sm font-semibold text-slate-800">{title}</header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function States({
  isLoading,
  isError,
  isEmpty,
  label,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  label: string;
}) {
  if (isLoading)
    return <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />;
  if (isError)
    return (
      <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
        The {label} report could not be loaded.
      </p>
    );
  if (isEmpty)
    return <p className="py-6 text-center text-sm text-slate-400">No data for this period.</p>;
  return null;
}

/** Server-side pagination controls shared by every row table. */
function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
      <p className="text-xs text-slate-500">{total} results</p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-xs text-slate-500">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function ExportButton({
  path,
  params,
  label,
}: {
  path: string;
  params: Record<string, unknown>;
  label: string;
}) {
  const exporter = useReportExport(path);
  return (
    <Button
      variant="secondary"
      onClick={() => exporter.mutate(params)}
      disabled={exporter.isPending}
    >
      <Download className="mr-1 h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [period, setPeriod] = useState<DashboardPeriod>('THIS_YEAR');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<ReportParams>({ period: 'THIS_YEAR' });
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const summary = useReportSummary(applied);
  const caps: ReportCapabilities | undefined = summary.data?.capabilities;
  const listParams: ListParams = { ...applied, page, pageSize: 10, sortDir };

  const apply = () => {
    setPage(1);
    setApplied({
      period,
      ...(period === 'CUSTOM' && from ? { from } : {}),
      ...(period === 'CUSTOM' && to ? { to } : {}),
    });
  };

  // Only fetch a tab's data when it is both authorised and selected.
  const leads = useLeadReport(applied, tab === 'leads' && Boolean(caps?.canViewLeads));
  const quotations = useQuotationReport(
    listParams,
    tab === 'quotations' && Boolean(caps?.canViewQuotations),
  );
  const bookings = useBookingReport(
    listParams,
    tab === 'bookings' && Boolean(caps?.canViewBookings),
  );
  const payments = useClientPaymentReport(
    { ...listParams, sortDir: 'asc' },
    tab === 'client-payments' && Boolean(caps?.canViewClientPayments),
  );
  const payables = useVendorPayableReport(
    { ...listParams, sortDir: 'asc' },
    tab === 'vendor-payables' && Boolean(caps?.canViewVendorPayables),
  );
  const onStaffOrOverview = tab === 'staff' || tab === 'overview';
  const onSourcesOrOverview = tab === 'sources' || tab === 'overview';
  const staffConversions = useStaffConversionReport(
    { ...applied, limit: 10 },
    onStaffOrOverview && Boolean(caps?.canViewLeads),
  );
  const staffFinancials = useStaffFinancialReport(
    { ...applied, limit: 10 },
    onStaffOrOverview && Boolean(caps?.canViewFinancials),
  );
  const sources = useLeadSourceReport(applied, onSourcesOrOverview && Boolean(caps?.canViewLeads));
  const destinations = useDestinationReport(
    applied,
    onSourcesOrOverview && Boolean(caps?.canViewLeads),
  );

  // A tab that the caller may not see is never rendered — not even disabled.
  const visibleTabs: TabKey[] = (
    [
      'overview',
      'leads',
      'quotations',
      'bookings',
      'client-payments',
      'vendor-payables',
      'staff',
      'sources',
    ] as TabKey[]
  ).filter((key) => {
    if (!caps) return key === 'overview';
    if (key === 'leads' || key === 'sources') return caps.canViewLeads;
    if (key === 'quotations') return caps.canViewQuotations;
    if (key === 'bookings') return caps.canViewBookings;
    if (key === 'client-payments') return caps.canViewClientPayments;
    if (key === 'vendor-payables') return caps.canViewVendorPayables;
    if (key === 'staff') return caps.canViewLeads || caps.canViewFinancials;
    return true;
  });

  const data = summary.data;
  const periodLabel = DASHBOARD_PERIOD_LABELS[applied.period];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Analytics</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-6 w-6 text-brand-600" aria-hidden="true" />
            Reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Period reporting across leads, quotations, bookings, receivables and payables.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-slate-500">
            Period
            <select
              aria-label="Report period"
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
          <Button variant="secondary" onClick={() => summary.refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </header>

      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{periodLabel}</span>
        {data?.period.timezone ? ` · ${data.period.timezone}` : ''}
        {summary.dataUpdatedAt
          ? ` · Last updated ${new Date(summary.dataUpdatedAt).toLocaleTimeString()}`
          : ''}
      </p>

      <nav className="flex flex-wrap gap-1 rounded-xl border bg-white p-1 shadow-sm">
        {visibleTabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="space-y-4">
          <States
            isLoading={summary.isLoading}
            isError={summary.isError}
            isEmpty={false}
            label="summary"
          />
          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {data.leads && (
                  <>
                    <Kpi label="Total leads" value={data.leads.total} />
                    <Kpi label="Converted leads" value={data.leads.converted} />
                  </>
                )}
                {data.quotations && (
                  <>
                    <Kpi label="Total quotations" value={data.quotations.total} />
                    <Kpi label="Accepted quotations" value={data.quotations.accepted} />
                  </>
                )}
                {data.bookings && <Kpi label="Total bookings" value={data.bookings.total} />}
                {data.financials && (
                  <>
                    <Kpi label="Agency revenue" value={money(data.financials.netRevenue)} />
                    <Kpi
                      label="Customer outstanding"
                      value={money(data.financials.customerOutstanding)}
                    />
                    <Kpi label="Refunds" value={money(data.financials.refunds)} />
                    <Kpi label="Net profit" value={money(data.financials.netProfit)} />
                  </>
                )}
                {data.vendorPayables && (
                  <Kpi
                    label="Vendor outstanding"
                    value={money(data.vendorPayables.dueInPeriodAmount)}
                  />
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {caps?.canViewLeads && (
                  <Card title="Lead sources">
                    <HorizontalBarChart
                      data={(sources.data?.rows ?? []).map((row) => ({
                        label: row.label,
                        value: row.leadCount,
                      }))}
                    />
                  </Card>
                )}
                {caps?.canViewLeads && (
                  <Card title="Top destinations">
                    <HorizontalBarChart
                      data={(destinations.data?.rows ?? []).slice(0, 5).map((row) => ({
                        label: row.destination,
                        value: row.enquiryCount,
                      }))}
                    />
                  </Card>
                )}
                {caps?.canViewLeads && (
                  <Card title="Staff conversions">
                    <HorizontalBarChart
                      data={(staffConversions.data?.rows ?? []).map((row) => ({
                        label: row.displayName,
                        value: row.convertedLeads,
                      }))}
                    />
                  </Card>
                )}
                {caps?.canViewFinancials && (
                  <Card title="Staff net profit">
                    <HorizontalBarChart
                      data={(staffFinancials.data?.rows ?? []).map((row) => ({
                        label: row.displayName,
                        value: Number(row.netProfit),
                      }))}
                    />
                  </Card>
                )}
                {data.receivables && (
                  <Card title="Receivables">
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Overdue</dt>
                        <dd className="font-medium">
                          {data.receivables.overdueCount} · {money(data.receivables.overdueAmount)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Due in period</dt>
                        <dd className="font-medium">
                          {data.receivables.dueInPeriodCount} ·{' '}
                          {money(data.receivables.dueInPeriodAmount)}
                        </dd>
                      </div>
                    </dl>
                  </Card>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'leads' && (
        <section className="space-y-4">
          <States
            isLoading={leads.isLoading}
            isError={leads.isError}
            isEmpty={Boolean(leads.data && !leads.data.summary)}
            label="lead"
          />
          {leads.data?.summary && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Total leads" value={leads.data.summary.totalLeads} />
                <Kpi label="Converted" value={leads.data.summary.convertedLeads} />
                <Kpi label="Lost" value={leads.data.summary.lostLeads} />
                <Kpi label="Conversion rate" value={`${leads.data.summary.conversionRate}%`} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="By stage">
                  <HorizontalBarChart
                    data={(leads.data.byStage ?? []).map((row) => ({
                      label: row.label,
                      value: row.count,
                    }))}
                  />
                </Card>
                <Card title="By assigned user">
                  <HorizontalBarChart
                    data={(leads.data.byAssignee ?? []).map((row) => ({
                      label: row.displayName,
                      value: row.totalLeads,
                    }))}
                  />
                </Card>
              </div>
              <p className="text-xs text-slate-500">
                Detailed lead rows and their CSV export live on the Leads page, which already
                supports the full filter set.
              </p>
            </>
          )}
        </section>
      )}

      {tab === 'quotations' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Quotation performance</h2>
            <ExportButton path="quotations" params={{ ...applied }} label="Export CSV" />
          </div>
          <States
            isLoading={quotations.isLoading}
            isError={quotations.isError}
            isEmpty={Boolean(quotations.data && !quotations.data.rows?.length)}
            label="quotation"
          />
          {quotations.data?.summary && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Total quotations" value={quotations.data.summary.totalQuotations} />
              <Kpi label="Accepted" value={quotations.data.summary.accepted} />
              <Kpi label="Quoted value" value={money(quotations.data.summary.totalQuotedValue)} />
              <Kpi label="Acceptance rate" value={`${quotations.data.summary.acceptanceRate}%`} />
            </div>
          )}
          {quotations.data?.rows?.length ? (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        'Quotation',
                        'Lead',
                        'Customer',
                        'Status',
                        'Version',
                        'Amount',
                        'Booking',
                      ].map((column) => (
                        <th key={column} className={head}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {quotations.data.rows.map((row) => (
                      <tr key={row.quotationId}>
                        <td className={cell}>{row.quotationNumber}</td>
                        <td className={cell}>{row.leadNumber ?? '—'}</td>
                        <td className={cell}>{row.customerName}</td>
                        <td className={cell}>{row.status}</td>
                        <td className={cell}>{row.currentVersion ?? '—'}</td>
                        <td className={cell}>{money(row.currentAmount)}</td>
                        <td className={cell}>{row.bookingNumber ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={quotations.data.pagination?.page ?? 1}
                totalPages={quotations.data.pagination?.totalPages ?? 1}
                total={quotations.data.pagination?.total ?? 0}
                onPage={setPage}
              />
            </div>
          ) : null}
        </section>
      )}

      {tab === 'bookings' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Bookings and profitability</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
              >
                Sort: {sortDir === 'desc' ? 'Newest' : 'Oldest'}
              </Button>
              <ExportButton path="bookings" params={{ ...applied }} label="Export CSV" />
            </div>
          </div>
          <States
            isLoading={bookings.isLoading}
            isError={bookings.isError}
            isEmpty={Boolean(bookings.data && !bookings.data.rows?.length)}
            label="booking"
          />
          {bookings.data?.financialSummary && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Customer amount"
                value={money(bookings.data.financialSummary.totalCustomerAmount)}
              />
              <Kpi label="Net revenue" value={money(bookings.data.financialSummary.netRevenue)} />
              <Kpi label="Gross profit" value={money(bookings.data.financialSummary.grossProfit)} />
              <Kpi label="Net profit" value={money(bookings.data.financialSummary.netProfit)} />
            </div>
          )}
          {bookings.data?.rows?.length ? (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={head}>Booking</th>
                      <th className={head}>Customer</th>
                      <th className={head}>Status</th>
                      {bookings.data.includesFinancials && (
                        <>
                          <th className={head}>Customer Amount</th>
                          <th className={head}>Outstanding</th>
                          <th className={head}>Net Profit</th>
                          <th className={head}>Margin</th>
                        </>
                      )}
                      <th className={head}>Booked By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bookings.data.rows.map((row) => (
                      <tr key={row.bookingId}>
                        <td className={cell}>{row.bookingNumber}</td>
                        <td className={cell}>{row.customerName}</td>
                        <td className={cell}>{row.bookingStatus}</td>
                        {bookings.data?.includesFinancials && (
                          <>
                            <td className={cell}>{money(row.customerAmount)}</td>
                            <td className={cell}>{money(row.outstandingAmount)}</td>
                            <td className={cell}>{money(row.netProfit)}</td>
                            <td className={cell}>{row.marginPercentage ?? '—'}</td>
                          </>
                        )}
                        <td className={cell}>{row.bookedBy ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y md:hidden">
                {bookings.data.rows.map((row) => (
                  <li key={row.bookingId} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-800">{row.bookingNumber}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {row.bookingStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{row.customerName}</p>
                    {bookings.data?.includesFinancials && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-amber-700">
                          Outstanding <strong>{money(row.outstandingAmount)}</strong>
                        </span>
                        <span className="text-emerald-700">
                          Net profit <strong>{money(row.netProfit)}</strong>
                        </span>
                        <span>Margin {row.marginPercentage ?? '—'}</span>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Booked by {row.bookedBy ?? '—'}</p>
                  </li>
                ))}
              </ul>
              <Pager
                page={bookings.data.pagination?.page ?? 1}
                totalPages={bookings.data.pagination?.totalPages ?? 1}
                total={bookings.data.pagination?.total ?? 0}
                onPage={setPage}
              />
            </div>
          ) : null}
        </section>
      )}

      {tab === 'client-payments' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Customer payments due</h2>
            <ExportButton path="client-payments" params={{ ...applied }} label="Export CSV" />
          </div>
          <States
            isLoading={payments.isLoading}
            isError={payments.isError}
            isEmpty={Boolean(payments.data && !payments.data.rows?.length)}
            label="client payments"
          />
          {payments.data?.summary && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Schedules" value={payments.data.summary.totalSchedules} />
              <Kpi label="Scheduled" value={money(payments.data.summary.totalScheduledAmount)} />
              <Kpi
                label="Outstanding"
                value={money(payments.data.summary.totalOutstandingAmount)}
              />
              <Kpi label="Overdue" value={money(payments.data.summary.overdueAmount)} />
            </div>
          )}
          {payments.data?.rows?.length ? (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        'Booking',
                        'Customer',
                        'Installment',
                        'Due Date',
                        'Amount',
                        'Outstanding',
                        'Status',
                      ].map((column) => (
                        <th key={column} className={head}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payments.data.rows.map((row) => (
                      <tr key={row.scheduleId}>
                        <td className={cell}>{row.bookingNumber}</td>
                        <td className={cell}>{row.customerName}</td>
                        <td className={cell}>
                          #{row.installmentNumber} {row.label}
                        </td>
                        <td className={cell}>{row.dueDate.slice(0, 10)}</td>
                        <td className={cell}>{money(row.amount)}</td>
                        <td className={cell}>{money(row.outstandingAmount)}</td>
                        <td className={cell}>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={payments.data.pagination?.page ?? 1}
                totalPages={payments.data.pagination?.totalPages ?? 1}
                total={payments.data.pagination?.total ?? 0}
                onPage={setPage}
              />
            </div>
          ) : null}
        </section>
      )}

      {tab === 'vendor-payables' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Vendor payables</h2>
            <ExportButton path="vendor-payables" params={{ ...applied }} label="Export CSV" />
          </div>
          <States
            isLoading={payables.isLoading}
            isError={payables.isError}
            isEmpty={Boolean(payables.data && !payables.data.rows?.length)}
            label="vendor payables"
          />
          {payables.data?.summary && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Payables" value={payables.data.summary.totalPayables} />
              <Kpi label="Original" value={money(payables.data.summary.originalAmount)} />
              <Kpi label="Outstanding" value={money(payables.data.summary.outstandingAmount)} />
              <Kpi label="Overdue" value={money(payables.data.summary.overdueAmount)} />
            </div>
          )}
          {payables.data?.rows?.length ? (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        'Payable',
                        'Vendor',
                        'Booking',
                        'Due Date',
                        'Original',
                        'Outstanding',
                        'Status',
                      ].map((column) => (
                        <th key={column} className={head}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payables.data.rows.map((row) => (
                      <tr key={row.payableId}>
                        <td className={cell}>{row.payableNumber}</td>
                        <td className={cell}>{row.vendorName}</td>
                        <td className={cell}>{row.bookingNumber}</td>
                        <td className={cell}>{row.dueDate ? row.dueDate.slice(0, 10) : '—'}</td>
                        <td className={cell}>{money(row.originalAmount)}</td>
                        <td className={cell}>{money(row.outstandingAmount)}</td>
                        <td className={cell}>{row.paymentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={payables.data.pagination?.page ?? 1}
                totalPages={payables.data.pagination?.totalPages ?? 1}
                total={payables.data.pagination?.total ?? 0}
                onPage={setPage}
              />
            </div>
          ) : null}
        </section>
      )}

      {tab === 'staff' && (
        <section className="grid gap-4 lg:grid-cols-2">
          {caps?.canViewLeads && (
            <Card title="Lead conversion (by assigned user)">
              <States
                isLoading={staffConversions.isLoading}
                isError={staffConversions.isError}
                isEmpty={Boolean(staffConversions.data && !staffConversions.data.rows?.length)}
                label="staff conversion"
              />
              {staffConversions.data?.rows?.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y">
                    <thead>
                      <tr>
                        {['#', 'Staff', 'Leads', 'Converted', 'Rate'].map((column) => (
                          <th key={column} className={head}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {staffConversions.data.rows.map((row) => (
                        <tr key={row.userId}>
                          <td className={cell}>{row.rank}</td>
                          <td className={cell}>{row.displayName}</td>
                          <td className={cell}>{row.totalLeads}</td>
                          <td className={cell}>{row.convertedLeads}</td>
                          <td className={cell}>{row.conversionRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          )}
          {caps?.canViewFinancials && (
            <Card title="Revenue and profit (by booked by)">
              <States
                isLoading={staffFinancials.isLoading}
                isError={staffFinancials.isError}
                isEmpty={Boolean(staffFinancials.data && !staffFinancials.data.rows?.length)}
                label="staff financial"
              />
              {staffFinancials.data?.rows?.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y">
                    <thead>
                      <tr>
                        {['#', 'Staff', 'Bookings', 'Revenue', 'Net Profit'].map((column) => (
                          <th key={column} className={head}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {staffFinancials.data.rows.map((row) => (
                        <tr key={row.userId}>
                          <td className={cell}>{row.rank}</td>
                          <td className={cell}>{row.displayName}</td>
                          <td className={cell}>{row.bookingCount}</td>
                          <td className={cell}>{money(row.revenue)}</td>
                          <td className={cell}>{money(row.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          )}
        </section>
      )}

      {tab === 'sources' && (
        <section className="grid gap-4 lg:grid-cols-2">
          <Card title="Lead sources">
            <States
              isLoading={sources.isLoading}
              isError={sources.isError}
              isEmpty={Boolean(sources.data && !sources.data.rows?.length)}
              label="lead source"
            />
            {sources.data?.rows?.length ? (
              <>
                <HorizontalBarChart
                  data={sources.data.rows.map((row) => ({
                    label: row.label,
                    value: row.leadCount,
                  }))}
                />
                <table className="mt-4 min-w-full divide-y">
                  <thead>
                    <tr>
                      {['Source', 'Leads', 'Converted', 'Rate'].map((column) => (
                        <th key={column} className={head}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sources.data.rows.map((row) => (
                      <tr key={row.source}>
                        <td className={cell}>{row.label}</td>
                        <td className={cell}>{row.leadCount}</td>
                        <td className={cell}>{row.convertedCount}</td>
                        <td className={cell}>{row.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </Card>
          <Card title="Top destinations">
            <States
              isLoading={destinations.isLoading}
              isError={destinations.isError}
              isEmpty={Boolean(destinations.data && !destinations.data.rows?.length)}
              label="destination"
            />
            {destinations.data?.rows?.length ? (
              <HorizontalBarChart
                data={destinations.data.rows.map((row) => ({
                  label: row.destination,
                  value: row.enquiryCount,
                }))}
              />
            ) : null}
          </Card>
        </section>
      )}
    </div>
  );
}
