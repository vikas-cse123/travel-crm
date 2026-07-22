import { Archive, Eye, Pencil, Plane, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { COUNTRIES, PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAirlines, useArchiveAirline } from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

export function AirlinesPage() {
  const [params, setParams] = useSearchParams();
  const airlines = useAirlines(params);
  const archive = useArchiveAirline();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_AIRLINES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_AIRLINES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_AIRLINES_DELETE);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const archiveRow = (id: string, name: string) => {
    if (window.confirm(`Archive ${name}? Existing records using it will remain intact.`))
      archive.mutate(id);
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Airline Master"
        description="Maintain the airlines used across quotations and bookings."
        current="Airlines"
        action={
          canCreate ? (
            <Link to="/masters/airlines/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Airline
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_200px_160px]">
          <label className="relative">
            <span className="sr-only">Search airlines</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search airlines"
              placeholder="Search airline or code…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Airline country"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('country') ?? ''}
            onChange={(event) => update('country', event.target.value)}
          >
            <option value="">All countries</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          {canUpdate ? (
            <select
              aria-label="Airline status"
              className="rounded-lg border px-3 py-2.5 text-sm"
              value={params.get('status') ?? ''}
              onChange={(event) => update('status', event.target.value)}
            >
              <option value="">Current statuses</option>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
              <option>ARCHIVED</option>
            </select>
          ) : (
            <div />
          )}
        </div>
        {airlines.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : airlines.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Airlines could not be loaded.
          </div>
        ) : !airlines.data?.data.length ? (
          <div className="p-12 text-center">
            <Plane className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No airlines found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first airline.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {['Logo', 'Airline', 'IATA', 'ICAO', 'Country', 'Status', 'Updated', 'Actions'].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {airlines.data.data.map((airline) => (
                    <tr key={airline.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex h-9 w-14 items-center justify-center rounded bg-slate-100 text-slate-500">
                          {airline.hasLogo ? (
                            <Plane className="h-4 w-4 text-brand-600" />
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">No Logo</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{airline.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{airline.iataCode ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{airline.icaoCode ?? '—'}</td>
                      <td className="px-4 py-3">{airline.countryName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={airline.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(airline.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${airline.name}`}
                            to={`/masters/airlines/${airline.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${airline.name}`}
                              to={`/masters/airlines/${airline.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && airline.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${airline.name}`}
                              onClick={() => archiveRow(airline.id, airline.name)}
                              className="rounded bg-red-600 p-2 text-white"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {airlines.data.data.map((airline) => (
                <article key={airline.id} className="flex items-center justify-between gap-2 p-4">
                  <div>
                    <h2 className="font-semibold">{airline.name}</h2>
                    <p className="font-mono text-xs text-slate-500">
                      {airline.iataCode ?? '—'} · {airline.icaoCode ?? '—'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/airlines/${airline.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/airlines/${airline.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={airlines.data.pagination.page}
              totalPages={airlines.data.pagination.totalPages}
              total={airlines.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
