import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Edit3, Mail, MessageSquarePlus, Phone, Upload, UserRound } from 'lucide-react';
import { CUSTOMER_DOCUMENT_TYPES, PERMISSIONS, labelForLookup } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useCreateCustomerCommunication,
  useCreateCustomerNote,
  useCustomer,
  useCustomerCommunications,
  useCustomerDocuments,
  useCustomerNotes,
  useCustomerRelationships,
  useCustomerTimeline,
  useCustomers,
  useMergeCustomers,
  uploadCustomerDocument,
} from '@/features/customers/customers.api';

const tabs = [
  'overview',
  'timeline',
  'leads',
  'quotations',
  'bookings',
  'travellers',
  'payments',
  'notes',
  'communications',
  'documents',
  'merge',
] as const;
type Tab = (typeof tabs)[number];
const money = (value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(value));
const card = 'rounded-xl border bg-white p-5 shadow-sm';

function Relationships({
  id,
  type,
}: {
  id: string;
  type: 'leads' | 'quotations' | 'bookings' | 'travellers' | 'payments';
}) {
  const query = useCustomerRelationships(id, type);
  if (query.isLoading) return <div className="h-36 animate-pulse rounded-xl bg-slate-100" />;
  if (!query.data?.length)
    return (
      <div className={`${card} text-center text-sm text-slate-500`}>
        No {type} linked to this customer.
      </div>
    );
  return (
    <div className={card}>
      <div className="divide-y">
        {query.data.map((row) => {
          const rowId = String(row.id);
          const booking = row.booking as { id?: string; bookingNumber?: string } | undefined;
          const number = String(
            row.queryNumber ??
              row.quotationNumber ??
              row.bookingNumber ??
              row.paymentNumber ??
              booking?.bookingNumber ??
              rowId,
          );
          const title =
            type === 'travellers'
              ? `${String(row.firstName ?? '')} ${String(row.lastName ?? '')}`.trim()
              : number;
          const href =
            type === 'travellers' || type === 'payments'
              ? `/bookings/${booking?.id ?? ''}`
              : `/${type === 'leads' ? 'queries' : type}/${rowId}`;
          return (
            <Link
              key={rowId}
              className="flex items-center justify-between gap-3 py-3 hover:text-brand-700"
              to={href}
            >
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-slate-500">
                  {type === 'payments'
                    ? `${String(row.currency ?? '')} ${String(row.amount ?? '')} · ${number}`
                    : type === 'travellers'
                      ? `${number} · ${labelForLookup(String(row.travellerType ?? ''))}`
                      : String(row.destinationSummary ?? row.leadStage ?? '')}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                {labelForLookup(
                  String(
                    row.status ??
                      row.bookingStatus ??
                      row.paymentStatus ??
                      row.visaStatus ??
                      row.leadStage ??
                      '',
                  ),
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerWorkspacePage() {
  const { customerId = '' } = useParams();
  const { hasPermission } = useAuth();
  const [active, setActive] = useState<Tab>('overview');
  const customer = useCustomer(customerId);
  const timeline = useCustomerTimeline(customerId);
  const notes = useCustomerNotes(customerId);
  const communications = useCustomerCommunications(customerId);
  const documents = useCustomerDocuments(
    customerId,
    hasPermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
  );
  const addNote = useCreateCustomerNote(customerId);
  const addCommunication = useCreateCustomerCommunication(customerId);
  const candidates = useCustomers(new URLSearchParams({ pageSize: '100' }));
  const merge = useMergeCustomers();
  const [note, setNote] = useState('');
  const [communication, setCommunication] = useState('');
  const [targetId, setTargetId] = useState('');
  const [documentType, setDocumentType] =
    useState<(typeof CUSTOMER_DOCUMENT_TYPES)[number]>('GENERAL_ATTACHMENT');
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  if (customer.isError) return <Navigate to="/customers" replace />;
  if (!customer.data) return <div className="h-96 animate-pulse rounded-xl bg-slate-100" />;
  const value = customer.data;
  const submitMerge = (previewOnly: boolean) =>
    merge.mutate(
      {
        sourceCustomerId: customerId,
        targetCustomerId: targetId,
        reason: 'Duplicate profile consolidation',
        fieldChoices: {},
        preview: previewOnly,
      },
      {
        onSuccess: (result) => {
          if (previewOnly) setPreview(result as Record<string, unknown>);
          else window.location.assign(`/customers/${targetId}`);
        },
      },
    );
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 to-brand-900 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-white/10 p-3">
                <UserRound className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-brand-200">
                  {value.customerNumber} · {labelForLookup(value.type)}
                </p>
                <h1 className="text-2xl font-semibold">{value.displayName}</h1>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-2 py-1">
                    {labelForLookup(value.status)}
                  </span>
                  {value.isRepeatCustomer && (
                    <span className="rounded-full bg-emerald-500/30 px-2 py-1">
                      Repeat customer
                    </span>
                  )}
                  {value.isVip && (
                    <span className="rounded-full bg-amber-400/30 px-2 py-1">VIP</span>
                  )}
                  {Boolean(value.duplicateWarnings?.length) && (
                    <span className="rounded-full bg-red-500/30 px-2 py-1">Possible duplicate</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-200">
                  {value.primaryPhone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      {value.primaryPhone}
                    </span>
                  )}
                  {value.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {value.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {hasPermission(PERMISSIONS.CUSTOMERS_UPDATE) && (
              <div className="flex flex-wrap gap-2">
                <Link to={`/queries/new?customerId=${customerId}`}>
                  <Button variant="secondary">Add lead</Button>
                </Link>
                <Button variant="secondary" onClick={() => setActive('communications')}>
                  Log communication
                </Button>
                <Button variant="secondary" onClick={() => setActive('notes')}>
                  Add note
                </Button>
                <Link to={`/customers/${customerId}/edit`}>
                  <Button variant="secondary">
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                </Link>
              </div>
            )}
          </div>
          <div className="mt-5 grid gap-3 border-t border-white/20 pt-4 sm:grid-cols-3 lg:grid-cols-7">
            {[
              ['Lifecycle', labelForLookup(value.lifecycleStage)],
              ['Leads', value.queryCount],
              ['Quotations', value.quotationCount],
              ['Bookings', value.bookingCount],
              ['Booked', money(value.totalBookedValue)],
              ['Paid', money(value.totalPaid)],
              ['Outstanding', money(value.totalOutstanding)],
            ].map(([label, metric]) => (
              <div key={label}>
                <p className="text-lg font-semibold">{metric}</p>
                <p className="text-xs uppercase tracking-wide text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t px-3">
          {tabs
            .filter(
              (tab) => tab !== 'documents' || hasPermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
            )
            .filter(
              (tab) => tab !== 'payments' || hasPermission(PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS),
            )
            .filter((tab) => tab !== 'merge' || hasPermission(PERMISSIONS.CUSTOMERS_MERGE))
            .map((tab) => (
              <button
                key={tab}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${active === tab ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
                onClick={() => setActive(tab)}
              >
                {labelForLookup(tab)}
              </button>
            ))}
        </nav>
      </section>

      {active === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Profile</h2>
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              {[
                ['Status', labelForLookup(value.status)],
                ['Assigned agent', value.assignedTo?.fullName ?? 'Unassigned'],
                ['Company', value.companyName ?? '—'],
                [
                  'Date of birth',
                  value.dateOfBirth ? new Date(value.dateOfBirth).toLocaleDateString() : '—',
                ],
                ['Travel preferences', value.travelPreferences ?? '—'],
                ['Dietary requirements', value.dietaryRequirements ?? '—'],
                ['Special requirements', value.specialRequirements ?? '—'],
                [
                  'Last interaction',
                  value.lastInteractionAt
                    ? new Date(value.lastInteractionAt).toLocaleString()
                    : '—',
                ],
              ].map(([label, detail]) => (
                <div key={label}>
                  <dt className="text-xs uppercase text-slate-500">{label}</dt>
                  <dd className="mt-1 font-medium">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className={card}>
            <h2 className="font-semibold">Tags</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {value.tags.length ? (
                value.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full px-3 py-1 text-xs text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No tags assigned.</span>
              )}
            </div>
            <h2 className="mt-6 font-semibold">Addresses</h2>
            <div className="mt-3 space-y-2">
              {value.addresses.length ? (
                value.addresses.map((address) => (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm" key={address.id}>
                    <p className="font-medium">
                      {labelForLookup(address.type)}
                      {address.isPrimary ? ' · Primary' : ''}
                    </p>
                    <p>
                      {address.line1}, {address.city}, {address.country}
                    </p>
                  </div>
                ))
              ) : (
                <span className="text-sm text-slate-500">No address recorded.</span>
              )}
            </div>
          </section>
          <section className={`${card} lg:col-span-3`}>
            <h2 className="font-semibold">Relationship highlights</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {[
                [
                  'Latest lead',
                  value.latestLead?.queryNumber ?? 'No lead',
                  value.latestLead ? `/queries/${value.latestLead.id}` : null,
                ],
                [
                  'Latest quotation',
                  value.latestQuotation?.quotationNumber ?? 'No quotation',
                  value.latestQuotation ? `/quotations/${value.latestQuotation.id}` : null,
                ],
                [
                  'Latest booking',
                  value.latestBooking?.bookingNumber ?? 'No booking',
                  value.latestBooking ? `/bookings/${value.latestBooking.id}` : null,
                ],
                [
                  'Upcoming travel',
                  value.upcomingTravel?.destinationSummary ?? 'Nothing scheduled',
                  value.upcomingTravel ? `/bookings/${value.upcomingTravel.id}` : null,
                ],
              ].map(([label, detail, href]) => (
                <div className="rounded-lg bg-slate-50 p-3" key={label}>
                  <p className="text-xs uppercase text-slate-500">{label}</p>
                  {href ? (
                    <Link className="mt-1 block font-medium text-brand-700" to={href}>
                      {detail}
                    </Link>
                  ) : (
                    <p className="mt-1 font-medium">{detail}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {active === 'timeline' && (
        <section className={card}>
          <h2 className="font-semibold">Unified timeline</h2>
          <div className="mt-4 divide-y">
            {timeline.data?.data.map((item, index) => (
              <div className="flex gap-4 py-3" key={`${item.type}-${index}`}>
                <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
                <div>
                  <p className="text-sm font-medium">{labelForLookup(item.type)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(item.occurredAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {active === 'leads' && <Relationships id={customerId} type="leads" />}
      {active === 'quotations' && <Relationships id={customerId} type="quotations" />}
      {active === 'bookings' && <Relationships id={customerId} type="bookings" />}
      {active === 'travellers' && <Relationships id={customerId} type="travellers" />}
      {active === 'payments' && <Relationships id={customerId} type="payments" />}
      {active === 'notes' && (
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Notes</h2>
          </div>
          {hasPermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES) && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (note.trim())
                  addNote.mutate({ type: 'GENERAL', content: note, isPinned: false });
                setNote('');
              }}
            >
              <input
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
                placeholder="Add a customer note…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button type="submit">
                <MessageSquarePlus className="h-4 w-4" />
                Add
              </Button>
            </form>
          )}
          <div className="mt-4 divide-y">
            {notes.data?.map((item) => (
              <article className="py-3 text-sm" key={String(item.id)}>
                <p>{String(item.content)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {labelForLookup(String(item.type))} ·{' '}
                  {new Date(String(item.createdAt)).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
      {active === 'communications' && (
        <section className={card}>
          <h2 className="font-semibold">Communication history</h2>
          {hasPermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES) && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (communication.trim())
                  addCommunication.mutate({
                    type: 'PHONE',
                    direction: 'OUTBOUND',
                    summary: communication,
                    occurredAt: new Date(),
                  });
                setCommunication('');
              }}
            >
              <input
                className="flex-1 rounded-lg border px-3 py-2 text-sm"
                placeholder="Record an outbound call…"
                value={communication}
                onChange={(event) => setCommunication(event.target.value)}
              />
              <Button type="submit">Record</Button>
            </form>
          )}
          <div className="mt-4 divide-y">
            {communications.data?.map((item) => (
              <article className="py-3 text-sm" key={String(item.id)}>
                <p>{String(item.summary)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {labelForLookup(String(item.type))} · {labelForLookup(String(item.direction))} ·{' '}
                  {new Date(String(item.occurredAt)).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
      {active === 'documents' && (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Customer and linked booking documents</h2>
            <div className="flex items-center gap-2">
              <select
                aria-label="Customer document type"
                className="rounded-lg border px-3 py-2 text-sm"
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value as (typeof CUSTOMER_DOCUMENT_TYPES)[number])
                }
              >
                {CUSTOMER_DOCUMENT_TYPES.filter(
                  (type) => !['PASSPORT', 'VISA', 'PAN_CARD', 'PROFILE_PHOTO'].includes(type),
                ).map((type) => (
                  <option key={type} value={type}>
                    {labelForLookup(type)}
                  </option>
                ))}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                <Upload className="h-4 w-4" />
                {uploadingDocument ? 'Uploading…' : 'Upload'}
                <input
                  className="sr-only"
                  disabled={uploadingDocument}
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setUploadingDocument(true);
                    void uploadCustomerDocument(customerId, file, documentType)
                      .then(() => documents.refetch())
                      .finally(() => setUploadingDocument(false));
                  }}
                />
              </label>
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Private objects are served through short-lived signed URLs.
          </p>
          <div className="mt-4 divide-y">
            {documents.data?.length ? (
              documents.data.map((item) => (
                <div
                  className="flex items-center justify-between py-3 text-sm"
                  key={String(item.id)}
                >
                  <div>
                    <p className="font-medium">{String(item.name)}</p>
                    <p className="text-xs text-slate-500">
                      {labelForLookup(String(item.type))} · {labelForLookup(String(item.status))} ·{' '}
                      {labelForLookup(String(item.source))}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-slate-500">No customer documents uploaded.</p>
            )}
          </div>
        </section>
      )}
      {active === 'merge' && (
        <section className={card}>
          <h2 className="font-semibold">Merge duplicate profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            This customer becomes the source and is archived after all relationships move
            transactionally to the target.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <select
              aria-label="Merge target"
              className="min-w-72 rounded-lg border px-3 py-2 text-sm"
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setPreview(null);
              }}
            >
              <option value="">Choose target customer</option>
              {candidates.data?.data
                .filter((item) => item.id !== customerId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.customerNumber} · {item.displayName}
                  </option>
                ))}
            </select>
            <Button
              disabled={!targetId || merge.isPending}
              variant="secondary"
              onClick={() => submitMerge(true)}
            >
              Preview merge
            </Button>
          </div>
          {preview && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h3 className="font-semibold text-amber-900">Merge preview ready</h3>
              <pre className="mt-2 max-h-64 overflow-auto text-xs">
                {JSON.stringify(preview, null, 2)}
              </pre>
              <Button
                className="mt-3"
                disabled={merge.isPending}
                onClick={() => submitMerge(false)}
              >
                Confirm transactional merge
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
