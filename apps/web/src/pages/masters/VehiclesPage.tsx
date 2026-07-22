import { Archive, Bus, Eye, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useArchiveVehicle,
  useRestoreVehicle,
  useVehicles,
  useVehicleTypes,
} from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

export function VehiclesPage() {
  const [params, setParams] = useSearchParams();
  const vehicles = useVehicles(params);
  // Free-text field, so the dropdown is built from values actually in use.
  const types = useVehicleTypes();
  const archive = useArchiveVehicle();
  const restore = useRestoreVehicle();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_VEHICLES_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_VEHICLES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_VEHICLES_DELETE);

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
        title="Vehicle Master"
        description="Maintain the vehicle categories used for transfers and sightseeing."
        current="Vehicles"
        action={
          canCreate ? (
            <Link to="/masters/vehicles/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Vehicle
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_200px_160px]">
          <label className="relative">
            <span className="sr-only">Search vehicles</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search vehicles"
              placeholder="Search vehicle or type…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <select
            aria-label="Vehicle type"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={params.get('vehicleType') ?? ''}
            onChange={(event) => update('vehicleType', event.target.value)}
          >
            <option value="">All Vehicle Types</option>
            {(types.data?.vehicleTypes ?? []).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          {canUpdate ? (
            <select
              aria-label="Vehicle status"
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

        {vehicles.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : vehicles.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Vehicles could not be loaded.
          </div>
        ) : !vehicles.data?.data.length ? (
          <div className="p-12 text-center">
            <Bus className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No vehicles found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first vehicle.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {[
                      'Image',
                      'Vehicle Name',
                      'Type',
                      'Capacity',
                      'Status',
                      'Created At',
                      'Actions',
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vehicles.data.data.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex h-9 w-14 items-center justify-center rounded bg-slate-100 text-slate-500">
                          {vehicle.hasImage ? (
                            <Bus className="h-4 w-4 text-brand-600" />
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">
                              No Image
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{vehicle.name}</td>
                      <td className="px-4 py-3 text-slate-700">{vehicle.vehicleType}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {vehicle.capacity != null ? `${vehicle.capacity} persons` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={vehicle.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(vehicle.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${vehicle.name}`}
                            to={`/masters/vehicles/${vehicle.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit ${vehicle.name}`}
                              to={`/masters/vehicles/${vehicle.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && vehicle.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${vehicle.name}`}
                              onClick={() => archiveRow(vehicle.id, vehicle.name)}
                              className="rounded bg-red-600 p-2 text-white"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                          {canUpdate && vehicle.status === 'ARCHIVED' && (
                            <button
                              aria-label={`Restore ${vehicle.name}`}
                              onClick={() => restore.mutate(vehicle.id)}
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
              {vehicles.data.data.map((vehicle) => (
                <article key={vehicle.id} className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{vehicle.name}</h2>
                    <p className="text-xs text-slate-500">
                      {vehicle.vehicleType}
                      {vehicle.capacity != null ? ` · ${vehicle.capacity} persons` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/masters/vehicles/${vehicle.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/vehicles/${vehicle.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={vehicles.data.pagination.page}
              totalPages={vehicles.data.pagination.totalPages}
              total={vehicles.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
