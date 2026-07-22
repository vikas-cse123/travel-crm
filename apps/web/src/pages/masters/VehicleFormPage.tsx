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
  useCreateVehicle,
  useUpdateVehicle,
  useVehicle,
  useVehicleTypes,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader } from './MasterUi';
import { MasterImageField } from './MasterImageField';

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

  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');

  const form = useForm<FormValues>({
    defaultValues: { name: '', vehicleType: '', capacity: '', description: '', status: 'ACTIVE' },
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

  const validateImage = (file?: File) => {
    setImageError('');
    if (!file) return setImage(null);
    if (
      !VEHICLE_IMAGE_MIME_TYPES.includes(file.type as (typeof VEHICLE_IMAGE_MIME_TYPES)[number])
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
    const approval = await approveVehicleImage(id, {
      fileName: file.name,
      mimeType: file.type as (typeof VEHICLE_IMAGE_MIME_TYPES)[number],
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
    await confirmVehicleImage(id);
  };

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
      if (image && canManageMedia) await uploadImage(saved.id, image);
      navigate(`/masters/vehicles/${saved.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The vehicle could not be saved.');
    }
  });

  return (
    <div className="space-y-5">
      <MasterHeader
        title={vehicleId ? 'Edit Vehicle' : 'Create Vehicle'}
        description="Capture the vehicle category, seating capacity and photo."
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

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
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
                <MasterImageField
                  label="Vehicle Image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  maxSizeMb={MAX_IMAGE_MB}
                  error={imageError}
                  editing={Boolean(vehicleId)}
                  hasExisting={Boolean(vehicle.data?.hasImage)}
                  onSelect={validateImage}
                  onDelete={async () => {
                    if (vehicleId && window.confirm('Delete this vehicle image?')) {
                      await deleteVehicleImage(vehicleId);
                      await vehicle.refetch();
                    }
                  }}
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

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <Button variant="secondary" onClick={() => navigate('/masters/vehicles')}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending || form.formState.isSubmitting}>
            <Save className="h-4 w-4" /> {vehicleId ? 'Update Vehicle' : 'Create Vehicle'}
          </Button>
        </div>
      </form>
    </div>
  );
}
