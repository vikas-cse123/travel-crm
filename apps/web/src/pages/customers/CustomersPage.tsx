import {
  Crown,
  Eye,
  IndianRupee,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserRoundCheck,
  Users,
} from 'lucide-react';
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
  useArchiveCustomer,
  useCustomerAnalytics,
  useCustomerLookups,
  useCustomers,
} from '@/features/customers/customers.api';

const field =
  'h-11 rounded-md border border-slate-300 bg-card px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
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

const statusStyle: Record<string, string> = {
  ACTIVE: 'bg-emerald-600 text-white',
  INACTIVE: 'bg-slate-500 text-white',
  ARCHIVED: 'bg-slate-500 text-white',
  BLOCKED: 'bg-red-600 text-white',
};

export function CustomersPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const customers = useCustomers(params);
  const analytics = useCustomerAnalytics();
  const lookups = useCustomerLookups();
  const archive = useArchiveCustomer();
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

  const totalCustomers = analytics.data?.total ?? 0;
  const averageSpent = totalCustomers
    ? String(Number(analytics.data?.totalBookedValue ?? 0) / totalCustomers)
    : '0';
  const cards = [
    {
      label: 'Total Customers',
      value: totalCustomers,
      Icon: Users,
      style: 'bg-cyan-600 text-white',
    },
    {
      label: 'Active Customers',
      value: analytics.data?.active ?? 0,
      Icon: UserRoundCheck,
      style: 'bg-green-600 text-white',
    },
    {
      label: 'VIP Customers',
      value: analytics.data?.vip ?? 0,
      Icon: Crown,
      style: 'bg-amber-400 text-slate-900',
    },
    ...(financials
      ? [
          {
            label: 'Avg. Spent',
            value: money(averageSpent),
            Icon: IndianRupee,
            style: 'bg-rose-500 text-white',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
      </header>

      <section aria-label="Customer summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, Icon, style }) => (
          <article
            key={label}
            className={`relative min-h-32 overflow-hidden rounded-md p-5 shadow-sm ${style}`}
          >
            <p className="text-3xl font-bold">{value}</p>
            <p className="mt-4 text-base font-medium">{label}</p>
            <Icon className="absolute right-5 top-7 h-16 w-16 opacity-20" strokeWidth={2.5} />
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-lg font-medium">Customer List</h2>
        </div>

        <div className="grid gap-4 border-b p-5 md:grid-cols-3">
          <label className="relative">
            <Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-600" />
            <input
              aria-label="Search customers"
              className={`${field} w-full pr-10`}
              placeholder="Search customers..."
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
            <option value="">All Status</option>
            {CUSTOMER_STATUSES.filter((value) => value !== 'MERGED').map((value) => (
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
            <option value="">All Types</option>
            {CUSTOMER_TYPES.map((value) => (
              <option key={value} value={value}>
                {labelForLookup(value)}
              </option>
            ))}
          </select>

          <select
            aria-label="Lifecycle stage"
            className="sr-only"
            tabIndex={-1}
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
            aria-label="Customer tag"
            className="sr-only"
            tabIndex={-1}
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
        </div>

        {customers.isLoading ? (
          <div className="h-72 animate-pulse bg-slate-50" />
        ) : customers.isError ? (
          <div className="p-12 text-center text-red-700">Customers could not be loaded.</div>
        ) : !customers.data?.data.length ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-9 w-9 text-slate-300" />
            <h2 className="mt-2 font-semibold">No customers found</h2>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-sm font-semibold text-slate-800">
                  <tr>
                    {[
                      'Customer Code',
                      'Customer Info',
                      'Type',
                      'Loyalty Tier',
                      'Total Bookings',
                      ...(financials ? ['Total Spent'] : []),
                      'Status',
                      'Created',
                      'Actions',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap border-b border-r px-4 py-4 last:border-r-0"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customers.data.data.map((customer, index) => (
                    <tr
                      key={customer.id}
                      className={
                        index % 2
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-slate-100/70 hover:bg-slate-100'
                      }
                    >
                      <td className="border-b border-r px-4 py-4 font-bold">
                        {customer.customerNumber}
                      </td>
                      <td className="border-b border-r px-4 py-4">
                        <Link
                          className="font-bold text-slate-900 hover:text-blue-700"
                          to={`/customers/${customer.id}`}
                        >
                          {customer.displayName}
                        </Link>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Phone className="h-3.5 w-3.5" />{' '}
                          {customer.primaryPhone || customer.email || '—'}
                        </p>
                        <span className="sr-only">
                          {customer.queryCount} leads · {customer.quotationCount} quotes ·{' '}
                          {customer.bookingCount} bookings
                        </span>
                        {financials && (
                          <span className="sr-only">{money(customer.totalOutstanding)}</span>
                        )}
                      </td>
                      <td className="border-b border-r px-4 py-4">
                        <span className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white">
                          {labelForLookup(customer.type) || 'N/A'}
                        </span>
                      </td>
                      <td className="border-b border-r px-4 py-4">
                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold ${customer.isVip ? 'bg-amber-400 text-slate-900' : 'bg-slate-500 text-white'}`}
                        >
                          {customer.isVip ? 'VIP' : 'N/A'}
                        </span>
                      </td>
                      <td className="border-b border-r px-4 py-4">
                        <span className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                          {customer.bookingCount}
                        </span>
                      </td>
                      {financials && (
                        <td className="border-b border-r px-4 py-4 font-bold">
                          {moneyDetailed(customer.totalBookedValue)}
                        </td>
                      )}
                      <td className="border-b border-r px-4 py-4">
                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold ${statusStyle[customer.status] ?? 'bg-slate-500 text-white'}`}
                        >
                          {labelForLookup(customer.status) || 'N/A'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap border-b border-r px-4 py-4">
                        {new Date(customer.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="border-b px-4 py-4">
                        <div className="flex overflow-hidden rounded-md border border-slate-200">
                          <Link
                            aria-label={`View ${customer.displayName}`}
                            to={`/customers/${customer.id}`}
                            className="bg-cyan-600 p-2 text-white hover:bg-cyan-700"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {hasPermission(PERMISSIONS.CUSTOMERS_UPDATE) && (
                            <Link
                              aria-label={`Edit ${customer.displayName}`}
                              to={`/customers/${customer.id}/edit`}
                              className="bg-blue-600 p-2 text-white hover:bg-blue-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {hasPermission(PERMISSIONS.CUSTOMERS_DELETE) && (
                            <button
                              aria-label={`Archive ${customer.displayName}`}
                              className="bg-red-600 p-2 text-white hover:bg-red-700 disabled:opacity-50"
                              disabled={archive.isPending}
                              onClick={() => {
                                if (window.confirm(`Archive ${customer.displayName}?`))
                                  archive.mutate(customer.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {customers.data.pagination.totalPages > 1 && (
              <footer className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-slate-500">
                  Page {customers.data.pagination.page} of {customers.data.pagination.totalPages} ·{' '}
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
                      customers.data.pagination.page >= customers.data.pagination.totalPages
                    }
                    variant="secondary"
                    onClick={() => setPage(customers.data!.pagination.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}
