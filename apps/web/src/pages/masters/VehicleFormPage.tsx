import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Save, X } from 'lucide-react';
import { PERMISSIONS, VEHICLE_IMAGE_MIME_TYPES } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveVehicleImage,
  confirmVehicleImage,
  deleteVehicleImage,
  reorderVehicleImages,
  useCreateVehicle,
  useUpdateVehicle,
  useVehicle,
  useVehicleTypes,
  vehicleImageUrl,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader } from './MasterUi';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

const MAX_IMAGE_MB = 5;

interface FormValues {
  name: string;
  vehicleType: string;
  capacity: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

/**
 * Create/edit Vehicle — a single two-column card, matching the reference.
 *
 * Vehicle Type is free text with a datalist of values already in use, so the
 * reference's open-ended field keeps working while typos stay unlikely.
 */
export function VehicleFormPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const vehicle = useVehicle(vehicleId);
  const types = useVehicleTypes();
  const create = useCreateVehicle();
  const update = useUpdateVehicle(vehicleId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_VEHICLES_MANAGE_MEDIA);

  const [formError, setFormError] = useState('');

  const form = useForm<FormValues>({
    defaultValues: { name: '', vehicleType: '', capacity: '', description: '', status: 'ACTIVE' },
  });
  const imageGallery = useMasterImageGallery({
    masterId: vehicleId,
    entity: vehicle.data,
    allowedMimeTypes: VEHICLE_IMAGE_MIME_TYPES,
    maxSizeMb: MAX_IMAGE_MB,
    api: {
      approve: approveVehicleImage,
      confirm: confirmVehicleImage,
      download: vehicleImageUrl,
      remove: deleteVehicleImage,
      reorder: reorderVehicleImages,
    },
    onExistingChange: vehicle.refetch,
  });

  useEffect(() => {
    const value = vehicle.data;
    if (!value) return;
    form.reset({
      name: value.name,
      vehicleType: value.vehicleType,
      capacity: value.capacity != null ? String(value.capacity) : '',
      description: value.description ?? '',
      status: value.status as FormValues['status'],
    });
  }, [vehicle.data, form]);

  if (vehicleId && vehicle.isError) return <Navigate to="/masters/vehicles" replace />;
  const mutation = vehicleId ? update : create;

  const submit = form.handleSubmit(async (values) => {
    setFormError('');
    const payload = {
      name: values.name.trim(),
      vehicleType: values.vehicleType.trim(),
      capacity: values.capacity === '' ? null : Number(values.capacity),
      description: values.description || null,
      status: values.status,
    };
    try {
      const saved = vehicleId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (canManageMedia) await imageGallery.persist(saved.id);
      navigate(`/masters/vehicles/${saved.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The vehicle could not be saved.');
    }
  });

  return (
    <div className="space-y-5">
      <MasterHeader
        title={vehicleId ? 'Edit Vehicle' : 'Create Vehicle'}
        description=""
        current="Vehicles"
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

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
            Vehicle Information
          </h2>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Vehicle Name <span className="text-red-600">*</span>
                  <input
                    className={fieldClass}
                    placeholder="Enter vehicle name"
                    aria-invalid={Boolean(form.formState.errors.name)}
                    {...form.register('name', {
                      required: 'Vehicle name is required.',
                      minLength: { value: 2, message: 'Use at least 2 characters.' },
                    })}
                  />
                </label>
                {form.formState.errors.name && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Vehicle Type <span className="text-red-600">*</span>
                  <input
                    className={fieldClass}
                    placeholder="Enter vehicle type"
                    list="vehicle-type-options"
                    aria-invalid={Boolean(form.formState.errors.vehicleType)}
                    {...form.register('vehicleType', { required: 'Vehicle type is required.' })}
                  />
                </label>
                <datalist id="vehicle-type-options">
                  {(types.data?.vehicleTypes ?? []).map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                {form.formState.errors.vehicleType && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.vehicleType.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Capacity (persons)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={fieldClass}
                    placeholder="Enter capacity"
                    aria-invalid={Boolean(form.formState.errors.capacity)}
                    {...form.register('capacity', {
                      validate: (value) => {
                        if (value === '') return true;
                        const parsed = Number(value);
                        if (!Number.isInteger(parsed)) return 'Capacity must be a whole number.';
                        if (parsed < 1) return 'Capacity must be at least 1.';
                        if (parsed > 1000) return 'Capacity looks too large.';
                        return true;
                      },
                    })}
                  />
                </label>
                {form.formState.errors.capacity && (
                  <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {form.formState.errors.capacity.message}
                  </p>
                )}
              </div>

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
              {canManageMedia && (
                <MasterImageGalleryField
                  label="Vehicle Images"
                  controller={imageGallery}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  maxSizeMb={MAX_IMAGE_MB}
                />
              )}
              <label className="block text-sm font-medium text-slate-700">
                Description
                <textarea
                  rows={6}
                  className={fieldClass}
                  placeholder="Enter vehicle description"
                  {...form.register('description')}
                />
              </label>
            </div>
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-end gap-2 bg-background/95 py-4 backdrop-blur">
          <Button variant="secondary" onClick={() => navigate('/masters/vehicles')}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button
            type="submit"
            isLoading={mutation.isPending || form.formState.isSubmitting || imageGallery.isBusy}
          >
            <Save className="h-4 w-4" /> {vehicleId ? 'Update Vehicle' : 'Create Vehicle'}
          </Button>
        </div>
      </form>
    </div>
  );
}
