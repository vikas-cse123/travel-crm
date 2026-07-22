import { Archive, Building2, Eye, Pencil, Plus, Search, Star } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useArchiveHotel,
  useDestination,
  useDestinations,
  useHotels,
} from '@/features/masters/masters.api';
import { MasterHeader, Pagination, Stars, StatusBadge } from './MasterUi';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

export function HotelsPage() {
  const [params, setParams] = useSearchParams();
  const hotels = useHotels(params);
  const destinations = useDestinations(LARGE);
  const selectedDestination = params.get('destinationId') ?? '';
  const destinationDetail = useDestination(selectedDestination || undefined);
  const archive = useArchiveHotel();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_HOTELS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_HOTELS_DELETE);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'destinationId') next.delete('cityId');
    setParams(next);
  };
  const archiveRow = (id: string, name: string) => {
    if (window.confirm(`Archive ${name}? Existing records using it will remain intact.`))
      archive.mutate(id);
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Hotel Master"
        description="Maintain reusable hotels, room types and meal plans, organised by destination and city."
        current="Hotels"
        action={
          canCreate ? (
            <Link to="/masters/hotels/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Hotel
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_200px_180px_150px_150px]">
          <label className="relative">
            <span className="sr-only">Search hotels</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search hotels"
              placeholder="Search hotel, destination or city…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Hotel destination"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={selectedDestination}
            onChange={(event) => update('destinationId', event.target.value)}
          >
            <option value="">All destinations</option>
            {destinations.data?.data.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Hotel city"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('cityId') ?? ''}
            onChange={(event) => update('cityId', event.target.value)}
            disabled={!selectedDestination}
          >
            <option value="">{selectedDestination ? 'All cities' : 'Select a destination'}</option>
            {destinationDetail.data?.cities.map((link) => (
              <option key={link.cityId} value={link.cityId}>
                {link.city.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Hotel star category"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('starCategory') ?? ''}
            onChange={(event) => update('starCategory', event.target.value)}
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((star) => (
              <option key={star} value={star}>
                {star} Star
              </option>
            ))}
          </select>
          {canUpdate ? (
            <select
              aria-label="Hotel status"
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
        {hotels.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : hotels.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Hotels could not be loaded.
          </div>
        ) : !hotels.data?.data.length ? (
          <div className="p-12 text-center">
            <Building2 className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No hotels found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first hotel.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {[
                      'Hotel',
                      'Destination',
                      'City',
                      'Rating',
                      'Default',
                      'Status',
                      'Updated',
                      'Actions',
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hotels.data.data.map((hotel) => (
                    <tr key={hotel.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-orange-50 text-amber-600">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <span className="font-semibold text-slate-900">{hotel.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{hotel.destination.name}</td>
                      <td className="px-4 py-3">{hotel.city.name}</td>
                      <td className="px-4 py-3">
                        <Stars value={hotel.starCategory} />
                      </td>
                      <td className="px-4 py-3">
                        {hotel.isDefaultForCity ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                            <Star className="h-3 w-3" /> Default
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={hotel.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(hotel.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${hotel.name}`}
                            to={`/masters/hotels/${hotel.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${hotel.name}`}
                              to={`/masters/hotels/${hotel.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && hotel.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${hotel.name}`}
                              onClick={() => archiveRow(hotel.id, hotel.name)}
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
              {hotels.data.data.map((hotel) => (
                <article key={hotel.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{hotel.name}</h2>
                      <p className="text-sm text-slate-500">
                        {hotel.destination.name} · {hotel.city.name}
                      </p>
                      <Stars value={hotel.starCategory} />
                    </div>
                    <StatusBadge value={hotel.status} />
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/hotels/${hotel.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/hotels/${hotel.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={hotels.data.pagination.page}
              totalPages={hotels.data.pagination.totalPages}
              total={hotels.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
