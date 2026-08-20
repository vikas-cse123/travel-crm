import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  PERMISSIONS,
  TESTIMONIAL_IMAGE_MIME_TYPES,
  type TestimonialInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveTestimonialImage,
  confirmTestimonialImage,
  deleteTestimonialImage,
  reorderTestimonialImages,
  testimonialImageUrl,
  useCreateTestimonial,
  useTestimonial,
  useUpdateTestimonial,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader } from './MasterUi';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

interface FormValues {
  clientName: string;
  destinationName: string;
  description: string;
  isActive: boolean;
  isVisible: boolean;
}

const empty: FormValues = {
  clientName: '',
  destinationName: '',
  description: '',
  isActive: true,
  isVisible: true,
};

export function TestimonialFormPage() {
  const { testimonialId } = useParams();
  const navigate = useNavigate();
  const testimonial = useTestimonial(testimonialId);
  const create = useCreateTestimonial();
  const update = useUpdateTestimonial(testimonialId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_TESTIMONIALS_MANAGE_MEDIA);
  const [formError, setFormError] = useState('');
  const form = useForm<FormValues>({ defaultValues: empty });
  const imageGallery = useMasterImageGallery({
    masterId: testimonialId,
    entity: testimonial.data,
    allowedMimeTypes: TESTIMONIAL_IMAGE_MIME_TYPES,
    maxSizeMb: 2,
    api: {
      approve: approveTestimonialImage,
      confirm: confirmTestimonialImage,
      download: testimonialImageUrl,
      remove: deleteTestimonialImage,
      reorder: reorderTestimonialImages,
    },
    onExistingChange: testimonial.refetch,
  });

  useEffect(() => {
    if (!testimonial.data) return;
    form.reset({
      clientName: testimonial.data.clientName ?? '',
      destinationName: testimonial.data.destinationName,
      description: testimonial.data.description,
      isActive: testimonial.data.status !== 'INACTIVE',
      isVisible: testimonial.data.isVisible,
    });
  }, [testimonial.data, form]);

  if (testimonialId && testimonial.isError) return <Navigate to="/masters/testimonials" replace />;
  const mutation = testimonialId ? update : create;

  const submit = form.handleSubmit(async (values) => {
    if (values.destinationName.trim().length < 1) {
      form.setError('destinationName', { message: 'Enter a destination name.' });
      return;
    }
    if (values.description.trim().length < 1) {
      form.setError('description', { message: 'Enter the testimonial description.' });
      return;
    }
    const payload: TestimonialInput = {
      clientName: values.clientName.trim() || null,
      destinationName: values.destinationName.trim(),
      description: values.description.trim(),
      isVisible: values.isVisible,
      status: values.isActive ? 'ACTIVE' : 'INACTIVE',
    };
    try {
      setFormError('');
      const saved = testimonialId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (canManageMedia) await imageGallery.persist(saved.id);
      navigate(`/masters/testimonials/${saved.id}`);
    } catch (error) {
      if (error instanceof Error && !(error as { code?: string }).code) setFormError(error.message);
    }
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <MasterHeader
        title={testimonialId ? 'Edit Testimonial' : 'Create Testimonial'}
        description="Customer testimonials and reviews."
        current={testimonialId ? 'Edit Testimonial' : 'Create Testimonial'}
      />
      <form onSubmit={submit} className="space-y-5">
        {(mutation.error || formError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {formError || mutation.error?.message}
          </div>
        )}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
            Testimonial Information
          </div>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <div className="space-y-5">
              <label className="block text-sm font-medium">
                Client Name
                <input
                  className={fieldClass}
                  placeholder="Enter client name (optional)"
                  {...form.register('clientName')}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Leave empty for an anonymous testimonial.
                </span>
              </label>
              <label className="block text-sm font-medium">
                Destination Name *
                <input
                  className={fieldClass}
                  placeholder="Enter destination name"
                  {...form.register('destinationName')}
                />
                {form.formState.errors.destinationName && (
                  <span className="text-xs text-red-600">
                    {form.formState.errors.destinationName.message}
                  </span>
                )}
              </label>
              {canManageMedia && (
                <MasterImageGalleryField
                  label="Client Images"
                  controller={imageGallery}
                  accept="image/jpeg,image/png,image/webp"
                  maxSizeMb={2}
                />
              )}
            </div>
            <label className="block text-sm font-medium">
              Testimonial Description *
              <textarea
                className={`${fieldClass} min-h-40`}
                placeholder="Write the client's testimonial or review…"
                {...form.register('description')}
              />
              {form.formState.errors.description && (
                <span className="text-xs text-red-600">
                  {form.formState.errors.description.message}
                </span>
              )}
            </label>
          </div>
          <div className="space-y-3 border-t px-5 py-4">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" className="mt-0.5" {...form.register('isActive')} />
              <span>
                Active
                <span className="block text-xs font-normal text-slate-500">
                  Uncheck to make the testimonial inactive.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" className="mt-0.5" {...form.register('isVisible')} />
              <span>
                Is Visible
                <span className="block text-xs font-normal text-slate-500">
                  Marks the testimonial as visible (configuration only in this release).
                </span>
              </span>
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Link
            to={testimonialId ? `/masters/testimonials/${testimonialId}` : '/masters/testimonials'}
          >
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending || imageGallery.isBusy}>
            {testimonialId ? 'Update Testimonial' : 'Create Testimonial'}
          </Button>
        </div>
      </form>
    </div>
  );
}
