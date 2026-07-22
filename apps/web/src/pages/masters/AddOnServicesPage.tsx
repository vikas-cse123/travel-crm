import { Archive, Eye, PackagePlus, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useAddOnServices,
  useArchiveAddOnService,
  useRestoreAddOnService,
} from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

/** Strip HTML so the reference's description column stays readable. */
function plainText(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    // An unknown ISO code should not break the row.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function AddOnServicesPage() {
  const [params, setParams] = useSearchParams();
  const services = useAddOnServices(params);
  const archive = useArchiveAddOnService();
  const restore = useRestoreAddOnService();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_DELETE);

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
        title="Add-On Services Master"
        description="Optional extras offered alongside trips."
        current="Add-On Services"
        action={
          canCreate ? (
            <Link to="/masters/add-on-services/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Service
              </Button>
            </Link>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <label className="relative">
            <span className="sr-only">Search add-on services</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search add-on services"
              placeholder="Search…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          {canUpdate ? (
            <select
              aria-label="Service status"
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

        {services.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : services.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Add-on services could not be loaded.
          </div>
        ) : !services.data?.data.length ? (
          <div className="p-12 text-center">
            <PackagePlus className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No add-on services found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first service.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {['Service Name', 'Description', 'Price', 'Status', 'Actions'].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {services.data.data.map((service) => (
                    <tr key={service.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{service.name}</td>
                      <td className="max-w-lg px-4 py-3 text-slate-600">
                        <span className="line-clamp-2 block">
                          {plainText(service.description) || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {money(service.price, service.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={service.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${service.name}`}
                            to={`/masters/add-on-services/${service.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${service.name}`}
                              to={`/masters/add-on-services/${service.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && service.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${service.name}`}
                              onClick={() => archiveRow(service.id, service.name)}
                              className="rounded bg-red-600 p-2 text-white"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                          {canUpdate && service.status === 'ARCHIVED' && (
                            <button
                              aria-label={`Restore ${service.name}`}
                              onClick={() => restore.mutate(service.id)}
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
              {services.data.data.map((service) => (
                <article key={service.id} className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{service.name}</h2>
                    <p className="text-xs text-slate-500">
                      {money(service.price, service.currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/masters/add-on-services/${service.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/add-on-services/${service.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <Pagination
              page={services.data.pagination.page}
              totalPages={services.data.pagination.totalPages}
              total={services.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
