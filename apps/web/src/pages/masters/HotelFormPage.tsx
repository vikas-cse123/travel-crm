import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  HOTEL_IMAGE_MIME_TYPES,
  HOTEL_MEAL_PLAN_TYPES,
  PERMISSIONS,
  type HotelInput,
  type HotelMealPlanType,
} from '@interscale/shared';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveHotelImage,
  confirmHotelImage,
  createMealPlan,
  createRoomType,
  deleteHotelImage,
  hotelImageUrl,
  reorderHotelImages,
  useCreateHotel,
  useDestination,
  useDestinations,
  useHotel,
  useUpdateHotel,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';
import { HotelPlansEditor } from './HotelPlansEditor';
import { emptyPlanDraft, HotelPlanDraftPanel, type PlanDraft } from './HotelPlanDraftPanel';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

const HOTEL_HEADER = 'bg-gradient-to-r from-brand-700 to-blue-600';
const ROOM_HEADER = 'bg-emerald-600';
const MEAL_HEADER = 'bg-teal-600';

interface FormValues {
  destinationId: string;
  cityId: string;
  name: string;
  starCategory: string;
  starRating: string;
  reviewLink: string;
  address: string;
  description: string;
  amenities: string;
  isDefaultForCity: boolean;
}

const empty: FormValues = {
  destinationId: '',
  cityId: '',
  name: '',
  starCategory: '',
  starRating: '',
  reviewLink: '',
  address: '',
  description: '',
  amenities: '',
  isDefaultForCity: false,
};

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
const textOrNull = (value: string): string | null => value.trim() || null;

function SectionCard({
  title,
  headerClass,
  children,
}: {
  title: string;
  headerClass: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className={`px-5 py-4 text-lg font-semibold text-white ${headerClass}`}>{title}</div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function HotelFormPage() {
  const { hotelId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hotel = useHotel(hotelId);
  const destinations = useDestinations(LARGE);
  const create = useCreateHotel();
  const update = useUpdateHotel(hotelId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_HOTELS_MANAGE_MEDIA);
  const canManageCosting = hasPermission(PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
  const [formError, setFormError] = useState('');
  const [roomDrafts, setRoomDrafts] = useState<PlanDraft[]>([emptyPlanDraft()]);
  const [mealDrafts, setMealDrafts] = useState<PlanDraft[]>([emptyPlanDraft()]);
  const form = useForm<FormValues>({ defaultValues: empty });
  const destinationId = form.watch('destinationId');
  const destinationDetail = useDestination(destinationId || undefined);
  const imageGallery = useMasterImageGallery({
    masterId: hotelId,
    entity: hotel.data,
    allowedMimeTypes: HOTEL_IMAGE_MIME_TYPES,
    maxSizeMb: 10,
    api: {
      approve: approveHotelImage,
      confirm: confirmHotelImage,
      download: hotelImageUrl,
      remove: deleteHotelImage,
      reorder: reorderHotelImages,
    },
    onExistingChange: hotel.refetch,
  });

  useEffect(() => {
    const destinationIdFromLink = searchParams.get('destinationId');
    if (!hotelId && destinationIdFromLink) form.setValue('destinationId', destinationIdFromLink);
  }, [form, hotelId, searchParams]);

  useEffect(() => {
    if (!hotel.data) return;
    const value = hotel.data;
    form.reset({
      destinationId: value.destinationId,
      cityId: value.cityId,
      name: value.name,
      starCategory: value.starCategory ? String(value.starCategory) : '',
      starRating: value.starRating != null ? String(value.starRating) : '',
      reviewLink: value.reviewLink ?? '',
      address: value.address ?? '',
      description: value.description ?? '',
      amenities: value.amenities ?? '',
      isDefaultForCity: value.isDefaultForCity,
    });
  }, [hotel.data, form]);

  if (hotelId && hotel.isError) return <Navigate to="/masters/hotels" replace />;
  const mutation = hotelId ? update : create;

  const priceField = (draft: PlanDraft) =>
    canManageCosting && draft.price.trim() ? { sellingPrice: numberOrNull(draft.price) } : {};

  const persistDrafts = async (id: string) => {
    for (const draft of roomDrafts) {
      if (!draft.name.trim()) continue;
      await createRoomType(id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        status: 'ACTIVE',
        currency: 'INR',
        ...priceField(draft),
      });
    }
    for (const draft of mealDrafts) {
      if (!draft.name.trim()) continue;
      await createMealPlan(id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        type: 'CUSTOM' as HotelMealPlanType,
        status: 'ACTIVE',
        currency: 'INR',
        ...priceField(draft),
      });
    }
  };

  const submit = form.handleSubmit(async (values) => {
    setFormError('');
    imageGallery.clearError();
    if (!values.destinationId) {
      form.setError('destinationId', { message: 'Select a destination.' });
      return;
    }
    if (!values.cityId) {
      form.setError('cityId', { message: 'Select a city.' });
      return;
    }
    if (values.name.trim().length < 2) {
      form.setError('name', { message: 'Enter a hotel name.' });
      return;
    }
    const starRating = numberOrNull(values.starRating);
    if (starRating != null && (starRating < 0 || starRating > 5)) {
      form.setError('starRating', { message: 'Enter a rating from 0 to 5.' });
      return;
    }
    const base = {
      destinationId: values.destinationId,
      cityId: values.cityId,
      name: values.name.trim(),
      starCategory: numberOrNull(values.starCategory),
      starRating,
      reviewLink: textOrNull(values.reviewLink),
      address: textOrNull(values.address),
      description: textOrNull(values.description),
      amenities: textOrNull(values.amenities),
      isDefaultForCity: values.isDefaultForCity,
    };
    try {
      const saved = hotelId
        ? await update.mutateAsync(base)
        : await create.mutateAsync({ ...base, status: 'ACTIVE' } as HotelInput);
      if (!hotelId) await persistDrafts(saved.id);
      if (canManageMedia) await imageGallery.persist(saved.id);
      navigate(`/masters/hotels/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        Object.entries(error.fields).forEach(([field, messages]) => {
          if (field in empty) {
            form.setError(field as keyof FormValues, {
              message: messages[0] ?? 'Please check this field.',
            });
          }
        });
        setFormError(
          Object.values(error.fields)
            .map((messages) => messages[0] ?? 'Please check this field.')
            .join(' '),
        );
        return;
      }
      if (error instanceof Error && !(error as { code?: string }).code) setFormError(error.message);
    }
  });

  const errors = form.formState.errors;

  return (
    <div className="space-y-5">
      <MasterHeader
        title={hotelId ? 'Edit Hotel' : 'Create Hotel'}
        current={hotelId ? 'Edit Hotel' : 'Create Hotel'}
      />
      <form onSubmit={submit} className="space-y-5">
        {(mutation.error || formError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {formError || mutation.error?.message}
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <SectionCard title="Hotel Information" headerClass={HOTEL_HEADER}>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <Field label="Destination *" error={errors.destinationId?.message}>
                  <select
                    className={fieldClass}
                    {...form.register('destinationId', {
                      onChange: () => form.setValue('cityId', ''),
                    })}
                  >
                    <option value="">Select destination</option>
                    {destinations.data?.data.map((destination) => (
                      <option key={destination.id} value={destination.id}>
                        {destination.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="City *" error={errors.cityId?.message}>
                  <select
                    className={fieldClass}
                    {...form.register('cityId')}
                    disabled={!destinationId}
                  >
                    <option value="">
                      {destinationId ? 'Select city' : 'Select a destination first'}
                    </option>
                    {destinationDetail.data?.cities.map((link) => (
                      <option key={link.cityId} value={link.cityId}>
                        {link.city.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Hotel Name *" error={errors.name?.message}>
                  <input
                    className={fieldClass}
                    placeholder="Enter hotel name"
                    {...form.register('name')}
                  />
                </Field>
                <label className="flex items-start gap-2 rounded-lg border bg-slate-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    {...form.register('isDefaultForCity')}
                  />
                  <span>
                    <span className="font-medium">Set as default hotel for this city</span>
                    <span className="block text-xs text-slate-500">
                      Only one hotel can be default per city.
                    </span>
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Star Category">
                    <select className={fieldClass} {...form.register('starCategory')}>
                      <option value="">Not rated</option>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <option key={star} value={star}>
                          {star} Star
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Star Rating (0–5)" error={errors.starRating?.message}>
                    <input
                      className={fieldClass}
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      placeholder="e.g. 4.3"
                      {...form.register('starRating')}
                    />
                  </Field>
                </div>
                <Field label="Review Link">
                  <input
                    className={fieldClass}
                    placeholder="e.g. TripAdvisor link"
                    {...form.register('reviewLink')}
                  />
                </Field>
              </div>

              <div className="space-y-4">
                {canManageMedia && (
                  <MasterImageGalleryField
                    label="Hotel Images"
                    controller={imageGallery}
                    accept="image/jpeg,image/png,image/webp"
                    maxSizeMb={10}
                  />
                )}
                <Field label="Address">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    placeholder="Enter hotel address"
                    {...form.register('address')}
                  />
                </Field>
              </div>
            </div>

            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <RichTextEditor label="Description" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={form.control}
              name="amenities"
              render={({ field }) => (
                <RichTextEditor label="Amenities" value={field.value} onChange={field.onChange} />
              )}
            />
          </SectionCard>

          <div className="space-y-5">
            {hotelId && hotel.data ? (
              <>
                <HotelPlansEditor kind="room" hotel={hotel.data} headerClass={ROOM_HEADER} />
                <HotelPlansEditor
                  kind="meal"
                  hotel={hotel.data}
                  mealTypes={HOTEL_MEAL_PLAN_TYPES}
                  headerClass={MEAL_HEADER}
                />
              </>
            ) : (
              <>
                <HotelPlanDraftPanel
                  kind="room"
                  headerClass={ROOM_HEADER}
                  drafts={roomDrafts}
                  onChange={setRoomDrafts}
                />
                <HotelPlanDraftPanel
                  kind="meal"
                  headerClass={MEAL_HEADER}
                  drafts={mealDrafts}
                  onChange={setMealDrafts}
                />
              </>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
          <Link to={hotelId ? `/masters/hotels/${hotelId}` : '/masters/hotels'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending || imageGallery.isBusy}>
            {hotelId ? 'Update Hotel' : 'Create Hotel'}
          </Button>
        </div>
      </form>
    </div>
  );
}
