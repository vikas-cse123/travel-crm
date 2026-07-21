import { Search, TicketPlus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BOOKING_PAYMENT_STATUSES,
  BOOKING_STATUSES,
  OPERATIONAL_STATUSES,
  PERMISSIONS,
  labelForLookup,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useBookingAnalytics, useBookings } from '@/features/bookings/bookings.api';

const field = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm';
const money = (value: string | undefined) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(value));

export function BookingsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const list = useBookings(params);
  const analytics = useBookingAnalytics();
  const canViewFinancials = hasPermission(PERMISSIONS.BOOKINGS_VIEW_FINANCIALS);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const cards: Array<[string, string | number]> = [
    ['Total bookings', analytics.data?.totalBookings ?? 0],
    ['Pending confirmation', analytics.data?.pendingConfirmation ?? 0],
    ['Confirmed', analytics.data?.confirmed ?? 0],
    ['Upcoming departures', analytics.data?.bookingsDepartingNext7Days ?? 0],
    ['Travel in progress', analytics.data?.travelInProgress ?? 0],
    ['Completed', analytics.data?.completed ?? 0],
    ['Services pending', analytics.data?.servicesAwaitingConfirmation ?? 0],
    ['Documents pending', analytics.data?.bookingsWithMissingTravellerDocuments ?? 0],
    ...(canViewFinancials
      ? ([
          ['Customer outstanding', money(analytics.data?.totalCustomerOutstanding)],
          ['Payments overdue', analytics.data?.overdueCustomerPayments ?? 0],
        ] as Array<[string, string | number]>)
      : []),
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Booking operations</p>
          <h1 className="text-2xl font-semibold">Bookings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Travellers, confirmations, payments, documents and operational readiness.
          </p>
        </div>
        {hasPermission(PERMISSIONS.BOOKINGS_CREATE) && (
          <Link to="/bookings/new">
            <Button>
              <TicketPlus className="h-4 w-4" />
              Manual booking
            </Button>
          </Link>
        )}
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search bookings"
              className={`${field} w-full pl-9`}
              placeholder="Booking, customer, lead, traveller or supplier reference…"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Booking status"
            className={field}
            value={params.get('bookingStatus') ?? ''}
            onChange={(event) => update('bookingStatus', event.target.value)}
          >
            <option value="">All booking statuses</option>
            {BOOKING_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select
            aria-label="Operational status"
            className={field}
            value={params.get('operationalStatus') ?? ''}
            onChange={(event) => update('operationalStatus', event.target.value)}
          >
            <option value="">All operational statuses</option>
            {OPERATIONAL_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select
            aria-label="Payment status"
            className={field}
            value={params.get('paymentStatus') ?? ''}
            onChange={(event) => update('paymentStatus', event.target.value)}
          >
            <option value="">All payment statuses</option>
            {BOOKING_PAYMENT_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <input
            aria-label="Destination"
            className={field}
            placeholder="Destination"
            value={params.get('destination') ?? ''}
            onChange={(event) => update('destination', event.target.value)}
          />
          <input
            aria-label="Travel from"
            className={field}
            type="date"
            value={params.get('travelFrom') ?? ''}
            onChange={(event) => update('travelFrom', event.target.value)}
          />
          <input
            aria-label="Travel to"
            className={field}
            type="date"
            value={params.get('travelTo') ?? ''}
            onChange={(event) => update('travelTo', event.target.value)}
          />
          {params.size > 0 && (
            <Button variant="ghost" onClick={() => setParams(new URLSearchParams())}>
              Clear filters
            </Button>
          )}
        </div>
        {list.isLoading ? (
          <div className="h-72 animate-pulse bg-slate-50" />
        ) : list.isError ? (
          <div className="p-12 text-center text-red-700">Bookings could not be loaded.</div>
        ) : !list.data?.data.length ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold">No bookings found</h2>
            <p className="mt-1 text-sm text-slate-500">
              Convert an accepted quotation or create an authorised manual booking.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1250px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    'Booking',
                    'Customer',
                    'Destination',
                    'Travel dates',
                    'Travellers',
                    'Assigned',
                    'Booking status',
                    'Operations',
                    'Payment',
                    'Selling',
                    'Paid',
                    'Outstanding',
                    'Created',
                  ].map((header) =>
                    !canViewFinancials &&
                    ['Selling', 'Paid', 'Outstanding'].includes(header) ? null : (
                      <th className="px-4 py-3" key={header}>
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.data.data.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <Link className="font-semibold text-brand-700" to={`/bookings/${booking.id}`}>
                        {booking.bookingNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <strong>{booking.customerName}</strong>
                      <p className="text-xs text-slate-500">{booking.customerPhone}</p>
                    </td>
                    <td className="px-4 py-4">{booking.destinationSummary}</td>
                    <td className="px-4 py-4">
                      {booking.travelStartDate
                        ? new Date(booking.travelStartDate).toLocaleDateString()
                        : 'Open'}{' '}
                      –{' '}
                      {booking.travelEndDate
                        ? new Date(booking.travelEndDate).toLocaleDateString()
                        : 'Open'}
                    </td>
                    <td className="px-4 py-4">
                      {booking.adults +
                        booking.childrenWithBed +
                        booking.childrenWithoutBed +
                        booking.infants}
                    </td>
                    <td className="px-4 py-4">{booking.assignedTo?.fullName ?? 'Unassigned'}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {labelForLookup(booking.bookingStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4">{labelForLookup(booking.operationalStatus)}</td>
                    <td className="px-4 py-4">{labelForLookup(booking.paymentStatus)}</td>
                    {canViewFinancials && (
                      <>
                        <td className="px-4 py-4">{money(booking.totalSellingAmount)}</td>
                        <td className="px-4 py-4">{money(booking.totalCustomerPaid)}</td>
                        <td className="px-4 py-4 font-semibold text-amber-700">
                          {money(booking.totalCustomerOutstanding)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-4">
                      {new Date(booking.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span>
              Page {list.data.pagination.page} of {list.data.pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={list.data.pagination.page <= 1}
                onClick={() => update('page', String(list.data!.pagination.page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={list.data.pagination.page >= list.data.pagination.totalPages}
                onClick={() => update('page', String(list.data!.pagination.page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
