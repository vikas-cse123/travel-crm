import { FilePlus2, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useQuotations } from '@/features/quotations/quotations.api';

const field = 'h-10 rounded-lg border border-slate-300 bg-card px-3 text-sm';
export function QuotationsPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const list = useQuotations(params);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const metrics = list.data?.analytics;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Commercial workspace</p>
          <h1 className="text-2xl font-semibold">Customer quotations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Versioned proposals, delivery tracking and secure customer access.
          </p>
        </div>
        {hasPermission(PERMISSIONS.QUOTATIONS_CREATE) && (
          <Link to="/quotations/new">
            <Button>
              <FilePlus2 className="h-4 w-4" />
              New quotation
            </Button>
          </Link>
        )}
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border bg-card p-4">
          <p className="text-xl font-semibold">
            ₹{Number(metrics?.totalQuotedValue ?? 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500">Quoted value</p>
        </article>
        <article className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-semibold">{list.data?.data.length ?? 0}</p>
          <p className="text-xs text-slate-500">Quotations</p>
        </article>
        <article className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-semibold">{list.data?.pagination.total ?? 0}</p>
          <p className="text-xs text-slate-500">Total</p>
        </article>
      </section>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-2">
          <label className="relative md:col-span-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search quotations"
              className={`${field} w-full pl-9`}
              placeholder="Quotation, lead, customer, phone or destination…"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <input
            aria-label="Quotation destination"
            className={field}
            placeholder="Destination"
            value={params.get('destination') ?? ''}
            onChange={(event) => update('destination', event.target.value)}
          />
        </div>
        {list.isLoading ? (
          <div className="h-72 animate-pulse bg-slate-50" />
        ) : list.isError ? (
          <div className="p-12 text-center text-red-700">Quotations could not be loaded.</div>
        ) : !list.data?.data.length ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold">No quotations found</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create one from a lead or adjust your filters.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Quotation',
                      'Lead / customer',
                      'Destination',
                      'Version',
                      'Final amount',
                      'Created by',
                      'Last sent',
                      'Last viewed',
                      'Created',
                    ].map((value) => (
                      <th key={value} className="px-4 py-3">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.data.map((quotation) => {
                    const version = quotation.versions[0];
                    return (
                      <tr key={quotation.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <Link
                            className="font-semibold text-brand-700"
                            to={`/quotations/${quotation.id}`}
                          >
                            {quotation.quotationNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-4">
                          <Link className="text-brand-700" to={`/queries/${quotation.query.id}`}>
                            {quotation.query.queryNumber}
                          </Link>
                          <p>{quotation.customerName}</p>
                        </td>
                        <td className="px-4 py-4">{quotation.destinationSummary}</td>
                        <td className="px-4 py-4">v{version?.versionNumber ?? '—'}</td>
                        <td className="px-4 py-4 font-semibold">
                          {version
                            ? new Intl.NumberFormat('en-IN', {
                                style: 'currency',
                                currency: version.currency,
                              }).format(Number(version.finalAmount))
                            : '—'}
                        </td>
                        <td className="px-4 py-4">{quotation.createdBy.fullName}</td>
                        <td className="px-4 py-4">
                          {quotation.lastSentAt
                            ? new Date(quotation.lastSentAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-4">
                          {quotation.lastViewedAt
                            ? new Date(quotation.lastViewedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-4">
                          {new Date(quotation.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {list.data.data.map((quotation) => {
                const version = quotation.versions[0];
                return (
                  <li key={quotation.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        className="font-semibold text-brand-700"
                        to={`/quotations/${quotation.id}`}
                      >
                        {quotation.quotationNumber}
                      </Link>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {quotation.customerName}
                    </p>
                    <p className="text-xs text-slate-500">{quotation.destinationSummary}</p>
                    <p className="mt-1 text-sm">
                      v{version?.versionNumber ?? '—'} ·{' '}
                      <span className="font-semibold">
                        {version
                          ? new Intl.NumberFormat('en-IN', {
                              style: 'currency',
                              currency: version.currency,
                            }).format(Number(version.finalAmount))
                          : '—'}
                      </span>
                    </p>
                    <Link
                      className="mt-2 inline-block text-sm font-medium text-brand-700"
                      to={`/quotations/${quotation.id}`}
                    >
                      Open quotation →
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
