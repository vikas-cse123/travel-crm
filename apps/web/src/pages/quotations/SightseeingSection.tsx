import { useMemo } from 'react';
import { useFieldArray, type FieldPath, type UseFormReturn } from 'react-hook-form';
import { Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import type { QuotationVersionInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { MasterSelect } from '@/components/ui/MasterSelect';
import { useSightseeingList, type Sightseeing } from '@/features/masters/masters.api';

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
  dailyTransfer: 'SHARED',
  activities: [emptySightseeingActivity()],
  ...seed,
});

const cityKey = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const durationLabel = (row: Sightseeing) =>
  row.estimatedHours != null ? `${row.estimatedHours} hours` : null;

/** Compact fixed-size activity thumbnail; never grows with the description. */
function ActivityThumb({ imageUrl }: { imageUrl?: string | null }) {
  if (imageUrl)
    return (
      <img
        src={imageUrl}
        alt="Activity"
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
  onRemove,
}: {
  form: Form;
  dayIndex: number;
  attractions: Sightseeing[];
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

  const dayOptions = useMemo(() => {
    const cityMatches = attractions.filter((row) => cityKey(row.city?.name) === cityKey(dayCity));
    const pool = cityMatches.length ? cityMatches : attractions;
    return [...pool].sort(
      (a, b) =>
        (a.sequence ?? 0) - (b.sequence ?? 0) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  }, [attractions, dayCity]);

  const pickActivity = (
    abase: string,
    option: { id: string; label: string } | null,
  ) => {
    const picked = attractions.find((row) => row.id === option?.id) ?? null;
    form.setValue(fp(`${abase}.sightseeingId`), (option?.id ?? null) as never, {
      shouldDirty: true,
    });
    form.setValue(fp(`${abase}.name`), (picked?.title ?? null) as never, { shouldDirty: true });
    if (picked) {
      if (picked.description)
        form.setValue(fp(`${abase}.description`), picked.description as never, {
          shouldDirty: true,
        });
      if (picked.city?.name)
        form.setValue(fp(`${abase}.city`), picked.city.name as never, { shouldDirty: true });
      if (picked.suggestedStartTime)
        form.setValue(fp(`${abase}.startTime`), picked.suggestedStartTime as never, {
          shouldDirty: true,
        });
      form.setValue(
        fp(`${abase}.duration`),
        (durationLabel(picked) ?? null) as never,
        { shouldDirty: true },
      );
      form.setValue(fp(`${abase}.sequence`), 1 as never, { shouldDirty: true });
      if (!titleTouched)
        form.setValue(fp(`${base}.title`), `Day ${dayIndex + 1}: ${picked.title}`, {
          shouldDirty: true,
        });
    }
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
          const imageUrl = (form.watch(fp(`${abase}.imageUrl`)) as string | null) ?? null;
          return (
            <div
              key={activity.id}
              className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[200px_1fr]"
            >
              <div className="aspect-[16/9] w-full overflow-hidden rounded-md md:aspect-auto md:h-28">
                <ActivityThumb imageUrl={imageUrl} />
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_150px]">
                  <label className={labelCls}>
                    Attraction / Activity
                    <div className="mt-1">
                      <MasterSelect
                        ariaLabel={`Day ${dayIndex + 1} activity ${aIndex + 1}`}
                        placeholder="Select or type an attraction"
                        options={dayOptions.map((row) => ({
                          id: row.id,
                          label: row.title,
                          hint: [row.city?.name, durationLabel(row)].filter(Boolean).join(' • '),
                        }))}
                        value={(form.watch(fp(`${abase}.sightseeingId`)) as string | null) ?? null}
                        loading={false}
                        fallbackLabel={(form.watch(fp(`${abase}.name`)) as string | null) ?? undefined}
                        onSelect={(option) => pickActivity(abase, option)}
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
            {meals.map((meal) => (
              <label key={meal} className="flex items-center gap-2 text-sm capitalize">
                <input type="checkbox" {...form.register(fp(`${base}.meals.${meal}`))} />
                {meal}
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {(
              [
                ['NO_TRANSFER', 'No Transfer'],
                ['INCLUDE_AT_HOTEL', 'Include At Hotel'],
                ['WITH_TRANSFER', 'With Transfer'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" value={value} {...form.register(fp(`${base}.mealMode`))} />
                {label}
              </label>
            ))}
          </div>
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
export function SightseeingSection({ form }: { form: Form }) {
  const attractionsQuery = useSightseeingList(
    useMemo(() => new URLSearchParams({ status: 'ACTIVE', pageSize: '200' }), []),
  );
  const destinationSummary = (form.watch('destinationSummary') as string) ?? '';
  const destinationToken = destinationSummary.split(/[•(→>,]/)[0]?.trim()?.toLowerCase();
  // Options are scoped to the quotation's destination (tenant + active filtering
  // already happens server-side) so unrelated attractions never appear.
  const attractions: Sightseeing[] = useMemo(() => {
    const rows = (attractionsQuery.data?.data ?? []).filter((row) => row.status === 'ACTIVE');
    if (!destinationToken) return rows;
    return rows.filter((row) =>
      [row.destination?.name, row.destination?.countryName]
        .map((value) => value?.toLowerCase())
        .some((value) => Boolean(value && value.includes(destinationToken))),
    );
  }, [attractionsQuery.data, destinationToken]);
  const days = useFieldArray({ control: form.control, name: 'sightseeingDetails.days' });
  const include = form.watch('sightseeingDetails.include') ?? true;
  const fp = (path: string) => path as FieldPath<QuotationVersionInput>;

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
