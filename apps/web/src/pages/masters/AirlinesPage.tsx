import { useEffect, useState } from 'react';
import { Archive, Eye, EyeOff, Pencil, Plane, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  airlineLogoUrl,
  useAirlines,
  useArchiveAirline,
  useHideGlobalMaster,
} from '@/features/masters/masters.api';
import {
  formatMasterDate,
  GlobalBadge,
  HIDE_GLOBAL_CONFIRM,
  MasterHeader,
  Pagination,
} from './MasterUi';

const airlineLogoUrlCache = new Map<string, string>();

export function AirlinesPage() {
  const [params, setParams] = useSearchParams();
  const airlines = useAirlines(params);
  const archive = useArchiveAirline();
  const hideMaster = useHideGlobalMaster();
  const { hasPermission } = useAuth();
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const canCreate = hasPermission(PERMISSIONS.MASTER_AIRLINES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_AIRLINES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_AIRLINES_DELETE);
  const logoIdsKey =
    airlines.data?.data
      .filter((airline) => airline.hasLogo)
      .map((airline) => airline.id)
      .join('|') ?? '';

  useEffect(() => {
    const rowsWithLogos = airlines.data?.data.filter((airline) => airline.hasLogo);
    if (!rowsWithLogos?.length) return;

    const cachedEntries = rowsWithLogos.flatMap((airline) => {
      const cachedUrl = airlineLogoUrlCache.get(airline.id);
      return cachedUrl ? ([[airline.id, cachedUrl]] as const) : [];
    });
    if (cachedEntries.length) {
      setLogoUrls((current) => {
        const next = { ...current };
        cachedEntries.forEach(([id, url]) => {
          next[id] = url;
        });
        return next;
      });
    }

    const missingRows = rowsWithLogos.filter((airline) => !airlineLogoUrlCache.has(airline.id));
    if (!missingRows.length) return;

    let active = true;
    void Promise.all(
      missingRows.map(async (airline) => {
        try {
          const result = await airlineLogoUrl(airline.id);
          return [airline.id, result.url] as const;
        } catch {
          return [airline.id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setLogoUrls((current) => {
        const next = { ...current };
        entries.forEach(([id, url]) => {
          if (url) {
            airlineLogoUrlCache.set(id, url);
            next[id] = url;
          }
        });
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [airlines.data?.data, logoIdsKey]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const archiveRow = (id: string) => {
    if (window.confirm('Are you sure you want to delete this airline?')) archive.mutate(id);
  };
  const hideRow = (id: string) => {
    if (window.confirm(HIDE_GLOBAL_CONFIRM))
      hideMaster.mutate({ masterType: 'AIRLINE', masterId: id });
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Airline Master"
        description=""
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
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4">
          <label className="relative block">
            <span className="sr-only">Search airlines</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search airlines"
              placeholder="Search airline…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
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
                <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {['Logo', 'Airline', 'Created', 'Actions'].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {airlines.data.data.map((airline) => (
                    <tr key={airline.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex h-9 w-14 items-center justify-center rounded bg-slate-100 text-slate-500">
                          {logoUrls[airline.id] ? (
                            <img
                              src={logoUrls[airline.id]}
                              alt=""
                              className="h-full w-full rounded object-contain"
                            />
                          ) : airline.hasLogo ? (
                            <Plane className="h-4 w-4 text-slate-300" />
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">
                              No Logo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {airline.name}
                        {airline.isGlobal && <GlobalBadge />}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatMasterDate(airline.createdAt)}
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
                          {canUpdate && !airline.isGlobal && (
                            <Link
                              aria-label={`Edit ${airline.name}`}
                              to={`/masters/airlines/${airline.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {airline.canHide && (
                            <button
                              aria-label={`Hide ${airline.name} for this company`}
                              title="Hide this global record for your company"
                              onClick={() => hideRow(airline.id)}
                              className="rounded bg-amber-600 p-2 text-white"
                            >
                              <EyeOff className="h-4 w-4" />
                            </button>
                          )}
                          {canArchive && airline.status !== 'ARCHIVED' && !airline.isGlobal && (
                            <button
                              aria-label={`Archive ${airline.name}`}
                              onClick={() => archiveRow(airline.id)}
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
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">
                      {logoUrls[airline.id] ? (
                        <img
                          src={logoUrls[airline.id]}
                          alt=""
                          className="h-full w-full rounded object-contain"
                        />
                      ) : airline.hasLogo ? (
                        <Plane className="h-4 w-4 text-slate-300" />
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400">No Logo</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">
                        {airline.name}
                        {airline.isGlobal && <GlobalBadge />}
                      </h2>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/airlines/${airline.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && !airline.isGlobal && (
                      <Link to={`/masters/airlines/${airline.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                    {airline.canHide && (
                      <Button
                        variant="secondary"
                        onClick={() => hideRow(airline.id)}
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
              page={airlines.data.pagination.page}
              pageSize={airlines.data.pagination.pageSize}
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
