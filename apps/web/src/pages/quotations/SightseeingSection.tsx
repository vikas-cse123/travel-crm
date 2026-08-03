import { useMemo } from 'react';
import { useFieldArray, type FieldPath, type UseFormReturn } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { QuotationVersionInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { useSightseeingList } from '@/features/masters/masters.api';

const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

type Form = UseFormReturn<QuotationVersionInput>;
type SightDay = NonNullable<QuotationVersionInput['sightseeingDetails']>['days'][number];
type SightActivity = SightDay['activities'][number];
interface AttractionOption {
  id: string;
  title: string;
  description: string;
}

export const emptySightseeingActivity = (): SightActivity => ({
  sightseeingId: null,
  name: null,
  startTime: '09:00',
  description: null,
  imageUrl: null,
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

/** One day card: title/city + activities + meals + transfer. */
function DayCard({
  form,
  dayIndex,
  attractions,
  onRemove,
}: {
  form: Form;
  dayIndex: number;
  attractions: AttractionOption[];
  onRemove: () => void;
}) {
  const fp = (path: string) => path as FieldPath<QuotationVersionInput>;
  const base = `sightseeingDetails.days.${dayIndex}`;
  const activities = useFieldArray({
    control: form.control,
    name: `sightseeingDetails.days.${dayIndex}.activities`,
  });
  const meals = ['breakfast', 'lunch', 'dinner'] as const;

  return (
    <article className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex-1 text-sm font-semibold text-slate-800">
          Day {dayIndex + 1} title
          <input
            aria-label={`Sightseeing day ${dayIndex + 1} title`}
            className={`${field} mt-1`}
            {...form.register(fp(`${base}.title`))}
          />
        </label>
        <label className="w-48 text-sm font-semibold text-slate-800">
          City
          <input className={`${field} mt-1`} {...form.register(fp(`${base}.city`))} />
        </label>
        <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
          <Trash2 className="h-4 w-4" /> Remove Day
        </Button>
      </div>

      <div className="space-y-4">
        {activities.fields.map((activity, aIndex) => {
          const abase = `${base}.activities.${aIndex}`;
          return (
            <div key={activity.id} className="rounded-lg border border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_150px]">
                <label className={labelCls}>
                  Attraction / Activity
                  <select
                    aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1}`}
                    className={`${field} mt-1`}
                    value={(form.watch(fp(`${abase}.sightseeingId`)) as string) ?? ''}
                    onChange={(event) => {
                      const picked = attractions.find((row) => row.id === event.target.value);
                      form.setValue(fp(`${abase}.sightseeingId`), (event.target.value || null) as never, {
                        shouldDirty: true,
                      });
                      form.setValue(fp(`${abase}.name`), (picked?.title ?? null) as never, {
                        shouldDirty: true,
                      });
                      const current = form.getValues(fp(`${abase}.description`)) as string | null;
                      if (picked?.description && !current)
                        form.setValue(fp(`${abase}.description`), picked.description as never, {
                          shouldDirty: true,
                        });
                    }}
                  >
                    <option value="">Type to search attractions…</option>
                    {attractions.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Day ${dayIndex + 1} activity ${aIndex + 1} name`}
                    placeholder="Or type a custom activity name"
                    className={`${field} mt-2`}
                    {...form.register(fp(`${abase}.name`))}
                  />
                </label>
                <label className={labelCls}>
                  Start Time
                  <input
                    type="time"
                    className={`${field} mt-1`}
                    {...form.register(fp(`${abase}.startTime`))}
                  />
                </label>
              </div>
              <div className="mt-3">
                <span className={labelCls}>Description</span>
                <div className="mt-1">
                  <RichTextEditor
                    ariaLabel={`Day ${dayIndex + 1} activity ${aIndex + 1} description`}
                    value={(form.watch(fp(`${abase}.description`)) as string) ?? ''}
                    onChange={(html) =>
                      form.setValue(fp(`${abase}.description`), html as never, { shouldDirty: true })
                    }
                  />
                </div>
              </div>
              {activities.fields.length > 1 && (
                <div className="mt-2 flex justify-end">
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
  const attractions: AttractionOption[] = (attractionsQuery.data?.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? '',
  }));
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
