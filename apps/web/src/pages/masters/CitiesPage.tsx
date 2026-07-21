import { Archive, Eye, MapPin, Pencil, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useArchiveCity, useCities, useMasterLookups } from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

export function CitiesPage() {
  const [params, setParams] = useSearchParams();
  const cities = useCities(params);
  const lookups = useMasterLookups();
  const archive = useArchiveCity();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_CITIES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_CITIES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_CITIES_DELETE);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const archiveCity = (id: string, name: string) => {
    if (window.confirm(`Archive ${name}? Existing destination relationships will remain visible.`))
      archive.mutate(id);
  };
  return (
    <div className="space-y-5">
      <MasterHeader
        title="City Master"
        description="Maintain reusable cities and airport codes for destination planning."
        current="Cities"
        action={
          canCreate ? (
            <Link to="/masters/cities/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add New City
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_240px_180px]">
          <label className="relative">
            <span className="sr-only">Search cities</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search cities"
              placeholder="Search city, airport code or country…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(e) => update('search', e.target.value)}
            />
          </label>
          <select
            aria-label="City country"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('country') ?? ''}
            onChange={(e) => update('country', e.target.value)}
          >
            <option value="">All countries</option>
            {lookups.data?.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          {canUpdate ? (
            <select
              aria-label="City status"
              className="rounded-lg border px-3 py-2.5 text-sm"
              value={params.get('status') ?? ''}
              onChange={(e) => update('status', e.target.value)}
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
        {cities.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : cities.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Cities could not be loaded.
          </div>
        ) : !cities.data?.data.length ? (
          <div className="p-12 text-center">
            <MapPin className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No cities found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first city.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {['Country', 'City name', 'Airport code', 'Status', 'Created', 'Actions'].map(
                      (h) => (
                        <th key={h} className="px-4 py-3">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cities.data.data.map((city) => (
                    <tr key={city.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{city.countryName}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{city.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-blue-50 px-2 py-1 font-mono text-blue-700">
                          {city.airportCode ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={city.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(city.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${city.name}`}
                            to={`/masters/cities/${city.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${city.name}`}
                              to={`/masters/cities/${city.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && city.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${city.name}`}
                              onClick={() => archiveCity(city.id, city.name)}
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
              {cities.data.data.map((city) => (
                <article key={city.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold">{city.name}</h2>
                      <p className="text-sm text-slate-500">
                        {city.countryName} · {city.airportCode ?? 'No airport code'}
                      </p>
                    </div>
                    <StatusBadge value={city.status} />
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/cities/${city.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/cities/${city.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={cities.data.pagination.page}
              totalPages={cities.data.pagination.totalPages}
              total={cities.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
