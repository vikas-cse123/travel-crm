import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { InlineLeadField } from './InlineLeadField';
import {
  useBulkAssign,
  useBulkStage,
  useLeadAnalytics,
  useLeadExport,
  useLeadLookups,
  useLeads,
  type Lead,
} from '@/features/queries/queries.api';
import { Button } from '@/components/ui/Button';
import { labelForLookup } from '@interscale/shared';

const badge = (value: string) =>
  value === 'HOT' || value === 'URGENT' || value === 'LOST'
    ? 'bg-red-50 text-red-700'
    : value === 'BOOKING_CONFIRMED' || value === 'QUALIFIED'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-blue-50 text-blue-700';

const leadDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(
        new Date(value),
      )
    : null;

/** Keep the stored query number intact while hiding its year in the lead list. */
const leadListId = (value: string) => value.replace(/^([^-]+)-\d{4}-/, '$1-');

function LeadInfoCell({ lead }: { lead: Lead }) {
  const email = lead.email ?? lead.customer?.email;
  return (
    <div className="min-w-44 space-y-1">
      <Link className="block font-semibold text-brand-700 hover:underline" to={`/queries/${lead.id}`}>
        {lead.customerName}
      </Link>
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Phone className="h-3 w-3 shrink-0" /> {lead.phone}
      </span>
      {email && (
        <span className="flex max-w-52 items-center gap-1 text-xs text-brand-600">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate" title={email}>{email}</span>
        </span>
      )}
    </div>
  );
}

function DestinationCell({ lead }: { lead: Lead }) {
  const totalNights = lead.itinerary.reduce((sum, item) => sum + item.nights, 0);
  if (!lead.itinerary.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="min-w-40 space-y-1.5">
      <span className="inline-flex rounded-full bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white">
        {totalNights}N Total
      </span>
      {lead.itinerary.map((item) => (
        <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-center">
          <p className="font-semibold text-slate-800">{item.destination}</p>
          <p className="text-xs font-semibold text-red-500">{item.nights}N</p>
          {item.country && <p className="text-[11px] text-slate-500">{item.country}</p>}
        </div>
      ))}
    </div>
  );
}

function TravellersInfoCell({ lead }: { lead: Lead }) {
  return (
    <div className="min-w-44 space-y-1.5 text-xs">
      <span className="flex w-fit items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 font-semibold text-slate-700">
        <MapPin className="h-3 w-3 text-sky-600" /> {lead.departureCity || 'N/A'}
      </span>
      <span className="block w-fit rounded border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-slate-700">
        {leadDate(lead.travelStartDate) ?? 'Flexible dates'}
      </span>
      <span className="block w-fit rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-slate-700">
        {lead.travellerSummary || 'No traveller details'}
      </span>
    </div>
  );
}

function ServicesCell({ lead }: { lead: Lead }) {
  if (!lead.services.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex min-w-28 flex-wrap gap-1">
      {lead.services.map((service, index) => (
        <span key={`${service.serviceType}-${index}`} className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-semibold text-slate-600">
          {labelForLookup(service.serviceType)}
        </span>
      ))}
    </div>
  );
}

function QuotationCell({ lead }: { lead: Lead }) {
  const summary = lead.quotationSummary;
  if (lead.quotationSummary === undefined) return <span className="text-slate-300">—</span>;
  if (!summary)
    return lead.actions?.canCreateQuotation ? (
      <Link className="inline-flex rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white" to={`/queries/${lead.id}/quotations/new`}>
        + New
      </Link>
    ) : (
      <span className="text-xs text-slate-400">None</span>
    );
  return (
    <div className="min-w-28 space-y-1 text-xs">
      <Link className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-1 font-semibold text-white" to={`/quotations/${summary.quotationId}`}>
        <Eye className="h-3 w-3" /> View
      </Link>
      <span className={`ml-1 inline-flex rounded px-2 py-1 font-medium ${badge(summary.quotationStatus)}`} title={summary.quotationNumber}>
        {labelForLookup(summary.quotationStatus)}
      </span>
      {summary.latestVersionAmount && (
        <p className="text-slate-500">
          {summary.currency ?? ''} {summary.latestVersionAmount}
        </p>
      )}
    </div>
  );
}

function BookingCell({ lead, canCreateBooking }: { lead: Lead; canCreateBooking: boolean }) {
  const summary = lead.bookingSummary;
  if (lead.bookingSummary === undefined) return <span className="text-slate-300">—</span>;
  if (!summary) {
    // Hot + Booking Confirmed + no booking + a finalized quotation → offer the
    // lead-based booking flow. The backend re-validates eligibility.
    const quotationId = lead.quotationSummary?.quotationId;
    if (
      canCreateBooking &&
      lead.leadType === 'HOT' &&
      lead.leadStage === 'BOOKING_CONFIRMED' &&
      quotationId
    ) {
      return (
        <Link
          aria-label={`Create booking for ${lead.queryNumber}`}
          title="Create booking for this lead"
          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          to={`/bookings/new?leadId=${encodeURIComponent(lead.id)}&quotationId=${encodeURIComponent(quotationId)}`}
        >
          <Plus className="h-3.5 w-3.5" /> Create Booking
        </Link>
      );
    }
    return <span className="text-xs text-slate-500">{lead.quotationRequired ? 'Quote Required' : 'None'}</span>;
  }
  return (
    <div className="text-xs">
      <Link className="font-medium text-brand-700" to={`/bookings/${summary.bookingId}`}>
        {summary.bookingNumber}
      </Link>
      <p className="mt-0.5 text-slate-500">{labelForLookup(summary.bookingStatus)}</p>
    </div>
  );
}

/** Compact context-aware quick actions for a lead row. */
function QuickActions({ lead, canEdit }: { lead: Lead; canEdit: boolean }) {
  const a = lead.actions;
  const quotationId = lead.quotationSummary?.quotationId;
  const bookingId = lead.bookingSummary?.bookingId;
  return (
    <div className="flex min-w-24 flex-wrap items-center gap-1 text-xs font-medium">
      <Link aria-label={`View ${lead.queryNumber}`} className="rounded bg-cyan-600 p-2 text-white" to={`/queries/${lead.id}`}>
        <Eye className="h-3.5 w-3.5" />
      </Link>
      {canEdit && (
        <Link aria-label={`Edit ${lead.queryNumber}`} className="rounded bg-brand-600 p-2 text-white" to={`/queries/${lead.id}/edit`}>
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      )}
      {a?.canConvertToBooking && quotationId && (
        <Link className="rounded bg-emerald-600 px-2 py-1.5 text-white" to={`/quotations/${quotationId}/convert-to-booking`}>
          Convert to booking
        </Link>
      )}
      {a?.canViewBooking && bookingId && (
        <Link className="rounded bg-emerald-600 px-2 py-1.5 text-white" to={`/bookings/${bookingId}`}>
          View booking
        </Link>
      )}
      {a?.canOpenQuotation && quotationId && !a.canConvertToBooking && !a.canViewBooking && (
        <Link className="rounded bg-slate-600 px-2 py-1.5 text-white" to={`/quotations/${quotationId}`}>
          View quotation
        </Link>
      )}
      {a?.canCreateQuotation && !lead.hasQuotations && (
        <Link className="rounded bg-slate-600 px-2 py-1.5 text-white" to={`/queries/${lead.id}/quotations/new`}>
          Create quotation
        </Link>
      )}
      {a?.canAddFollowUp && (
        <Link className="rounded bg-cyan-600 px-2 py-1.5 text-white" to={`/queries/${lead.id}?tab=follow-ups`}>
          Follow-up
        </Link>
      )}
    </div>
  );
}

export function LeadsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const leads = useLeads(params);
  const analytics = useLeadAnalytics();
  const { data: lookups } = useLeadLookups();
  const bulkAssign = useBulkAssign();
  const bulkStage = useBulkStage();
  const exportLeads = useLeadExport();

  const canAssign = hasPermission('queries.assign');
  const canUpdate = hasPermission('queries.update');
  const canExport = hasPermission('queries.export');
  const canCreateBooking = hasPermission('bookings.create');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'assign' | 'stage'>(null);
  const [assignTo, setAssignTo] = useState('');
  const [bulkStageValue, setBulkStageValue] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  // A change in filters or page invalidates the current selection.
  const paramsKey = params.toString();
  useEffect(() => {
    setSelected(new Set());
    setDialog(null);
  }, [paramsKey]);

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

  const rows = useMemo(() => leads.data?.data ?? [], [leads.data]);
  const pageIds = useMemo(() => rows.map((lead) => lead.id), [rows]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 100) next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.size < 100 && next.add(id));
      return next;
    });

  const closeDialog = () => {
    setDialog(null);
    setAssignTo('');
    setBulkStageValue('');
    setBulkReason('');
  };
  const runAssign = () => {
    if (!assignTo) return;
    bulkAssign.mutate(
      { queryIds: [...selected], assignedToId: assignTo },
      {
        onSuccess: () => {
          setSelected(new Set());
          closeDialog();
        },
      },
    );
  };
  const runStage = () => {
    if (!bulkStageValue) return;
    bulkStage.mutate(
      {
        queryIds: [...selected],
        leadStage: bulkStageValue,
        ...(bulkReason ? { reason: bulkReason } : {}),
      },
      {
        onSuccess: () => {
          setSelected(new Set());
          closeDialog();
        },
      },
    );
  };

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

  const headers: Array<[string, string?]> = [
    ['Lead ID', 'queryNumber'],
    ['Lead Info', 'customerName'],
    ['Destination'],
    ['Travellers Info'],
    ['Services'],
    ['Quotation'],
    ['Booking'],
    ['Weblink'],
    ['Logging'],
    ['Assigned to'],
    ['Amount'],
    ['Margin'],
    ['Type', 'leadType'],
    ['Stage', 'leadStage'],
    ['Created', 'createdAt'],
    ['Actions'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Home / Leads</p>
          <h1 className="text-2xl font-semibold">Leads</h1>
        </div>
      </div>
      <section className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2 shadow-sm">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700"><BarChart3 className="h-4 w-4 text-brand-600" /> Analytics</span>
        {analytics.isLoading ? (
          <span className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        ) : (
          cards
            .filter(([title]) => ['Total Leads', 'Booking Confirmed', 'Conversion Rate', 'Win Rate'].includes(String(title)))
            .map(([title, value]) => (
              <span key={title} className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                <span>{value}</span><span>{title}</span>
              </span>
            ))
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"><h2 className="text-lg font-medium text-slate-800">Leads List</h2><div className="flex gap-2">{canExport && <Button size="sm" variant="secondary" disabled={exportLeads.isPending} onClick={() => exportLeads.mutate(params)}><Download className="h-4 w-4" /> Export</Button>}{hasPermission('queries.create') && <Link aria-label="Add Lead" to="/queries/new"><Button size="sm"><Plus className="h-4 w-4" /> Create</Button></Link>}</div></div>
        <div className="space-y-3 border-b p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px_auto]">
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
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={params.get('leadType') === 'HOT'} onChange={(event) => set('leadType', event.target.checked ? 'HOT' : '')} /> 🔥 Hot</label>
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
                className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Destination"
              value={params.get('destination') ?? ''}
              onChange={(e) => set('destination', e.target.value)}
            />
            <select
              aria-label="Quotation required"
              className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              <label key={key} className="hidden space-y-1 text-xs font-medium text-slate-500">
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
              className="hidden text-left text-sm font-medium text-brand-700"
              onClick={() => setParams({})}
            >
              Clear filters
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t-4 border-indigo-500 bg-sky-50 p-3">
            {chips.map(([label, value, count]) => (
              <button
                key={`${label}-${value}`}
                className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold ${params.get(value && ['FRESH', 'HOT', 'WARM', 'COLD'].includes(String(value)) ? 'leadType' : 'leadStage') === value || (!value && !params.get('leadType') && !params.get('leadStage')) ? 'border-brand-600 bg-slate-800 text-white' : 'border-blue-300 bg-card text-blue-700'}`}
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

        {selected.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-3 border-b bg-brand-50 px-4 py-2.5 text-sm"
            role="region"
            aria-label="Bulk actions"
          >
            <span className="font-medium text-brand-800">{selected.size} selected</span>
            {canAssign && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('assign')}>
                Assign
              </Button>
            )}
            {canUpdate && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('stage')}>
                Change stage
              </Button>
            )}
            <button
              className="flex items-center gap-1 text-slate-600 hover:text-slate-900"
              onClick={() => setSelected(new Set())}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        )}
        {(bulkAssign.isError || bulkStage.isError) && (
          <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
            {(bulkAssign.error as Error)?.message ?? (bulkStage.error as Error)?.message}
          </div>
        )}

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
        ) : !rows.length ? (
          <div className="p-12 text-center">
            <UsersRound className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-medium">No leads found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or create your first lead.</p>
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {rows.map((lead) => (
                <article key={lead.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {canAssign && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${lead.queryNumber}`}
                          className="mt-1"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleRow(lead.id)}
                        />
                      )}
                      <div>
                        <Link className="font-semibold text-brand-700" to={`/queries/${lead.id}`}>
                          {leadListId(lead.queryNumber)}
                        </Link>
                        <p className="font-medium">{lead.customerName}</p>
                        <p className="text-xs text-slate-500">{lead.phone}</p>
                      </div>
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
                    <span>{labelForLookup(lead.leadSource)}</span>
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
                  <div className="flex flex-wrap gap-3 text-xs">
                    <QuotationCell lead={lead} />
                    <BookingCell lead={lead} canCreateBooking={canCreateBooking} />
                  </div>
                  <QuickActions lead={lead} canEdit={canUpdate} />
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[2100px] table-auto text-left text-sm">
                <thead className="bg-emerald-500 text-xs uppercase text-white">
                  <tr>
                    {canAssign && (
                      <th className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select page"
                          checked={allOnPageSelected}
                          onChange={togglePage}
                        />
                      </th>
                    )}
                    {headers.map(([label, sortBy]) => (
                      <th key={label} className="whitespace-nowrap border-r border-emerald-400 px-3 py-3 last:border-r-0">
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
                  {rows.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-200 align-top hover:bg-slate-50 even:bg-slate-50/60">
                      {canAssign && (
                        <td className="border-r px-3 py-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${lead.queryNumber}`}
                            checked={selected.has(lead.id)}
                            onChange={() => toggleRow(lead.id)}
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap border-r px-3 py-4 font-semibold text-brand-700">
                        <Link to={`/queries/${lead.id}`}>{leadListId(lead.queryNumber)}</Link>
                      </td>
                      <td className="border-r px-3 py-4"><LeadInfoCell lead={lead} /></td>
                      <td className="border-r px-3 py-4"><DestinationCell lead={lead} /></td>
                      <td className="border-r px-3 py-4"><TravellersInfoCell lead={lead} /></td>
                      <td className="border-r px-3 py-4"><ServicesCell lead={lead} /></td>
                      <td className="border-r px-3 py-4"><QuotationCell lead={lead} /></td>
                      <td className="border-r px-3 py-4"><BookingCell lead={lead} canCreateBooking={canCreateBooking} /></td>
                      <td className="border-r px-3 py-4 text-xs text-slate-500">{lead.webLinkPlaceholder || 'Not Generated'}</td>
                      <td className="border-r px-3 py-4"><Link aria-label={`Open logging for ${lead.queryNumber}`} to={`/queries/${lead.id}?tab=follow-ups`} className="inline-flex rounded bg-cyan-600 px-2 py-1.5 text-xs font-semibold text-white">＋ <Eye className="ml-1 h-3.5 w-3.5" /></Link></td>
                      <td className="min-w-28 border-r px-3 py-4">{lead.assignedTo?.fullName ?? 'Unassigned'}</td>
                      <td className="whitespace-nowrap border-r px-3 py-4 font-semibold text-emerald-600">{lead.expectedAmount ? `${lead.currency} ${lead.expectedAmount}` : '—'}</td>
                      <td className="whitespace-nowrap border-r px-3 py-4 font-semibold text-emerald-600">{lead.expectedMargin ? `${lead.currency} ${lead.expectedMargin}` : '—'}</td>
                      <td className="border-r px-3 py-4">
                        <InlineLeadField
                          lead={lead}
                          field="leadType"
                          options={lookups?.leadTypes ?? []}
                          canEdit={canUpdate}
                        />
                      </td>
                      <td className="border-r px-3 py-4">
                        <InlineLeadField
                          lead={lead}
                          field="leadStage"
                          options={lookups?.leadStages ?? []}
                          canEdit={canUpdate}
                        />
                      </td>
                      <td className="whitespace-nowrap border-r px-3 py-4">{leadDate(lead.createdAt)}</td>
                      <td className="px-3 py-4">
                        <QuickActions lead={lead} canEdit={canUpdate} />
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

      {dialog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={dialog === 'assign' ? 'Bulk assign leads' : 'Bulk change stage'}
        >
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {dialog === 'assign' ? 'Assign' : 'Change stage for'} {selected.size} leads
              </h2>
              <button aria-label="Close" onClick={closeDialog}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            {dialog === 'assign' ? (
              <div className="mt-4 space-y-3">
                <select
                  aria-label="Bulk assignee"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                >
                  <option value="">Select a user</option>
                  {lookups?.assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
                <Button className="w-full" isLoading={bulkAssign.isPending} onClick={runAssign}>
                  Assign leads
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <select
                  aria-label="Bulk stage"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={bulkStageValue}
                  onChange={(e) => setBulkStageValue(e.target.value)}
                >
                  <option value="">Select a stage</option>
                  {lookups?.leadStages.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Bulk stage reason"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Reason (required for lost/cancelled/invalid)"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                />
                <Button className="w-full" isLoading={bulkStage.isPending} onClick={runStage}>
                  Update stage
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
