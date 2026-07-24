import { useEffect, useState } from 'react';
import { ArrowLeft, MessageSquareQuote, Pencil } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { testimonialImageUrl, useTestimonial } from '@/features/masters/masters.api';
import { LoadingCard, MasterHeader, StatusBadge } from './MasterUi';

export function TestimonialDetailsPage() {
  const { testimonialId } = useParams();
  const testimonial = useTestimonial(testimonialId);
  const { hasPermission } = useAuth();
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!testimonialId || !testimonial.data?.hasImage) return;
    let active = true;
    void testimonialImageUrl(testimonialId)
      .then((result) => active && setImageUrl(result.url))
      .catch(() => setImageUrl(''));
    return () => {
      active = false;
    };
  }, [testimonial.data?.hasImage, testimonialId]);

  if (testimonial.isError) return <Navigate to="/masters/testimonials" replace />;
  if (!testimonial.data) return <LoadingCard />;
  const value = testimonial.data;
  const clientName = value.clientName?.trim() || 'Anonymous';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <MasterHeader
        title="View Testimonial"
        description="Customer testimonial detail."
        current={clientName}
        action={
          <div className="flex gap-2">
            <Link to="/masters/testimonials">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            {hasPermission(PERMISSIONS.MASTER_TESTIMONIALS_UPDATE) && (
              <Link to={`/masters/testimonials/${value.id}/edit`}>
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
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-slate-50">
            {imageUrl ? (
              <img src={imageUrl} alt={clientName} className="h-full w-full object-cover" />
            ) : (
              <MessageSquareQuote className="h-7 w-7 text-slate-300" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{clientName}</h2>
              <StatusBadge value={value.status} />
              {value.isVisible ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                  Visible
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                  Hidden
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{value.destinationName}</p>
          </div>
        </div>
        <div className="space-y-5 p-5">
          <blockquote className="border-l-4 border-brand-200 pl-4 text-slate-700">
            {value.description}
          </blockquote>
          <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Created by</dt>
              <dd className="font-medium">{value.createdBy.fullName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last updated</dt>
              <dd className="font-medium">{new Date(value.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
