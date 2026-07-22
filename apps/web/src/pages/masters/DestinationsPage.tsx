import { Archive, Eye, Globe2, Pencil, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useArchiveDestination,
  useDestinations,
  useMasterLookups,
} from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

export function DestinationsPage() {
  const [params, setParams] = useSearchParams();
  const destinations = useDestinations(params);
  const lookups = useMasterLookups();
  const archive = useArchiveDestination();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_DESTINATIONS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_DESTINATIONS_DELETE);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const archiveRow = (id: string, name: string) => {
    if (window.confirm(`Archive ${name}? Existing records using it will remain intact.`)) {
      archive.mutate(id);
    }
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Destination Master"
        description="Build reusable destinations with ordered cities and customer-facing policies."
        current="Destinations"
        action={
          canCreate ? (
            <Link to="/masters/destinations/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Destination
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_220px_180px_180px]">
          <label className="relative">
            <span className="sr-only">Search destinations</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search destinations"
              placeholder="Search destination, country or city…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Destination country"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('country') ?? ''}
            onChange={(event) => update('country', event.target.value)}
          >
            <option value="">All countries</option>
            {lookups.data?.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Destination type"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('destinationType') ?? ''}
            onChange={(event) => update('destinationType', event.target.value)}
          >
            <option value="">All types</option>
            <option value="DOMESTIC">Domestic</option>
            <option value="INTERNATIONAL">International</option>
          </select>
          {canUpdate ? (
            <select
              aria-label="Destination status"
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
        {destinations.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : destinations.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Destinations could not be loaded.
          </div>
        ) : !destinations.data?.data.length ? (
          <div className="p-12 text-center">
            <Globe2 className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No destinations found</h2>
            <p className="text-sm text-slate-500">
              Adjust the filters or add the first destination.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {[
                      'Destination',
                      'Country',
                      'Type',
                      'Cities',
                      'Status',
                      'Created',
                      'Actions',
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {destinations.data.data.map((destination) => (
                    <tr key={destination.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-cyan-50 text-blue-600">
                            <Globe2 className="h-5 w-5" />
                          </div>
                          <span className="font-semibold text-slate-900">{destination.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{destination.countryName}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={destination.destinationType} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-cyan-100 px-2 py-1 font-semibold text-cyan-800">
                          {destination._count.cities}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={destination.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(destination.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${destination.name}`}
                            to={`/masters/destinations/${destination.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${destination.name}`}
                              to={`/masters/destinations/${destination.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && destination.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${destination.name}`}
                              onClick={() => archiveRow(destination.id, destination.name)}
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
              {destinations.data.data.map((destination) => (
                <article key={destination.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{destination.name}</h2>
                      <p className="text-sm text-slate-500">
                        {destination.countryName} · {destination._count.cities} cities
                      </p>
                    </div>
                    <StatusBadge value={destination.destinationType} />
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/destinations/${destination.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/destinations/${destination.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={destinations.data.pagination.page}
              totalPages={destinations.data.pagination.totalPages}
              total={destinations.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
