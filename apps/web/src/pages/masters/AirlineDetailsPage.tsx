import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plane } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { airlineLogoUrl, useAirline } from '@/features/masters/masters.api';
import { LoadingCard, MasterHeader, StatusBadge } from './MasterUi';

export function AirlineDetailsPage() {
  const { airlineId } = useParams();
  const airline = useAirline(airlineId);
  const { hasPermission } = useAuth();
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (!airlineId || !airline.data?.hasLogo) return;
    let active = true;
    void airlineLogoUrl(airlineId)
      .then((result) => active && setLogoUrl(result.url))
      .catch(() => setLogoUrl(''));
    return () => {
      active = false;
    };
  }, [airline.data?.hasLogo, airlineId]);

  if (airline.isError) return <Navigate to="/masters/airlines" replace />;
  if (!airline.data) return <LoadingCard />;
  const value = airline.data;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <MasterHeader
        title="View Airline"
        description="Airline profile and codes."
        current={value.name}
        action={
          <div className="flex gap-2">
            <Link to="/masters/airlines">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.MASTER_AIRLINES_UPDATE) && (
              <Link to={`/masters/airlines/${value.id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b p-5">
          <div className="flex h-20 w-28 items-center justify-center rounded-lg border bg-slate-50">
            {logoUrl ? (
              <img src={logoUrl} alt={value.name} className="max-h-16 max-w-24 object-contain" />
            ) : (
              <Plane className="h-8 w-8 text-slate-300" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold">{value.name}</h2>
              <StatusBadge value={value.status} />
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500">
              {value.iataCode ?? '—'} · {value.icaoCode ?? '—'}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">IATA Code</dt>
            <dd className="font-medium">{value.iataCode ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">ICAO Code</dt>
            <dd className="font-medium">{value.icaoCode ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Country</dt>
            <dd className="font-medium">{value.countryName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Website</dt>
            <dd className="font-medium">{value.website ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Internal Notes</dt>
            <dd className="font-medium">{value.internalNotes ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-medium">{value.createdBy.fullName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="font-medium">{new Date(value.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
