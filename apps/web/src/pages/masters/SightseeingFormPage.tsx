import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { ERROR_CODES, PERMISSIONS, SIGHTSEEING_IMAGE_MIME_TYPES } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveSightseeingImage,
  confirmSightseeingImage,
  deleteSightseeingImage,
  reorderSightseeingImages,
  useRefreshMasterImageQueries,
  sightseeingImageUrl,
  useCreateSightseeing,
  useDestination,
  useDestinations,
  useRestoreSightseeing,
  useSightseeing,
  useUpdateSightseeing,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor, CurrencySelect } from './MasterUi';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');
const MAX_IMAGE_MB = 5;

interface ArchivedDuplicateInfo {
  sightseeingId: string;
  title: string;
  cityId: string;
  destinationId: string;
  cityName?: string | null;
  destinationName?: string | null;
}

interface FormValues {
  destinationId: string;
  cityId: string;
  title: string;
  sequence: string;
  estimatedHours: string;
  suggestedStartTime: string;
  description: string;
  remarks: string;
  pricing: Array<{ label: string; price: string; currency: string }>;
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

  const [formError, setFormError] = useState('');
  const [archivedDuplicate, setArchivedDuplicate] = useState<ArchivedDuplicateInfo | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const restore = useRestoreSightseeing();

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
      pricing: [],
      status: 'ACTIVE',
    },
  });

  const pricingArray = useFieldArray({ control: form.control, name: 'pricing' });

  // City options come from the chosen destination, mirroring the reference's
  // "Cities will be loaded based on selected destination" hint. The backend
  // re-checks the pair, so this is convenience rather than the real control.
  const destinationId = form.watch('destinationId');
  const destination = useDestination(destinationId || undefined);
  // Root cause fix: both selects are uncontrolled (register) with async options.
  // `form.reset` runs when the sightseeing detail loads, but at that moment
  // (a) the destinations list may not have loaded yet and (b) the dependent
  // destination-detail (cities) ALWAYS loads after, since it needs the id.
  // Setting a select value with no matching <option> makes the browser drop
  // it to "", so a later submit sends "" and trips "Select a ..." validation,
  // forcing a re-select. Include the saved record's destination/city as
  // fallback options (available synchronously with record.data) so reset never
  // loses them. The saved-city fallback only applies while the saved
  // destination is still selected, so intentionally changing destination still
  // clears/reloads cities correctly.
  const savedDestination = record.data?.destination;
  const destinationList = destinations.data?.data ?? [];
  const destinationOptions =
    savedDestination && !destinationList.some((option) => option.id === savedDestination.id)
      ? [...destinationList, { id: savedDestination.id, name: savedDestination.name }]
      : destinationList;
  const detailCities = (destination.data?.cities ?? []).map((link) => link.city);
  const savedCity = record.data?.city;
  const isSavedDestinationSelected =
    !destinationId || !savedDestination || destinationId === savedDestination.id;
  const cityOptions =
    savedCity && isSavedDestinationSelected && !detailCities.some((city) => city.id === savedCity.id)
      ? [...detailCities, { id: savedCity.id, name: savedCity.name }]
      : detailCities;
  const refreshImageQueries = useRefreshMasterImageQueries('sightseeing');
  const imageGallery = useMasterImageGallery({
    masterId: sightseeingId,
    entity: record.data,
    allowedMimeTypes: SIGHTSEEING_IMAGE_MIME_TYPES,
    maxSizeMb: MAX_IMAGE_MB,
    api: {
      approve: approveSightseeingImage,
      confirm: confirmSightseeingImage,
      download: sightseeingImageUrl,
      remove: deleteSightseeingImage,
      reorder: reorderSightseeingImages,
    },
    onExistingChange: refreshImageQueries,
  });

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
      pricing: Array.isArray(value.pricing)
        ? value.pricing.map((row) => ({
            label: row.label,
            price: row.price != null ? String(row.price) : '',
            currency: row.currency ?? 'INR',
          }))
        : [],
      status: value.status as FormValues['status'],
    });
  }, [record.data, form]);

  if (sightseeingId && record.isError) return <Navigate to="/masters/sightseeing" replace />;
  const mutation = sightseeingId ? update : create;

  const destinationField = form.register('destinationId', {
    required: 'Select a destination.',
  });

  const submit = form.handleSubmit(async (values) => {
    setFormError('');
    setArchivedDuplicate(null);
    // RULE: a saved destination/city must never be replaced with null/"".
    // If the selects momentarily hold "" (e.g. options still loading), fall
    // back to the loaded record in edit mode so the update preserves them.
    // An explicit change to a different valid id still flows through.
    const effectiveDestinationId =
      values.destinationId || (sightseeingId ? (record.data?.destination.id ?? '') : '');
    const effectiveCityId = values.cityId || (sightseeingId ? (record.data?.city.id ?? '') : '');
    if (!effectiveDestinationId) {
      form.setError('destinationId', { message: 'Select a destination.' });
      return;
    }
    if (!effectiveCityId) {
      form.setError('cityId', { message: 'Select a city.' });
      return;
    }
    const pricing = (values.pricing ?? [])
      .map((row) => ({
        label: row.label.trim(),
        price: row.price === '' ? null : Number(row.price),
        currency: row.currency || 'INR',
      }))
      .filter((row) => row.label || row.price != null);
    const payload = {
      destinationId: effectiveDestinationId,
      cityId: effectiveCityId,
      title: values.title.trim(),
      sequence: Number(values.sequence || 1),
      estimatedHours: values.estimatedHours === '' ? null : Number(values.estimatedHours),
      suggestedStartTime: values.suggestedStartTime || null,
      description: values.description || null,
      remarks: values.remarks || null,
      pricing: pricing.length ? pricing : undefined,
      status: values.status,
    };
    try {
      const saved = sightseeingId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (canManageMedia) await imageGallery.persist(saved.id);
      navigate(`/masters/sightseeing/${saved.id}`);
    } catch (error) {
      if (
        !sightseeingId &&
        error instanceof ApiError &&
        error.code === ERROR_CODES.SIGHTSEEING_ARCHIVED_DUPLICATE
      ) {
        const details = (error.details ?? {}) as Partial<ArchivedDuplicateInfo>;
        setArchivedDuplicate({
          sightseeingId: String(details.sightseeingId ?? ''),
          title: String(details.title ?? values.title),
          cityId: String(details.cityId ?? ''),
          destinationId: String(details.destinationId ?? ''),
          cityName: details.cityName ?? null,
          destinationName: details.destinationName ?? null,
        });
        return;
      }
      setFormError(error instanceof Error ? error.message : 'The sightseeing could not be saved.');
    }
  });

  const performRestore = () => {
    if (!archivedDuplicate) return;
    restore.mutate(archivedDuplicate.sightseeingId, {
      onSuccess: () => {
        setShowRestoreConfirm(false);
        setArchivedDuplicate(null);
        window.alert('Sightseeing restored successfully.');
        navigate(`/masters/sightseeing/${archivedDuplicate.sightseeingId}`, { replace: true });
      },
    });
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title={sightseeingId ? 'Edit Sightseeing' : 'Create Sightseeing'}
        description=""
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

        {archivedDuplicate && !sightseeingId && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-900">An archived sightseeing already exists</h3>
            <p className="mt-1 text-sm text-amber-800">
              A sightseeing named &ldquo;{archivedDuplicate.title}&rdquo; already exists in{' '}
              {archivedDuplicate.cityName ?? 'this city'} but is archived. Restore the existing
              sightseeing instead of creating a duplicate.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setShowRestoreConfirm(true)}>
                <RotateCcw className="h-4 w-4" /> Restore Sightseeing
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setArchivedDuplicate(null)}>
                <X className="h-4 w-4" /> Dismiss
              </Button>
            </div>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <h2 className="bg-brand-600 px-4 py-3 text-base font-semibold text-white">
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
                    {destinationOptions.map((option) => (
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
                    lang="en-US"
                    className={fieldClass}
                    {...form.register('suggestedStartTime')}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Recommended time to start this activity
                </p>
              </div>

              {canManageMedia && (
                <MasterImageGalleryField
                  label="Sightseeing Images"
                  controller={imageGallery}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  maxSizeMb={MAX_IMAGE_MB}
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

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <h2 className="bg-emerald-600 px-4 py-3 text-base font-semibold text-white">Pricing</h2>
          <div className="space-y-4 p-4">
            {pricingArray.fields.length === 0 ? (
              <p className="text-sm text-slate-500">No pricing added. Click Add Price Category to add pricing.</p>
            ) : (
              pricingArray.fields.map((field, index) => (
                <div key={field.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="block text-sm font-medium text-slate-700">
                    Category
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm"
                      placeholder="e.g. Adult, Child, Senior"
                      {...form.register(`pricing.${index}.label` as const)}
                    />
                  </label>
                  <div className="block text-sm font-medium text-slate-700">
                    <span>Price</span>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                          {form.watch(`pricing.${index}.currency` as const) === 'USD'
                            ? '$'
                            : form.watch(`pricing.${index}.currency` as const) === 'EUR'
                              ? '€'
                              : '₹'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 pl-7 text-sm"
                          placeholder="e.g. 5000"
                          aria-label={`Pricing ${index + 1} price`}
                          {...form.register(`pricing.${index}.price` as const)}
                        />
                      </div>
                      <CurrencySelect
                        value={form.watch(`pricing.${index}.currency` as const)}
                        onChange={(currency) =>
                          form.setValue(`pricing.${index}.currency` as const, currency)
                        }
                        aria-label={`Pricing ${index + 1} currency`}
                      />
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => pricingArray.remove(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
            <Button size="sm" variant="secondary" onClick={() => pricingArray.append({ label: '', price: '', currency: 'INR' } as never)}>
              <Plus className="h-4 w-4" /> Add Price Category
            </Button>
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-end gap-2 bg-transparent py-2">
          <Button variant="secondary" onClick={() => navigate('/masters/sightseeing')}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button
            type="submit"
            isLoading={mutation.isPending || form.formState.isSubmitting || imageGallery.isBusy}
          >
            <Save className="h-4 w-4" />{' '}
            {sightseeingId ? 'Update Sightseeing' : 'Create Sightseeing'}
          </Button>
        </div>
      </form>
      {showRestoreConfirm && archivedDuplicate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-sightseeing-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 id="restore-sightseeing-title" className="text-lg font-semibold text-slate-900">
              Restore this sightseeing?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This will make the sightseeing active and available for use in quotations again.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowRestoreConfirm(false)}>
                Cancel
              </Button>
              <Button isLoading={restore.isPending} onClick={performRestore}>
                Restore Sightseeing
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
