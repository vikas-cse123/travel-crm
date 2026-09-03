import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useWatch, type FieldPath, type UseFormReturn } from 'react-hook-form';
import {
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  SIGHTSEEING_DEFAULT_PRICE_LABELS,
  SIGHTSEEING_PRICING_BASES,
  calculateSightseeingActivityTotal,
  calculateSightseeingSectionTotal,
  formatItineraryDayTitle,
  quotationSnapshotImageIdentity,
  type QuotationVersionInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { cn } from '@/utils/cn';
import {
  SightseeingActivitySelect,
  type SightseeingSelectOption,
} from '@/components/ui/SightseeingActivitySelect';
import {
  quotationDocumentInlineUrl,
  uploadQuotationAttachment,
} from '@/features/quotations/quotations.api';
import {
  useSightseeingActivities,
  useSightseeingPresentations,
  type SightseeingActivity,
  type SightseeingPresentationMap,
} from '@/features/masters/masters.api';

/** Reference quick options shown above the master list in the activity picker. */
const SPECIAL_SIGHTSEEING_OPTIONS: SightseeingSelectOption[] = [
  { id: 'special:day_at_leisure', label: 'Day at Leisure' },
  { id: 'special:custom_sightseeing', label: 'Custom Sightseeing' },
  { id: 'special:arrival_checkin', label: 'Arrival and Check-in' },
];
const SPECIAL_DAY_AT_LEISURE_DESCRIPTION = '<p>Relax and enjoy the day at your own pace.</p>';
const SPECIAL_ARRIVAL_CHECKIN_DESCRIPTION = '<p>Arrival and hotel check-in.</p>';

const field =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm h-[38px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring transition-colors';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const calculatedCard = 'rounded-lg bg-muted/50 border border-border/40 px-3 py-2.5';
const calculatedLabel = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const calculatedValue = 'text-sm font-semibold text-foreground';
const subsectionHeading = 'text-xs font-semibold uppercase tracking-widest text-brand-700';
const subsectionHeadingMuted = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

type Form = UseFormReturn<QuotationVersionInput>;
type SightDay = NonNullable<QuotationVersionInput['sightseeingDetails']>['days'][number];
type SightActivity = SightDay['activities'][number];
type SightImage = SightActivity['images'][number];

type SightPriceRow = SightActivity['pricingOptions'][number];

/** The default rows (Adult/Child), blank. Blank rows are dropped on save by the schema. */
const emptyPricingRows = (): SightPriceRow[] =>
  SIGHTSEEING_DEFAULT_PRICE_LABELS.map((label) => ({ label, price: null as never }));

const priceLabelKey = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const isDefaultPriceLabel = (value: unknown) =>
  SIGHTSEEING_DEFAULT_PRICE_LABELS.some((label) => label.toLowerCase() === priceLabelKey(value));

/**
 * Shape a saved activity's pricing for editing: Adult/Child always
 * present (and in that order) at the head, every other saved row kept after
 * them in its saved order. Activities saved before this feature have no
 * `pricingOptions` at all and simply get the two blank defaults.
 */
export const withDefaultPricingRows = (rows?: SightPriceRow[] | null): SightPriceRow[] => {
  const savedRaw = Array.isArray(rows) ? rows : [];
  // Drop legacy Senior rows — sightseeing now uses only Adult/Child defaults.
  const saved = savedRaw.filter((row) => priceLabelKey(row?.label) !== 'senior');
  const defaults = SIGHTSEEING_DEFAULT_PRICE_LABELS.map((label) => {
    const match = saved.find((row) => priceLabelKey(row?.label) === label.toLowerCase());
    return { label, price: (match?.price ?? null) as never };
  });
  return [...defaults, ...saved.filter((row) => !isDefaultPriceLabel(row?.label))];
};

/**
 * Apply {@link withDefaultPricingRows} to every activity of a saved snapshot so
 * reopening a quotation shows the default price boxes with their saved values.
 */
export const withSightseeingPricingRows = <T,>(details: T): T => {
  const source = details as { days?: Array<{ activities?: unknown[] }> };
  return {
    ...details,
    days: (source.days ?? []).map((day) => ({
      ...day,
      activities: (day.activities ?? []).map((activity) => {
        const row = (activity ?? {}) as {
          pricingOptions?: SightPriceRow[] | null;
          startTime?: string | null;
          showTime?: boolean;
          images?: SightImage[] | null;
          imageSnapshotPresent?: boolean;
        };
        return {
          ...row,
          showTime: Boolean(row.startTime) && row.showTime !== false,
          imageSnapshotPresent:
            row.imageSnapshotPresent ?? (Array.isArray(row.images) && row.images.length > 0),
          pricingOptions: withDefaultPricingRows(row.pricingOptions),
        };
      }),
    })),
  } as T;
};

export const emptySightseeingActivity = (): SightActivity => ({
  sightseeingId: null,
  imageDocumentId: null,
  name: null,
  startTime: null,
  showTime: false,
  duration: null,
  city: null,
  description: null,
  imageUrl: null,
  images: [],
  imageSnapshotPresent: false,
  pdfImageUrl: null,
  dailyTransfer: null,
  pricingOptions: emptyPricingRows(),
  pricingBasis: null,
  pricingQuantity: null,
  sequence: null,
});

export const emptySightseeingDay = (dayNumber: number, seed?: Partial<SightDay>): SightDay => ({
  dayNumber,
  title: `Day ${dayNumber}`,
  city: null,
  date: null,
  meals: { breakfast: true, lunch: false, dinner: false },
  mealMode: 'INCLUDE_AT_HOTEL',
  // Persist the default-checked breakfast's displayed mode so the public page
  // never falls back to the shared legacy mealMode and shows "(Hotel)".
  mealPreferences: { breakfast: { mode: 'NO_TRANSFER', transferDetails: null } },
  dailyTransfer: 'SHARED',
  activities: [emptySightseeingActivity()],
  ...seed,
});

const cityKey = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const durationLabel = (row: SightseeingActivity) =>
  row.estimatedHours != null ? `${row.estimatedHours} hours` : null;

/** Compact fixed-size activity thumbnail; never grows with the description. */
function ActivityThumb({ imageUrl }: { imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed)
    return (
      <img
        src={imageUrl}
        alt="Activity"
        onError={() => setFailed(true)}
        className="h-full w-full rounded-md object-cover object-center"
      />
    );
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md bg-slate-100 text-slate-400">
      <ImageIcon className="h-6 w-6" />
    </div>
  );
}

function ActivityImageGallery({
  dayIndex,
  activityIndex,
  images,
  pdfImageUrl,
  imageUrl,
  onMove,
  onRemove,
  onSelectPdf,
}: {
  dayIndex: number;
  activityIndex: number;
  images: SightImage[];
  pdfImageUrl?: string | null;
  imageUrl: (image: SightImage) => string | null;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onSelectPdf: (identity: string) => void;
}) {
  if (!images.length) return null;
  const selected =
    images.find((image) => quotationSnapshotImageIdentity(image) === pdfImageUrl) ?? images[0];
  const selectedIdentity = quotationSnapshotImageIdentity(selected!);
  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
      <p className={labelCls}>Activity Images ({images.length}) · order saved with the quotation</p>
      {images.map((image, index) => {
        const identity = quotationSnapshotImageIdentity(image);
        return (
          <div
            key={`${identity ?? 'image'}-${index}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-2"
          >
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md">
              <ActivityThumb imageUrl={imageUrl(image)} />
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={index === 0}
              aria-label={`Move sightseeing image ${index + 1} left on day ${dayIndex + 1} activity ${activityIndex + 1}`}
              onClick={() => onMove(index, -1)}
            >
              <ArrowLeft className="h-4 w-4" /> Move Left
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={index === images.length - 1}
              aria-label={`Move sightseeing image ${index + 1} right on day ${dayIndex + 1} activity ${activityIndex + 1}`}
              onClick={() => onMove(index, 1)}
            >
              Move Right <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Remove sightseeing image ${index + 1} on day ${dayIndex + 1} activity ${activityIndex + 1}`}
              onClick={() => onRemove(index)}
            >
              <X className="h-4 w-4" /> Remove
            </Button>
            {identity && (
              <label className="ml-auto flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={`sightseeing-${dayIndex}-${activityIndex}-pdf-image`}
                  aria-label={`Use sightseeing image ${index + 1} in PDF on day ${dayIndex + 1} activity ${activityIndex + 1}`}
                  checked={identity === selectedIdentity}
                  onChange={() => onSelectPdf(identity)}
                />
                Use in PDF
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Per-activity informational pricing.
 *
 * Adult/Child occupy the first two slots of the same `pricingOptions`
 * array every custom row lives in — they are not separate fields, they just
 * always render. Leaving one blank persists nothing; the shared schema drops
 * unfilled rows and reports duplicates/negatives at their array index, which is
 * what the inline errors below read.
 */
function ActivityPricing({
  form,
  dayIndex,
  activityIndex,
  ariaPrefix,
  pax,
}: {
  form: Form;
  dayIndex: number;
  activityIndex: number;
  ariaPrefix: string;
  pax?: { adults: number; childrenWithBed: number; childrenWithoutBed: number; infants: number };
}) {
  const name =
    `sightseeingDetails.days.${dayIndex}.activities.${activityIndex}.pricingOptions` as const;
  const rows = useFieldArray({ control: form.control, name });
  const fp = (path: string) => path as FieldPath<QuotationVersionInput>;
  // null rather than 0 so an untouched price stays visibly blank. Also runs on
  // mount against the stored value, so it must tolerate null/number, not just
  // the string an <input> hands back.
  const asPrice = (value: unknown) => {
    if (value == null) return null;
    const text = String(value).trim();
    if (text === '') return null;
    const parsed = Number(text);
    return Number.isNaN(parsed) ? null : parsed;
  };
  const errorAt = (index: number, key: 'label' | 'price') => {
    const list = form.formState.errors.sightseeingDetails?.days?.[dayIndex]?.activities?.[
      activityIndex
    ]?.pricingOptions as Array<Record<string, { message?: string }>> | undefined;
    return list?.[index]?.[key]?.message;
  };

  const defaultCount = SIGHTSEEING_DEFAULT_PRICE_LABELS.length;
  const customRows = rows.fields.slice(defaultCount);
  const basisBase =
    `sightseeingDetails.days.${dayIndex}.activities.${activityIndex}.pricingBasis` as const;
  const quantityBase =
    `sightseeingDetails.days.${dayIndex}.activities.${activityIndex}.pricingQuantity` as const;
  const basis =
    (form.watch(basisBase as never) as unknown as string | null | undefined) ?? 'PER_TRAVELER';
  const mode = (form.watch('pricingMode' as never) as unknown as string | undefined);
  const isSectionWise = mode !== 'PER_PERSON';
  if (!isSectionWise) return null;

  return (
    <div className="rounded-lg bg-muted/40 border border-border/40 p-3.5">
      <p className={subsectionHeading}>Activity Pricing</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          Pricing Basis
          <select
            aria-label={`${ariaPrefix} pricing basis`}
            className={`${field} mt-1`}
            value={basis}
            {...form.register(basisBase as never)}
          >
            {SIGHTSEEING_PRICING_BASES.map((value) => (
              <option key={value} value={value}>
                {value === 'PER_TRAVELER'
                  ? 'Per Traveler (Adult/Child rates)'
                  : value === 'PER_GROUP'
                    ? 'Per Group'
                    : value === 'PER_VEHICLE'
                      ? 'Per Vehicle'
                      : value === 'PER_DAY'
                        ? 'Per Day'
                        : 'Fixed'}
              </option>
            ))}
          </select>
        </label>
        {basis !== 'PER_TRAVELER' && (
          <label className="block text-xs font-medium text-slate-600">
            Quantity
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              aria-label={`${ariaPrefix} pricing quantity`}
              className={`${field} mt-1`}
              placeholder="1"
              {...form.register(quantityBase as never, {
                setValueAs: (value: unknown) =>
                  value === '' || value == null ? null : Math.max(0, Math.floor(Number(value) || 0)),
              })}
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">
              Price × Quantity — traveler counts are not used for this basis.
            </span>
          </label>
        )}
      </div>
      {/* One column on phones — two price boxes. */}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {SIGHTSEEING_DEFAULT_PRICE_LABELS.map((label, index) => (
          <label key={label} className="block text-xs font-medium text-slate-600">
            {label} Price
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                aria-label={`${ariaPrefix} ${label.toLowerCase()} price`}
                className={`${field} pl-7`}
                {...form.register(fp(`${name}.${index}.price`), { setValueAs: asPrice })}
              />
            </div>
            {errorAt(index, 'price') && (
              <span className="mt-1 block text-xs font-normal text-red-600">
                {errorAt(index, 'price')}
              </span>
            )}
          </label>
        ))}
      </div>

      {basis === 'PER_TRAVELER' && (() => {
        const pricingOptions = form.watch(name as never) as unknown as Array<{ label: string; price: number | string | null | undefined }>;
        const effectivePax = pax ?? { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 };
        const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const paxForLabel = (label: string, p: typeof effectivePax): number | null => {
          const norm = label.trim().toLowerCase();
          if (norm === 'adult' || norm === 'adults') return p.adults;
          if (norm === 'cwb' || norm === 'child with bed' || norm === 'child_with_bed') return p.childrenWithBed;
          if (norm === 'cwob' || norm === 'child without bed' || norm === 'child_without_bed') return p.childrenWithoutBed;
          if (norm === 'infant' || norm === 'infants') return p.infants;
          if (norm === 'child' || norm === 'children') return p.childrenWithBed + p.childrenWithoutBed;
          return null;
        };
        const rows = (pricingOptions ?? [])
          .map((row) => {
            const label = typeof row.label === 'string' ? row.label.trim() : '';
            const price = Number(row.price ?? 0);
            if (!label || !Number.isFinite(price) || price === 0) return null;
            const count = paxForLabel(label, effectivePax);
            const qty = count === null ? 1 : count;
            return { label, price, qty, amount: price * qty };
          })
          .filter(Boolean) as Array<{ label: string; price: number; qty: number; amount: number }>;
        if (rows.length === 0) return null;
        return (
          <div className="mt-3 rounded-md border bg-white px-3 py-2 text-sm">
            <div className="space-y-1 text-slate-600">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between">
                  <span>
                    {r.label}: {r.qty} × {fmt(r.price)}
                  </span>
                  <span className="font-medium text-slate-800">= {fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {customRows.length > 0 && (
        <div className="mt-3 space-y-3">
          {customRows.map((row, offset) => {
            const index = defaultCount + offset;
            return (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_170px_auto] sm:items-end">
                <label className="block text-xs font-medium text-slate-600">
                  Label
                  <input
                    aria-label={`${ariaPrefix} price option ${offset + 1} label`}
                    placeholder="e.g. Infant"
                    className={`${field} mt-1`}
                    {...form.register(fp(`${name}.${index}.label`))}
                  />
                  {errorAt(index, 'label') && (
                    <span className="mt-1 block text-xs font-normal text-red-600">
                      {errorAt(index, 'label')}
                    </span>
                  )}
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Price
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`${ariaPrefix} price option ${offset + 1} price`}
                      className={`${field} pl-7`}
                      {...form.register(fp(`${name}.${index}.price`), { setValueAs: asPrice })}
                    />
                  </div>
                  {errorAt(index, 'price') && (
                    <span className="mt-1 block text-xs font-normal text-red-600">
                      {errorAt(index, 'price')}
                    </span>
                  )}
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-red-600 sm:w-auto"
                  aria-label={`Remove ${ariaPrefix} price option ${offset + 1}`}
                  onClick={() => rows.remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sm:hidden">Remove</span>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => rows.append({ label: '', price: null } as never)}
        >
          <Plus className="h-4 w-4" /> Add Price Option
        </Button>
      </div>
      {(() => {
        const pricingOptions = form.watch(name as never) as unknown as Array<{ label: string; price: number | string | null | undefined }>;
        const pricingBasis = form.watch(basisBase as never) as unknown as string | null;
        const pricingQuantity = form.watch(quantityBase as never) as unknown as number | null;
        const effectivePax = pax ?? { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 };
        const total = calculateSightseeingActivityTotal(pricingOptions as never, effectivePax as never, { pricingBasis, pricingQuantity } as never);
        return (
          <div className={`mt-3 ${calculatedCard} flex justify-between bg-card`}>
            <span className={calculatedLabel}>Activity Amount</span>
            <span className={calculatedValue}>₹{total.toFixed(2)}</span>
          </div>
        );
      })()}
    </div>
  );
}

/** One day card: title/city + activities + meals + transfer. */
function DayCard({
  form,
  quotationId,
  quotationVersionId,
  dayIndex,
  attractions,
  presentations,
  destinationLabel,
  attractionsStatus,
  pax,
  onInsertBefore,
  onInsertAfter,
  onRemove,
}: {
  form: Form;
  quotationId: string;
  quotationVersionId: string;
  dayIndex: number;
  attractions: SightseeingActivity[];
  presentations: SightseeingPresentationMap;
  /** Display name of the resolved quotation destination, e.g. "Singapore". */
  destinationLabel: string;
  attractionsStatus: { loading: boolean; error: boolean };
  pax: { adults: number; childrenWithBed: number; childrenWithoutBed: number; infants: number };
  onInsertBefore?: (() => void) | undefined;
  onInsertAfter: () => void;
  onRemove: () => void;
}) {
  const fp = (path: string) => path as FieldPath<QuotationVersionInput>;
  const base = `sightseeingDetails.days.${dayIndex}`;
  const activities = useFieldArray({
    control: form.control,
    name: `sightseeingDetails.days.${dayIndex}.activities`,
  });
  const [documentPreviews, setDocumentPreviews] = useState<Record<string, string>>({});
  const [uploadingActivity, setUploadingActivity] = useState<number | null>(null);
  const [imageError, setImageError] = useState('');
  const savedDocumentIds = useMemo(
    () =>
      activities.fields
        .map((activity) => activity.imageDocumentId)
        .filter((id): id is string => Boolean(id)),
    [activities.fields],
  );
  useEffect(() => {
    let active = true;
    const missing = savedDocumentIds.filter((id) => !documentPreviews[id]);
    if (!missing.length)
      return () => {
        active = false;
      };
    void Promise.all(
      missing.map(async (documentId) => {
        try {
          return [documentId, await quotationDocumentInlineUrl(quotationId, documentId)] as const;
        } catch {
          return [documentId, ''] as const;
        }
      }),
    ).then((entries) => {
      if (active)
        setDocumentPreviews((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      active = false;
    };
  }, [documentPreviews, quotationId, savedDocumentIds]);
  const meals = ['breakfast', 'lunch', 'dinner'] as const;
  const dayCity = (form.watch(fp(`${base}.city`)) as string | null) ?? '';
  // Day-level transfer is a legacy fallback for activities without their own
  // per-activity transfer; the builder edits transfers per activity.
  const dayDailyTransfer =
    (form.watch(fp(`${base}.dailyTransfer`)) as string | null | undefined) ?? 'SHARED';
  const dayTitle = (form.watch(fp(`${base}.title`)) as string | null) ?? '';
  const titleTouched = form.watch(fp(`${base}.titleTouched`)) ?? false;

  // Current-day city activities stay at the top; every other destination/city
  // remains available below so users can pick any tenant activity (search is
  // global across the tenant, not restricted to the itinerary day's city).
  const dayContext = useMemo(() => {
    const sortedAll = [...attractions].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.title.localeCompare(b.title),
    );
    const currentCity = cityKey(dayCity);
    const cityMatches = sortedAll.filter((row) => cityKey(row.city?.name) === currentCity);
    const others = sortedAll.filter((row) => cityKey(row.city?.name) !== currentCity);
    return {
      options: [...cityMatches, ...others],
      cityHasMatch: cityMatches.length > 0,
    };
  }, [attractions, dayCity]);

  const groupLabel = dayContext.cityHasMatch
    ? dayCity.trim()
      ? `Activities in ${dayCity.trim()}`
      : destinationLabel
        ? `Activities in ${destinationLabel}`
        : 'Activities'
    : destinationLabel
      ? `Activities in ${destinationLabel}`
      : 'Activities';

  const masterOptions = useMemo(
    () =>
      dayContext.options.map((row) => ({
        id: row.id,
        label: row.title,
        hint: [row.city?.name, durationLabel(row)].filter(Boolean).join(' • '),
        searchText: [
          row.title,
          row.city?.name,
          row.destination?.name,
          (row.description ?? '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        ]
          .filter(Boolean)
          .join(' '),
      })),
    [dayContext.options],
  );

  // Always replace stale prefixes after inserting/removing/reordering days.
  const autoDayTitle = (activityName: string | null): string => {
    return formatItineraryDayTitle(dayIndex + 1, activityName);
  };

  const clearActivity = (abase: string) => {
    form.setValue(fp(`${abase}.sightseeingId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageDocumentId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.images`), [] as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageSnapshotPresent`), false as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.pdfImageUrl`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.name`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.description`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.city`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.startTime`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.showTime`), false as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.duration`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.sequence`), null as never, { shouldDirty: true });
  };

  const pickSpecial = (abase: string, option: SightseeingSelectOption) => {
    form.setValue(fp(`${abase}.sightseeingId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageDocumentId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.images`), [] as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageSnapshotPresent`), false as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.pdfImageUrl`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.city`), (dayCity || null) as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.startTime`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.showTime`), false as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.duration`), null as never, { shouldDirty: true });
    const name =
      option.id === 'special:day_at_leisure'
        ? 'Day at Leisure'
        : option.id === 'special:arrival_checkin'
          ? 'Arrival and Check-in'
          : null;
    form.setValue(fp(`${abase}.name`), name as never, { shouldDirty: true });
    const description =
      option.id === 'special:day_at_leisure'
        ? SPECIAL_DAY_AT_LEISURE_DESCRIPTION
        : option.id === 'special:arrival_checkin'
          ? SPECIAL_ARRIVAL_CHECKIN_DESCRIPTION
          : null;
    form.setValue(fp(`${abase}.description`), description as never, { shouldDirty: true });
    if (!titleTouched && name)
      form.setValue(fp(`${base}.title`), autoDayTitle(name), { shouldDirty: true });
  };

  const pickMaster = (abase: string, option: SightseeingSelectOption) => {
    const picked = attractions.find((row) => row.id === option.id) ?? null;
    form.setValue(fp(`${abase}.sightseeingId`), (picked?.id ?? null) as never, {
      shouldDirty: true,
    });
    form.setValue(fp(`${abase}.name`), (picked?.title ?? null) as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageDocumentId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
    const gallery = (picked?.images ?? []).map((image, index) => ({
      masterImageId: image.id,
      alt: `${picked?.title ?? 'Sightseeing'} image ${index + 1}`,
    }));
    form.setValue(fp(`${abase}.images`), gallery as never, { shouldDirty: true });
    form.setValue(
      fp(`${abase}.imageSnapshotPresent`),
      (picked ? (Array.isArray(picked.images) ? true : undefined) : false) as never,
      { shouldDirty: true },
    );
    form.setValue(
      fp(`${abase}.pdfImageUrl`),
      (gallery[0] ? quotationSnapshotImageIdentity(gallery[0]) : null) as never,
      { shouldDirty: true },
    );
    if (picked) {
      form.setValue(fp(`${abase}.description`), (picked.description ?? null) as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.city`), (picked.city?.name ?? null) as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.startTime`), (picked.suggestedStartTime ?? null) as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.showTime`), Boolean(picked.suggestedStartTime) as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.duration`), (durationLabel(picked) ?? null) as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.sequence`), 1 as never, { shouldDirty: true });
      // Prefill pricingOptions from master pricing if activity has no pricing yet.
      // Keep existing manual edits: only fill when all current prices are blank/zero.
      const masterPricing = (picked as unknown as { pricing?: Array<{ label: string; price: number | null }> | null })?.pricing;
      if (Array.isArray(masterPricing) && masterPricing.length > 0) {
        const currentPricing = form.getValues(fp(`${abase}.pricingOptions`) as never) as unknown as Array<{ label?: unknown; price?: unknown }> | undefined;
        const isEmpty =
          !currentPricing ||
          currentPricing.length === 0 ||
          currentPricing.every(
            (row) => row?.price == null || row?.price === '' || Number(row?.price) === 0,
          );
        if (isEmpty) {
          const mapped = masterPricing.map((row) => ({ label: row.label, price: row.price }));
          const normalized = withDefaultPricingRows(mapped as never);
          normalized.forEach((row, idx) => {
            form.setValue(fp(`${abase}.pricingOptions.${idx}.label`), row.label as never, { shouldDirty: true });
            form.setValue(fp(`${abase}.pricingOptions.${idx}.price`), row.price as never, { shouldDirty: true, shouldValidate: false });
          });
        }
      }
      if (!titleTouched)
        form.setValue(fp(`${base}.title`), autoDayTitle(picked.title), { shouldDirty: true });
    }
  };

  const applyActivitySelection = (abase: string, option: SightseeingSelectOption | null) => {
    if (!option) {
      clearActivity(abase);
      return;
    }
    if (option.id.startsWith('special:')) {
      pickSpecial(abase, option);
      return;
    }
    pickMaster(abase, option);
  };

  const uploadActivityImage = async (abase: string, activityIndex: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageError('Choose a PNG, JPG, WebP, GIF, or AVIF image.');
      return;
    }
    setImageError('');
    setUploadingActivity(activityIndex);
    try {
      const { documentId, url } = await uploadQuotationAttachment(
        quotationId,
        file,
        quotationVersionId,
      );
      form.setValue(fp(`${abase}.imageDocumentId`), documentId as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
      form.setValue(fp(`${abase}.images`), [] as never, { shouldDirty: true });
      form.setValue(fp(`${abase}.imageSnapshotPresent`), false as never, { shouldDirty: true });
      form.setValue(fp(`${abase}.pdfImageUrl`), null as never, { shouldDirty: true });
      setDocumentPreviews((current) => ({ ...current, [documentId]: url }));
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : 'The sightseeing image upload failed.',
      );
    } finally {
      setUploadingActivity(null);
    }
  };

  return (
    <article className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-1 flex-wrap gap-3">
          <label className="flex-1 text-sm font-semibold text-slate-800">
            Day {dayIndex + 1} title
            <input
              aria-label={`Sightseeing day ${dayIndex + 1} title`}
              className={`${field} mt-1`}
              value={dayTitle}
              onChange={(event) => {
                form.setValue(fp(`${base}.title`), event.target.value, { shouldDirty: true });
                form.setValue(fp(`${base}.titleTouched`), true as never, { shouldDirty: true });
              }}
            />
          </label>
          <label className="w-48 text-sm font-semibold text-slate-800">
            City
            <input
              aria-label={`Sightseeing day ${dayIndex + 1} city`}
              className={`${field} mt-1`}
              value={dayCity}
              onChange={(event) =>
                form.setValue(fp(`${base}.city`), event.target.value || null, { shouldDirty: true })
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onInsertBefore && (
            <Button
              variant="secondary"
              aria-label={`Insert sightseeing day before day ${dayIndex + 1}`}
              onClick={onInsertBefore}
            >
              <Plus className="h-4 w-4" /> Add Day Before
            </Button>
          )}
          <Button
            variant="secondary"
            aria-label={`Insert sightseeing day after day ${dayIndex + 1}`}
            onClick={onInsertAfter}
          >
            <Plus className="h-4 w-4" /> Add Day After
          </Button>
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> Remove Day
          </Button>
        </div>
      </div>

          <div className="space-y-4">
            {activities.fields.map((activity, aIndex) => {
              const abase = `${base}.activities.${aIndex}`;
              const snapshotUrl = (form.watch(fp(`${abase}.imageUrl`)) as string | null) ?? null;
              const imageDocumentId =
                (form.watch(fp(`${abase}.imageDocumentId`)) as string | null) ?? null;
              const sightseeingId =
                (form.watch(fp(`${abase}.sightseeingId`)) as string | null) ?? null;
              const activityName = (form.watch(fp(`${abase}.name`)) as string | null) ?? null;
              const activityImages =
                (form.watch(fp(`${abase}.images`)) as SightImage[] | undefined) ?? [];
              const imageSnapshotPresent =
                (form.watch(fp(`${abase}.imageSnapshotPresent`)) as boolean | undefined) ?? false;
              const pdfImageUrl =
                (form.watch(fp(`${abase}.pdfImageUrl`)) as string | null | undefined) ?? null;
              const imageUrlFor = (image: SightImage) => {
                const identity = image.masterImageId ?? image.id;
                const viaMaster = identity
                  ? (presentations[sightseeingId ?? '']?.images.find(
                      (presented) => presented.id === identity,
                    )?.url ?? null)
                  : null;
                if (viaMaster) return viaMaster;
                if (image.url) return image.url;
                return null;
              };
              // A quotation gallery is authoritative once present. Legacy
              // activities with no gallery retain document/single-Master
              // fallbacks exactly as before.
              const resolvedUrl =
                (imageDocumentId ? documentPreviews[imageDocumentId] : null) ??
                (imageSnapshotPresent && activityImages.length
                  ? imageUrlFor(activityImages[0]!)
                  : null) ??
                (!imageSnapshotPresent
                  ? ((sightseeingId ? presentations[sightseeingId]?.imageUrl : null) ?? snapshotUrl)
                  : null);
              const moveImage = (imageIndex: number, direction: -1 | 1) => {
                const target = imageIndex + direction;
                if (target < 0 || target >= activityImages.length) return;
                const next = [...activityImages];
                [next[imageIndex], next[target]] = [next[target]!, next[imageIndex]!];
                form.setValue(fp(`${abase}.images`), next as never, { shouldDirty: true });
                form.setValue(fp(`${abase}.imageSnapshotPresent`), true as never, {
                  shouldDirty: true,
                });
              };
              const removeImage = (imageIndex: number) => {
                const removed = activityImages[imageIndex];
                const next = activityImages.filter((_, index) => index !== imageIndex);
                form.setValue(fp(`${abase}.images`), next as never, { shouldDirty: true });
                form.setValue(fp(`${abase}.imageSnapshotPresent`), true as never, {
                  shouldDirty: true,
                });
                if (removed && pdfImageUrl === quotationSnapshotImageIdentity(removed))
                  form.setValue(
                    fp(`${abase}.pdfImageUrl`),
                    (next[0] ? quotationSnapshotImageIdentity(next[0]) : null) as never,
                    { shouldDirty: true },
                  );
              };
              const isUploading = uploadingActivity === aIndex;
              return (
                <div
                  key={activity.id}
                  className="grid gap-3 rounded-lg bg-muted/20 border border-border/40 p-4 md:grid-cols-[200px_1fr]"
                >
                  <div>
                    <label className="group relative block aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 transition hover:border-brand-400 hover:ring-2 hover:ring-brand-100 md:aspect-auto md:h-28">
                      <ActivityThumb key={resolvedUrl ?? ''} imageUrl={resolvedUrl} />
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-slate-900/75 px-2 py-1.5 text-center text-xs font-semibold text-white backdrop-blur-sm">
                        <Upload className="h-3.5 w-3.5" />
                        {isUploading ? 'Uploading…' : resolvedUrl ? 'Replace' : 'Upload'}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                        aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} image`}
                        className="sr-only"
                        disabled={isUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) void uploadActivityImage(abase, aIndex, file);
                        }}
                      />
                    </label>
                  </div>
                  <div className="space-y-4">
                    <p className={`${subsectionHeading} border-b border-border/40 pb-1`}>Activity Details</p>
                    <div className="grid gap-3 md:grid-cols-[1fr_190px]">
                      <label className={labelCls}>
                        Attraction / Activity <span className="text-[11px] font-normal text-brand-600">· master</span>
                        <div className="mt-1">
                          <SightseeingActivitySelect
                            ariaLabel={`Day ${dayIndex + 1} activity ${aIndex + 1}`}
                            placeholder="Select or type an attraction"
                            groupLabel={groupLabel}
                            specialOptions={SPECIAL_SIGHTSEEING_OPTIONS}
                            masterOptions={masterOptions}
                            value={sightseeingId}
                            displayLabel={activityName}
                            onSelect={(option) => applyActivitySelection(abase, option)}
                            status={{
                              loading: attractionsStatus.loading,
                              error: attractionsStatus.error,
                              empty:
                                !attractionsStatus.loading &&
                                !attractionsStatus.error &&
                                masterOptions.length === 0,
                            }}
                          />
                        </div>
                      </label>
                      <label className={labelCls}>
                        Start Time
                        <input
                          type="time"
                          lang="en-US"
                          aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} start time`}
                          className={`${field} mt-1`}
                          {...form.register(fp(`${abase}.startTime`), {
                            onChange: (event) =>
                              form.setValue(
                                fp(`${abase}.showTime`),
                                Boolean(event.target.value) as never,
                                { shouldDirty: true },
                              ),
                          })}
                        />
                        <span className="mt-2 flex items-start gap-2 text-xs font-medium normal-case tracking-normal text-slate-600">
                          <input
                            {...form.register(fp(`${abase}.showTime`))}
                            type="checkbox"
                            aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} include time in PDF and weblink`}
                            checked={
                              (form.watch(fp(`${abase}.showTime`)) as boolean | undefined) === true
                            }
                            onChange={(event) =>
                              form.setValue(
                                fp(`${abase}.showTime`),
                                event.target.checked as never,
                                {
                                  shouldDirty: true,
                                },
                              )
                            }
                            className="mt-0.5"
                          />
                          Include time in PDF and weblink
                        </span>
                      </label>
                    </div>
                    <label className={labelCls}>
                      Custom Name
                      <input
                        aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} name`}
                        placeholder="Or type a custom activity name"
                        className={`${field} mt-1`}
                        {...form.register(fp(`${abase}.name`))}
                      />
                    </label>
                    <div>
                      <span className={labelCls}>Description</span>
                      <div className="mt-1">
                        <RichTextEditor
                          ariaLabel={`Day ${dayIndex + 1} activity ${aIndex + 1} description`}
                          value={(form.watch(fp(`${abase}.description`)) as string) ?? ''}
                          onChange={(html) =>
                            form.setValue(fp(`${abase}.description`), html as never, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <p className={`${subsectionHeadingMuted} border-b border-border/40 pb-1`}>Transfer</p>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm">
                        {(
                          [
                            ['PRIVATE', 'Private Transfer'],
                            ['SHARED', 'Shared Transfer'],
                            ['NO_TRANSFER', 'No Transfer'],
                          ] as const
                        ).map(([value, label]) => {
                          const current =
                            (form.watch(fp(`${abase}.dailyTransfer`)) as
                              string | null | undefined) ?? dayDailyTransfer;
                          return (
                            <label key={value} className="flex items-center gap-2">
                              <input
                                type="radio"
                                aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} daily transfer ${label}`}
                                value={value}
                                checked={current === value}
                                onChange={() =>
                                  form.setValue(fp(`${abase}.dailyTransfer`), value as never, {
                                    shouldDirty: true,
                                  })
                                }
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <ActivityPricing
                      form={form}
                      dayIndex={dayIndex}
                      activityIndex={aIndex}
                      ariaPrefix={`Day ${dayIndex + 1} activity ${aIndex + 1}`}
                      pax={pax}
                    />
                    <ActivityImageGallery
                      dayIndex={dayIndex}
                      activityIndex={aIndex}
                      images={activityImages}
                      pdfImageUrl={pdfImageUrl}
                      imageUrl={imageUrlFor}
                      onMove={moveImage}
                      onRemove={removeImage}
                      onSelectPdf={(identity) =>
                        form.setValue(fp(`${abase}.pdfImageUrl`), identity as never, {
                          shouldDirty: true,
                        })
                      }
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Add activity after activity ${aIndex + 1} on day ${dayIndex + 1}`}
                        onClick={() => activities.insert(aIndex + 1, emptySightseeingActivity())}
                      >
                        <Plus className="h-4 w-4" /> Add Activity After
                      </Button>
                      {activities.fields.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => activities.remove(aIndex)}
                        >
                          <Trash2 className="h-4 w-4" /> Remove activity
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {imageError && (
              <p role="alert" className="text-sm font-medium text-red-600">
                {imageError}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => activities.append(emptySightseeingActivity())}
              >
                <Plus className="h-4 w-4" /> Add Activity at End
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <div>
              <p className={labelCls}>Meals Included</p>
              <div className="mt-2 flex flex-wrap gap-4">
                {meals.map((meal) => {
                  const mealPath = `${base}.meals.${meal}`;
                  const prefPath = `${base}.mealPreferences.${meal}`;
                  const prefMode =
                    (form.watch(fp(`${prefPath}.mode`)) as string | null | undefined) ?? null;
                  return (
                    <label key={meal} className="flex items-center gap-2 text-sm capitalize">
                      <input
                        type="checkbox"
                        checked={(form.watch(fp(mealPath)) as boolean | undefined) ?? false}
                        onChange={(event) => {
                          form.setValue(fp(mealPath), event.target.checked as never, {
                            shouldDirty: true,
                          });
                          if (event.target.checked && !prefMode)
                            form.setValue(fp(`${prefPath}.mode`), 'NO_TRANSFER' as never, {
                              shouldDirty: true,
                            });
                        }}
                      />
                      {meal}
                    </label>
                  );
                })}
              </div>
              {meals
                .filter(
                  (meal) =>
                    (form.watch(fp(`${base}.meals.${meal}`)) as boolean | undefined) ?? false,
                )
                .map((meal) => {
                  const prefPath = `${base}.mealPreferences.${meal}`;
                  const mode =
                    (form.watch(fp(`${prefPath}.mode`)) as string | null | undefined) ??
                    'NO_TRANSFER';
                  const transferDetails =
                    (form.watch(fp(`${prefPath}.transferDetails`)) as string | null | undefined) ??
                    '';
                  return (
                    <div
                      key={meal}
                      role="group"
                      aria-label={`${meal} meal options`}
                      className="mt-3 rounded-md border border-slate-200 bg-card p-3"
                    >
                      <p className="text-sm font-semibold capitalize text-slate-700">{meal}</p>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm">
                        {(
                          [
                            ['NO_TRANSFER', 'No Transfer'],
                            ['INCLUDE_AT_HOTEL', 'Include At Hotel'],
                            ['WITH_TRANSFER', 'With Transfer'],
                          ] as const
                        ).map(([value, label]) => (
                          <label key={value} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`${base}-${meal}-meal-mode`}
                              value={value}
                              checked={mode === value}
                              onChange={() =>
                                form.setValue(fp(`${prefPath}.mode`), value as never, {
                                  shouldDirty: true,
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      {mode === 'WITH_TRANSFER' && (
                        <label className="mt-3 block">
                          <span className={labelCls}>Transfer Details</span>
                          <input
                            aria-label={`${meal} transfer details`}
                            className={`${field} mt-1`}
                            placeholder="Enter transfer or meal-location details"
                            value={transferDetails}
                            onChange={(event) =>
                              form.setValue(
                                fp(`${prefPath}.transferDetails`),
                                event.target.value || null,
                                {
                                  shouldDirty: true,
                                },
                              )
                            }
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
    </article>
  );
}

/** Reference "Sightseeing" tab — day-wise activity itinerary. */
export function SightseeingSection({
  form,
  quotationId = '',
  quotationVersionId = '',
  destination,
  pax,
}: {
  form: Form;
  quotationId?: string;
  quotationVersionId?: string;
  /** Resolved destination/country name (e.g. "Malaysia") for the activities lookup. */
  destination?: string | null;
  pax?: { adults: number; childrenWithBed: number; childrenWithoutBed: number; infants: number };
}) {
  const effectivePax = pax ?? { adults: 2, childrenWithBed: 0, childrenWithoutBed: 0, infants: 0 };
  const destinationSummary = (form.watch('destinationSummary') as string) ?? '';
  const destinationToken = destinationSummary.split(/[•(→>,]/)[0]?.trim() ?? '';
  // Resolve active sightseeing records by exact destination name, never by text
  // search or paginated admin list. The backend resolves the name to a
  // destination ID and returns all matching records (tenant-scoped, no limit).
  //
  // The quotation's destinationSummary often holds the CITY (e.g. "Kuala Lumpur")
  // while the Master Destination is the country (e.g. "Malaysia"), so the parent
  // passes the resolved destination name from the lead itinerary when available.
  const resolvedDestination = destination?.trim() || destinationToken || undefined;
  // Fetch every tenant-visible active sightseeing record (no destination/city
  // narrow), so the activity picker can search across all destinations. The
  // dropdown still prioritises the current day's city below.
  const attractionsQuery = useSightseeingActivities();
  const attractionsStatus = {
    loading: attractionsQuery.isLoading,
    error: attractionsQuery.isError,
  };
  const attractions: SightseeingActivity[] = attractionsQuery.data?.activities ?? [];
  // Display name for the dropdown heading, e.g. "Singapore".
  const destinationLabel = useMemo(() => {
    const source = resolvedDestination ?? destinationToken;
    return source ? source.charAt(0).toUpperCase() + source.slice(1) : '';
  }, [resolvedDestination, destinationToken]);
  const days = useFieldArray({ control: form.control, name: 'sightseeingDetails.days' });
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  useEffect(() => {
    days.fields.forEach((_, index) => {
      const path = `sightseeingDetails.days.${index}.title` as FieldPath<QuotationVersionInput>;
      const current = (form.getValues(path) as string | null | undefined) ?? '';
      const normalized = formatItineraryDayTitle(index + 1, current);
      if (current !== normalized) form.setValue(path, normalized as never, { shouldDirty: false });
    });
  }, [days.fields, form]);
  useEffect(() => {
    if (days.fields.length === 0) return;
    if (selectedDayIndex >= days.fields.length) setSelectedDayIndex(days.fields.length - 1);
    if (selectedDayIndex < 0) setSelectedDayIndex(0);
  }, [days.fields.length, selectedDayIndex]);
  const include = form.watch('sightseeingDetails.include') ?? true;
  const fp = (path: string) => path as FieldPath<QuotationVersionInput>;
  // Resolve every selected master's current display URL in one batched request
  // (unique ids only), so the builder never issues N per-activity requests.
  const watchedDays = useWatch({
    control: form.control,
    name: 'sightseeingDetails.days',
  });
  const selectedSightseeingIds = useMemo(() => {
    const rows = (watchedDays ?? []) as Array<{
      activities?: Array<{ sightseeingId?: string | null }>;
    }>;
    return rows.flatMap((day) =>
      (day?.activities ?? []).map((activity) => activity?.sightseeingId ?? null),
    );
  }, [watchedDays]);
  const presentationsQuery = useSightseeingPresentations(selectedSightseeingIds);
  const presentations = (presentationsQuery.data ?? {}) as SightseeingPresentationMap;

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <input type="checkbox" {...form.register('sightseeingDetails.include')} />
        Include Sightseeing in Quotation
      </label>
      {include && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">
              Section Title
              <input
                aria-label="Sightseeing section title"
                placeholder="Sightseeing & Experiences"
                className={`${field} mt-1`}
                {...form.register('sightseeingDetails.sectionTitle')}
              />
            </label>
            {((form.watch('pricingMode' as never) as unknown as string) ?? 'SECTION_WISE') !== 'PER_PERSON' && (() => {
              const sightseeingDetails = form.watch('sightseeingDetails' as never) as unknown as never;
              const sightseeingTotal = calculateSightseeingSectionTotal(sightseeingDetails, effectivePax as never);
              return (
                <div className="rounded-lg border bg-slate-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">Sightseeing Total:</span>
                  <span className="text-sm font-bold text-slate-900">₹{sightseeingTotal.toFixed(2)}</span>
                </div>
              );
            })()}
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-800">Description</span>
            <div className="mt-1">
              <RichTextEditor
                ariaLabel="Sightseeing description"
                value={(form.watch(fp('sightseeingDetails.description')) as string) ?? ''}
                onChange={(html) =>
                  form.setValue('sightseeingDetails.description', html, { shouldDirty: true })
                }
              />
            </div>
          </div>

          {days.fields.length === 0 ? (
            <div className="flex justify-start">
              <Button
                variant="secondary"
                onClick={() => {
                  days.append(emptySightseeingDay(1));
                  setSelectedDayIndex(0);
                }}
              >
                <Plus className="h-4 w-4" /> Add Day
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* LEFT navigation — consistent with Hotel/Flight section navigation */}
              <aside className="w-full shrink-0 lg:w-64">
                <div className="rounded-xl border bg-card p-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sightseeing Days
                    <select
                      aria-label="Select sightseeing day"
                      className={`${field} mt-1 w-full lg:hidden`}
                      value={selectedDayIndex}
                      onChange={(event) => setSelectedDayIndex(Number(event.target.value))}
                    >
                      {days.fields.map((field, idx) => {
                        const raw = (form.watch(`sightseeingDetails.days.${idx}.title` as FieldPath<QuotationVersionInput>) as string | null) ?? '';
                        const label = raw?.trim() ? raw.trim() : `Day ${idx + 1}`;
                        return (
                          <option key={field.id} value={idx}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <div className="mt-2 hidden flex-col gap-1.5 lg:flex">
                    {days.fields.map((field, idx) => {
                      const raw = (form.watch(`sightseeingDetails.days.${idx}.title` as FieldPath<QuotationVersionInput>) as string | null) ?? '';
                      const label = raw?.trim() ? raw.trim() : `Day ${idx + 1}`;
                      const isActive = idx === selectedDayIndex;
                      return (
                        <button
                          key={field.id}
                          type="button"
                          aria-label={`Select sightseeing day ${idx + 1}`}
                          aria-selected={isActive}
                          onClick={() => setSelectedDayIndex(idx)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition',
                            isActive
                              ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                          )}
                        >
                          <span className="truncate font-medium">{label}</span>
                          <span className={cn('ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs', isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
                            {idx + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label="Move selected day up"
                      disabled={selectedDayIndex === 0}
                      onClick={() => {
                        const idx = selectedDayIndex;
                        if (idx <= 0) return;
                        days.move(idx, idx - 1);
                        setSelectedDayIndex(idx - 1);
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Up
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label="Move selected day down"
                      disabled={selectedDayIndex === days.fields.length - 1}
                      onClick={() => {
                        const idx = selectedDayIndex;
                        if (idx >= days.fields.length - 1) return;
                        days.move(idx, idx + 1);
                        setSelectedDayIndex(idx + 1);
                      }}
                    >
                      Down <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label="Add sightseeing day before selected"
                      onClick={() => {
                        const idx = selectedDayIndex;
                        days.insert(idx, emptySightseeingDay(idx + 1));
                        // keep selection on the newly inserted day
                        setSelectedDayIndex(idx);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Before
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label="Add sightseeing day after selected"
                      onClick={() => {
                        const idx = selectedDayIndex;
                        days.insert(idx + 1, emptySightseeingDay(idx + 2));
                        setSelectedDayIndex(idx + 1);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> After
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={() => {
                      days.append(emptySightseeingDay(days.fields.length + 1));
                      setSelectedDayIndex(days.fields.length);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add Day
                  </Button>
                  <p className="mt-2 text-xs text-slate-500">{days.fields.length} day{days.fields.length !== 1 ? 's' : ''} · select a day to edit on the right</p>
                </div>
              </aside>
              <div className="min-w-0 flex-1">
                <DayCard
                  key={days.fields[selectedDayIndex]!.id}
                  form={form}
                  quotationId={quotationId}
                  quotationVersionId={quotationVersionId}
                  dayIndex={selectedDayIndex}
                  attractions={attractions}
                  presentations={presentations}
                  destinationLabel={destinationLabel}
                  attractionsStatus={attractionsStatus}
                  pax={effectivePax}
                  onInsertBefore={
                    selectedDayIndex === 0
                      ? () => {
                          days.insert(0, emptySightseeingDay(1));
                          setSelectedDayIndex(0);
                        }
                      : undefined
                  }
                  onInsertAfter={() => {
                    days.insert(selectedDayIndex + 1, emptySightseeingDay(selectedDayIndex + 2));
                    setSelectedDayIndex(selectedDayIndex + 1);
                  }}
                  onRemove={() => {
                    const idx = selectedDayIndex;
                    days.remove(idx);
                    setSelectedDayIndex((prev) => Math.max(0, Math.min(prev, days.fields.length - 2)));
                  }}
                />
              </div>
            </div>
          )}
          {((form.watch('pricingMode' as never) as unknown as string) ?? 'SECTION_WISE') !== 'PER_PERSON' && (
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">Sightseeing Section Total: calculated from priced activities (see Pricing Breakdown)</div>
          )}
        </>
      )}
    </div>
  );
}
