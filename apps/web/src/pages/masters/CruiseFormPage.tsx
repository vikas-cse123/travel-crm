import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { CRUISE_IMAGE_MIME_TYPES, PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveCruiseImage,
  confirmCruiseImage,
  cruiseImageUrl,
  deleteCruiseImage,
  useCreateCruise,
  useCruise,
  useUpdateCruise,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';
import { MasterImageField } from './MasterImageField';
import { MasterImageEditor } from './MasterImageEditor';

const MAX_IMAGE_MB = 5;

interface RoomTypeValue {
  name: string;
  description: string;
  price: string;
  /** Carried through so editing a cruise never silently resets these. */
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

interface FormValues {
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  roomTypes: RoomTypeValue[];
}

/**
 * Create/edit Cruise.
 *
 * Mirrors the reference layout: a Cruise Information card on the left and a
 * repeatable Room Types card on the right, with the save bar underneath.
 */
export function CruiseFormPage() {
  const { cruiseId } = useParams<{ cruiseId: string }>();
  const navigate = useNavigate();
  const cruise = useCruise(cruiseId);
  const create = useCreateCruise();
  const update = useUpdateCruise(cruiseId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_CRUISES_MANAGE_MEDIA);
  const canManageCosting = hasPermission(PERMISSIONS.MASTER_CRUISES_MANAGE_COSTING);

  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [isImageEditorOpen, setImageEditorOpen] = useState(false);
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');

  const form = useForm<FormValues>({
    defaultValues: { name: '', description: '', status: 'ACTIVE', roomTypes: [] },
  });
  const roomTypes = useFieldArray({ control: form.control, name: 'roomTypes' });

  useEffect(() => {
    const value = cruise.data;
    if (!value) return;
    form.reset({
      name: value.name,
      description: value.description ?? '',
      status: value.status as FormValues['status'],
      roomTypes: (value.roomTypes ?? []).map((roomType) => ({
        name: roomType.name,
        description: roomType.description ?? '',
        price: roomType.price != null ? String(roomType.price) : '',
        currency: roomType.currency ?? 'INR',
        status: roomType.status as RoomTypeValue['status'],
      })),
    });
  }, [cruise.data, form]);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (!cruiseId || !cruise.data?.hasImage) {
      setExistingImageUrl('');
      return;
    }
    let active = true;
    void cruiseImageUrl(cruiseId)
      .then((result) => {
        if (active) setExistingImageUrl(result.url);
      })
      .catch(() => {
        if (active) setExistingImageUrl('');
      });
    return () => {
      active = false;
    };
  }, [cruise.data?.hasImage, cruiseId]);

  if (cruiseId && cruise.isError) return <Navigate to="/masters/cruises" replace />;
  const mutation = cruiseId ? update : create;

  const validateImage = (file?: File) => {
    setImageError('');
    if (!file) {
      setImage(null);
      setImageEditorOpen(false);
      return;
    }
    if (!CRUISE_IMAGE_MIME_TYPES.includes(file.type as (typeof CRUISE_IMAGE_MIME_TYPES)[number])) {
      setImageError('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Image must be ${MAX_IMAGE_MB} MB or smaller.`);
      return;
    }
    setImage(file);
    setImageEditorOpen(true);
  };
  const applyEditedImage = (file: File) => {
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Image must be ${MAX_IMAGE_MB} MB or smaller.`);
      return;
    }
    setImageError('');
    setImage(file);
    setImageEditorOpen(false);
  };

  const uploadImage = async (id: string, file: File) => {
    const approval = await approveCruiseImage(id, {
      fileName: file.name,
      mimeType: file.type as (typeof CRUISE_IMAGE_MIME_TYPES)[number],
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
    await confirmCruiseImage(id);
  };

  const submit = form.handleSubmit(async (values) => {
    setFormError('');
    // Blank rows are dropped rather than rejected: the reference lets you add a
    // room-type row and change your mind without clearing it first.
    const rows = values.roomTypes.filter((roomType) => roomType.name.trim().length > 0);
    const payload = {
      name: values.name.trim(),
      description: values.description || null,
      status: values.status,
      roomTypes: rows.map((roomType, index) => ({
        name: roomType.name.trim(),
        description: roomType.description.trim() || null,
        currency: roomType.currency || 'INR',
        status: roomType.status,
        ...(canManageCosting
          ? { price: roomType.price === '' ? null : Number(roomType.price) }
          : {}),
        sortOrder: index,
      })),
    };

    try {
      const saved = cruiseId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (image && canManageMedia) await uploadImage(saved.id, image);
      navigate(`/masters/cruises/${saved.id}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The cruise could not be saved.');
    }
  });

  return (
    <div className="space-y-5">
      <MasterHeader
        title={cruiseId ? 'Edit Cruise' : 'Create Cruise'}
        description=""
        current="Cruises"
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
              Cruise Information
            </h2>
            <div className="space-y-4 p-4">
              <label className="block text-sm font-medium text-slate-700">
                Cruise Name <span className="text-red-600">*</span>
                <input
                  className={fieldClass}
                  placeholder="Enter cruise name"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name', {
                    required: 'Cruise name is required.',
                    minLength: { value: 2, message: 'Use at least 2 characters.' },
                  })}
                />
              </label>
              {form.formState.errors.name && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {form.formState.errors.name.message}
                </p>
              )}

              <RichTextEditor
                label="Description"
                value={form.watch('description')}
                onChange={(value) => form.setValue('description', value)}
              />

              {canManageMedia && (
                <div className="space-y-3">
                  <MasterImageField
                    label="Cruise Image"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    maxSizeMb={MAX_IMAGE_MB}
                    error={imageError}
                    editing={Boolean(cruiseId)}
                    hasExisting={Boolean(cruise.data?.hasImage)}
                    onSelect={validateImage}
                    onDelete={async () => {
                      if (cruiseId && window.confirm('Delete this cruise image?')) {
                        await deleteCruiseImage(cruiseId);
                        setExistingImageUrl('');
                        await cruise.refetch();
                      }
                    }}
                  />
                  {(imagePreviewUrl || existingImageUrl) && (
                    <div className="overflow-hidden rounded-lg border bg-slate-50">
                      <img
                        src={imagePreviewUrl || existingImageUrl}
                        alt="Cruise image preview"
                        className="h-44 w-full bg-slate-50 object-contain"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card p-3">
                        <p className="min-w-0 truncate text-sm text-slate-600">
                          {image?.name ?? cruise.data?.imageFileName ?? 'Cruise image'}
                        </p>
                        <div className="flex gap-2">
                          {image && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setImageEditorOpen(true)}
                              >
                                Edit image
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setImage(null);
                                  setImageError('');
                                  setImageEditorOpen(false);
                                }}
                              >
                                Remove
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
          </section>

          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Room Types</h2>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  roomTypes.append({
                    name: '',
                    description: '',
                    price: '',
                    currency: 'INR',
                    status: 'ACTIVE',
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add Room Type
              </Button>
            </div>
            <div className="divide-y">
              {roomTypes.fields.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  No room types added yet. Click “Add Room Type” to add one.
                </p>
              ) : (
                roomTypes.fields.map((field, index) => (
                  <div key={field.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <label className="block flex-1 text-sm font-medium text-slate-700">
                        Room Type
                        <input
                          className={fieldClass}
                          placeholder="e.g. Interior, Ocean View, Balcony, Suite"
                          aria-label={`Room type ${index + 1} name`}
                          {...form.register(`roomTypes.${index}.name` as const)}
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Remove room type ${index + 1}`}
                        onClick={() => roomTypes.remove(index)}
                        className="mt-6 rounded bg-red-600 p-2 text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <RichTextEditor
                      label="Description"
                      value={form.watch(`roomTypes.${index}.description` as const)}
                      onChange={(value) =>
                        form.setValue(`roomTypes.${index}.description` as const, value, {
                          shouldDirty: true,
                        })
                      }
                    />
                    {canManageCosting && (
                      <label className="block text-sm font-medium text-slate-700">
                        Price
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={fieldClass}
                          placeholder="Enter price"
                          aria-label={`Room type ${index + 1} price`}
                          {...form.register(`roomTypes.${index}.price` as const)}
                        />
                      </label>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 bg-background/95 py-4 backdrop-blur">
          <Button variant="secondary" onClick={() => navigate('/masters/cruises')}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending || form.formState.isSubmitting}>
            <Save className="h-4 w-4" /> {cruiseId ? 'Update Cruise' : 'Create Cruise'}
          </Button>
        </div>
      </form>
      {image && imagePreviewUrl && (
        <MasterImageEditor
          file={image}
          imageUrl={imagePreviewUrl}
          isOpen={isImageEditorOpen}
          title="Edit Cruise Image"
          onCancel={() => setImageEditorOpen(false)}
          onApply={applyEditedImage}
        />
      )}
    </div>
  );
}
