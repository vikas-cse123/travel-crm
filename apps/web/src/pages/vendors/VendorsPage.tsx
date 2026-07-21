import {
  Building2,
  CircleDollarSign,
  Eye,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  labelForLookup,
  PERMISSIONS,
  VENDOR_CONTRACT_TYPES,
  VENDOR_PAYMENT_STATUSES,
  VENDOR_STATUSES,
  VENDOR_TYPES,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useVendorAnalytics, useVendors } from '@/features/vendors/vendors.api';

const field = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm';
const currency = (value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(Number(value));

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
  const clear = () => setParams(new URLSearchParams());
  const setPage = (page: number) => {
    const next = new URLSearchParams(params);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    setParams(next);
  };
  const summary = [
    ['Total vendors', analytics.data?.total ?? 0, Building2],
    ['Active vendors', analytics.data?.active ?? 0, Building2],
    ...(financial
      ? [
          [
            'Total vendor costs',
            currency(analytics.data?.totalVendorCosts),
            CircleDollarSign,
          ] as const,
        ]
      : []),
    [
      'Average rating',
      `${Number(analytics.data?.averageRating ?? 0).toFixed(1)} / 5`,
      SlidersHorizontal,
    ],
  ] as const;
  const distribution = [
    ['Hotels', analytics.data?.distribution.HOTEL ?? 0],
    ['Airlines', analytics.data?.distribution.AIRLINE ?? 0],
    ['Transport', analytics.data?.distribution.TRANSPORT ?? 0],
    ['DMCs', analytics.data?.distribution.DMC ?? 0],
    ['Bookings', analytics.data?.totalBookings ?? 0],
    ...(financial ? [['Total costs', currency(analytics.data?.totalVendorCosts)] as const] : []),
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Supplier operations</p>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">
            Services, supplier costs, payables and performance in one tenant-safe workspace.
          </p>
        </div>
        {hasPermission(PERMISSIONS.VENDORS_CREATE) && (
          <Link to="/vendors/new">
            <Button>
              <Plus className="h-4 w-4" /> Add vendor
            </Button>
          </Link>
        )}
      </header>

      <section aria-label="Vendor summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(([label, value, Icon]) => (
          <article key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
              <Icon className="h-5 w-5 text-brand-600" />
            </div>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Vendor distribution</h2>
        <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {distribution.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <p className="text-xl font-semibold">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-3 xl:grid-cols-7">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search vendors"
              className={`${field} w-full pl-9`}
              placeholder="Vendor code, name, contact, city or service…"
              value={params.get('search') ?? ''}
              onChange={(e) => update('search', e.target.value)}
            />
          </label>
          <select
            aria-label="Vendor status"
            className={field}
            value={params.get('status') ?? ''}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {VENDOR_STATUSES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Vendor type"
            className={field}
            value={params.get('vendorType') ?? ''}
            onChange={(e) => update('vendorType', e.target.value)}
          >
            <option value="">All types</option>
            {VENDOR_TYPES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {financial && (
            <select
              aria-label="Payment status"
              className={field}
              value={params.get('paymentStatus') ?? ''}
              onChange={(e) => update('paymentStatus', e.target.value)}
            >
              <option value="">All payment statuses</option>
              {VENDOR_PAYMENT_STATUSES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          )}
          <select
            aria-label="Contract type"
            className={field}
            value={params.get('contractType') ?? ''}
            onChange={(e) => update('contractType', e.target.value)}
          >
            <option value="">All contracts</option>
            {VENDOR_CONTRACT_TYPES.map((v) => (
              <option key={v}>{labelForLookup(v)}</option>
            ))}
          </select>
          <input
            aria-label="Coverage area"
            className={field}
            placeholder="Coverage area"
            value={params.get('coverageArea') ?? ''}
            onChange={(e) => update('coverageArea', e.target.value)}
          />
          <select
            aria-label="Sort vendors"
            className={field}
            value={params.get('sortBy') ?? 'createdAt'}
            onChange={(e) => update('sortBy', e.target.value)}
          >
            <option value="createdAt">Newest</option>
            <option value="name">Name</option>
            <option value="rating">Rating</option>
            <option value="totalBookings">Bookings</option>
            {financial && <option value="totalOutstanding">Outstanding</option>}
          </select>
          {params.toString() && (
            <Button variant="secondary" onClick={clear}>
              Clear filters
            </Button>
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
            <Building2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 font-medium">No vendors match these filters.</p>
            <p className="text-sm text-slate-500">
              Add your first supplier or clear the current filters.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1300px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Vendor code',
                      'Vendor info',
                      'Type',
                      'Contact',
                      'Services',
                      'Performance',
                      ...(financial
                        ? ['Total business', 'Total paid', 'Outstanding', 'Payment status']
                        : []),
                      'Status',
                      'Created',
                      'Actions',
                    ].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vendors.data.data.map((vendor) => {
                    const paymentStatus =
                      Number(vendor.totalOutstanding ?? 0) <= 0
                        ? 'PAID'
                        : Number(vendor.totalPaid ?? 0) > 0
                          ? 'PARTIALLY_PAID'
                          : 'UNPAID';
                    return (
                      <tr key={vendor.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-brand-700">
                          {vendor.vendorCode}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            className="font-semibold hover:text-brand-700"
                            to={`/vendors/${vendor.id}`}
                          >
                            {vendor.name}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {vendor.city ?? vendor.coverageAreas ?? 'Coverage not set'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-700">
                            {labelForLookup(vendor.vendorType)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {vendor.contactPerson ?? '—'}
                          <p className="text-xs text-slate-500">
                            {vendor.primaryPhone ?? vendor.primaryEmail ?? ''}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Link className="text-brand-700" to={`/vendors/${vendor.id}/services`}>
                            {vendor.services.length} · Manage
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          ★ {Number(vendor.rating ?? 0).toFixed(1)}
                          <p className="text-xs text-slate-500">{vendor.totalBookings} bookings</p>
                        </td>
                        {financial && (
                          <>
                            <td className="px-4 py-3">{currency(vendor.totalBusiness)}</td>
                            <td className="px-4 py-3 text-emerald-700">
                              {currency(vendor.totalPaid)}
                            </td>
                            <td className="px-4 py-3 text-amber-700">
                              {currency(vendor.totalOutstanding)}
                            </td>
                            <td className="px-4 py-3">{labelForLookup(paymentStatus)}</td>
                          </>
                        )}
                        <td className="px-4 py-3">{labelForLookup(vendor.status)}</td>
                        <td className="px-4 py-3">
                          {new Date(vendor.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Link
                              aria-label={`View ${vendor.name}`}
                              to={`/vendors/${vendor.id}`}
                              className="rounded p-2 text-brand-700 hover:bg-brand-50"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            {hasPermission(PERMISSIONS.VENDORS_UPDATE) && (
                              <Link
                                aria-label={`Edit ${vendor.name}`}
                                to={`/vendors/${vendor.id}/edit`}
                                className="rounded p-2 text-slate-600 hover:bg-slate-100"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 lg:hidden">
              {vendors.data.data.map((vendor) => (
                <Link
                  key={vendor.id}
                  to={`/vendors/${vendor.id}`}
                  className="rounded-xl border p-4 hover:border-brand-300"
                >
                  <div className="flex justify-between">
                    <div>
                      <p className="font-semibold">{vendor.name}</p>
                      <p className="text-xs text-brand-700">
                        {vendor.vendorCode} · {labelForLookup(vendor.vendorType)}
                      </p>
                    </div>
                    <span className="text-sm">★ {Number(vendor.rating ?? 0).toFixed(1)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>{vendor.services.length} services</span>
                    <span>{vendor.totalBookings} bookings</span>
                    {financial && (
                      <>
                        <span>Paid {currency(vendor.totalPaid)}</span>
                        <span>Due {currency(vendor.totalOutstanding)}</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <footer className="flex items-center justify-between border-t p-4 text-sm">
              <span>{vendors.data.pagination.total} vendor(s)</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={vendors.data.pagination.page <= 1}
                  onClick={() => setPage(vendors.data!.pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={vendors.data.pagination.page >= vendors.data.pagination.totalPages}
                  onClick={() => setPage(vendors.data!.pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
