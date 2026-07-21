import { useState } from 'react';
import { ArrowLeft, Download, FilePlus2, Mail, Plane, Plus, Receipt, UserPlus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  BOOKING_COST_CATEGORIES,
  BOOKING_DOCUMENT_TYPES,
  BOOKING_NOTE_TYPES,
  BOOKING_STATUSES,
  PAYMENT_METHODS,
  PERMISSIONS,
  TRAVELLER_TYPES,
  VISA_STATUSES,
  labelForLookup,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  uploadBookingDocument,
  useBooking,
  useBookingAction,
  useBookingTimeline,
} from '@/features/bookings/bookings.api';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const money = (value: string | undefined, currency = 'INR') =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value));
const tabs = [
  'Overview',
  'Travellers',
  'Services',
  'Itinerary',
  'Payments',
  'Costs',
  'Documents',
  'Notes',
  'Timeline',
  'Emails',
] as const;
const nextBookingStatuses: Record<string, readonly string[]> = {
  PENDING_CONFIRMATION: ['PARTIALLY_CONFIRMED', 'CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  PARTIALLY_CONFIRMED: ['CONFIRMED', 'ON_HOLD', 'CANCELLED'],
  CONFIRMED: ['TRAVEL_IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['PENDING_CONFIRMATION', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'CANCELLED'],
  TRAVEL_IN_PROGRESS: ['COMPLETED'],
  COMPLETED: BOOKING_STATUSES,
  CANCELLED: BOOKING_STATUSES,
  ARCHIVED: BOOKING_STATUSES,
};
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="space-y-1 text-sm">
    <span className="font-medium text-slate-700">{label}</span>
    {children}
  </label>
);

export function BookingWorkspacePage() {
  const { bookingId = '' } = useParams();
  const { hasPermission } = useAuth();
  const query = useBooking(bookingId);
  const action = useBookingAction(bookingId);
  const timeline = useBookingTimeline(bookingId);
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const clear = () => setForm({});
  if (query.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  if (!query.data)
    return <div className="rounded-xl bg-white p-12 text-center">Booking unavailable.</div>;
  const booking = query.data;
  const canFinance = hasPermission(PERMISSIONS.BOOKINGS_VIEW_FINANCIALS);
  const canPay = hasPermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS);
  const canCost = hasPermission(PERMISSIONS.BOOKINGS_MANAGE_COSTS);
  const canTravel = hasPermission(PERMISSIONS.BOOKINGS_MANAGE_TRAVELLERS);
  const canDocs = hasPermission(PERMISSIONS.BOOKINGS_MANAGE_DOCUMENTS);
  const canUpdate = hasPermission(PERMISSIONS.BOOKINGS_UPDATE);
  const terminal = ['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(booking.bookingStatus);
  const totalTravellers =
    booking.adults + booking.childrenWithBed + booking.childrenWithoutBed + booking.infants;
  const mutate = (path: string, body?: unknown, method: 'post' | 'patch' | 'delete' = 'post') =>
    action.mutate(
      { path, body, method },
      {
        onSuccess: () => {
          clear();
          setReversingPaymentId(null);
        },
      },
    );
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/bookings" className="rounded-lg p-2 hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">Bookings / {booking.bookingNumber}</p>
            <h1 className="text-2xl font-semibold">
              {booking.customerName} · {booking.destinationSummary}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canTravel && !terminal && (
            <Button variant="secondary" onClick={() => setTab('Travellers')}>
              <UserPlus className="h-4 w-4" />
              Add traveller
            </Button>
          )}
          {canPay && !terminal && (
            <Button variant="secondary" onClick={() => setTab('Payments')}>
              <Receipt className="h-4 w-4" />
              Record payment
            </Button>
          )}
          {canDocs && !terminal && (
            <Button variant="secondary" onClick={() => setTab('Documents')}>
              <FilePlus2 className="h-4 w-4" />
              Upload document
            </Button>
          )}
          {hasPermission(PERMISSIONS.BOOKINGS_CHANGE_STATUS) && (
            <Button onClick={() => setTab('Overview')}>Change status</Button>
          )}
        </div>
      </header>
      {booking.attentionIndicators.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Operational attention</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {booking.attentionIndicators.map((indicator) => (
              <span
                key={indicator}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-800"
              >
                {labelForLookup(indicator)}
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Booking status', labelForLookup(booking.bookingStatus)],
          ['Operations', labelForLookup(booking.operationalStatus)],
          ['Payment', labelForLookup(booking.paymentStatus)],
          [
            'Departure',
            booking.travelStartDate
              ? new Date(booking.travelStartDate).toLocaleDateString()
              : 'Open',
          ],
          ['Travellers', `${booking.travellers.length}/${totalTravellers}`],
          ['Assigned', booking.assignedTo?.fullName ?? 'Unassigned'],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-2 font-semibold">{value}</p>
          </article>
        ))}
      </section>
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1"
        aria-label="Booking workspace sections"
      >
        {tabs
          .filter((name) => name !== 'Costs' || canFinance)
          .map((name) => (
            <button
              key={name}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tab === name ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
      </nav>
      {action.isError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{action.error.message}</div>
      )}

      {tab === 'Overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Booking overview</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Customer email', booking.customerEmail ?? '—'],
                ['Customer phone', booking.customerPhone],
                [
                  'Travel dates',
                  `${booking.travelStartDate ? new Date(booking.travelStartDate).toLocaleDateString() : 'Open'} – ${booking.travelEndDate ? new Date(booking.travelEndDate).toLocaleDateString() : 'Open'}`,
                ],
                ['Source lead', booking.query?.queryNumber ?? 'Manual'],
                ['Source quotation', booking.quotation?.quotationNumber ?? 'Manual'],
                [
                  'Accepted version',
                  booking.quotationVersion ? `v${booking.quotationVersion.versionNumber}` : 'None',
                ],
                ['Booked by', booking.bookedBy.fullName],
                ['Created', new Date(booking.createdAt).toLocaleString()],
                ['Updated', new Date(booking.updatedAt).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">Status workflow</h2>
            {hasPermission(PERMISSIONS.BOOKINGS_CHANGE_STATUS) ? (
              <div className="mt-4 space-y-3">
                <select
                  className={input}
                  value={form.status ?? ''}
                  onChange={(event) => set('status', event.target.value)}
                >
                  <option value="">Select next status</option>
                  {(nextBookingStatuses[booking.bookingStatus] ?? [])
                    .filter((status) => status !== booking.bookingStatus && status !== 'ARCHIVED')
                    .map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                </select>
                <textarea
                  className={input}
                  placeholder="Reason (required for cancellation)"
                  value={form.statusReason ?? ''}
                  onChange={(event) => set('statusReason', event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!form.status}
                  onClick={() =>
                    mutate(
                      'status',
                      { status: form.status, reason: form.statusReason || null },
                      'patch',
                    )
                  }
                >
                  Update status
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">You have read-only status access.</p>
            )}
          </section>
          {canFinance && (
            <section className="rounded-xl border bg-slate-950 p-5 text-white lg:col-span-3">
              <h2 className="font-semibold">Financial summary</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Selling', booking.totalSellingAmount],
                  ['Paid', booking.totalCustomerPaid],
                  ['Outstanding', booking.totalCustomerOutstanding],
                  ['Total cost', booking.totalCost],
                  ['Gross profit', booking.grossProfit],
                  ['Margin', `${booking.profitMarginPercentage ?? '0'}%`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs uppercase text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-semibold">
                      {label === 'Margin' ? value : money(value, booking.currency)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'Travellers' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Travellers</h2>
            <div className="mt-4 space-y-3">
              {booking.travellers.length ? (
                booking.travellers.map((traveller) => (
                  <article key={traveller.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <strong>
                          {traveller.title} {traveller.firstName} {traveller.middleName}{' '}
                          {traveller.lastName}
                        </strong>
                        <p className="text-sm text-slate-500">
                          {labelForLookup(traveller.travellerType)} ·{' '}
                          {labelForLookup(traveller.visaStatus)}{' '}
                          {traveller.isPrimaryTraveller ? '· Primary' : ''}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p>Passport {traveller.passportMasked ?? 'not recorded'}</p>
                        <p className="text-slate-500">
                          Expires{' '}
                          {traveller.passportExpiresAt
                            ? new Date(traveller.passportExpiresAt).toLocaleDateString()
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">No traveller names recorded yet.</p>
              )}
            </div>
          </section>
          {canTravel && !terminal && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Add traveller</h2>
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className={input}
                    value={form.travellerType ?? 'ADULT'}
                    onChange={(event) => set('travellerType', event.target.value)}
                  >
                    {TRAVELLER_TYPES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <input
                    className={input}
                    placeholder="Title"
                    value={form.title ?? ''}
                    onChange={(event) => set('title', event.target.value)}
                  />
                </div>
                <input
                  className={input}
                  placeholder="First name"
                  value={form.firstName ?? ''}
                  onChange={(event) => set('firstName', event.target.value)}
                />
                <input
                  className={input}
                  placeholder="Last name"
                  value={form.lastName ?? ''}
                  onChange={(event) => set('lastName', event.target.value)}
                />
                <input
                  className={input}
                  placeholder="Passport number (encrypted)"
                  value={form.passportNumber ?? ''}
                  onChange={(event) => set('passportNumber', event.target.value)}
                />
                <Field label="Passport expiry">
                  <input
                    className={input}
                    type="date"
                    value={form.passportExpiresAt ?? ''}
                    onChange={(event) => set('passportExpiresAt', event.target.value)}
                  />
                </Field>
                <select
                  className={input}
                  value={form.visaStatus ?? 'NOT_STARTED'}
                  onChange={(event) => set('visaStatus', event.target.value)}
                >
                  {VISA_STATUSES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <Button
                  className="w-full"
                  disabled={!form.firstName || !form.lastName || !form.title}
                  onClick={() =>
                    mutate('travellers', {
                      travellerType: form.travellerType || 'ADULT',
                      title: form.title,
                      firstName: form.firstName,
                      lastName: form.lastName,
                      passportNumber: form.passportNumber || null,
                      passportExpiresAt: form.passportExpiresAt || null,
                      visaStatus: form.visaStatus || 'NOT_STARTED',
                      isPrimaryTraveller: booking.travellers.length === 0,
                      sequence: booking.travellers.length + 1,
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add traveller
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'Services' && (
        <section className="rounded-xl border bg-white p-5">
          <div className="flex justify-between">
            <div>
              <h2 className="font-semibold">Booking services</h2>
              <p className="text-sm text-slate-500">
                Supplier confirmations and operational deadlines.
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[850px] w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Service</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Confirmation</th>
                  <th>Supplier</th>
                  {canFinance && <th>Cost snapshot</th>}
                  {canUpdate && <th>Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {booking.services.map((service) => (
                  <tr key={service.id}>
                    <td className="py-3">
                      <strong>{service.name}</strong>
                      <p className="text-xs text-slate-500">
                        {labelForLookup(service.serviceType)}
                      </p>
                    </td>
                    <td>{service.city ?? '—'}</td>
                    <td>{labelForLookup(service.confirmationStatus)}</td>
                    <td>{service.confirmationNumber ?? '—'}</td>
                    <td>{service.supplierName ?? '—'}</td>
                    {canFinance && <td>{money(service.internalCostSnapshot, booking.currency)}</td>}
                    {canUpdate && (
                      <td>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={service.confirmationStatus === 'CONFIRMED'}
                          onClick={() =>
                            mutate(
                              `services/${service.id}/status`,
                              {
                                confirmationStatus: 'CONFIRMED',
                                confirmationNumber:
                                  service.confirmationNumber || `CONF-${service.sequence}`,
                              },
                              'patch',
                            )
                          }
                        >
                          Confirm
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'Itinerary' && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Operational itinerary</h2>
          <div className="mt-4 space-y-4">
            {booking.itinerary.map((day) => (
              <article key={day.id} className="border-l-2 border-brand-300 pl-4">
                <strong>
                  Day {day.dayNumber}: {day.title} — {day.destination}
                </strong>
                <p className="mt-1 text-sm text-slate-600">{day.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'Payments' && (
        <div className="space-y-5">
          {canFinance && (
            <section className="grid gap-3 sm:grid-cols-3">
              {[
                ['Selling', booking.totalSellingAmount],
                ['Paid', booking.totalCustomerPaid],
                ['Outstanding', booking.totalCustomerOutstanding],
              ].map(([label, value]) => (
                <article key={label} className="rounded-xl border bg-white p-4">
                  <p className="text-xs uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{money(value, booking.currency)}</p>
                </article>
              ))}
            </section>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Installment schedule</h2>
              <div className="mt-3 divide-y">
                {booking.paymentSchedules.map((row) => (
                  <article key={row.id} className="flex justify-between py-3">
                    <div>
                      <strong>
                        {row.installmentNumber}. {row.label}
                      </strong>
                      <p className="text-xs text-slate-500">
                        Due {new Date(row.dueDate).toLocaleDateString()} ·{' '}
                        {labelForLookup(row.status)}
                      </p>
                    </div>
                    <strong>{money(row.amount, booking.currency)}</strong>
                  </article>
                ))}
              </div>
              {canPay && !terminal && (
                <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
                  <input
                    className={input}
                    placeholder="Installment label"
                    value={form.scheduleLabel ?? ''}
                    onChange={(event) => set('scheduleLabel', event.target.value)}
                  />
                  <input
                    className={input}
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={form.scheduleAmount ?? ''}
                    onChange={(event) => set('scheduleAmount', event.target.value)}
                  />
                  <input
                    className={input}
                    type="date"
                    value={form.scheduleDue ?? ''}
                    onChange={(event) => set('scheduleDue', event.target.value)}
                  />
                  <Button
                    disabled={!form.scheduleLabel || !form.scheduleAmount || !form.scheduleDue}
                    onClick={() =>
                      mutate('payment-schedules', {
                        installmentNumber: booking.paymentSchedules.length + 1,
                        label: form.scheduleLabel,
                        amount: Number(form.scheduleAmount),
                        dueDate: form.scheduleDue,
                      })
                    }
                  >
                    Add installment
                  </Button>
                </div>
              )}
            </section>
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Received payments</h2>
              {canFinance ? (
                <div className="mt-3 divide-y">
                  {booking.payments.map((payment) => (
                    <article key={payment.id} className="py-3">
                      <div className="flex justify-between">
                        <div>
                          <strong>{payment.paymentNumber}</strong>
                          <p className="text-xs text-slate-500">
                            {labelForLookup(payment.paymentMethod)} ·{' '}
                            {new Date(payment.receivedAt).toLocaleString()} ·{' '}
                            {labelForLookup(payment.paymentStatus)}
                          </p>
                        </div>
                        <strong>{money(payment.amount, payment.currency)}</strong>
                      </div>
                      {canPay && !payment.reversedAt && reversingPaymentId !== payment.id && (
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="danger"
                          onClick={() => setReversingPaymentId(payment.id)}
                        >
                          Reverse
                        </Button>
                      )}
                      {canPay && !payment.reversedAt && reversingPaymentId === payment.id && (
                        <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                          <textarea
                            className={input}
                            placeholder="Payment reversal reason"
                            value={form.reversalReason ?? ''}
                            onChange={(event) => set('reversalReason', event.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={!form.reversalReason?.trim()}
                              onClick={() =>
                                mutate(`payments/${payment.id}/reverse`, {
                                  reason: form.reversalReason,
                                })
                              }
                            >
                              Confirm reversal
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setReversingPaymentId(null);
                                set('reversalReason', '');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Payment details require financial access.
                </p>
              )}
              {canPay && !terminal && (
                <div className="mt-4 grid gap-2 border-t pt-4">
                  <input
                    className={input}
                    type="number"
                    step="0.01"
                    placeholder="Payment amount"
                    value={form.paymentAmount ?? ''}
                    onChange={(event) => set('paymentAmount', event.target.value)}
                  />
                  <select
                    className={input}
                    value={form.paymentMethod ?? 'BANK_TRANSFER'}
                    onChange={(event) => set('paymentMethod', event.target.value)}
                  >
                    {PAYMENT_METHODS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <select
                    className={input}
                    value={form.paymentScheduleId ?? ''}
                    onChange={(event) => set('paymentScheduleId', event.target.value)}
                  >
                    <option value="">Unallocated (notes recommended)</option>
                    {booking.paymentSchedules
                      .filter((row) => row.status !== 'PAID' && row.status !== 'CANCELLED')
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                        </option>
                      ))}
                  </select>
                  <textarea
                    className={input}
                    placeholder="Payment notes (required when unallocated)"
                    value={form.paymentNotes ?? ''}
                    onChange={(event) => set('paymentNotes', event.target.value)}
                  />
                  <Button
                    disabled={
                      !form.paymentAmount || (!form.paymentScheduleId && !form.paymentNotes?.trim())
                    }
                    onClick={() =>
                      mutate('payments', {
                        amount: Number(form.paymentAmount),
                        currency: booking.currency,
                        paymentMethod: form.paymentMethod || 'BANK_TRANSFER',
                        paymentStatus: 'RECEIVED',
                        receivedAt: new Date(),
                        paymentScheduleId: form.paymentScheduleId || null,
                        notes: form.paymentNotes || null,
                      })
                    }
                  >
                    Record payment
                  </Button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'Costs' && canFinance && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Agency costs</h2>
            <div className="mt-4 divide-y">
              {booking.costs?.map((cost) => (
                <article key={cost.id} className="flex flex-wrap justify-between gap-3 py-3">
                  <div>
                    <strong>
                      {cost.supplierName} · {cost.description}
                    </strong>
                    <p className="text-xs text-slate-500">
                      {labelForLookup(cost.costCategory)} · {labelForLookup(cost.costStatus)}{' '}
                      {cost.dueDate ? `· Due ${new Date(cost.dueDate).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <strong>{money(cost.amount, cost.currency)}</strong>
                </article>
              ))}
            </div>
          </section>
          {canCost && !terminal && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Add cost</h2>
              <div className="mt-4 space-y-2">
                <select
                  className={input}
                  value={form.costCategory ?? 'HOTEL'}
                  onChange={(event) => set('costCategory', event.target.value)}
                >
                  {BOOKING_COST_CATEGORIES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <input
                  className={input}
                  placeholder="Supplier name"
                  value={form.supplierName ?? ''}
                  onChange={(event) => set('supplierName', event.target.value)}
                />
                <input
                  className={input}
                  placeholder="Description"
                  value={form.costDescription ?? ''}
                  onChange={(event) => set('costDescription', event.target.value)}
                />
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={form.costAmount ?? ''}
                  onChange={(event) => set('costAmount', event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!form.supplierName || !form.costDescription || !form.costAmount}
                  onClick={() =>
                    mutate('costs', {
                      costCategory: form.costCategory || 'HOTEL',
                      supplierName: form.supplierName,
                      description: form.costDescription,
                      amount: Number(form.costAmount),
                      currency: booking.currency,
                      costStatus: 'ESTIMATED',
                    })
                  }
                >
                  Add cost
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'Documents' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Private documents</h2>
            <div className="mt-4 divide-y">
              {booking.documents.map((document) => (
                <article
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <strong>{document.originalFileName}</strong>
                    <p className="text-xs text-slate-500">
                      {labelForLookup(document.documentType)} ·{' '}
                      {labelForLookup(document.visibility)} ·{' '}
                      {labelForLookup(document.uploadStatus)} ·{' '}
                      {(document.fileSize / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  {document.uploadStatus === 'AVAILABLE' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        action.mutate(
                          { path: `documents/${document.id}/download-url`, method: 'get' },
                          {
                            onSuccess: (value) =>
                              window.open((value as { url: string }).url, '_blank', 'noopener'),
                          },
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </section>
          {canDocs && !terminal && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Upload document</h2>
              <div className="mt-4 space-y-3">
                <select
                  className={input}
                  value={form.documentType ?? 'OTHER'}
                  onChange={(event) => set('documentType', event.target.value)}
                >
                  {BOOKING_DOCUMENT_TYPES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                {['PASSPORT', 'VISA', 'IDENTITY_DOCUMENT'].includes(form.documentType ?? '') && (
                  <select
                    className={input}
                    value={form.documentTravellerId ?? ''}
                    onChange={(event) => set('documentTravellerId', event.target.value)}
                  >
                    <option value="">Select traveller</option>
                    {booking.travellers.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.firstName} {row.lastName}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className={input}
                  value={form.documentVisibility ?? 'INTERNAL'}
                  onChange={(event) => set('documentVisibility', event.target.value)}
                >
                  <option>INTERNAL</option>
                  <option>CUSTOMER_VISIBLE</option>
                </select>
                <input
                  className={input}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <Button
                  className="w-full"
                  isLoading={uploading}
                  disabled={!file}
                  onClick={() => {
                    if (!file) return;
                    setUploading(true);
                    void uploadBookingDocument(booking.id, file, {
                      documentType: (form.documentType || 'OTHER') as never,
                      visibility: (form.documentVisibility || 'INTERNAL') as never,
                      travellerId: form.documentTravellerId || null,
                    })
                      .then(() => query.refetch())
                      .finally(() => setUploading(false));
                  }}
                >
                  Upload privately
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'Notes' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Booking notes</h2>
            <div className="mt-3 divide-y">
              {booking.notes.map((note) => (
                <article key={note.id} className="py-3">
                  <div className="flex justify-between">
                    <strong>{labelForLookup(note.noteType)}</strong>
                    <span className="text-xs text-slate-500">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{note.content}</p>
                  <p className="mt-1 text-xs text-slate-500">{note.authorUser.fullName}</p>
                </article>
              ))}
            </div>
          </section>
          {canUpdate && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">Add note</h2>
              <div className="mt-4 space-y-3">
                <select
                  className={input}
                  value={form.noteType ?? 'GENERAL'}
                  onChange={(event) => set('noteType', event.target.value)}
                >
                  {BOOKING_NOTE_TYPES.filter((value) => value !== 'FINANCIAL' || canFinance).map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
                <textarea
                  className={input}
                  rows={6}
                  value={form.noteContent ?? ''}
                  onChange={(event) => set('noteContent', event.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!form.noteContent}
                  onClick={() =>
                    mutate('notes', {
                      noteType: form.noteType || 'GENERAL',
                      content: form.noteContent,
                    })
                  }
                >
                  Add note
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'Timeline' && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Complete booking timeline</h2>
          <div className="mt-4 space-y-4">
            {timeline.data?.data.map((item) => (
              <article key={item.id} className="border-l-2 border-slate-200 pl-4">
                <strong>{item.title}</strong>
                <p className="text-sm text-slate-600">
                  {item.actor?.fullName ?? 'System'} · {item.description}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'Emails' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-xl border bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Email history</h2>
            <div className="mt-3 divide-y">
              {booking.emailLogs.map((email) => (
                <article key={email.id} className="py-3">
                  <div className="flex justify-between">
                    <strong>{email.subject}</strong>
                    <span>{labelForLookup(email.status)}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {email.recipientEmail} · {labelForLookup(email.emailType)} ·{' '}
                    {new Date(email.createdAt).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          </section>
          {hasPermission(PERMISSIONS.BOOKINGS_SEND_CONFIRMATION) && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Mail className="h-4 w-4" />
                Send customer email
              </h2>
              <div className="mt-4 space-y-3">
                <input
                  className={input}
                  type="email"
                  placeholder="Recipient email"
                  value={form.email ?? booking.customerEmail ?? ''}
                  onChange={(event) => set('email', event.target.value)}
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    mutate('send-confirmation', {
                      recipientEmail: form.email || booking.customerEmail,
                    })
                  }
                >
                  Send confirmation
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() =>
                    mutate('send-payment-reminder', {
                      recipientEmail: form.email || booking.customerEmail,
                    })
                  }
                >
                  Send payment reminder
                </Button>
                {hasPermission(PERMISSIONS.BOOKINGS_EXPORT) && (
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => mutate('generate-confirmation', {})}
                  >
                    <Plane className="h-4 w-4" />
                    Generate confirmation PDF
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
