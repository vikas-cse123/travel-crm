import { Search, UserPlus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CUSTOMER_LIFECYCLE_STAGES,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  PERMISSIONS,
  labelForLookup,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useCustomerAnalytics,
  useCustomerLookups,
  useCustomers,
} from '@/features/customers/customers.api';

const field = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm';
const money = (value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(value));

export function CustomersPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const customers = useCustomers(params);
  const analytics = useCustomerAnalytics();
  const lookups = useCustomerLookups();
  const financials = hasPermission(PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const setPage = (page: number) => {
    const next = new URLSearchParams(params);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    setParams(next);
  };
  const cards: Array<[string, string | number]> = [
    ['Total customers', analytics.data?.total ?? 0],
    ['New this month', analytics.data?.newThisMonth ?? 0],
    ['Repeat customers', analytics.data?.repeat ?? 0],
    ['VIP', analytics.data?.vip ?? 0],
    ['Active prospects', analytics.data?.prospects ?? 0],
    ['Upcoming travellers', analytics.data?.upcomingBookings ?? 0],
    ['Possible duplicates', analytics.data?.possibleDuplicateGroups ?? 0],
    ...(financials
      ? ([['Outstanding customers', analytics.data?.customersWithOutstanding ?? 0]] as Array<
          [string, string | number]
        >)
      : []),
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Relationship history</p>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            One profile across leads, quotations and bookings.
          </p>
        </div>
        {hasPermission(PERMISSIONS.CUSTOMERS_CREATE) && (
          <Link to="/customers/new">
            <Button>
              <UserPlus className="h-4 w-4" />
              New customer
            </Button>
          </Link>
        )}
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-4 xl:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search customers"
              className={`${field} w-full pl-9`}
              placeholder="Name, customer number, phone, email or company…"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Customer status"
            className={field}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {CUSTOMER_STATUSES.filter((value) => value !== 'MERGED').map((value) => (
              <option key={value} value={value}>
                {labelForLookup(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Lifecycle stage"
            className={field}
            value={params.get('lifecycleStage') ?? ''}
            onChange={(event) => update('lifecycleStage', event.target.value)}
          >
            <option value="">All lifecycle stages</option>
            {CUSTOMER_LIFECYCLE_STAGES.map((value) => (
              <option key={value} value={value}>
                {labelForLookup(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Customer type"
            className={field}
            value={params.get('customerType') ?? ''}
            onChange={(event) => update('customerType', event.target.value)}
          >
            <option value="">All customer types</option>
            {CUSTOMER_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelForLookup(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Assigned user"
            className={field}
            value={params.get('assignedToId') ?? ''}
            onChange={(event) => update('assignedToId', event.target.value)}
          >
            <option value="">All assigned users</option>
            {lookups.data?.users?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </select>
          <select
            aria-label="Customer tag"
            className={field}
            value={params.get('tagId') ?? ''}
            onChange={(event) => update('tagId', event.target.value)}
          >
            <option value="">All tags</option>
            {lookups.data?.tags?.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Repeat customer"
            className={field}
            value={params.get('isRepeatCustomer') ?? ''}
            onChange={(event) => update('isRepeatCustomer', event.target.value)}
          >
            <option value="">Repeat and first-time</option>
            <option value="true">Repeat customers</option>
            <option value="false">First-time customers</option>
          </select>
          <select
            aria-label="VIP customer"
            className={field}
            value={params.get('isVip') ?? ''}
            onChange={(event) => update('isVip', event.target.value)}
          >
            <option value="">VIP and standard</option>
            <option value="true">VIP only</option>
            <option value="false">Standard only</option>
          </select>
          {financials && (
            <select
              aria-label="Outstanding balance"
              className={field}
              value={params.get('hasOutstandingBalance') ?? ''}
              onChange={(event) => update('hasOutstandingBalance', event.target.value)}
            >
              <option value="">Any balance</option>
              <option value="true">Has outstanding</option>
              <option value="false">Fully settled</option>
            </select>
          )}
          <label className="text-xs text-slate-500">
            Last booking from
            <input
              className={`${field} mt-1 w-full`}
              type="date"
              value={params.get('lastBookingFrom') ?? ''}
              onChange={(event) => update('lastBookingFrom', event.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            Last booking to
            <input
              className={`${field} mt-1 w-full`}
              type="date"
              value={params.get('lastBookingTo') ?? ''}
              onChange={(event) => update('lastBookingTo', event.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            Created from
            <input
              className={`${field} mt-1 w-full`}
              type="date"
              value={params.get('createdFrom') ?? ''}
              onChange={(event) => update('createdFrom', event.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            Created to
            <input
              className={`${field} mt-1 w-full`}
              type="date"
              value={params.get('createdTo') ?? ''}
              onChange={(event) => update('createdTo', event.target.value)}
            />
          </label>
          {financials && (
            <label className="text-xs text-slate-500">
              Minimum booking value
              <input
                className={`${field} mt-1 w-full`}
                min="0"
                type="number"
                value={params.get('totalBookingValueMin') ?? ''}
                onChange={(event) => update('totalBookingValueMin', event.target.value)}
              />
            </label>
          )}
          {financials && (
            <label className="text-xs text-slate-500">
              Maximum booking value
              <input
                className={`${field} mt-1 w-full`}
                min="0"
                type="number"
                value={params.get('totalBookingValueMax') ?? ''}
                onChange={(event) => update('totalBookingValueMax', event.target.value)}
              />
            </label>
          )}
          <select
            aria-label="Sort customers"
            className={field}
            value={params.get('sortBy') ?? 'updatedAt'}
            onChange={(event) => update('sortBy', event.target.value)}
          >
            <option value="updatedAt">Recently updated</option>
            <option value="customerNumber">Customer number</option>
            <option value="displayName">Customer name</option>
            <option value="lastContactedAt">Last contacted</option>
            <option value="lastBookingAt">Last booking</option>
            <option value="bookingCount">Booking count</option>
            {financials && <option value="totalBookedValue">Booking value</option>}
            {financials && <option value="totalOutstanding">Outstanding</option>}
          </select>
          <select
            aria-label="Sort direction"
            className={field}
            value={params.get('sortOrder') ?? 'desc'}
            onChange={(event) => update('sortOrder', event.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
            Clear filters
          </Button>
        </div>
        {customers.isLoading ? (
          <div className="h-72 animate-pulse bg-slate-50" />
        ) : customers.isError ? (
          <div className="p-12 text-center text-red-700">Customers could not be loaded.</div>
        ) : !customers.data?.data.length ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold">No customers found</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a customer or add a lead to build the relationship history.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 md:hidden">
              {customers.data.data.map((customer) => (
                <article className="rounded-xl border p-4 shadow-sm" key={customer.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        className="font-semibold text-brand-700"
                        to={`/customers/${customer.id}`}
                      >
                        {customer.displayName}
                      </Link>
                      <p className="text-xs text-slate-500">{customer.customerNumber}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {labelForLookup(customer.lifecycleStage)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm">{customer.primaryPhone || customer.email || '—'}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {customer.queryCount} leads · {customer.quotationCount} quotes ·{' '}
                    {customer.bookingCount} bookings
                  </p>
                  {financials && (
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                      <span>Booked {money(customer.totalBookedValue)}</span>
                      <span>Due {money(customer.totalOutstanding)}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[1050px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Customer',
                      'Contact',
                      'Lifecycle',
                      'Tags',
                      'Relationships',
                      'Assigned',
                      ...(financials ? ['Booked', 'Outstanding'] : []),
                      'Updated',
                    ].map((heading) => (
                      <th className="px-4 py-3" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.data.data.map((customer) => (
                    <tr className="border-t hover:bg-slate-50" key={customer.id}>
                      <td className="px-4 py-3">
                        <Link
                          className="font-semibold text-brand-700 hover:underline"
                          to={`/customers/${customer.id}`}
                        >
                          {customer.displayName}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {customer.customerNumber} · {labelForLookup(customer.type)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{customer.primaryPhone || '—'}</p>
                        <p className="text-xs text-slate-500">{customer.email || 'No email'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                          {labelForLookup(customer.lifecycleStage)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {customer.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full px-2 py-0.5 text-xs text-white"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p>
                          {customer.queryCount} leads · {customer.quotationCount} quotes
                        </p>
                        <p>{customer.bookingCount} bookings</p>
                      </td>
                      <td className="px-4 py-3">{customer.assignedTo?.fullName ?? 'Unassigned'}</td>
                      {financials && (
                        <>
                          <td className="px-4 py-3">{money(customer.totalBookedValue)}</td>
                          <td className="px-4 py-3">{money(customer.totalOutstanding)}</td>
                        </>
                      )}
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(customer.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-slate-500">
                Page {customers.data.pagination.page} of{' '}
                {Math.max(customers.data.pagination.totalPages, 1)} ·{' '}
                {customers.data.pagination.total} customers
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={customers.data.pagination.page <= 1}
                  variant="secondary"
                  onClick={() => setPage(customers.data!.pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  disabled={
                    customers.data.pagination.totalPages === 0 ||
                    customers.data.pagination.page >= customers.data.pagination.totalPages
                  }
                  variant="secondary"
                  onClick={() => setPage(customers.data!.pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
