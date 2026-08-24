import { Link, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, BedDouble, Pencil, RotateCcw, Ship } from 'lucide-react';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  cruiseImageUrl,
  useArchiveCruise,
  useCruise,
  useRestoreCruise,
} from '@/features/masters/masters.api';
import { MasterImageGalleryView } from './MasterImageGallery';
import { Breadcrumbs, formatMasterDate, LoadingCard, SafeRichText, StatusBadge } from './MasterUi';

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

export function CruiseDetailsPage() {
  const { cruiseId = '' } = useParams<{ cruiseId: string }>();
  const cruise = useCruise(cruiseId);
  const archive = useArchiveCruise();
  const restore = useRestoreCruise();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PERMISSIONS.MASTER_CRUISES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_CRUISES_DELETE);
  const canViewCosting = hasPermission(PERMISSIONS.MASTER_CRUISES_VIEW_COSTING);

  if (cruise.isPending) return <LoadingCard />;
  if (cruise.isError)
    return (
      <div role="alert" className="rounded-xl border bg-card p-8 text-center text-red-700">
        This cruise could not be loaded.
      </div>
    );

  const value = cruise.data;
  const roomTypes = value.roomTypes ?? [];
  const activeCount = value.activeRoomTypeCount ?? 0;
  const priceRange = value.priceRange;
  const formatPrice = (amount: number) =>
    amount.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Breadcrumbs current="Cruises" />
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{value.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <StatusBadge value={value.status} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/masters/cruises">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to List
            </Button>
          </Link>
          {canUpdate && (
            <Link to={`/masters/cruises/${cruiseId}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
          )}
          {canArchive && value.status !== 'ARCHIVED' && (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this cruise?')) {
                  archive.mutate(cruiseId);
                }
              }}
            >
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          {canUpdate && value.status === 'ARCHIVED' && (
            <Button variant="secondary" onClick={() => restore.mutate(cruiseId)}>
              <RotateCcw className="h-4 w-4" /> Restore
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
            Cruise Information
          </h2>
          <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div className="min-h-40 overflow-hidden rounded-lg bg-slate-50">
              {value.hasImage ? (
                <MasterImageGalleryView
                  masterId={value.id}
                  entity={value}
                  download={cruiseImageUrl}
                  alt={value.name}
                />
              ) : (
                <div className="flex h-40 items-center justify-center border">
                  <Ship className="h-10 w-10 text-slate-300" />
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Cruise Name</dt>
                <dd className="font-medium text-slate-900">{value.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Price</dt>
                <dd className="text-slate-800">
                  {value.price != null
                    ? money(value.price, value.currency ?? 'INR')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Created</dt>
                <dd className="text-slate-800">{formatMasterDate(value.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Created By</dt>
                <dd className="text-slate-800">{value.createdBy?.fullName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last Updated</dt>
                <dd className="text-slate-800">{formatMasterDate(value.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Updated By</dt>
                <dd className="text-slate-800">{value.updatedBy?.fullName ?? '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="border-t p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Description</h3>
            <SafeRichText html={value.description} empty="No description added." />
          </div>
        </section>

        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-800">Room Types</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {roomTypes.length} type{roomTypes.length === 1 ? '' : 's'}
              </span>
            </div>
            {roomTypes.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No room types added yet.</p>
            ) : (
              <ul className="divide-y">
                {roomTypes.map((roomType) => (
                  <li key={roomType.id} className="flex items-start gap-3 px-4 py-3">
                    <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-brand-700">{roomType.name}</p>
                      {roomType.description && (
                        <div className="mt-1 text-xs text-slate-500">
                          <SafeRichText html={roomType.description} />
                        </div>
                      )}
                    </div>
                    {canViewCosting && roomType.price != null && (
                      <span className="shrink-0 text-sm font-medium text-slate-800">
                        {formatPrice(roomType.price)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
              Quick Stats
            </h2>
            <div className="grid grid-cols-2 divide-x border-b text-center">
              <div className="py-3">
                <p className="text-xl font-semibold text-brand-700">{roomTypes.length}</p>
                <p className="text-xs text-slate-500">Room Types</p>
              </div>
              <div className="py-3">
                <p className="text-xl font-semibold text-emerald-700">{activeCount}</p>
                <p className="text-xs text-slate-500">Available</p>
              </div>
            </div>
            {canViewCosting && (
              <div className="p-4">
                <p className="text-xs text-slate-500">Price Range</p>
                <p className="mt-0.5 text-sm font-medium text-slate-800">
                  {priceRange
                    ? priceRange.min === priceRange.max
                      ? formatPrice(priceRange.min)
                      : `${formatPrice(priceRange.min)} – ${formatPrice(priceRange.max)}`
                    : 'No pricing information available'}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
