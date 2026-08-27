import { useEffect, useState } from 'react';
import { Archive, Eye, EyeOff, Pencil, Plus, RotateCcw, Search, Ship, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { ExcelImportDialog } from '@/features/masters/excel-import/ExcelImportDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  cruiseImageUrl,
  masterImageFingerprint,
  useArchiveCruise,
  useCruises,
  useHideGlobalMaster,
  useRestoreCruise,
} from '@/features/masters/masters.api';
import {
  formatMasterDate,
  GlobalBadge,
  HIDE_GLOBAL_CONFIRM,
  MasterHeader,
  Pagination,
  RichTextPreview,
  StatusBadge,
} from './MasterUi';

const cruiseImageUrlCache = new Map<string, { fingerprint: string; url: string }>();

function priceRangeLabel(range?: { min: number; max: number } | null): string {
  if (!range) return '—';
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return range.min === range.max
    ? format(range.min)
    : `${format(range.min)} – ${format(range.max)}`;
}

export function CruisesPage() {
  const [params, setParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const cruises = useCruises(params);
  const archive = useArchiveCruise();
  const restore = useRestoreCruise();
  const hideMaster = useHideGlobalMaster();
  const { hasPermission } = useAuth();
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const canCreate = hasPermission(PERMISSIONS.MASTER_CRUISES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_CRUISES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_CRUISES_DELETE);
  const canViewCosting = hasPermission(PERMISSIONS.MASTER_CRUISES_VIEW_COSTING);
  const imageIdsKey =
    cruises.data?.data
      .filter((cruise) => cruise.hasImage)
      .map((cruise) => `${cruise.id}:${masterImageFingerprint(cruise)}`)
      .join('|') ?? '';

  useEffect(() => {
    const rowsWithImages = cruises.data?.data.filter((cruise) => cruise.hasImage);
    if (!rowsWithImages?.length) return;

    const cachedEntries = rowsWithImages.flatMap((cruise) => {
      const cached = cruiseImageUrlCache.get(cruise.id);
      return cached?.fingerprint === masterImageFingerprint(cruise)
        ? ([[cruise.id, cached.url]] as const)
        : [];
    });
    setImageUrls((current) => {
      const next = { ...current };
      rowsWithImages.forEach((cruise) => {
        delete next[cruise.id];
      });
      cachedEntries.forEach(([id, url]) => {
        next[id] = url;
      });
      return next;
    });

    const missingRows = rowsWithImages.filter(
      (cruise) =>
        cruiseImageUrlCache.get(cruise.id)?.fingerprint !== masterImageFingerprint(cruise),
    );
    if (!missingRows.length) return;

    let active = true;
    void Promise.all(
      missingRows.map(async (cruise) => {
        try {
          const result = await cruiseImageUrl(cruise.id);
          return [cruise.id, result.url] as const;
        } catch {
          return [cruise.id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setImageUrls((current) => {
        const next = { ...current };
        entries.forEach(([id, url]) => {
          if (url) {
            const cruise = missingRows.find((row) => row.id === id);
            cruiseImageUrlCache.set(id, {
              fingerprint: cruise ? masterImageFingerprint(cruise) : '',
              url,
            });
            next[id] = url;
          }
        });
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [cruises.data?.data, imageIdsKey]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const archiveRow = (id: string) => {
    if (window.confirm('Are you sure you want to delete this cruise?')) archive.mutate(id);
  };
  const hideRow = (id: string) => {
    if (window.confirm(HIDE_GLOBAL_CONFIRM))
      hideMaster.mutate({ masterType: 'CRUISE', masterId: id });
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
        description=""
        current="Cruises"
        action={
          canCreate ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import Excel
              </Button>
              <Link to="/masters/cruises/new">
                <Button>
                  <Plus className="h-4 w-4" /> Add New Cruise
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />
      <ExcelImportDialog open={importOpen} onClose={() => setImportOpen(false)} initialMasterType="CRUISE" onSuccess={() => cruises.refetch()} />
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <label className="relative block">
            <span className="sr-only">Search cruises</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                        <div className="flex h-10 w-16 items-center justify-center overflow-hidden rounded bg-slate-100 text-slate-500">
                          {cruise.hasImage && imageUrls[cruise.id] ? (
                            <img
                              src={imageUrls[cruise.id]}
                              alt={`${cruise.name} image`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Ship className="h-4 w-4 text-brand-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {cruise.name}
                        {cruise.isGlobal && <GlobalBadge />}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-600">
                        <RichTextPreview html={cruise.description} />
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
                        {formatMasterDate(cruise.createdAt)}
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
                          {canUpdate && !cruise.isGlobal && (
                            <Link
                              aria-label={`Edit ${cruise.name}`}
                              to={`/masters/cruises/${cruise.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {cruise.canHide && (
                            <button
                              aria-label={`Hide ${cruise.name} for this company`}
                              title="Hide this global record for your company"
                              onClick={() => hideRow(cruise.id)}
                              className="rounded bg-amber-600 p-2 text-white"
                            >
                              <EyeOff className="h-4 w-4" />
                            </button>
                          )}
                          {canArchive && cruise.status !== 'ARCHIVED' && !cruise.isGlobal && (
                            <button
                              aria-label={`Archive ${cruise.name}`}
                              onClick={() => archiveRow(cruise.id)}
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
                    <h2 className="truncate font-semibold">
                      {cruise.name}
                      {cruise.isGlobal && <GlobalBadge />}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {cruise.roomTypeCount ?? 0} room type
                      {(cruise.roomTypeCount ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/masters/cruises/${cruise.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && !cruise.isGlobal && (
                      <Link to={`/masters/cruises/${cruise.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                    {cruise.canHide && (
                      <Button
                        variant="secondary"
                        onClick={() => hideRow(cruise.id)}
                        title="Hide for this company"
                      >
                        Hide
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={cruises.data.pagination.page}
              pageSize={cruises.data.pagination.pageSize}
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
