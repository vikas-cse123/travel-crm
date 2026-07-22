import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, ImagePlus, MapPin, Trash2 } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import type { DestinationInput } from '@interscale/shared';
import { DESTINATION_IMAGE_MIME_TYPES, PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveDestinationImage,
  confirmDestinationImage,
  deleteDestinationImage,
  useCreateDestination,
  useDestination,
  useMasterLookups,
  useUpdateDestination,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';

const schema = z.object({
  countryCode: z.string().length(2, 'Select a country.'),
  name: z.string().trim().min(2, 'Enter a destination name.').max(200),
  destinationType: z.enum(['DOMESTIC', 'INTERNATIONAL']),
  cityIds: z.array(z.string().uuid()).min(1, 'Select at least one city.'),
  inclusions: z.string().max(50_000),
  exclusions: z.string().max(50_000),
  paymentPolicies: z.string().max(50_000),
  cancellationPolicies: z.string().max(50_000),
  bookingTerms: z.string().max(50_000),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
});
type Values = z.infer<typeof schema>;
const initial: Values = {
  countryCode: '',
  name: '',
  destinationType: 'DOMESTIC',
  cityIds: [],
  inclusions: '',
  exclusions: '',
  paymentPolicies: '',
  cancellationPolicies: '',
  bookingTerms: '',
  status: 'ACTIVE',
};

export function DestinationFormPage() {
  const { destinationId } = useParams();
  const navigate = useNavigate();
  const destination = useDestination(destinationId);
  const create = useCreateDestination();
  const update = useUpdateDestination(destinationId ?? '');
  const { hasPermission } = useAuth();
  const canManageImages = hasPermission(PERMISSIONS.MASTER_DESTINATIONS_MANAGE_IMAGES);
  const [citySearch, setCitySearch] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  const [uploading, setUploading] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const country = form.watch('countryCode');
  const selectedIds = useWatch({ control: form.control, name: 'cityIds' });
  const countryLookups = useMasterLookups();
  const lookups = useMasterLookups(country, citySearch);
  const allCountryCities = useMasterLookups(country);

  useEffect(() => {
    if (!destination.data) return;
    form.reset({
      countryCode: destination.data.countryCode,
      name: destination.data.name,
      destinationType: destination.data.destinationType as Values['destinationType'],
      cityIds: destination.data.cities.map((link) => link.cityId),
      inclusions: destination.data.inclusions ?? '',
      exclusions: destination.data.exclusions ?? '',
      paymentPolicies: destination.data.paymentPolicies ?? '',
      cancellationPolicies: destination.data.cancellationPolicies ?? '',
      bookingTerms: destination.data.bookingTerms ?? '',
      status: destination.data.status as Values['status'],
    });
  }, [destination.data, form]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty || image) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [form.formState.isDirty, image]);

  const cityById = useMemo(() => {
    const map = new Map((allCountryCities.data?.cities ?? []).map((city) => [city.id, city]));
    destination.data?.cities.forEach((link) => map.set(link.cityId, link.city));
    return map;
  }, [allCountryCities.data?.cities, destination.data?.cities]);

  if (destinationId && destination.isError) return <Navigate to="/masters/destinations" replace />;
  const mutation = destinationId ? update : create;
  const selectCity = (cityId: string) => {
    if (!selectedIds.includes(cityId))
      form.setValue('cityIds', [...selectedIds, cityId], {
        shouldDirty: true,
        shouldValidate: true,
      });
  };
  const moveCity = (index: number, direction: -1 | 1) => {
    const next = [...selectedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    form.setValue('cityIds', next, { shouldDirty: true });
  };
  const validateImage = (file?: File) => {
    setImageError('');
    if (!file) return setImage(null);
    if (
      !DESTINATION_IMAGE_MIME_TYPES.includes(
        file.type as (typeof DESTINATION_IMAGE_MIME_TYPES)[number],
      )
    ) {
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
    const approval = await approveDestinationImage(id, {
      fileName: file.name,
      mimeType: file.type as (typeof DESTINATION_IMAGE_MIME_TYPES)[number],
      fileSize: file.size,
    });
    if (!approval.uploadUrl.startsWith('http')) {
      throw new Error(
        'Local memory storage has no browser upload transport. Configure S3 to upload destination images.',
      );
    }
    const response = await fetch(approval.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) throw new Error('The image upload failed. Please try again.');
    await confirmDestinationImage(id);
  };
  const submit = async (values: Values) => {
    const payload: DestinationInput = {
      ...values,
      inclusions: values.inclusions || null,
      exclusions: values.exclusions || null,
      paymentPolicies: values.paymentPolicies || null,
      cancellationPolicies: values.cancellationPolicies || null,
      bookingTerms: values.bookingTerms || null,
    };
    try {
      const saved = destinationId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (image && canManageImages) {
        setUploading(true);
        await uploadImage(saved.id, image);
      }
      navigate(`/masters/destinations/${saved.id}`);
    } catch (error) {
      if (error instanceof Error && !(error as { code?: string }).code)
        setImageError(error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title={destinationId ? 'Edit Destination' : 'Create Destination'}
        description="Group cities in visit order and maintain reusable commercial content."
        current={destinationId ? 'Edit Destination' : 'Create Destination'}
      />
      <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
        {(mutation.error || imageError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {imageError || mutation.error?.message}
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
              Destination Information
            </div>
            <div className="space-y-5 p-5">
              <label className="block text-sm font-medium">
                Country *
                <select
                  className={fieldClass}
                  {...form.register('countryCode', {
                    onChange: () => form.setValue('cityIds', [], { shouldDirty: true }),
                  })}
                >
                  <option value="">Select country</option>
                  {countryLookups.data?.countries.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.countryCode && (
                  <span className="text-xs text-red-600">
                    {form.formState.errors.countryCode.message}
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium">
                Destination Name *
                <input
                  className={fieldClass}
                  placeholder="e.g. Rajasthan Highlights"
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <span className="text-xs text-red-600">{form.formState.errors.name.message}</span>
                )}
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Destination Type *</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['DOMESTIC', 'INTERNATIONAL'] as const).map((type) => (
                    <label
                      key={type}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"
                    >
                      <input type="radio" value={type} {...form.register('destinationType')} />
                      {type === 'DOMESTIC' ? 'Domestic' : 'International'}
                    </label>
                  ))}
                </div>
              </fieldset>
              {canManageImages && (
                <div>
                  <span className="text-sm font-medium">Destination Image</span>
                  <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600 hover:bg-slate-50">
                    <ImagePlus className="h-5 w-5" />
                    {image?.name ??
                      (destination.data?.hasImage
                        ? `Replace ${destination.data.imageFileName}`
                        : 'Choose JPEG, PNG or WebP')}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => validateImage(event.target.files?.[0])}
                    />
                  </label>
                  {destinationId && destination.data?.hasImage && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (window.confirm('Delete this destination image?')) {
                          await deleteDestinationImage(destinationId);
                          await destination.refetch();
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete image
                    </Button>
                  )}
                </div>
              )}
              <div>
                <label className="text-sm font-medium" htmlFor="city-search">
                  Search Cities *
                </label>
                <input
                  id="city-search"
                  className={fieldClass}
                  value={citySearch}
                  onChange={(event) => setCitySearch(event.target.value)}
                  placeholder="Search active cities"
                />
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border">
                  {(country ? (lookups.data?.cities ?? []) : [])
                    .filter((city) => !selectedIds.includes(city.id))
                    .map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => selectCity(city.id)}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                      >
                        <span>{city.name}</span>
                        <span className="font-mono text-xs text-slate-500">
                          {city.airportCode ?? '—'}
                        </span>
                      </button>
                    ))}
                  {!(country ? (lookups.data?.cities ?? []) : []).filter(
                    (city) => !selectedIds.includes(city.id),
                  ).length && (
                    <p className="p-3 text-sm text-slate-500">
                      {country ? 'No more matching cities.' : 'Select a country to view cities.'}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Selected Cities ({selectedIds.length})</p>
                <div className="mt-2 space-y-2">
                  {selectedIds.map((id, index) => {
                    const city = cityById.get(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {index + 1}
                        </span>
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {city?.name ?? 'Selected city'}
                        </span>
                        <button
                          type="button"
                          aria-label={`Move ${city?.name ?? 'city'} up`}
                          disabled={index === 0}
                          onClick={() => moveCity(index, -1)}
                          className="disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${city?.name ?? 'city'} down`}
                          disabled={index === selectedIds.length - 1}
                          onClick={() => moveCity(index, 1)}
                          className="disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${city?.name ?? 'city'}`}
                          onClick={() =>
                            form.setValue(
                              'cityIds',
                              selectedIds.filter((value) => value !== id),
                              { shouldDirty: true, shouldValidate: true },
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {form.formState.errors.cityIds && (
                  <span className="text-xs text-red-600">
                    {form.formState.errors.cityIds.message}
                  </span>
                )}
              </div>
              {destinationId && (
                <label className="block text-sm font-medium">
                  Status
                  <select className={fieldClass} {...form.register('status')}>
                    <option>ACTIVE</option>
                    <option>INACTIVE</option>
                    <option>ARCHIVED</option>
                  </select>
                </label>
              )}
            </div>
          </section>
          <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b px-5 py-4 text-lg font-semibold">Policies & Terms</div>
            <div className="space-y-5 p-5">
              {(
                [
                  'inclusions',
                  'exclusions',
                  'paymentPolicies',
                  'cancellationPolicies',
                  'bookingTerms',
                ] as const
              ).map((name) => (
                <Controller
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <RichTextEditor
                      label={
                        {
                          inclusions: 'Inclusions',
                          exclusions: 'Exclusions',
                          paymentPolicies: 'Payment Policies',
                          cancellationPolicies: 'Cancellation Policies',
                          bookingTerms: 'Booking Terms & Conditions',
                        }[name]
                      }
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              ))}
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <Link
            to={destinationId ? `/masters/destinations/${destinationId}` : '/masters/destinations'}
          >
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending || uploading}>
            {destinationId ? 'Update Destination' : 'Create Destination'}
          </Button>
        </div>
      </form>
    </div>
  );
}
