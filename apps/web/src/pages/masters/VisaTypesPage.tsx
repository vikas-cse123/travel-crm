import { Archive, Eye, FileText, Pencil, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useArchiveVisaType, useDestinations, useVisaTypes } from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

export function VisaTypesPage() {
  const [params, setParams] = useSearchParams();
  const visaTypes = useVisaTypes(params);
  const destinations = useDestinations(LARGE);
  const archive = useArchiveVisaType();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_VISA_TYPES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_VISA_TYPES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_VISA_TYPES_DELETE);
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
        title="Visa Types Master"
        description="Maintain reusable visa types per destination with rich-text sections."
        current="Visa Types"
        action={
          canCreate ? (
            <Link to="/masters/visa-types/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Visa Type
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_220px_160px]">
          <label className="relative">
            <span className="sr-only">Search visa types</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search visa types"
              placeholder="Search visa type or destination…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Visa type destination"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('destinationId') ?? ''}
            onChange={(event) => update('destinationId', event.target.value)}
          >
            <option value="">All destinations</option>
            {destinations.data?.data.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
          {canUpdate ? (
            <select
              aria-label="Visa type status"
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
        {visaTypes.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : visaTypes.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Visa types could not be loaded.
          </div>
        ) : !visaTypes.data?.data.length ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No visa types found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first visa type.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {['Destination', 'Visa Type Name', 'Sections', 'Status', 'Actions'].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visaTypes.data.data.map((visa) => (
                    <tr key={visa.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{visa.destination.name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{visa.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-cyan-100 px-2 py-1 font-semibold text-cyan-800">
                          {visa._count.sections}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={visa.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${visa.name}`}
                            to={`/masters/visa-types/${visa.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${visa.name}`}
                              to={`/masters/visa-types/${visa.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && visa.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${visa.name}`}
                              onClick={() => archiveRow(visa.id, visa.name)}
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
              {visaTypes.data.data.map((visa) => (
                <article key={visa.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{visa.name}</h2>
                      <p className="text-sm text-slate-500">
                        {visa.destination.name} · {visa._count.sections} sections
                      </p>
                    </div>
                    <StatusBadge value={visa.status} />
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/visa-types/${visa.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/visa-types/${visa.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={visaTypes.data.pagination.page}
              totalPages={visaTypes.data.pagination.totalPages}
              total={visaTypes.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
