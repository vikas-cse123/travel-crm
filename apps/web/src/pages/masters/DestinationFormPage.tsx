import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowDown,
  ArrowUp,
  MapPin,
  Minus,
  Move,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
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
  destinationImageUrl,
  reorderDestinationImages,
  useCreateDestination,
  useDestination,
  useMasterLookups,
  useUpdateDestination,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader, RichTextEditor } from './MasterUi';
import { MasterImageGalleryField, useMasterImageGallery } from './MasterImageGallery';

const DESTINATION_IMAGE_MAX_MB = 4;

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
  const [formError, setFormError] = useState('');
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const country = form.watch('countryCode');
  const selectedIds = useWatch({ control: form.control, name: 'cityIds' }) ?? [];
  const countryLookups = useMasterLookups();
  const lookups = useMasterLookups(country, citySearch);
  const allCountryCities = useMasterLookups(country);
  const imageGallery = useMasterImageGallery({
    masterId: destinationId,
    entity: destination.data,
    allowedMimeTypes: DESTINATION_IMAGE_MIME_TYPES,
    maxSizeMb: DESTINATION_IMAGE_MAX_MB,
    api: {
      approve: approveDestinationImage,
      confirm: confirmDestinationImage,
      download: destinationImageUrl,
      remove: deleteDestinationImage,
      reorder: reorderDestinationImages,
    },
    onExistingChange: destination.refetch,
  });

  useEffect(() => {
    if (!destination.data) return;
    form.reset({
      countryCode: destination.data.countryCode,
      name: destination.data.name,
      destinationType: destination.data.destinationType as Values['destinationType'],
      cityIds: (destination.data.cities ?? []).map((link) => link.cityId),
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
      if (form.formState.isDirty || imageGallery.pendingCount > 0) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [form.formState.isDirty, imageGallery.pendingCount]);

  const cityById = useMemo(() => {
    const map = new Map((allCountryCities.data?.cities ?? []).map((city) => [city.id, city]));
    destination.data?.cities?.forEach((link) => map.set(link.cityId, link.city));
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
  const submit = async (values: Values) => {
    setFormError('');
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
      if (canManageImages) {
        try {
          await imageGallery.persist(saved.id);
        } catch {
          const message =
            'Destination saved, but the image upload failed. Please check AWS S3 credentials and upload the image again from Edit Destination.';
          if (!destinationId) {
            navigate(`/masters/destinations/${saved.id}`, {
              state: { warning: message },
              replace: true,
            });
            return;
          }
          setFormError(message);
          return;
        }
      }
      navigate(`/masters/destinations/${saved.id}`);
    } catch (error) {
      if (error instanceof Error && !(error as { code?: string }).code) setFormError(error.message);
    }
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title={destinationId ? 'Edit Destination' : 'Create Destination'}
        description=""
        current={destinationId ? 'Edit Destination' : 'Create Destination'}
      />
      <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
        {(mutation.error || formError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {formError || mutation.error?.message}
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
                <MasterImageGalleryField
                  label="Destination Images"
                  controller={imageGallery}
                  accept="image/jpeg,image/png,image/webp"
                  maxSizeMb={DESTINATION_IMAGE_MAX_MB}
                  renderEditor={({ file, imageUrl, onCancel, onApply }) => (
                    <DestinationImageEditor
                      file={file}
                      imageUrl={imageUrl}
                      isOpen
                      onCancel={onCancel}
                      onApply={onApply}
                    />
                  )}
                />
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
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
        <div className="sticky bottom-0 flex justify-end gap-2 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
          <Link
            to={destinationId ? `/masters/destinations/${destinationId}` : '/masters/destinations'}
          >
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending || imageGallery.isBusy}>
            {destinationId ? 'Update Destination' : 'Create Destination'}
          </Button>
        </div>
      </form>
    </div>
  );
}

type CropAspect = 'free' | '1:1' | '16:9' | '4:3';
type CropRect = { x: number; y: number; width: number; height: number };

const EDITOR_CANVAS_WIDTH = 1200;
const EDITOR_CANVAS_HEIGHT = 675;
const CROP_ASPECTS: Array<{ value: CropAspect; label: string; ratio: number | null }> = [
  { value: 'free', label: 'Free', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
];

function cropForAspect(aspect: CropAspect): CropRect {
  if (aspect === 'free') {
    return {
      x: 0,
      y: 0,
      width: EDITOR_CANVAS_WIDTH,
      height: EDITOR_CANVAS_HEIGHT,
    };
  }
  const ratio = CROP_ASPECTS.find((item) => item.value === aspect)?.ratio;
  const margin = 84;
  const maxWidth = EDITOR_CANVAS_WIDTH - margin * 2;
  const maxHeight = EDITOR_CANVAS_HEIGHT - margin * 2;
  let width = maxWidth;
  let height = maxHeight;
  if (ratio) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  return {
    x: (EDITOR_CANVAS_WIDTH - width) / 2,
    y: (EDITOR_CANVAS_HEIGHT - height) / 2,
    width,
    height,
  };
}

function clampCrop(crop: CropRect): CropRect {
  const minSize = 120;
  const width = Math.min(Math.max(crop.width, minSize), EDITOR_CANVAS_WIDTH);
  const height = Math.min(Math.max(crop.height, minSize), EDITOR_CANVAS_HEIGHT);
  return {
    x: Math.min(Math.max(crop.x, 0), EDITOR_CANVAS_WIDTH - width),
    y: Math.min(Math.max(crop.y, 0), EDITOR_CANVAS_HEIGHT - height),
    width,
    height,
  };
}

function renderEditedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rotation: number,
  scale: number,
) {
  const width = EDITOR_CANVAS_WIDTH;
  const height = EDITOR_CANVAS_HEIGHT;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#111827';
  context.fillRect(0, 0, width, height);

  const radians = (rotation * Math.PI) / 180;
  const rotated = Math.abs(rotation % 180) === 90;
  const baseScale = Math.max(
    width / (rotated ? image.height : image.width),
    height / (rotated ? image.width : image.height),
  );
  const finalScale = baseScale * scale;

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(
    image,
    (-image.width * finalScale) / 2,
    (-image.height * finalScale) / 2,
    image.width * finalScale,
    image.height * finalScale,
  );
  context.restore();
}

function drawCropOverlay(context: CanvasRenderingContext2D, crop: CropRect) {
  context.save();
  context.fillStyle = 'rgba(15, 23, 42, 0.58)';
  context.beginPath();
  context.rect(0, 0, EDITOR_CANVAS_WIDTH, EDITOR_CANVAS_HEIGHT);
  context.rect(crop.x, crop.y, crop.width, crop.height);
  context.fill('evenodd');

  context.strokeStyle = '#3b82f6';
  context.lineWidth = 4;
  context.strokeRect(crop.x, crop.y, crop.width, crop.height);

  context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  context.lineWidth = 1;
  for (const factor of [1 / 3, 2 / 3]) {
    const x = crop.x + crop.width * factor;
    const y = crop.y + crop.height * factor;
    context.beginPath();
    context.moveTo(x, crop.y);
    context.lineTo(x, crop.y + crop.height);
    context.moveTo(crop.x, y);
    context.lineTo(crop.x + crop.width, y);
    context.stroke();
  }

  const handles = [
    [crop.x, crop.y],
    [crop.x + crop.width, crop.y],
    [crop.x, crop.y + crop.height],
    [crop.x + crop.width, crop.y + crop.height],
    [crop.x + crop.width / 2, crop.y],
    [crop.x + crop.width / 2, crop.y + crop.height],
    [crop.x, crop.y + crop.height / 2],
    [crop.x + crop.width, crop.y + crop.height / 2],
  ];
  context.fillStyle = '#3b82f6';
  for (const [x, y] of handles) {
    context.fillRect(x! - 5, y! - 5, 10, 10);
  }
  context.restore();
}

function DestinationImageEditor({
  file,
  imageUrl,
  isOpen,
  onApply,
  onCancel,
}: {
  file: File;
  imageUrl: string;
  isOpen: boolean;
  onApply: (file: File) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    pointerId: number;
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<CropAspect>('free');
  const [crop, setCrop] = useState<CropRect>(() => cropForAspect('free'));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const image = new Image();
    image.onload = () => {
      renderEditedImage(context, image, rotation, scale);
      drawCropOverlay(context, crop);
    };
    image.src = imageUrl;
  }, [crop, imageUrl, rotation, scale]);

  useEffect(() => {
    if (isOpen) draw();
  }, [draw, isOpen]);

  useEffect(() => {
    setScale(1);
    setRotation(0);
    setAspect('free');
    setCrop(cropForAspect('free'));
  }, [file]);

  const zoom = (amount: number) => {
    setScale((value) => Math.min(3, Math.max(1, Number((value + amount).toFixed(2)))));
  };

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * EDITOR_CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * EDITOR_CANVAS_HEIGHT,
    };
  };

  const changeAspect = (nextAspect: CropAspect) => {
    setAspect(nextAspect);
    setCrop(cropForAspect(nextAspect));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const nearRight = Math.abs(point.x - (crop.x + crop.width)) < 28;
    const nearBottom = Math.abs(point.y - (crop.y + crop.height)) < 28;
    const inside =
      point.x >= crop.x &&
      point.x <= crop.x + crop.width &&
      point.y >= crop.y &&
      point.y <= crop.y + crop.height;
    if (!inside && !(nearRight && nearBottom)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode: nearRight && nearBottom ? 'resize' : 'move',
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startCrop: crop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;

    if (drag.mode === 'move') {
      setCrop(
        clampCrop({
          ...drag.startCrop,
          x: drag.startCrop.x + deltaX,
          y: drag.startCrop.y + deltaY,
        }),
      );
      return;
    }

    const ratio = CROP_ASPECTS.find((item) => item.value === aspect)?.ratio;
    const width = drag.startCrop.width + deltaX;
    let height = drag.startCrop.height + deltaY;
    if (ratio) height = width / ratio;
    setCrop(clampCrop({ ...drag.startCrop, width, height }));
  };

  const stopDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const apply = () => {
    const isFullFrame =
      aspect === 'free' &&
      crop.x === 0 &&
      crop.y === 0 &&
      crop.width === EDITOR_CANVAS_WIDTH &&
      crop.height === EDITOR_CANVAS_HEIGHT;
    if (isFullFrame && rotation === 0 && scale === 1) {
      onApply(file);
      return;
    }

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = EDITOR_CANVAS_WIDTH;
    fullCanvas.height = EDITOR_CANVAS_HEIGHT;
    const fullContext = fullCanvas.getContext('2d');
    if (!fullContext) return;

    const image = new Image();
    image.onload = () => {
      renderEditedImage(fullContext, image, rotation, scale);
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = Math.round(crop.width);
      outputCanvas.height = Math.round(crop.height);
      const outputContext = outputCanvas.getContext('2d');
      if (!outputContext) return;
      outputContext.drawImage(
        fullCanvas,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height,
      );
      outputCanvas.toBlob(
        (blob) => {
          if (!blob) return;
          const edited = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });
          onApply(edited);
        },
        file.type,
        0.9,
      );
    };
    image.src = imageUrl;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit destination image"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Edit Destination Image</h2>
            <p className="text-sm text-slate-500">Crop, zoom and rotate before uploading.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Close
          </Button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="mr-1 text-slate-600">Aspect ratio:</span>
            {CROP_ASPECTS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeAspect(item.value)}
                className={`rounded-lg border px-3 py-2 ${
                  aspect === item.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-card text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border bg-slate-800">
            <canvas
              ref={canvasRef}
              width={EDITOR_CANVAS_WIDTH}
              height={EDITOR_CANVAS_HEIGHT}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              className="aspect-video w-full cursor-move touch-none bg-slate-800"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block text-sm font-medium">
              Zoom
              <input
                className="mt-2 w-full accent-brand-600"
                type="range"
                min="1"
                max="2.5"
                step="0.05"
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRotation((value) => (value + 270) % 360)}
              >
                <RotateCcw className="h-4 w-4" /> Rotate left
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRotation((value) => (value + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" /> Rotate right
              </Button>
              <Button type="button" variant="secondary" onClick={() => zoom(0.1)}>
                <Plus className="h-4 w-4" /> Zoom
              </Button>
              <Button type="button" variant="secondary" onClick={() => zoom(-0.1)}>
                <Minus className="h-4 w-4" /> Zoom
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setScale(1);
                  setRotation(0);
                  setAspect('free');
                  setCrop(cropForAspect('free'));
                }}
              >
                Reset
              </Button>
              <Button type="button" variant="secondary" onClick={onCancel}>
                Use original
              </Button>
              <Button type="button" onClick={apply}>
                <Move className="h-4 w-4" />
                Apply image
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
