import { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  HOTEL_IMAGE_MIME_TYPES,
  HOTEL_MEAL_PLAN_TYPES,
  PERMISSIONS,
  type HotelInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveHotelImage,
  confirmHotelImage,
  deleteHotelImage,
  useCreateHotel,
  useDestination,
  useDestinations,
  useHotel,
  useUpdateHotel,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';
import { HotelPlansEditor } from './HotelPlansEditor';

const LARGE = new URLSearchParams('pageSize=100&status=ACTIVE');

interface FormValues {
  destinationId: string;
  cityId: string;
  name: string;
  starCategory: string;
  starRating: string;
  propertyType: string;
  isDefaultForCity: boolean;
  isFeatured: boolean;
  address: string;
  landmark: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  reviewLink: string;
  checkInTime: string;
  checkOutTime: string;
  description: string;
  amenities: string;
  internalNotes: string;
  externalCode: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

const empty: FormValues = {
  destinationId: '',
  cityId: '',
  name: '',
  starCategory: '',
  starRating: '',
  propertyType: '',
  isDefaultForCity: false,
  isFeatured: false,
  address: '',
  landmark: '',
  postalCode: '',
  latitude: '',
  longitude: '',
  contactName: '',
  phone: '',
  email: '',
  website: '',
  reviewLink: '',
  checkInTime: '',
  checkOutTime: '',
  description: '',
  amenities: '',
  internalNotes: '',
  externalCode: '',
  status: 'ACTIVE',
};

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
const textOrNull = (value: string): string | null => value.trim() || null;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
        {title}
      </div>
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
  const navigate = useNavigate();
  const hotel = useHotel(hotelId);
  const destinations = useDestinations(LARGE);
  const create = useCreateHotel();
  const update = useUpdateHotel(hotelId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_HOTELS_MANAGE_MEDIA);
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  const [uploading, setUploading] = useState(false);
  const form = useForm<FormValues>({ defaultValues: empty });
  const destinationId = form.watch('destinationId');
  const destinationDetail = useDestination(destinationId || undefined);

  useEffect(() => {
    if (!hotel.data) return;
    const value = hotel.data;
    form.reset({
      destinationId: value.destinationId,
      cityId: value.cityId,
      name: value.name,
      starCategory: value.starCategory ? String(value.starCategory) : '',
      starRating: value.starRating != null ? String(value.starRating) : '',
      propertyType: value.propertyType ?? '',
      isDefaultForCity: value.isDefaultForCity,
      isFeatured: value.isFeatured,
      address: value.address ?? '',
      landmark: value.landmark ?? '',
      postalCode: value.postalCode ?? '',
      latitude: value.latitude != null ? String(value.latitude) : '',
      longitude: value.longitude != null ? String(value.longitude) : '',
      contactName: value.contactName ?? '',
      phone: value.phone ?? '',
      email: value.email ?? '',
      website: value.website ?? '',
      reviewLink: value.reviewLink ?? '',
      checkInTime: value.checkInTime ?? '',
      checkOutTime: value.checkOutTime ?? '',
      description: value.description ?? '',
      amenities: value.amenities ?? '',
      internalNotes: value.internalNotes ?? '',
      externalCode: value.externalCode ?? '',
      status: value.status as FormValues['status'],
    });
  }, [hotel.data, form]);

  if (hotelId && hotel.isError) return <Navigate to="/masters/hotels" replace />;
  const mutation = hotelId ? update : create;

  const validateImage = (file?: File) => {
    setImageError('');
    if (!file) return setImage(null);
    if (!HOTEL_IMAGE_MIME_TYPES.includes(file.type as (typeof HOTEL_IMAGE_MIME_TYPES)[number])) {
      setImageError('Use a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be 5 MB or smaller.');
      return;
    }
    setImage(file);
  };
  const uploadImage = async (id: string, file: File) => {
    const approval = await approveHotelImage(id, {
      fileName: file.name,
      mimeType: file.type as (typeof HOTEL_IMAGE_MIME_TYPES)[number],
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
    await confirmHotelImage(id);
  };

  const submit = form.handleSubmit(async (values) => {
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
    const payload: HotelInput = {
      destinationId: values.destinationId,
      cityId: values.cityId,
      name: values.name.trim(),
      starCategory: numberOrNull(values.starCategory),
      starRating: numberOrNull(values.starRating),
      propertyType: textOrNull(values.propertyType),
      isDefaultForCity: values.isDefaultForCity,
      isFeatured: values.isFeatured,
      address: textOrNull(values.address),
      landmark: textOrNull(values.landmark),
      postalCode: textOrNull(values.postalCode),
      latitude: numberOrNull(values.latitude),
      longitude: numberOrNull(values.longitude),
      contactName: textOrNull(values.contactName),
      phone: textOrNull(values.phone),
      email: textOrNull(values.email),
      website: textOrNull(values.website),
      reviewLink: textOrNull(values.reviewLink),
      checkInTime: textOrNull(values.checkInTime),
      checkOutTime: textOrNull(values.checkOutTime),
      description: textOrNull(values.description),
      amenities: textOrNull(values.amenities),
      internalNotes: textOrNull(values.internalNotes),
      externalCode: textOrNull(values.externalCode),
      status: values.status,
    };
    try {
      const saved = hotelId ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
      if (image && canManageMedia) {
        setUploading(true);
        await uploadImage(saved.id, image);
      }
      navigate(`/masters/hotels/${saved.id}`);
    } catch (error) {
      if (error instanceof Error && !(error as { code?: string }).code)
        setImageError(error.message);
    } finally {
      setUploading(false);
    }
  });

  const errors = form.formState.errors;

  return (
    <div className="space-y-5">
      <MasterHeader
        title={hotelId ? 'Edit Hotel' : 'Create Hotel'}
        description="Maintain hotel content, location, room types and meal plans."
        current={hotelId ? 'Edit Hotel' : 'Create Hotel'}
      />
      <form onSubmit={submit} className="space-y-5">
        {(mutation.error || imageError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {imageError || mutation.error?.message}
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Basic Information">
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
              <select className={fieldClass} {...form.register('cityId')} disabled={!destinationId}>
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
              <Field label="Star Rating (0–5)">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Property Type">
                <input
                  className={fieldClass}
                  placeholder="Hotel, Resort…"
                  {...form.register('propertyType')}
                />
              </Field>
              <Field label="External Hotel Code">
                <input className={fieldClass} {...form.register('externalCode')} />
              </Field>
            </div>
            <label className="flex items-start gap-2 rounded-lg border bg-slate-50 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" {...form.register('isDefaultForCity')} />
              <span>
                <span className="font-medium">Set as default hotel for this city</span>
                <span className="block text-xs text-slate-500">
                  Only one hotel can be default per city.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register('isFeatured')} /> Featured hotel
            </label>
            {hotelId && (
              <Field label="Status">
                <select className={fieldClass} {...form.register('status')}>
                  <option>ACTIVE</option>
                  <option>INACTIVE</option>
                  <option>ARCHIVED</option>
                </select>
              </Field>
            )}
          </Card>

          <div className="space-y-5">
            <Card title="Location">
              <Field label="Address">
                <textarea className={fieldClass} rows={2} {...form.register('address')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Landmark">
                  <input className={fieldClass} {...form.register('landmark')} />
                </Field>
                <Field label="Postal Code">
                  <input className={fieldClass} {...form.register('postalCode')} />
                </Field>
                <Field label="Latitude">
                  <input
                    className={fieldClass}
                    type="number"
                    step="any"
                    {...form.register('latitude')}
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    className={fieldClass}
                    type="number"
                    step="any"
                    {...form.register('longitude')}
                  />
                </Field>
              </div>
            </Card>
            <Card title="Contact Information">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact Name">
                  <input className={fieldClass} {...form.register('contactName')} />
                </Field>
                <Field label="Phone">
                  <input className={fieldClass} {...form.register('phone')} />
                </Field>
                <Field label="Email">
                  <input className={fieldClass} type="email" {...form.register('email')} />
                </Field>
                <Field label="Website">
                  <input className={fieldClass} {...form.register('website')} />
                </Field>
              </div>
              <Field label="Review Link">
                <input
                  className={fieldClass}
                  placeholder="e.g. TripAdvisor link"
                  {...form.register('reviewLink')}
                />
              </Field>
            </Card>
            <Card title="Stay Information">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Check-in Time">
                  <input className={fieldClass} type="time" {...form.register('checkInTime')} />
                </Field>
                <Field label="Check-out Time">
                  <input className={fieldClass} type="time" {...form.register('checkOutTime')} />
                </Field>
              </div>
            </Card>
          </div>
        </div>

        <Card title="Description & Amenities">
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
          <Field label="Internal Notes">
            <textarea className={fieldClass} rows={3} {...form.register('internalNotes')} />
          </Field>
        </Card>

        {canManageMedia && (
          <Card title="Hotel Image">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600 hover:bg-slate-50">
              <ImagePlus className="h-5 w-5" />
              {image?.name ??
                (hotel.data?.hasImage
                  ? `Replace ${hotel.data.imageFileName}`
                  : 'Choose JPEG, PNG or WebP')}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => validateImage(event.target.files?.[0])}
              />
            </label>
            {hotelId && hotel.data?.hasImage && (
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (window.confirm('Delete this hotel image?')) {
                    await deleteHotelImage(hotelId);
                    await hotel.refetch();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete image
              </Button>
            )}
          </Card>
        )}

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <Link to={hotelId ? `/masters/hotels/${hotelId}` : '/masters/hotels'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending || uploading}>
            {hotelId ? 'Update Hotel' : 'Create Hotel'}
          </Button>
        </div>
      </form>

      {hotelId && hotel.data && (
        <div className="grid gap-5 xl:grid-cols-2">
          <HotelPlansEditor kind="room" hotel={hotel.data} />
          <HotelPlansEditor kind="meal" hotel={hotel.data} mealTypes={HOTEL_MEAL_PLAN_TYPES} />
        </div>
      )}
    </div>
  );
}
