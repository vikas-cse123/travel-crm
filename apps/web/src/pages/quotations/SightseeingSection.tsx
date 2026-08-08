import { useMemo, useState } from 'react';
import {
  useFieldArray,
  useWatch,
  type FieldPath,
  type UseFormReturn,
} from 'react-hook-form';
import { Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import type { QuotationVersionInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { SightseeingActivitySelect, type SightseeingSelectOption } from '@/components/ui/SightseeingActivitySelect';
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

const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

type Form = UseFormReturn<QuotationVersionInput>;
type SightDay = NonNullable<QuotationVersionInput['sightseeingDetails']>['days'][number];
type SightActivity = SightDay['activities'][number];

export const emptySightseeingActivity = (): SightActivity => ({
  sightseeingId: null,
  name: null,
  startTime: '09:00',
  duration: null,
  city: null,
  description: null,
  imageUrl: null,
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

/** One day card: title/city + activities + meals + transfer. */
function DayCard({
  form,
  dayIndex,
  attractions,
  presentations,
  destinationLabel,
  attractionsStatus,
  onRemove,
}: {
  form: Form;
  dayIndex: number;
  attractions: SightseeingActivity[];
  presentations: SightseeingPresentationMap;
  /** Display name of the resolved quotation destination, e.g. "Singapore". */
  destinationLabel: string;
  attractionsStatus: { loading: boolean; error: boolean };
  onRemove: () => void;
}) {
  const fp = (path: string) => path as FieldPath<QuotationVersionInput>;
  const base = `sightseeingDetails.days.${dayIndex}`;
  const activities = useFieldArray({
    control: form.control,
    name: `sightseeingDetails.days.${dayIndex}.activities`,
  });
  const meals = ['breakfast', 'lunch', 'dinner'] as const;
  const dayCity = (form.watch(fp(`${base}.city`)) as string | null) ?? '';
  const dayTitle = (form.watch(fp(`${base}.title`)) as string | null) ?? '';
  const titleTouched = form.watch(fp(`${base}.titleTouched`)) ?? false;

  // Current-day city activities stay at the top; every other destination/city
  // remains available below so users can pick any tenant activity (search is
  // global across the tenant, not restricted to the itinerary day's city).
  const dayContext = useMemo(() => {
    const sortedAll = [...attractions].sort(
      (a, b) =>
        (a.sequence ?? 0) - (b.sequence ?? 0) ||
        a.title.localeCompare(b.title),
    );
    const currentCity = cityKey(dayCity);
    const cityMatches = sortedAll.filter(
      (row) => cityKey(row.city?.name) === currentCity,
    );
    const others = sortedAll.filter(
      (row) => cityKey(row.city?.name) !== currentCity,
    );
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
          (row.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
        ]
          .filter(Boolean)
          .join(' '),
      })),
    [dayContext.options],
  );

  // "Day {N}: {name}" without duplicating a leading "Day {N}:" prefix.
  const autoDayTitle = (activityName: string | null): string => {
    const cleaned = (activityName ?? '')
      .trim()
      .replace(new RegExp(`^day\\s+${dayIndex + 1}(?:\\s*:)?\\s*`, 'i'), '')
      .trim();
    return cleaned ? `Day ${dayIndex + 1}: ${cleaned}` : `Day ${dayIndex + 1}`;
  };

  const clearActivity = (abase: string) => {
    form.setValue(fp(`${abase}.sightseeingId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.name`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.description`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.city`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.startTime`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.duration`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.sequence`), null as never, { shouldDirty: true });
  };

  const pickSpecial = (abase: string, option: SightseeingSelectOption) => {
    form.setValue(fp(`${abase}.sightseeingId`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
    form.setValue(fp(`${abase}.city`), (dayCity || null) as never, { shouldDirty: true });
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
    form.setValue(fp(`${abase}.imageUrl`), null as never, { shouldDirty: true });
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
      form.setValue(fp(`${abase}.duration`), (durationLabel(picked) ?? null) as never, {
        shouldDirty: true,
      });
      form.setValue(fp(`${abase}.sequence`), 1 as never, { shouldDirty: true });
      if (!titleTouched)
        form.setValue(fp(`${base}.title`), autoDayTitle(picked.title), { shouldDirty: true });
    }
  };

  const applyActivitySelection = (
    abase: string,
    option: SightseeingSelectOption | null,
  ) => {
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

  return (
    <article className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
        <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
          <Trash2 className="h-4 w-4" /> Remove Day
        </Button>
      </div>

      <div className="space-y-4">
        {activities.fields.map((activity, aIndex) => {
          const abase = `${base}.activities.${aIndex}`;
          const snapshotUrl = (form.watch(fp(`${abase}.imageUrl`)) as string | null) ?? null;
          const sightseeingId = (form.watch(fp(`${abase}.sightseeingId`)) as string | null) ?? null;
          const activityName = (form.watch(fp(`${abase}.name`)) as string | null) ?? null;
          // Fresh master presentation first (never persisted); the saved
          // snapshot is only a fallback for legacy/custom rows.
          const resolvedUrl =
            (sightseeingId ? presentations[sightseeingId]?.imageUrl : null) ?? snapshotUrl;
          return (
            <div
              key={activity.id}
              className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[200px_1fr]"
            >
              <div className="aspect-[16/9] w-full overflow-hidden rounded-md md:aspect-auto md:h-28">
                <ActivityThumb key={resolvedUrl ?? ''} imageUrl={resolvedUrl} />
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_150px]">
                  <label className={labelCls}>
                    Attraction / Activity
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
                      aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} start time`}
                      className={`${field} mt-1`}
                      {...form.register(fp(`${abase}.startTime`))}
                    />
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
                {activities.fields.length > 1 && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => activities.remove(aIndex)}
                    >
                      <Trash2 className="h-4 w-4" /> Remove activity
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => activities.append(emptySightseeingActivity())}>
            <Plus className="h-4 w-4" /> Add Activity
          </Button>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-2">
        <div>
          <p className={labelCls}>Meals Included</p>
          <div className="mt-2 flex flex-wrap gap-4">
            {meals.map((meal) => {
              const mealPath = `${base}.meals.${meal}`;
              const prefPath = `${base}.mealPreferences.${meal}`;
              const prefMode = (form.watch(fp(`${prefPath}.mode`)) as string | null | undefined) ?? null;
              return (
                <label key={meal} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={(form.watch(fp(mealPath)) as boolean | undefined) ?? false}
                    onChange={(event) => {
                      form.setValue(fp(mealPath), event.target.checked as never, { shouldDirty: true });
                      if (event.target.checked && !prefMode)
                        form.setValue(fp(`${prefPath}.mode`), 'NO_TRANSFER' as never, { shouldDirty: true });
                    }}
                  />
                  {meal}
                </label>
              );
            })}
          </div>
          {meals
            .filter((meal) => (form.watch(fp(`${base}.meals.${meal}`)) as boolean | undefined) ?? false)
            .map((meal) => {
              const prefPath = `${base}.mealPreferences.${meal}`;
              const mode =
                (form.watch(fp(`${prefPath}.mode`)) as string | null | undefined) ?? 'NO_TRANSFER';
              const transferDetails =
                (form.watch(fp(`${prefPath}.transferDetails`)) as string | null | undefined) ?? '';
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
                            form.setValue(fp(`${prefPath}.mode`), value as never, { shouldDirty: true })
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
                          form.setValue(fp(`${prefPath}.transferDetails`), event.target.value || null, {
                            shouldDirty: true,
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              );
            })}
        </div>
        <div>
          <p className={labelCls}>Daily Transfer</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {(
              [
                ['PRIVATE', 'Private Transfer'],
                ['SHARED', 'Shared Transfer'],
                ['NO_TRANSFER', 'No Transfer'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" value={value} {...form.register(fp(`${base}.dailyTransfer`))} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Reference "Sightseeing" tab — day-wise activity itinerary. */
export function SightseeingSection({
  form,
  destination,
}: {
  form: Form;
  /** Resolved destination/country name (e.g. "Malaysia") for the activities lookup. */
  destination?: string | null;
}) {
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
  const attractions: SightseeingActivity[] =
    attractionsQuery.data?.activities ?? [];
  // Display name for the dropdown heading, e.g. "Singapore".
  const destinationLabel = useMemo(
    () => {
      const source = resolvedDestination ?? destinationToken;
      return source ? source.charAt(0).toUpperCase() + source.slice(1) : '';
    },
    [resolvedDestination, destinationToken],
  );
  const days = useFieldArray({ control: form.control, name: 'sightseeingDetails.days' });
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
            <label className="text-sm font-semibold text-slate-800">
              Amount
              <input
                type="number"
                step="0.01"
                aria-label="Sightseeing amount"
                className={`${field} mt-1`}
                {...form.register('sightseeingDetails.amount', {
                  setValueAs: (value) => {
                    const parsed = Number(value);
                    return value === '' || Number.isNaN(parsed) ? 0 : parsed;
                  },
                })}
              />
            </label>
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

          <div className="space-y-4">
            {days.fields.map((day, index) => (
              <DayCard
                key={day.id}
                form={form}
                dayIndex={index}
                attractions={attractions}
                presentations={presentations}
                destinationLabel={destinationLabel}
                attractionsStatus={attractionsStatus}
                onRemove={() => days.remove(index)}
              />
            ))}
          </div>
          <div className="flex justify-start">
            <Button
              variant="secondary"
              onClick={() => days.append(emptySightseeingDay(days.fields.length + 1))}
            >
              <Plus className="h-4 w-4" /> Add Day
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
