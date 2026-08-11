import {
  Bookmark,
  BusFront,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Handshake,
  Hotel,
  MapPinned,
  Pencil,
  Percent,
  Plane,
  Plus,
  Search,
  Settings,
  Star,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  labelForLookup,
  PERMISSIONS,
  VENDOR_PAYMENT_STATUSES,
  VENDOR_STATUSES,
  VENDOR_TYPES,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/AuthProvider';
import { useVendorAnalytics, useVendors } from '@/features/vendors/vendors.api';

const field =
  'h-11 rounded-md border border-slate-300 bg-card px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const currency = (value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(value));

const compactNumber = (value?: string) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value ?? 0));

const statusStyle: Record<string, string> = {
  ACTIVE: 'bg-emerald-600 text-white',
  INACTIVE: 'bg-slate-500 text-white',
  BLACKLISTED: 'bg-red-600 text-white',
  ON_HOLD: 'bg-amber-500 text-white',
};

export function VendorsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const vendors = useVendors(params);
  const analytics = useVendorAnalytics();
  const financial = hasPermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS);

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

  const summary = [
    {
      label: 'Total Vendors',
      value: analytics.data?.total ?? 0,
      Icon: Handshake,
      style: 'bg-cyan-600 text-white',
    },
    {
      label: 'Active Vendors',
      value: analytics.data?.active ?? 0,
      Icon: CheckCircle2,
      style: 'bg-green-600 text-white',
    },
    ...(financial
      ? [
          {
            label: 'Total Vendor Costs',
            value: currency(analytics.data?.totalVendorCosts),
            Icon: CircleDollarSign,
            style: 'bg-amber-400 text-slate-900',
          },
        ]
      : []),
    {
      label: 'Avg. Rating',
      value: Number(analytics.data?.averageRating ?? 0).toFixed(1),
      accessibleValue: `${Number(analytics.data?.averageRating ?? 0).toFixed(1)} / 5`,
      Icon: Star,
      style: 'bg-rose-500 text-white',
    },
  ];

  const distribution = [
    {
      label: 'Hotels',
      value: analytics.data?.distribution.HOTEL ?? 0,
      Icon: Hotel,
      style: 'bg-blue-500 text-white',
    },
    {
      label: 'Airlines',
      value: analytics.data?.distribution.AIRLINE ?? 0,
      Icon: Plane,
      style: 'bg-green-500 text-white',
    },
    {
      label: 'Transport',
      value: analytics.data?.distribution.TRANSPORT ?? 0,
      Icon: BusFront,
      style: 'bg-amber-400 text-slate-900',
    },
    {
      label: 'DMCs',
      value: analytics.data?.distribution.DMC ?? 0,
      Icon: MapPinned,
      style: 'bg-cyan-600 text-white',
    },
    {
      label: 'Bookings',
      value: analytics.data?.totalBookings ?? 0,
      Icon: Bookmark,
      style: 'bg-slate-500 text-white',
    },
    ...(financial
      ? [
          {
            label: 'Total Costs',
            value: compactNumber(analytics.data?.totalVendorCosts),
            Icon: Percent,
            style: 'bg-slate-700 text-white',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Vendors</h1>
      </header>

      <section aria-label="Vendor summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ label, value, accessibleValue, Icon, style }) => (
          <article
            key={label}
            className={`relative min-h-32 overflow-hidden rounded-md p-5 shadow-sm ${style}`}
          >
            <p className="text-3xl font-bold">{value}</p>
            {accessibleValue && <span className="sr-only">{accessibleValue}</span>}
            <p className="mt-4 text-base font-medium">{label}</p>
            <Icon className="absolute right-5 top-7 h-16 w-16 opacity-20" strokeWidth={2.5} />
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-medium">Vendor Distribution</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {distribution.map(({ label, value, Icon, style }) => (
            <article
              key={label}
              className={`flex min-h-24 items-center gap-5 rounded-md px-6 py-4 shadow-sm ${style}`}
            >
              <Icon className="h-10 w-10 shrink-0" strokeWidth={2.4} />
              <div className="min-w-0 text-center">
                <p className="text-base font-medium">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-lg font-medium">Vendor List</h2>
          {hasPermission(PERMISSIONS.VENDORS_CREATE) && (
            <Link to="/vendors/new">
              <Button className="rounded-md bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Add Vendor
              </Button>
            </Link>
          )}
        </div>

        <div className="grid gap-4 border-b p-5 md:grid-cols-3">
          <label className="relative">
            <Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-600" />
            <input
              aria-label="Search vendors"
              className={`${field} w-full pr-10`}
              placeholder="Search vendors..."
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Vendor status"
            className={field}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All Status</option>
            {VENDOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labelForLookup(status)}
              </option>
            ))}
          </select>
          <select
            aria-label="Vendor type"
            className={field}
            value={params.get('vendorType') ?? ''}
            onChange={(event) => update('vendorType', event.target.value)}
          >
            <option value="">All Types</option>
            {VENDOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {labelForLookup(type)}
              </option>
            ))}
          </select>
          {financial && (
            <select
              aria-label="Payment status"
              className="sr-only"
              tabIndex={-1}
              value={params.get('paymentStatus') ?? ''}
              onChange={(event) => update('paymentStatus', event.target.value)}
            >
              <option value="">All payment statuses</option>
              {VENDOR_PAYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelForLookup(status)}
                </option>
              ))}
            </select>
          )}
        </div>

        {vendors.isPending ? (
          <div className="p-10 text-center text-slate-500">Loading vendors…</div>
        ) : vendors.isError ? (
          <div className="p-10 text-center text-red-700">
            Could not load vendors. {vendors.error.message}
          </div>
        ) : !vendors.data?.data.length ? (
          <div className="p-10 text-center">
            <Handshake className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-2 font-medium">No vendors match these filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-sm font-semibold text-slate-800">
                  <tr>
                    {[
                      'Vendor Code',
                      'Vendor Info',
                      'Type',
                      'Contact',
                      'Services',
                      'Performance',
                      ...(financial
                        ? ['Total Business', 'Total Paid', 'Outstanding', 'Payment Status']
                        : []),
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
                  {vendors.data.data.map((vendor) => {
                    const paymentStatus =
                      Number(vendor.totalOutstanding ?? 0) <= 0
                        ? 'All Paid'
                        : Number(vendor.totalPaid ?? 0) > 0
                          ? 'Partially Paid'
                          : 'Unpaid';
                    return (
                      <tr key={vendor.id} className="bg-slate-50/30 hover:bg-slate-50">
                        <td className="border-b border-r px-4 py-4 font-bold">
                          {vendor.vendorCode}
                        </td>
                        <td className="border-b border-r px-4 py-4">
                          <Link
                            className="font-bold text-slate-900 hover:text-brand-700"
                            to={`/vendors/${vendor.id}`}
                          >
                            {vendor.name}
                          </Link>
                          <p className="mt-1 max-w-40 text-xs text-slate-500">
                            {vendor.city ?? vendor.coverageAreas ?? ''}
                          </p>
                        </td>
                        <td className="border-b border-r px-4 py-4">
                          <span className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white">
                            {labelForLookup(vendor.vendorType)}
                          </span>
                        </td>
                        <td className="border-b border-r px-4 py-4">
                          <p className="font-semibold">{vendor.contactPerson ?? '—'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {vendor.primaryPhone ?? vendor.primaryEmail ?? ''}
                          </p>
                        </td>
                        <td className="border-b border-r px-4 py-4">
                          <Link
                            className="inline-flex flex-col text-blue-600 hover:text-blue-700"
                            to={`/vendors/${vendor.id}/services`}
                          >
                            <span className="rounded bg-blue-600 px-2 py-1 text-center text-xs font-semibold text-white">
                              {vendor.services.length} services
                            </span>
                            <span className="mt-1 inline-flex items-center gap-1 text-xs">
                              <Settings className="h-3.5 w-3.5" /> Manage
                            </span>
                          </Link>
                        </td>
                        <td className="border-b border-r px-4 py-4">
                          <p className="font-semibold">
                            {Number(vendor.rating ?? 0).toFixed(1)}/5.0
                          </p>
                          <div className="mt-2 h-1.5 w-28 overflow-hidden rounded bg-slate-200">
                            <div
                              className="h-full bg-cyan-500"
                              style={{
                                width: `${Math.min(100, Number(vendor.rating ?? 0) * 20)}%`,
                              }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {vendor.totalBookings} bookings
                          </p>
                        </td>
                        {financial && (
                          <>
                            <td className="border-b border-r px-4 py-4">
                              {currency(vendor.totalBusiness)}
                            </td>
                            <td className="border-b border-r px-4 py-4 font-medium text-emerald-600">
                              {currency(vendor.totalPaid)}
                            </td>
                            <td className="border-b border-r px-4 py-4 font-medium text-emerald-600">
                              {currency(vendor.totalOutstanding)}
                            </td>
                            <td className="border-b border-r px-4 py-4">
                              <span
                                className={`rounded px-2 py-1 text-xs font-semibold ${paymentStatus === 'All Paid' ? 'bg-emerald-600 text-white' : paymentStatus === 'Partially Paid' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}`}
                              >
                                {paymentStatus}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="border-b border-r px-4 py-4">
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold ${statusStyle[vendor.status] ?? 'bg-slate-500 text-white'}`}
                          >
                            {labelForLookup(vendor.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border-b border-r px-4 py-4">
                          {new Date(vendor.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="border-b px-4 py-4">
                          <div className="flex overflow-hidden rounded-md border border-slate-200">
                            <Link
                              aria-label={`View ${vendor.name}`}
                              to={`/vendors/${vendor.id}`}
                              className="bg-cyan-600 p-2 text-white hover:bg-cyan-700"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            {hasPermission(PERMISSIONS.VENDORS_UPDATE) && (
                              <Link
                                aria-label={`Edit ${vendor.name}`}
                                to={`/vendors/${vendor.id}/edit`}
                                className="bg-blue-600 p-2 text-white hover:bg-blue-700"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            )}
                            <Link
                              aria-label={`Manage ${vendor.name} services`}
                              to={`/vendors/${vendor.id}/services`}
                              className="bg-green-600 p-2 text-white hover:bg-green-700"
                            >
                              <Settings className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={vendors.data.pagination.page}
              pageSize={vendors.data.pagination.pageSize}
              totalPages={vendors.data.pagination.totalPages}
              total={vendors.data.pagination.total}
              onPage={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
