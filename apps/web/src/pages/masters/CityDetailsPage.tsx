import { ArrowLeft, Pencil } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCity } from '@/features/masters/masters.api';
import { LoadingCard, MasterHeader, StatusBadge } from './MasterUi';

export function CityDetailsPage() {
  const { cityId } = useParams();
  const city = useCity(cityId);
  const { hasPermission } = useAuth();
  if (city.isError) return <Navigate to="/masters/cities" replace />;
  if (!city.data) return <LoadingCard />;
  const value = city.data;
  const details: Array<[string, string]> = [
    ['Country', value.countryName],
    ['City Name', value.name],
    ['Airport Code', value.airportCode ?? 'Not provided'],
    ['Status', value.status],
    ['Used by destinations', String(value._count.destinationLinks)],
    ['Created At', new Date(value.createdAt).toLocaleString()],
    ['Created By', value.createdBy.fullName],
  ];
  return (
    <div className="space-y-5">
      <MasterHeader
        title="City Details"
        description="A reusable city record for destination planning."
        current={value.name}
        action={
          <div className="flex gap-2">
            <Link to="/masters/cities">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.MASTER_CITIES_UPDATE) && (
              <Link to={`/masters/cities/${value.id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">City Information</h2>
        </div>
        <dl className="divide-y">
          {details.map(([label, content]) => (
            <div key={label} className="grid gap-1 px-5 py-4 sm:grid-cols-[220px_1fr]">
              <dt className="font-medium text-slate-600">{label}</dt>
              <dd className="text-slate-900">
                {label === 'Status' ? <StatusBadge value={content} /> : content}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
