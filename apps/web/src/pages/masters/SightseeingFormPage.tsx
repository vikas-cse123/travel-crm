import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Save, X } from 'lucide-react';
import { PERMISSIONS, SIGHTSEEING_IMAGE_MIME_TYPES } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveSightseeingImage,
  confirmSightseeingImage,
  deleteSightseeingImage,
  useCreateSightseeing,
  useDestination,
  useDestinations,
  useSightseeing,
  useUpdateSightseeing,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';
import { MasterImageField } from './MasterImageField';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');
const MAX_IMAGE_MB = 5;

interface FormValues {
  destinationId: string;
  cityId: string;
  title: string;
  sequence: string;
  estimatedHours: string;
  suggestedStartTime: string;
  description: string;
  remarks: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

/**
 * Create/edit Sightseeing.
 *
 * Field order follows the reference exactly: Destination → City → Title →
 * Sequence → Estimated Hours → Suggested Start Time → Image on the left, with
 * Description and Remarks on the right.
 */
export function SightseeingFormPage() {
  const { sightseeingId } = useParams<{ sightseeingId: string }>();
  const navigate = useNavigate();
  const record = useSightseeing(sightseeingId);
  const destinations = useDestinations(LARGE);
  const create = useCreateSightseeing();
  const update = useUpdateSightseeing(sightseeingId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_SIGHTSEEING_MANAGE_MEDIA);

  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');

  const form = useForm<FormValues>({
    defaultValues: {
      destinationId: '',
      cityId: '',
      title: '',
      sequence: '1',
      estimatedHours: '',
      suggestedStartTime: '',
      description: '',
      remarks: '',
      status: 'ACTIVE',
    },
  });

  // City options come from the chosen destination, mirroring the reference's
  // "Cities will be loaded based on selected destination" hint. The backend
  // re-checks the pair, so this is convenience rather than the real control.
  const destinationId = form.watch('destinationId');
  const destination = useDestination(destinationId || undefined);
  const cityOptions = (destination.data?.cities ?? []).map((link) => link.city);

  useEffect(() => {
    const value = record.data;
    if (!value) return;
    form.reset({
      destinationId: value.destination.id,
      cityId: value.city.id,
      title: value.title,
      sequence: String(value.sequence),
      estimatedHours: value.estimatedHours != null ? String(value.estimatedHours) : '',
      suggestedStartTime: value.suggestedStartTime ?? '',
      description: value.description ?? '',
      remarks: value.remarks ?? '',
      status: value.status as FormValues['status'],
    });
  }, [record.data, form]);

  if (sightseeingId && record.isError) return <Navigate to="/masters/sightseeing" replace />;
  const mutation = sightseeingId ? update : create;

  const destinationField = form.register('destinationId', {
    required: 'Select a destination.',
  });

  const validateImage = (file?: File) => {
    setImageError('');
    if (!file) return setImage(null);
    if (
      !SIGHTSEEING_IMAGE_MIME_TYPES.includes(
        file.type as (typeof SIGHTSEEING_IMAGE_MIME_TYPES)[number],
      )
    ) {
      setImageError('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Image must be ${MAX_IMAGE_MB} MB or smaller.`);
      return;
    }
    setImage(file);
  };

  const uploadImage = async (id: string, file: File) => {
    const approval = await approveSightseeingImage(id, {
      fileName: file.name,
      mimeType: file.type as (typeof SIGHTSEEING_IMAGE_MIME_TYPES)[number],
      fileSize: file.size,
    });
    if (!approval.uploadUrl.startsWith('http'))
      throw new Error(
        'Local memory storage has no browser upload transport. Configure S3 to upload images.',
      );
    const response = await fetch(approval.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) throw new Error('The image upload failed. Please try again.');
    await confirmSightseeingImage(id);
  };

  const submit = form.handleSubmit(async (values) => {
    setFormError('');
    const payload = {
      destinationId: values.destinationId,
      cityId: values.cityId,
      title: values.title.trim(),
      sequence: Number(values.sequence || 1),
      estimatedHours: values.estimatedHours === '' ? null : Number(values.estimatedHours),
      suggestedStartTime: values.suggestedStartTime || null,
      description: values.description || null,
      remarks: values.remarks || null,
      status: values.status,
    };
    try {
      const saved = sightseeingId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (image && canManageMedia) await uploadImage(saved.id, image);
      navigate(`/masters/sightseeing/${saved.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The sightseeing could not be saved.');
    }
  });

  return (
    <div className="space-y-5">
      <MasterHeader
        title={sightseeingId ? 'Edit Sightseeing' : 'Create Sightseeing'}
        description="Reusable itinerary content grouped by destination and city."
        current="Sightseeing"
      />

      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {formError}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
            Sightseeing Information
          </h2>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Destination <span className="text-red-600">*</span>
                  <select
                    className={fieldClass}
                    aria-invalid={Boolean(form.formState.errors.destinationId)}
                    {...destinationField}
                    onChange={(event) => {
                      void destinationField.onChange(event);
                      // A city from the previous destination is no longer valid.
                      form.setValue('cityId', '');
                    }}
                  >
                    <option value="">Select Destination</option>
                    {(destinations.data?.data ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                {form.formState.errors.destinationId && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.destinationId.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  City <span className="text-red-600">*</span>
                  <select
                    className={fieldClass}
                    disabled={!destinationId}
                    aria-invalid={Boolean(form.formState.errors.cityId)}
                    {...form.register('cityId', { required: 'Select a city.' })}
                  >
                    <option value="">Select City</option>
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Cities will be loaded based on selected destination
                </p>
                {form.formState.errors.cityId && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.cityId.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Title <span className="text-red-600">*</span>
                  <input
                    className={fieldClass}
                    placeholder="Enter sightseeing title"
                    aria-invalid={Boolean(form.formState.errors.title)}
                    {...form.register('title', {
                      required: 'Title is required.',
                      minLength: { value: 2, message: 'Use at least 2 characters.' },
                    })}
                  />
                </label>
                {form.formState.errors.title && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Sequence <span className="text-red-600">*</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={fieldClass}
                    aria-invalid={Boolean(form.formState.errors.sequence)}
                    {...form.register('sequence', {
                      required: 'Sequence is required.',
                      validate: (value) => {
                        const parsed = Number(value);
                        if (!Number.isInteger(parsed)) return 'Sequence must be a whole number.';
                        if (parsed < 1) return 'Sequence must be 1 or more.';
                        return true;
                      },
                    })}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Lower sequence numbers will appear first in itineraries
                </p>
                {form.formState.errors.sequence && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.sequence.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Estimated Hours
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    className={fieldClass}
                    placeholder="e.g., 2.5 for 2 hours 30 minutes"
                    aria-invalid={Boolean(form.formState.errors.estimatedHours)}
                    {...form.register('estimatedHours', {
                      validate: (value) => {
                        if (value === '') return true;
                        const parsed = Number(value);
                        if (Number.isNaN(parsed)) return 'Enter a number of hours.';
                        if (parsed < 0) return 'Duration cannot be negative.';
                        if (parsed > 999.99) return 'Duration looks too large.';
                        return true;
                      },
                    })}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Duration in hours (e.g., 2.5 for 2 hours 30 minutes)
                </p>
                {form.formState.errors.estimatedHours && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.estimatedHours.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Suggested Start Time
                  <input
                    type="time"
                    className={fieldClass}
                    {...form.register('suggestedStartTime')}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Recommended time to start this activity
                </p>
              </div>

              {canManageMedia && (
                <MasterImageField
                  label="Image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  maxSizeMb={MAX_IMAGE_MB}
                  error={imageError}
                  editing={Boolean(sightseeingId)}
                  hasExisting={Boolean(record.data?.hasImage)}
                  onSelect={validateImage}
                  onDelete={async () => {
                    if (sightseeingId && window.confirm('Delete this sightseeing image?')) {
                      await deleteSightseeingImage(sightseeingId);
                      await record.refetch();
                    }
                  }}
                />
              )}

              <label className="block text-sm font-medium text-slate-700">
                Status
                <select className={fieldClass} {...form.register('status')}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </label>
            </div>

            <div className="space-y-4">
              <RichTextEditor
                label="Description"
                value={form.watch('description')}
                onChange={(value) => form.setValue('description', value)}
              />
              <div>
                <RichTextEditor
                  label="Remarks"
                  value={form.watch('remarks')}
                  onChange={(value) => form.setValue('remarks', value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Additional notes, tips, or important information
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <Button variant="secondary" onClick={() => navigate('/masters/sightseeing')}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending || form.formState.isSubmitting}>
            <Save className="h-4 w-4" />{' '}
            {sightseeingId ? 'Update Sightseeing' : 'Create Sightseeing'}
          </Button>
        </div>
      </form>
    </div>
  );
}
