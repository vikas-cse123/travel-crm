import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { labelForLookup, PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useVendor, useVendorAction, useVendorServices } from '@/features/vendors/vendors.api';

const money = (currency: string, value?: string) =>
  value === undefined
    ? 'Restricted'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value));
export function VendorServicesPage() {
  const { vendorId = '' } = useParams();
  const { hasPermission } = useAuth();
  const vendor = useVendor(vendorId);
  const services = useVendorServices(vendorId);
  const action = useVendorAction(vendorId);
  if (vendor.isError) return <Navigate to="/vendors" replace />;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            className="mb-2 inline-flex items-center gap-1 text-sm text-brand-700"
            to={`/vendors/${vendorId}`}
          >
            <ArrowLeft className="h-4 w-4" /> Vendor workspace
          </Link>
          <h1 className="text-2xl font-semibold">Vendor services</h1>
          <p className="text-sm text-slate-500">
            {vendor.data?.name ?? 'Loading vendor…'} · structured coverage, costs and seasonal rates
          </p>
        </div>
        {hasPermission(PERMISSIONS.VENDORS_MANAGE_SERVICES) && (
          <Link to={`/vendors/${vendorId}/services/new`}>
            <Button>
              <Plus className="h-4 w-4" /> Add service
            </Button>
          </Link>
        )}
      </header>
      {services.isPending ? (
        <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
      ) : services.isError ? (
        <div className="rounded-xl bg-red-50 p-5 text-red-700">Could not load vendor services.</div>
      ) : !services.data?.length ? (
        <section className="rounded-xl border bg-white p-10 text-center">
          <p className="font-medium">No structured services yet.</p>
          <p className="text-sm text-slate-500">
            Add hotel rates, transport routes, airline fares, DMC packages or another supplier
            service.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.data.map((service) => (
            <article key={service.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-700">
                    {labelForLookup(service.serviceType)}
                  </span>
                  <h2 className="mt-2 font-semibold">{service.name}</h2>
                  <p className="text-sm text-slate-500">
                    {service.city ??
                      service.destination ??
                      service.coverageArea ??
                      'Coverage not specified'}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{labelForLookup(service.status)}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Base cost</dt>
                  <dd className="font-medium">{money(service.currency, service.baseCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Rates</dt>
                  <dd className="font-medium">{service.rates.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Valid from</dt>
                  <dd>
                    {service.validFrom ? new Date(service.validFrom).toLocaleDateString() : 'Open'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Valid until</dt>
                  <dd>
                    {service.validUntil
                      ? new Date(service.validUntil).toLocaleDateString()
                      : 'Open'}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2 border-t pt-4">
                {hasPermission(PERMISSIONS.VENDORS_MANAGE_SERVICES) && (
                  <>
                    <Link to={`/vendors/${vendorId}/services/${service.id}/edit`}>
                      <Button variant="secondary">
                        <Pencil className="h-4 w-4" /> Edit & rates
                      </Button>
                    </Link>
                    {service.status === 'ACTIVE' && (
                      <Button
                        variant="secondary"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({
                            path: `services/${service.id}/status`,
                            method: 'patch',
                            body: { status: 'INACTIVE' },
                          })
                        }
                      >
                        Deactivate
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
