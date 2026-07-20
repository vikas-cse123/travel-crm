import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, ChevronLeft, ChevronRight, Plus, Search, UsersRound } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeadAnalytics, useLeadLookups, useLeads } from '@/features/queries/queries.api';
import { Button } from '@/components/ui/Button';
import { labelForLookup } from '@interscale/shared';

const badge = (value: string) =>
  value === 'HOT' || value === 'URGENT' || value === 'LOST'
    ? 'bg-red-50 text-red-700'
    : value === 'BOOKING_CONFIRMED' || value === 'QUALIFIED'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-blue-50 text-blue-700';
export function LeadsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const leads = useLeads(params);
  const analytics = useLeadAnalytics();
  const { data: lookups } = useLeadLookups();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
  };
  const page = Number(params.get('page') ?? 1);
  const sort = (sortBy: string) => {
    const next = new URLSearchParams(params);
    const sameColumn = next.get('sortBy') === sortBy;
    next.set('sortBy', sortBy);
    next.set('sortOrder', sameColumn && next.get('sortOrder') === 'asc' ? 'desc' : 'asc');
    next.set('page', '1');
    setParams(next);
  };
  const headers: Array<[string, string?]> = [
    ['Lead ID', 'queryNumber'],
    ['Customer', 'customerName'],
    ['Itinerary'],
    ['Travellers'],
    ['Services'],
    ['Travel', 'travelStartDate'],
    ['Assigned to'],
    ['Expected', 'expectedAmount'],
    ['Type', 'leadType'],
    ['Stage', 'leadStage'],
    ['Next follow-up', 'nextFollowUpAt'],
    ['Created', 'createdAt'],
    ['Actions'],
  ];
  const cards = analytics.data
    ? [
        ['Total Leads', analytics.data.totalLeads],
        ['New Leads', analytics.data.newLeads],
        ['Qualified', analytics.data.qualifiedLeads],
        ['Follow-Ups Due', analytics.data.followUpsDue],
        ['Quotation Required', analytics.data.quotationRequired],
        ['Ready to Book', analytics.data.readyToBook],
        ['Booking Confirmed', analytics.data.bookingConfirmed],
        ['Lost', analytics.data.lostLeads],
        ['Conversion Rate', `${analytics.data.conversionRate}%`],
        ['Win Rate', `${analytics.data.winRate}%`],
      ]
    : [];
  const chips = analytics.data
    ? [
        ['All', '', analytics.data.totalLeads],
        ...['FRESH', 'HOT', 'WARM', 'COLD'].map(
          (x) => [labelForLookup(x), x, analytics.data!.byLeadType[x] ?? 0] as const,
        ),
        ...[
          'NEW_LEAD',
          'QUOTATION_SENT',
          'IN_NEGOTIATION',
          'READY_TO_BOOK',
          'BOOKING_CONFIRMED',
          'LOST',
          'CANCELLED',
          'INVALID',
          'ON_HOLD',
        ].map((x) => [labelForLookup(x), x, analytics.data!.byLeadStage[x] ?? 0] as const),
      ]
    : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Home / Leads</p>
          <h1 className="text-2xl font-semibold">Leads</h1>
        </div>
        {hasPermission('queries.create') && (
          <Link to="/queries/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Lead
            </Button>
          </Link>
        )}
      </div>
      {analytics.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {cards.map(([title, value]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      )}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                aria-label="Search leads"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                placeholder="Search lead ID, customer, phone or destination"
                value={params.get('search') ?? ''}
                onChange={(e) => set('search', e.target.value)}
              />
            </label>
            {[
              ['leadType', 'All lead types', lookups?.leadTypes],
              ['leadStage', 'All lead stages', lookups?.leadStages],
              ['leadSource', 'All lead sources', lookups?.leadSources],
              ['priority', 'All priorities', lookups?.priorities],
              ['serviceType', 'All services', lookups?.serviceTypes],
            ].map(([key, label, options]) => (
              <select
                key={String(key)}
                aria-label={String(label)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={params.get(String(key)) ?? ''}
                onChange={(e) => set(String(key), e.target.value)}
              >
                <option value="">{String(label)}</option>
                {(options as Array<{ value: string; label: string }> | undefined)?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
            <select
              aria-label="Assigned user"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={params.get('assignedToId') ?? ''}
              onChange={(e) => set('assignedToId', e.target.value)}
            >
              <option value="">All assignees</option>
              {lookups?.assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <input
              aria-label="Destination"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Destination"
              value={params.get('destination') ?? ''}
              onChange={(e) => set('destination', e.target.value)}
            />
            <select
              aria-label="Quotation required"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={params.get('quotationRequired') ?? ''}
              onChange={(e) => set('quotationRequired', e.target.value)}
            >
              <option value="">Any quotation need</option>
              <option value="true">Quotation required</option>
              <option value="false">Not required</option>
            </select>
            {(
              [
                ['travelFrom', 'Travel from'],
                ['travelTo', 'Travel to'],
                ['followUpFrom', 'Follow-up from'],
                ['followUpTo', 'Follow-up to'],
                ['createdFrom', 'Created from'],
                ['createdTo', 'Created to'],
              ] as Array<[string, string]>
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs font-medium text-slate-500">
                {label}
                <input
                  aria-label={label}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  type="date"
                  value={params.get(key) ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              </label>
            ))}
            <button
              className="text-left text-sm font-medium text-brand-700"
              onClick={() => setParams({})}
            >
              Clear filters
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chips.map(([label, value, count]) => (
              <button
                key={`${label}-${value}`}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${params.get(value && ['FRESH', 'HOT', 'WARM', 'COLD'].includes(String(value)) ? 'leadType' : 'leadStage') === value || (!value && !params.get('leadType') && !params.get('leadStage')) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200'}`}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('leadType');
                  next.delete('leadStage');
                  if (value)
                    next.set(
                      ['FRESH', 'HOT', 'WARM', 'COLD'].includes(String(value))
                        ? 'leadType'
                        : 'leadStage',
                      String(value),
                    );
                  next.set('page', '1');
                  setParams(next);
                }}
              >
                {label} <strong>{count}</strong>
              </button>
            ))}
          </div>
        </div>
        {leads.isLoading ? (
          <div className="space-y-3 p-5" aria-label="Loading leads">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : leads.isError ? (
          <div className="p-10 text-center text-red-700">
            <p>Leads could not be loaded.</p>
            <Button className="mt-3" variant="secondary" onClick={() => void leads.refetch()}>
              Try again
            </Button>
          </div>
        ) : !leads.data?.data.length ? (
          <div className="p-12 text-center">
            <UsersRound className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-medium">No leads found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or create your first lead.</p>
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {leads.data.data.map((lead) => (
                <article key={lead.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link className="font-semibold text-brand-700" to={`/queries/${lead.id}`}>
                        {lead.queryNumber}
                      </Link>
                      <p className="font-medium">{lead.customerName}</p>
                      <p className="text-xs text-slate-500">{lead.phone}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${badge(lead.leadStage)}`}
                    >
                      {labelForLookup(lead.leadStage)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {lead.itinerary.map((x) => `${x.destination} (${x.nights}N)`).join(' → ')}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>{lead.travellerSummary}</span>
                    <span>{lead.assignedTo?.fullName ?? 'Unassigned'}</span>
                    <span>
                      Travel:{' '}
                      {lead.travelStartDate
                        ? new Date(lead.travelStartDate).toLocaleDateString()
                        : 'Flexible'}
                    </span>
                    <span>
                      Follow-up:{' '}
                      {lead.nextFollowUpAt
                        ? new Date(lead.nextFollowUpAt).toLocaleDateString()
                        : 'None'}
                    </span>
                  </div>
                  <div className="flex gap-3 text-sm font-medium">
                    <Link className="text-brand-700" to={`/queries/${lead.id}`}>
                      View
                    </Link>
                    {hasPermission('queries.update') && (
                      <Link className="text-slate-600" to={`/queries/${lead.id}/edit`}>
                        Edit
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {headers.map(([label, sortBy]) => (
                      <th key={label} className="px-4 py-3">
                        {sortBy ? (
                          <button
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                            aria-label={`Sort by ${label}`}
                            onClick={() => sort(sortBy)}
                          >
                            {label}
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leads.data.data.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-brand-700">
                        <Link to={`/queries/${lead.id}`}>{lead.queryNumber}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium">{lead.customerName}</span>
                        <span className="text-xs text-slate-500">{lead.phone}</span>
                      </td>
                      <td className="max-w-48 px-4 py-3">
                        <span className="line-clamp-2">
                          {lead.itinerary.map((x) => `${x.destination} (${x.nights}N)`).join(' → ')}
                        </span>
                      </td>
                      <td className="max-w-44 px-4 py-3 text-xs">{lead.travellerSummary}</td>
                      <td className="px-4 py-3 text-xs">
                        {lead.services
                          .slice(0, 2)
                          .map((x) => labelForLookup(x.serviceType))
                          .join(', ')}
                        {lead.services.length > 2 ? ` +${lead.services.length - 2}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {lead.travelStartDate
                          ? new Date(lead.travelStartDate).toLocaleDateString()
                          : 'Flexible'}
                      </td>
                      <td className="px-4 py-3">{lead.assignedTo?.fullName ?? 'Unassigned'}</td>
                      <td className="px-4 py-3">
                        {lead.expectedAmount
                          ? new Intl.NumberFormat(undefined, {
                              style: 'currency',
                              currency: lead.currency,
                              maximumFractionDigits: 0,
                            }).format(Number(lead.expectedAmount))
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${badge(lead.leadType)}`}
                        >
                          {labelForLookup(lead.leadType)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${badge(lead.leadStage)}`}
                        >
                          {labelForLookup(lead.leadStage)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <Link className="font-medium text-brand-700" to={`/queries/${lead.id}`}>
                          View
                        </Link>
                        {hasPermission('queries.update') && (
                          <Link
                            className="ml-3 font-medium text-slate-600"
                            to={`/queries/${lead.id}/edit`}
                          >
                            Edit
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {leads.data && (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span>{leads.data.pagination.total} leads</span>
            <div className="flex items-center gap-2">
              <Button
                aria-label="Previous page"
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => set('page', String(page - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                Page {page} of {Math.max(1, leads.data.pagination.totalPages)}
              </span>
              <Button
                aria-label="Next page"
                size="sm"
                variant="secondary"
                disabled={page >= leads.data.pagination.totalPages}
                onClick={() => set('page', String(page + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
