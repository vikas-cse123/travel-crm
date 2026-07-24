import { ArrowLeft, Pencil } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useVisaType } from '@/features/masters/masters.api';
import { LoadingCard, MasterHeader, SafeRichText, StatusBadge } from './MasterUi';

export function VisaTypeDetailsPage() {
  const { visaTypeId } = useParams();
  const visaType = useVisaType(visaTypeId);
  const { hasPermission } = useAuth();

  if (visaType.isError) return <Navigate to="/masters/visa-types" replace />;
  if (!visaType.data) return <LoadingCard />;
  const value = visaType.data;

  return (
    <div className="space-y-5">
      <MasterHeader
        title="View Visa Type"
        description="Visa type overview and rich-text sections."
        current={value.name}
        action={
          <div className="flex gap-2">
            <Link to="/masters/visa-types">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.MASTER_VISA_TYPES_UPDATE) && (
              <Link to={`/masters/visa-types/${value.id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
          </div>
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-5">
          <h2 className="text-2xl font-semibold">{value.name}</h2>
          <StatusBadge value={value.status} />
        </div>
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Destination</dt>
            <dd className="font-medium">{value.destination.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sections</dt>
            <dd className="font-medium">{value._count.sections}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-medium">{value.createdBy.fullName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last updated</dt>
            <dd className="font-medium">{new Date(value.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        {value.sections.length ? (
          value.sections.map((section) => (
            <div key={section.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <div className="border-b bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
                {section.title}
              </div>
              <div className="p-5">
                <SafeRichText html={section.content} empty="No content." />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            No sections added.
          </div>
        )}
      </section>
    </div>
  );
}
