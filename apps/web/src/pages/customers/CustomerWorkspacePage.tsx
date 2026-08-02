import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Banknote,
  BarChart3,
  Edit3,
  Eye,
  IndianRupee,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  Plane,
  Plus,
  Upload,
  UserCircle,
} from 'lucide-react';
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
const moneyDetailed = (value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value));
const card = 'rounded-xl border bg-card p-5 shadow-sm';

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
  const bookingHistory = useCustomerRelationships(customerId, 'bookings');
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
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Customer Details</h1>
      </header>

      {active === 'overview' && (
        <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className="overflow-hidden rounded-md border-t-4 border-blue-600 bg-card shadow-sm">
              <div className="p-5 text-center">
                <UserCircle className="mx-auto h-24 w-24 text-slate-500" strokeWidth={1.7} />
                <h2 className="mt-2 text-xl font-bold uppercase">{value.displayName}</h2>
                <p className="mt-2 text-slate-500">{value.customerNumber}</p>
              </div>
              <dl className="divide-y px-5 text-sm">
                {[
                  ['Customer Type', labelForLookup(value.type) || 'N/A'],
                  ['Loyalty Tier', value.isVip ? 'VIP' : 'N/A'],
                  ['Status', labelForLookup(value.status) || 'N/A'],
                  ['Total Bookings', value.bookingCount],
                  ['Total Spent', moneyDetailed(value.totalBookedValue)],
                ].map(([label, detail]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-4">
                    <dt className="font-semibold">{label}</dt>
                    <dd className="text-right font-medium text-blue-600">{detail}</dd>
                  </div>
                ))}
              </dl>
              {hasPermission(PERMISSIONS.CUSTOMERS_UPDATE) && (
                <div className="grid grid-cols-2 gap-3 p-5">
                  <Link to={`/customers/${customerId}/edit`}>
                    <Button fullWidth className="rounded-md bg-blue-600 hover:bg-blue-700">
                      <Edit3 className="h-4 w-4" /> Edit
                    </Button>
                  </Link>
                  <Button
                    fullWidth
                    className="rounded-md bg-cyan-600 hover:bg-cyan-700"
                    onClick={() => setActive('communications')}
                  >
                    <MessageCircle className="h-4 w-4" /> Contact
                  </Button>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-md border bg-card shadow-sm">
              <div className="bg-blue-600 px-5 py-4 text-white">
                <h2 className="text-lg font-medium">Contact Information</h2>
              </div>
              <div className="divide-y px-5 text-sm">
                <div className="py-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <Phone className="h-4 w-4" /> Phone
                  </p>
                  <p className="mt-1 text-slate-500">{value.primaryPhone || 'Not set'}</p>
                </div>
                {value.email && (
                  <div className="py-4">
                    <p className="flex items-center gap-2 font-semibold">
                      <Mail className="h-4 w-4" /> Email
                    </p>
                    <p className="mt-1 break-all text-slate-500">{value.email}</p>
                  </div>
                )}
                <div className="py-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <MessageCircle className="h-4 w-4" /> Communication Preference
                  </p>
                  <p className="mt-1 text-slate-500">
                    {value.preferredContactMethod
                      ? labelForLookup(value.preferredContactMethod)
                      : 'Not set'}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['Total Bookings', value.bookingCount, Plane, 'bg-cyan-600'],
                ['Total Spent', money(value.totalBookedValue), IndianRupee, 'bg-green-600'],
                [
                  'Avg. Booking',
                  moneyDetailed(
                    String(Number(value.totalBookedValue ?? 0) / Math.max(value.bookingCount, 1)),
                  ),
                  BarChart3,
                  'bg-amber-400',
                ],
                ['Total Paid', money(value.totalPaid), Banknote, 'bg-rose-500'],
              ] as const).map(([label, metric, Icon, iconStyle]) => {
                const MetricIcon = Icon as typeof Plane;
                return (
                  <article
                    key={String(label)}
                    className="flex min-h-24 items-center gap-3 rounded-md border bg-card p-3 shadow-sm"
                  >
                    <span
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded text-white ${iconStyle}`}
                    >
                      <MetricIcon className="h-8 w-8" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="mt-2 truncate font-bold">{metric}</p>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="overflow-hidden rounded-md border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                <h2 className="text-lg font-medium">Booking History</h2>
                <Link to={`/queries/new?customerId=${customerId}`}>
                  <Button className="rounded-md bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4" /> Create Lead
                  </Button>
                </Link>
              </div>
              <div className="overflow-x-auto p-5">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 font-semibold">
                    <tr>
                      {[
                        'Booking Code',
                        'Title',
                        'Travel Date',
                        'Amount',
                        'Status',
                        'Payment',
                        'Actions',
                      ].map((heading) => (
                        <th key={heading} className="border px-3 py-3">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(bookingHistory.data) && bookingHistory.data.length ? (
                      bookingHistory.data.map((booking) => {
                        const bookingId = String(booking.id ?? '');
                        const bookingNumber = String(booking.bookingNumber ?? bookingId);
                        const status = String(booking.bookingStatus ?? booking.status ?? 'N/A');
                        const payment = String(
                          booking.paymentStatus ?? booking.paymentSummary ?? 'N/A',
                        );
                        return (
                          <tr key={bookingId} className="bg-slate-50/70">
                            <td className="border px-3 py-4 font-medium">{bookingNumber}</td>
                            <td className="border px-3 py-4 font-medium">
                              {String(
                                booking.title ??
                                  booking.destinationSummary ??
                                  `${value.displayName} booking`,
                              )}
                            </td>
                            <td className="whitespace-nowrap border px-3 py-4">
                              {booking.travelStartDate
                                ? new Date(String(booking.travelStartDate)).toLocaleDateString(
                                    'en-US',
                                    { month: 'short', day: '2-digit', year: 'numeric' },
                                  )
                                : '—'}
                            </td>
                            <td className="whitespace-nowrap border px-3 py-4">
                              {money(
                                String(
                                  booking.totalAmount ??
                                    booking.totalBookingValue ??
                                    booking.amount ??
                                    0,
                                ),
                              )}
                            </td>
                            <td className="border px-3 py-4">
                              <span className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                                {labelForLookup(status)}
                              </span>
                            </td>
                            <td className="border px-3 py-4">
                              <span className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white">
                                {labelForLookup(payment)}
                              </span>
                            </td>
                            <td className="border px-3 py-4">
                              <Link
                                aria-label={`View ${bookingNumber}`}
                                to={`/bookings/${bookingId}`}
                                className="inline-flex rounded bg-cyan-600 p-2 text-white hover:bg-cyan-700"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="border px-4 py-8 text-center text-slate-500">
                          No bookings linked to this customer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-md border bg-card shadow-sm">
        <nav className="flex overflow-x-auto px-3">
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
