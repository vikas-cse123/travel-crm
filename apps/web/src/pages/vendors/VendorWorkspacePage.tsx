import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Edit3, Mail, MapPin, Phone, Star } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  labelForLookup,
  PAYMENT_METHODS,
  PERMISSIONS,
  VENDOR_NOTE_TYPES,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveVendorDocument,
  confirmVendorDocument,
  useCreateVendorContact,
  useCreateVendorNote,
  useCreateVendorPayable,
  useCreateVendorPayment,
  useVendor,
  useVendorAction,
  useVendorResource,
  useVendorTimeline,
  vendorKeys,
} from '@/features/vendors/vendors.api';

type Tab =
  | 'overview'
  | 'services'
  | 'bookings'
  | 'payables'
  | 'payments'
  | 'contacts'
  | 'documents'
  | 'notes'
  | 'timeline';
const tabs: Tab[] = [
  'overview',
  'services',
  'bookings',
  'payables',
  'payments',
  'contacts',
  'documents',
  'notes',
  'timeline',
];
const card = 'rounded-xl border bg-white p-5 shadow-sm';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const money = (value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(value));
const text = (value: unknown, fallback = '—') =>
  value === null || value === undefined || value === '' ? fallback : String(value);
const date = (value: unknown) => (value ? new Date(String(value)).toLocaleDateString() : '—');

export function VendorWorkspacePage() {
  const { vendorId = '' } = useParams();
  const { hasPermission } = useAuth();
  const [active, setActive] = useState<Tab>('overview');
  const vendor = useVendor(vendorId);
  const action = useVendorAction(vendorId);
  const client = useQueryClient();
  const financial = hasPermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS);
  const contacts = useVendorResource(vendorId, 'contacts');
  const payables = useVendorResource(vendorId, 'payables', financial);
  const payments = useVendorResource(vendorId, 'payments', financial);
  const bookings = useVendorResource(vendorId, 'bookings');
  const documents = useVendorResource(vendorId, 'documents');
  const notes = useVendorResource(vendorId, 'notes');
  const bankAccounts = useVendorResource(vendorId, 'bank-accounts', financial);
  const timeline = useVendorTimeline(vendorId);
  const addContact = useCreateVendorContact(vendorId);
  const addNote = useCreateVendorNote(vendorId);
  const addPayable = useCreateVendorPayable(vendorId);
  const addPayment = useCreateVendorPayment(vendorId);
  const [contact, setContact] = useState({ name: '', designation: '', phone: '', email: '' });
  const [note, setNote] = useState({ noteType: 'GENERAL', content: '', isPinned: false });
  const [payable, setPayable] = useState({
    bookingId: '',
    description: '',
    originalAmount: '',
    dueDate: '',
  });
  const [payment, setPayment] = useState({
    payableId: '',
    amount: '',
    paymentMethod: 'BANK_TRANSFER',
    referenceNumber: '',
  });
  const [bank, setBank] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  if (vendor.isError) return <Navigate to="/vendors" replace />;
  if (!vendor.data) return <div className="h-96 animate-pulse rounded-xl bg-slate-100" />;
  const value = vendor.data;
  const availableTabs = tabs.filter((tab) => financial || !['payables', 'payments'].includes(tab));
  const upload = async (file: File) => {
    setUploading(true);
    setUploadError('');
    try {
      const approved = await approveVendorDocument(vendorId, {
        documentType: 'RATE_CONTRACT',
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });
      if (approved.uploadUrl.startsWith('memory://'))
        throw new Error(
          'Local memory storage has no browser upload transport. Use S3 mode or the automated storage test.',
        );
      const response = await fetch(approved.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!response.ok) throw new Error('The private upload failed.');
      await confirmVendorDocument(vendorId, approved.document.id);
      void client.invalidateQueries({ queryKey: [...vendorKeys.one(vendorId), 'documents'] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 to-brand-900 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-white/10 p-3">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-brand-200">
                  {value.vendorCode} · {labelForLookup(value.vendorType)}
                </p>
                <h1 className="text-2xl font-semibold">{value.name}</h1>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white/10 px-2 py-1">
                    {labelForLookup(value.contractType)}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-1">
                    {labelForLookup(value.paymentTerm)}
                  </span>
                  <span className="rounded-full bg-emerald-500/30 px-2 py-1">
                    {labelForLookup(value.status)}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-1">
                    <Star className="h-3 w-3" /> {Number(value.rating ?? 0).toFixed(1)} / 5
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {hasPermission(PERMISSIONS.VENDORS_MANAGE_SERVICES) && (
                <Link to={`/vendors/${vendorId}/services`}>
                  <Button variant="secondary">Manage services</Button>
                </Link>
              )}
              {hasPermission(PERMISSIONS.VENDORS_UPDATE) && (
                <Link to={`/vendors/${vendorId}/edit`}>
                  <Button variant="secondary">
                    <Edit3 className="h-4 w-4" /> Edit
                  </Button>
                </Link>
              )}
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-white/20 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Total bookings', value.totalBookings],
              ...(financial
                ? [
                    ['Total costs', money(value.totalBusiness)],
                    ['Average booking', money(value.averageBookingCost)],
                  ]
                : []),
              ['Confirmation', `${Number(value.confirmationRate ?? 0).toFixed(1)}%`],
            ].map(([label, metric]) => (
              <div key={String(label)}>
                <p className="text-lg font-semibold">{metric}</p>
                <p className="text-xs uppercase tracking-wide text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t px-3">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${active === tab ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
            >
              {labelForLookup(tab)}
            </button>
          ))}
        </nav>
      </section>

      {active === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Contact information</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[
                [Phone, 'Contact person', value.contactPerson],
                [Phone, 'Phone', value.primaryPhone],
                [Mail, 'Email', value.primaryEmail],
                [
                  MapPin,
                  'Address',
                  [value.address, value.city, value.state, value.country]
                    .filter(Boolean)
                    .join(', '),
                ],
              ].map(([Icon, label, detail]) => {
                const C = Icon as typeof Phone;
                return (
                  <div key={String(label)} className="flex gap-3">
                    <C className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-xs uppercase text-slate-500">{String(label)}</p>
                      <p className="font-medium">{text(detail)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <h2 className="mt-6 font-semibold">Coverage and capabilities</h2>
            <dl className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-slate-500">Coverage areas</dt>
                <dd className="mt-1">{text(value.coverageAreas)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Services offered</dt>
                <dd className="mt-1">{text(value.servicesOffered)}</dd>
              </div>
            </dl>
          </section>
          <section className={card}>
            <h2 className="font-semibold">Service analytics</h2>
            <div className="mt-4 space-y-3">
              {[
                ['Total services', value.services.length],
                ['Booking usage', `${value.totalBookings} bookings`],
                ['Confirmation rate', `${Number(value.confirmationRate).toFixed(1)}%`],
                ...(financial
                  ? [
                      ['Outstanding', money(value.totalOutstanding)],
                      ['Total paid', money(value.totalPaid)],
                    ]
                  : []),
              ].map(([label, detail]) => (
                <div key={String(label)} className="flex justify-between border-b pb-2 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <strong>{detail}</strong>
                </div>
              ))}
            </div>
          </section>
          {financial && (
            <section className={`${card} lg:col-span-3`}>
              <h2 className="font-semibold">Profit analytics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xl font-semibold">{money(value.totalBusiness)}</p>
                  <p className="text-xs text-slate-500">Total vendor costs</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xl font-semibold">{money(value.averageBookingCost)}</p>
                  <p className="text-xs text-slate-500">Average cost per booking</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xl font-semibold">
                    {Number(value.confirmationRate).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500">Confirmation rate</p>
                </div>
              </div>
            </section>
          )}
          <section className={`${card} lg:col-span-3`}>
            <h2 className="font-semibold">Recent booking services</h2>
            <DataTable
              rows={value.recentBookingServices ?? []}
              columns={[
                'booking',
                'serviceType',
                'startDate',
                'internalCostSnapshot',
                'confirmationStatus',
                'createdAt',
              ]}
            />
          </section>
          {financial && (
            <section className={`${card} lg:col-span-3`}>
              <h2 className="font-semibold">Recent supplier payments</h2>
              <DataTable
                rows={value.recentPayments ?? []}
                columns={['paidAt', 'paymentNumber', 'amount', 'paymentMethod', 'paymentStatus']}
              />
            </section>
          )}
        </div>
      )}

      {active === 'services' && (
        <section className={card}>
          <div className="flex justify-between">
            <div>
              <h2 className="font-semibold">Structured services and rates</h2>
              <p className="text-sm text-slate-500">
                Current catalogue; historical bookings retain snapshots.
              </p>
            </div>
            <Link to={`/vendors/${vendorId}/services`}>
              <Button variant="secondary">Open service manager</Button>
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {value.services.length ? (
              value.services.map((s) => (
                <div key={s.id} className="rounded-lg border p-4">
                  <div className="flex justify-between">
                    <strong>{s.name}</strong>
                    <span className="text-xs">{labelForLookup(s.status)}</span>
                  </div>
                  <p className="text-xs text-brand-700">
                    {labelForLookup(s.serviceType)} · {s.city ?? s.destination ?? 'Any coverage'}
                  </p>
                  <p className="mt-2 text-sm">
                    {s.rates.length} rate(s){financial ? ` · ${money(s.baseCost)} base cost` : ''}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No services configured.</p>
            )}
          </div>
        </section>
      )}
      {active === 'bookings' && (
        <section className={card}>
          <h2 className="font-semibold">Vendor-linked bookings</h2>
          <DataTable
            rows={bookings.data ?? []}
            columns={[
              'bookingNumber',
              'customerName',
              'destinationSummary',
              'travelStartDate',
              'bookingStatus',
              'createdAt',
            ]}
          />
        </section>
      )}
      {active === 'contacts' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Contacts</h2>
            <DataTable
              rows={contacts.data ?? []}
              columns={['name', 'designation', 'phone', 'email', 'isPrimary']}
            />
          </section>
          {hasPermission(PERMISSIONS.VENDORS_MANAGE_CONTACTS) && (
            <section className={card}>
              <h2 className="font-semibold">Add contact</h2>
              <div className="mt-3 space-y-3">
                <input
                  className={field}
                  placeholder="Name"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                />
                <input
                  className={field}
                  placeholder="Designation"
                  value={contact.designation}
                  onChange={(e) => setContact({ ...contact, designation: e.target.value })}
                />
                <input
                  className={field}
                  placeholder="Phone"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                />
                <input
                  className={field}
                  placeholder="Email"
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                />
                <Button
                  disabled={!contact.name || addContact.isPending}
                  onClick={() => {
                    addContact.mutate({
                      name: contact.name,
                      designation: contact.designation || null,
                      phone: contact.phone || null,
                      email: contact.email || null,
                      isPrimary: false,
                    });
                    setContact({ name: '', designation: '', phone: '', email: '' });
                  }}
                >
                  Add contact
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
      {active === 'notes' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Internal notes</h2>
            <div className="mt-4 space-y-3">
              {notes.data?.length ? (
                notes.data.map((row) => (
                  <article key={String(row.id)} className="rounded-lg border p-4">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>
                        {labelForLookup(String(row.noteType))}
                        {row.isPinned ? ' · Pinned' : ''}
                      </span>
                      <span>{date(row.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm">{text(row.content)}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">No notes yet.</p>
              )}
            </div>
          </section>
          {hasPermission(PERMISSIONS.VENDORS_UPDATE) && (
            <section className={card}>
              <h2 className="font-semibold">Add note</h2>
              <select
                className={`${field} mt-3`}
                value={note.noteType}
                onChange={(e) => setNote({ ...note, noteType: e.target.value })}
              >
                {VENDOR_NOTE_TYPES.filter((v) => financial || v !== 'PAYMENT').map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
              <textarea
                className={`${field} mt-3 min-h-28`}
                value={note.content}
                onChange={(e) => setNote({ ...note, content: e.target.value })}
              />
              <label className="mt-3 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={note.isPinned}
                  onChange={(e) => setNote({ ...note, isPinned: e.target.checked })}
                />
                Pin note
              </label>
              <Button
                className="mt-3"
                disabled={!note.content || addNote.isPending}
                onClick={() => {
                  addNote.mutate(note as Parameters<typeof addNote.mutate>[0]);
                  setNote({ noteType: 'GENERAL', content: '', isPinned: false });
                }}
              >
                Add note
              </Button>
            </section>
          )}
        </div>
      )}
      {active === 'payables' && financial && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Supplier payables</h2>
            <DataTable
              rows={payables.data ?? []}
              columns={[
                'payableNumber',
                'booking',
                'description',
                'originalAmount',
                'paidAmount',
                'outstandingAmount',
                'dueDate',
                'paymentStatus',
              ]}
            />
          </section>
          {hasPermission(PERMISSIONS.VENDORS_MANAGE_PAYABLES) && (
            <section className={card}>
              <h2 className="font-semibold">Create payable</h2>
              <div className="mt-3 space-y-3">
                <select
                  className={field}
                  value={payable.bookingId}
                  onChange={(e) => setPayable({ ...payable, bookingId: e.target.value })}
                >
                  <option value="">Select booking</option>
                  {bookings.data?.map((b) => (
                    <option key={String(b.id)} value={String(b.id)}>
                      {text(b.bookingNumber)} · {text(b.customerName)}
                    </option>
                  ))}
                </select>
                <input
                  className={field}
                  placeholder="Description"
                  value={payable.description}
                  onChange={(e) => setPayable({ ...payable, description: e.target.value })}
                />
                <input
                  className={field}
                  min="0"
                  type="number"
                  placeholder="Amount"
                  value={payable.originalAmount}
                  onChange={(e) => setPayable({ ...payable, originalAmount: e.target.value })}
                />
                <input
                  className={field}
                  type="date"
                  value={payable.dueDate}
                  onChange={(e) => setPayable({ ...payable, dueDate: e.target.value })}
                />
                <Button
                  disabled={
                    !payable.bookingId ||
                    !payable.description ||
                    !payable.originalAmount ||
                    addPayable.isPending
                  }
                  onClick={() => {
                    addPayable.mutate({
                      bookingId: payable.bookingId,
                      description: payable.description,
                      currency: 'INR',
                      originalAmount: Number(payable.originalAmount),
                      dueDate: payable.dueDate ? new Date(payable.dueDate) : null,
                    });
                    setPayable({ bookingId: '', description: '', originalAmount: '', dueDate: '' });
                  }}
                >
                  Create payable
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
      {active === 'payments' && financial && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Supplier payments</h2>
            <div className="mt-4">
              <DataTable
                rows={payments.data ?? []}
                columns={[
                  'paymentNumber',
                  'paidAt',
                  'amount',
                  'paymentMethod',
                  'referenceNumber',
                  'paymentStatus',
                ]}
              />
              {hasPermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS) &&
                payments.data
                  ?.filter((p) => !p.reversedAt)
                  .map((p) => (
                    <Button
                      key={String(p.id)}
                      variant="secondary"
                      className="mr-2 mt-3"
                      onClick={() => {
                        const reason = window.prompt('Reason for reversing this payment?');
                        if (reason && reason.length >= 3)
                          action.mutate({
                            path: `payments/${String(p.id)}/reverse`,
                            body: { reason },
                          });
                      }}
                    >
                      Reverse {text(p.paymentNumber)}
                    </Button>
                  ))}
            </div>
          </section>
          {hasPermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS) && (
            <section className={card}>
              <h2 className="font-semibold">Record payment</h2>
              <div className="mt-3 space-y-3">
                <select
                  className={field}
                  value={payment.payableId}
                  onChange={(e) => {
                    const row = payables.data?.find((p) => p.id === e.target.value);
                    setPayment({
                      ...payment,
                      payableId: e.target.value,
                      amount: row ? String(row.outstandingAmount) : '',
                    });
                  }}
                >
                  <option value="">Select outstanding payable</option>
                  {payables.data
                    ?.filter((p) => Number(p.outstandingAmount) > 0)
                    .map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {text(p.payableNumber)} · {money(String(p.outstandingAmount))}
                      </option>
                    ))}
                </select>
                <input
                  className={field}
                  min="0"
                  type="number"
                  placeholder="Amount"
                  value={payment.amount}
                  onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                />
                <select
                  className={field}
                  value={payment.paymentMethod}
                  onChange={(e) => setPayment({ ...payment, paymentMethod: e.target.value })}
                >
                  {PAYMENT_METHODS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <input
                  className={field}
                  placeholder="Reference number"
                  value={payment.referenceNumber}
                  onChange={(e) => setPayment({ ...payment, referenceNumber: e.target.value })}
                />
                <Button
                  disabled={!payment.payableId || !payment.amount || addPayment.isPending}
                  onClick={() => {
                    addPayment.mutate({
                      amount: Number(payment.amount),
                      currency: 'INR',
                      paymentMethod: payment.paymentMethod as Parameters<
                        typeof addPayment.mutate
                      >[0]['paymentMethod'],
                      paidAt: new Date(),
                      referenceNumber: payment.referenceNumber || null,
                      allocations: [
                        { payableId: payment.payableId, amount: Number(payment.amount) },
                      ],
                    });
                    setPayment({
                      payableId: '',
                      amount: '',
                      paymentMethod: 'BANK_TRANSFER',
                      referenceNumber: '',
                    });
                  }}
                >
                  Record payment
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
      {active === 'documents' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="font-semibold">Private vendor documents</h2>
            <DataTable
              rows={documents.data ?? []}
              columns={[
                'documentType',
                'fileName',
                'mimeType',
                'fileSize',
                'uploadStatus',
                'createdAt',
              ]}
            />
          </section>
          {hasPermission(PERMISSIONS.VENDORS_MANAGE_DOCUMENTS) && (
            <section className={card}>
              <h2 className="font-semibold">Upload document</h2>
              <p className="mt-1 text-xs text-slate-500">
                PDF, JPEG, PNG, WebP, CSV or XLSX up to 15 MB. Objects stay private.
              </p>
              <label className="mt-4 block rounded-lg border border-dashed p-5 text-center text-sm">
                <input
                  className="sr-only"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
                {uploading ? 'Uploading…' : 'Choose rate contract or supplier document'}
              </label>
              {uploadError && <p className="mt-2 text-xs text-amber-700">{uploadError}</p>}
            </section>
          )}
        </div>
      )}
      {active === 'timeline' && (
        <section className={card}>
          <h2 className="font-semibold">Vendor timeline</h2>
          <div className="mt-4 space-y-3">
            {timeline.data?.data.map((row) => (
              <div key={String(row.id)} className="flex gap-3 border-l-2 border-brand-200 pl-4">
                <div>
                  <p className="font-medium">{text(row.title)}</p>
                  <p className="text-xs text-slate-500">
                    {date(row.timestamp)} ·{' '}
                    {text((row.actor as Record<string, unknown> | null)?.fullName, 'System')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active === 'overview' && financial && (
        <section className={card}>
          <h2 className="font-semibold">Bank accounts</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {bankAccounts.data?.map((row) => (
              <div key={String(row.id)} className="rounded-lg border p-3 text-sm">
                <strong>{text(row.bankName)}</strong>
                <p>
                  {text(row.accountNumber)} · {text(row.ifscCode)}
                </p>
                <p className="text-xs text-slate-500">
                  {text(row.accountHolderName)}
                  {row.isPrimary ? ' · Primary' : ''}
                </p>
              </div>
            ))}
          </div>
          {hasPermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS) && (
            <div className="mt-4 grid gap-2 border-t pt-4 md:grid-cols-5">
              <input
                className={field}
                placeholder="Account holder"
                value={bank.accountHolderName}
                onChange={(e) =>
                  setBank((current) => ({ ...current, accountHolderName: e.target.value }))
                }
              />
              <input
                className={field}
                placeholder="Bank name"
                value={bank.bankName}
                onChange={(e) => setBank((current) => ({ ...current, bankName: e.target.value }))}
              />
              <input
                className={field}
                placeholder="Account number"
                value={bank.accountNumber}
                onChange={(e) =>
                  setBank((current) => ({ ...current, accountNumber: e.target.value }))
                }
              />
              <input
                className={field}
                placeholder="IFSC"
                value={bank.ifscCode}
                onChange={(e) => setBank((current) => ({ ...current, ifscCode: e.target.value }))}
              />
              <Button
                disabled={!bank.accountHolderName || !bank.bankName || !bank.accountNumber}
                onClick={() => {
                  action.mutate(
                    {
                      path: 'bank-accounts',
                      body: {
                        ...bank,
                        ifscCode: bank.ifscCode || null,
                        isPrimary: !bankAccounts.data?.length,
                      },
                    },
                    {
                      onSuccess: () =>
                        setBank({
                          accountHolderName: '',
                          bankName: '',
                          accountNumber: '',
                          ifscCode: '',
                        }),
                    },
                  );
                }}
              >
                Add account
              </Button>
              {action.isError && (
                <p className="text-sm text-red-600 md:col-span-5">
                  The bank account could not be saved. Confirm that data encryption is configured.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DataTable({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: string[] }) {
  if (!rows.length)
    return (
      <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No records yet.</p>
    );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2">
                {labelForLookup(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => {
                const value = row[column];
                const nested =
                  value && typeof value === 'object' && !Array.isArray(value)
                    ? (value as Record<string, unknown>)
                    : null;
                const rendered =
                  column.toLowerCase().includes('date') || column.endsWith('At')
                    ? date(value)
                    : column.toLowerCase().includes('amount') ||
                        column.toLowerCase().includes('cost') ||
                        column.toLowerCase().includes('paid') ||
                        column.toLowerCase().includes('outstanding')
                      ? money(value === undefined ? undefined : String(value))
                      : nested
                        ? text(nested.bookingNumber ?? nested.name ?? nested.id)
                        : text(value);
                return (
                  <td key={column} className="whitespace-nowrap px-3 py-3">
                    {rendered}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
