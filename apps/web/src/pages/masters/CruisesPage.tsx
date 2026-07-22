import { Archive, Eye, Pencil, Plus, RotateCcw, Search, Ship } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useArchiveCruise, useCruises, useRestoreCruise } from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

/** Strip HTML so the reference's truncated description column stays readable. */
function plainText(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function priceRangeLabel(range?: { min: number; max: number } | null): string {
  if (!range) return '—';
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return range.min === range.max
    ? format(range.min)
    : `${format(range.min)} – ${format(range.max)}`;
}

export function CruisesPage() {
  const [params, setParams] = useSearchParams();
  const cruises = useCruises(params);
  const archive = useArchiveCruise();
  const restore = useRestoreCruise();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_CRUISES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_CRUISES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_CRUISES_DELETE);
  const canViewCosting = hasPermission(PERMISSIONS.MASTER_CRUISES_VIEW_COSTING);

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

  const columns = [
    'Image',
    'Name',
    'Description',
    'Room Types',
    ...(canViewCosting ? ['Price Range'] : []),
    'Status',
    'Created',
    'Actions',
  ];

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Cruise Master"
        description="Maintain the cruises and cabin categories offered to travellers."
        current="Cruises"
        action={
          canCreate ? (
            <Link to="/masters/cruises/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Cruise
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <label className="relative">
            <span className="sr-only">Search cruises</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search cruises"
              placeholder="Search cruises…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          {canUpdate ? (
            <select
              aria-label="Cruise status"
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

        {cruises.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : cruises.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Cruises could not be loaded.
          </div>
        ) : !cruises.data?.data.length ? (
          <div className="p-12 text-center">
            <Ship className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No cruises found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first cruise.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {columns.map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cruises.data.data.map((cruise) => (
                    <tr key={cruise.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex h-9 w-14 items-center justify-center rounded bg-slate-100 text-slate-500">
                          {cruise.hasImage ? (
                            <Ship className="h-4 w-4 text-brand-600" />
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">
                              No Image
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{cruise.name}</td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">
                        <span className="line-clamp-2 block">
                          {plainText(cruise.description) || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          {cruise.roomTypeCount ?? 0} type
                          {(cruise.roomTypeCount ?? 0) === 1 ? '' : 's'}
                        </span>
                      </td>
                      {canViewCosting && (
                        <td className="px-4 py-3 text-slate-600">
                          {priceRangeLabel(cruise.priceRange)}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <StatusBadge value={cruise.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(cruise.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${cruise.name}`}
                            to={`/masters/cruises/${cruise.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${cruise.name}`}
                              to={`/masters/cruises/${cruise.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && cruise.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${cruise.name}`}
                              onClick={() => archiveRow(cruise.id, cruise.name)}
                              className="rounded bg-red-600 p-2 text-white"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                          {canUpdate && cruise.status === 'ARCHIVED' && (
                            <button
                              aria-label={`Restore ${cruise.name}`}
                              onClick={() => restore.mutate(cruise.id)}
                              className="rounded bg-emerald-600 p-2 text-white"
                            >
                              <RotateCcw className="h-4 w-4" />
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
              {cruises.data.data.map((cruise) => (
                <article key={cruise.id} className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{cruise.name}</h2>
                    <p className="text-xs text-slate-500">
                      {cruise.roomTypeCount ?? 0} room type
                      {(cruise.roomTypeCount ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/masters/cruises/${cruise.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/cruises/${cruise.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={cruises.data.pagination.page}
              totalPages={cruises.data.pagination.totalPages}
              total={cruises.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
