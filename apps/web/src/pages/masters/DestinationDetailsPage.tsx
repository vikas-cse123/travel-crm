import { useEffect, useState } from 'react';
import { ArrowLeft, Globe2, MapPin, Pencil, Plane } from 'lucide-react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { destinationImageUrl, useDestination } from '@/features/masters/masters.api';
import { formatMasterDate, LoadingCard, MasterHeader, SafeRichText, StatusBadge } from './MasterUi';

const tabs = [
  ['inclusions', 'Inclusions'],
  ['exclusions', 'Exclusions'],
  ['paymentPolicies', 'Payment Policies'],
  ['cancellationPolicies', 'Cancellation Policies'],
  ['bookingTerms', 'Terms & Conditions'],
] as const;

export function DestinationDetailsPage() {
  const { destinationId } = useParams();
  const location = useLocation();
  const destination = useDestination(destinationId);
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('inclusions');
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    if (!destinationId || !destination.data?.hasImage) return;
    let active = true;
    void destinationImageUrl(destinationId)
      .then((result) => {
        if (active) setImageUrl(result.url);
      })
      .catch(() => setImageUrl(''));
    return () => {
      active = false;
    };
  }, [destination.data?.hasImage, destinationId]);
  if (destination.isError) return <Navigate to="/masters/destinations" replace />;
  if (!destination.data) return <LoadingCard />;
  const value = destination.data;
  const warning =
    typeof (location.state as { warning?: unknown } | null)?.warning === 'string'
      ? (location.state as { warning: string }).warning
      : '';

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Destination Details"
        description=""
        current={value.name}
        action={
          <div className="flex gap-2">
            <Link to="/masters/destinations">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE) && (
              <Link to={`/masters/destinations/${value.id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
          </div>
        }
      />
      {warning && (
        <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {warning}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {imageUrl ? (
            <div className="flex h-64 items-center justify-center bg-slate-50">
              <img
                src={imageUrl}
                alt={value.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 text-white">
              <Globe2 className="h-16 w-16 opacity-70" />
            </div>
          )}
          <div className="space-y-5 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold">{value.name}</h2>
                <StatusBadge value={value.destinationType} />
                <StatusBadge value={value.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">{value.countryName}</p>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
                <MapPin className="h-4 w-4 text-slate-700" />
                Cities Covered
                <span className="rounded bg-cyan-600 px-1.5 py-0.5 text-xs font-bold text-white">
                  {value.cities.length}
                </span>
              </h3>
              <div className="mt-3 space-y-2">
                {value.cities.map((link) => (
                  <div key={link.id} className="rounded-lg border bg-slate-50 px-4 py-3">
                    <p className="font-semibold text-slate-900">{link.city.name}</p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                      {link.city.airportCode ? (
                        <Plane className="h-3 w-3" />
                      ) : (
                        <MapPin className="h-3 w-3" />
                      )}
                      {link.city.airportCode ?? 'No airport code'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Created by</dt>
                <dd className="font-medium">{value.createdBy.fullName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium">{formatMasterDate(value.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last updated</dt>
                <dd className="font-medium">{formatMasterDate(value.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Image</dt>
                <dd className="font-medium">{value.imageFileName ?? 'Not uploaded'}</dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto border-b bg-slate-50">
            <div role="tablist" className="flex min-w-max">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`border-b-2 px-4 py-4 text-sm font-medium ${tab === key ? 'border-brand-600 bg-card text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div role="tabpanel" className="min-h-72 p-6">
            <SafeRichText html={value[tab]} />
          </div>
        </section>
      </div>
    </div>
  );
}
