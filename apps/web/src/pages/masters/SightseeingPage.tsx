import { useMemo } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Building2,
  Clock,
  Eye,
  Image as ImageIcon,
  MapPinned,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useArchiveSightseeing,
  useCities,
  useDestinations,
  useReorderSightseeing,
  useRestoreSightseeing,
  useSightseeingList,
  useSightseeingSummary,
  type Sightseeing,
} from '@/features/masters/masters.api';
import { MasterHeader, Pagination } from './MasterUi';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

/** Strip HTML so the truncated description column stays readable. */
function plainText(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "14:30" → "2:30 PM", matching the reference's start-time column. */
function formatTime(value: string | null): string {
  if (!value) return '—';
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minuteText ?? '00'} ${suffix}`;
}

/**
 * Sightseeing list.
 *
 * The reference groups rows by Destination and then by City, which is what
 * makes the sequence column meaningful, so the same grouping is rebuilt here
 * from the flat paginated response.
 */
export function SightseeingPage() {
  const [params, setParams] = useSearchParams();
  const rows = useSightseeingList(params);
  const summary = useSightseeingSummary();
  const destinations = useDestinations(LARGE);
  const cities = useCities(LARGE);
  const archive = useArchiveSightseeing();
  const restore = useRestoreSightseeing();
  const reorder = useReorderSightseeing();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_SIGHTSEEING_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_SIGHTSEEING_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_SIGHTSEEING_DELETE);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Changing destination invalidates any city already chosen.
    if (key === 'destinationId') next.delete('cityId');
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const archiveRow = (id: string, title: string) => {
    if (window.confirm(`Archive ${title}? Existing records using it will remain intact.`))
      archive.mutate(id);
  };

  /** Group the page into destination → city buckets, preserving server order. */
  const groups = useMemo(() => {
    const data = rows.data?.data ?? [];
    const byDestination = new Map<
      string,
      { name: string; cities: Map<string, { name: string; items: Sightseeing[] }> }
    >();
    for (const row of data) {
      const destination = byDestination.get(row.destination.id) ?? {
        name: row.destination.name,
        cities: new Map<string, { name: string; items: Sightseeing[] }>(),
      };
      const city = destination.cities.get(row.city.id) ?? { name: row.city.name, items: [] };
      city.items.push(row);
      destination.cities.set(row.city.id, city);
      byDestination.set(row.destination.id, destination);
    }
    return [...byDestination.entries()];
  }, [rows.data]);

  const stats = summary.data;

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Sightseeing Master"
        description="Organized by destinations — reusable attractions, tours and transfers."
        current="Sightseeing"
        action={
          canCreate ? (
            <Link to="/masters/sightseeing/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Sightseeing
              </Button>
            </Link>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_200px_200px_150px]">
          <label className="relative">
            <span className="sr-only">Search sightseeing</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search sightseeing"
              placeholder="Search sightseeing…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Destination"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('destinationId') ?? ''}
            onChange={(event) => update('destinationId', event.target.value)}
          >
            <option value="">All Destinations</option>
            {(destinations.data?.data ?? []).map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
          <select
            aria-label="City"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('cityId') ?? ''}
            onChange={(event) => update('cityId', event.target.value)}
          >
            <option value="">All Cities</option>
            {(cities.data?.data ?? []).map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          {canUpdate ? (
            <select
              aria-label="Sightseeing status"
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

        {rows.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : rows.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Sightseeing could not be loaded.
          </div>
        ) : !rows.data?.data.length ? (
          <div className="p-12 text-center">
            <MapPinned className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No sightseeing found</h2>
            <p className="text-sm text-slate-500">
              Adjust the filters or add the first sightseeing entry.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop: destination → city grouped tables. */}
            <div className="hidden md:block">
              {groups.map(([destinationId, destination]) => (
                <section key={destinationId} className="border-b last:border-b-0">
                  <header className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <MapPinned className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      <h2 className="font-semibold text-brand-700">{destination.name}</h2>
                      <span className="text-xs text-slate-500">
                        {[...destination.cities.values()].reduce(
                          (total, city) => total + city.items.length,
                          0,
                        )}{' '}
                        attractions ({destination.cities.size}{' '}
                        {destination.cities.size === 1 ? 'city' : 'cities'})
                      </span>
                    </div>
                    <Link
                      to={`/masters/destinations/${destinationId}`}
                      className="text-xs font-medium text-slate-600 hover:text-brand-700"
                    >
                      View Dest.
                    </Link>
                  </header>

                  {[...destination.cities.entries()].map(([cityId, city]) => (
                    <div key={cityId}>
                      <div className="flex items-center gap-2 border-y bg-slate-100/70 px-4 py-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        <span className="text-xs font-semibold text-slate-700">{city.name}</span>
                        <span className="rounded bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-700">
                          {city.items.length}
                        </span>
                      </div>
                      <table className="min-w-full text-left text-sm">
                        <thead className="sr-only">
                          <tr>
                            <th>Image</th>
                            <th>Title</th>
                            <th>City</th>
                            <th>Sequence</th>
                            <th>Duration</th>
                            <th>Start time</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {city.items.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50">
                              <td className="w-16 px-4 py-2.5">
                                <div className="flex h-9 w-12 items-center justify-center rounded bg-slate-100">
                                  <ImageIcon
                                    className={`h-4 w-4 ${row.hasImage ? 'text-brand-600' : 'text-slate-300'}`}
                                    aria-hidden="true"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <Link
                                  to={`/masters/sightseeing/${row.id}`}
                                  className="font-semibold text-brand-700 hover:underline"
                                >
                                  {row.title}
                                </Link>
                                <p className="line-clamp-1 text-xs text-slate-500">
                                  {plainText(row.description)}
                                </p>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="rounded bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-white">
                                  {row.city.name}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  {row.sequence}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                {row.estimatedHours != null ? (
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    {row.estimatedHours.toFixed(1)}h
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-slate-600">
                                {row.suggestedStartTime ? (
                                  <span className="inline-flex items-center gap-1 text-xs">
                                    <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                                    {formatTime(row.suggestedStartTime)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1">
                                  {canUpdate && (
                                    <>
                                      <button
                                        aria-label={`Move ${row.title} up`}
                                        onClick={() =>
                                          reorder.mutate({ id: row.id, direction: 'UP' })
                                        }
                                        className="rounded border p-1.5 text-slate-600 hover:bg-slate-100"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        aria-label={`Move ${row.title} down`}
                                        onClick={() =>
                                          reorder.mutate({ id: row.id, direction: 'DOWN' })
                                        }
                                        className="rounded border p-1.5 text-slate-600 hover:bg-slate-100"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <Link
                                    aria-label={`View ${row.title}`}
                                    to={`/masters/sightseeing/${row.id}`}
                                    className="rounded bg-cyan-600 p-1.5 text-white"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                  {canUpdate && (
                                    <Link
                                      aria-label={`Edit ${row.title}`}
                                      to={`/masters/sightseeing/${row.id}/edit`}
                                      className="rounded bg-brand-600 p-1.5 text-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Link>
                                  )}
                                  {canArchive && row.status !== 'ARCHIVED' && (
                                    <button
                                      aria-label={`Archive ${row.title}`}
                                      onClick={() => archiveRow(row.id, row.title)}
                                      className="rounded bg-red-600 p-1.5 text-white"
                                    >
                                      <Archive className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canUpdate && row.status === 'ARCHIVED' && (
                                    <button
                                      aria-label={`Restore ${row.title}`}
                                      onClick={() => restore.mutate(row.id)}
                                      className="rounded bg-emerald-600 p-1.5 text-white"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </section>
              ))}
            </div>

            {/* Mobile: flat cards. */}
            <div className="divide-y md:hidden">
              {(rows.data?.data ?? []).map((row) => (
                <article key={row.id} className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{row.title}</h2>
                    <p className="text-xs text-slate-500">
                      {row.destination.name} · {row.city.name} · #{row.sequence}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/masters/sightseeing/${row.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/sightseeing/${row.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <Pagination
              page={rows.data.pagination.page}
              totalPages={rows.data.pagination.totalPages}
              total={rows.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>

      {stats && (
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
            Summary Statistics
          </h2>
          <dl className="grid grid-cols-2 divide-x divide-y text-center sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: 'Total Attractions', value: stats.totalAttractions },
              { label: 'Destinations', value: stats.destinations },
              { label: 'Cities Covered', value: stats.citiesCovered },
              { label: 'With Images', value: stats.withImages },
            ].map((tile) => (
              <div key={tile.label} className="p-4">
                <dt className="text-xs text-slate-500">{tile.label}</dt>
                <dd className="mt-0.5 text-xl font-semibold text-slate-900">{tile.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
