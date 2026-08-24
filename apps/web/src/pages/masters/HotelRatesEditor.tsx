import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useCreateHotelMonthPrice,
  useCreateHotelSeason,
  useCreateMealPlanMonthPrice,
  useCreateMealPlanSeason,
  useCreateRoomTypeMonthPrice,
  useCreateRoomTypeSeason,
  useDeleteHotelMonthPrice,
  useDeleteHotelSeason,
  useDeleteMealPlanMonthPrice,
  useDeleteMealPlanSeason,
  useDeleteRoomTypeMonthPrice,
  useDeleteRoomTypeSeason,
  useUpdateHotelMonthPrice,
  useUpdateHotelSeason,
  useUpdateMealPlanMonthPrice,
  useUpdateMealPlanSeason,
  useUpdateRoomTypeMonthPrice,
  useUpdateRoomTypeSeason,
} from '@/features/masters/masters.api';
import { fieldClass, CurrencySelect } from './MasterUi';

/** One calendar-month rate row, shared by create-mode drafts and edit-mode rows. */
export interface MonthRateDraft {
  id: string;
  month: string;
  price: string;
  currency: string;
}

/** One date-range season row, shared by create-mode drafts and edit-mode rows. */
export interface SeasonRateDraft {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  price: string;
  currency: string;
}

export const emptyMonthRateDraft = (): MonthRateDraft => ({
  id: '',
  month: '',
  price: '',
  currency: 'INR',
});

export const emptySeasonRateDraft = (): SeasonRateDraft => ({
  id: '',
  name: '',
  startDate: '',
  endDate: '',
  price: '',
  currency: 'INR',
});

/** Monotonic id source for create-mode draft rows. */
let draftSequence = 0;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const formatDisplayDate = (value: string): string => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** Raw number formatting matching the rest of the master UI (no symbol swaps). */
const formatRate = (value: number | string | null | undefined): string => {
  if (value == null || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return String(numeric);
};

const hasDateOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean => Boolean(aStart && aEnd && bStart && bEnd && aStart <= bEnd && bStart <= aEnd);

type EntityKind = 'hotel' | 'room' | 'meal';

interface RateDraftProps {
  entityKind: EntityKind;
  hotelId?: string;
  ownerId?: string;
  monthRates?: MonthRateDraft[];
  seasonRates?: SeasonRateDraft[];
  onMonthRatesChange?: (rows: MonthRateDraft[]) => void;
  onSeasonRatesChange?: (rows: SeasonRateDraft[]) => void;
}

/**
 * Optional pricing extras for a Hotel, Room Type or Meal Plan: a set of
 * calendar-month rates and a set of date-range season rates. The base price
 * stays on the parent entity and is untouched here. Months and seasons are
 * always optional — an empty configuration behaves exactly like today.
 */
export function HotelRatesEditor({
  entityKind,
  hotelId,
  ownerId,
  monthRates,
  seasonRates,
  onMonthRatesChange,
  onSeasonRatesChange,
}: RateDraftProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE);

  const editMode = Boolean(hotelId && ownerId);
  const ownerLabel = entityKind === 'hotel' ? 'hotel' : entityKind === 'room' ? 'room type' : 'meal plan';

  const months = useHotelMonthMutations(entityKind, hotelId ?? '');
  const seasons = useHotelSeasonMutations(entityKind, hotelId ?? '');

  const [monthForm, setMonthForm] = useState(emptyMonthRateDraft());
  const [monthOpen, setMonthOpen] = useState(false);
  const [monthEditingId, setMonthEditingId] = useState<string | null>(null);
  const [monthError, setMonthError] = useState('');

  const [seasonForm, setSeasonForm] = useState(emptySeasonRateDraft());
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonEditingId, setSeasonEditingId] = useState<string | null>(null);
  const [seasonError, setSeasonError] = useState('');

  const monthRows = editMode ? (monthRates ?? []) : (monthRates ?? []);
  const seasonRows = editMode ? (seasonRates ?? []) : (seasonRates ?? []);

  const closeMonth = () => {
    setMonthForm(emptyMonthRateDraft());
    setMonthEditingId(null);
    setMonthOpen(false);
    setMonthError('');
  };

  const beginAddMonth = () => {
    setMonthForm(emptyMonthRateDraft());
    setMonthEditingId(null);
    setMonthOpen(true);
    setMonthError('');
  };

  const beginEditMonth = (id: string) => {
    const row = monthRows.find((entry) => entry.id === id);
    if (!row) return;
    setMonthEditingId(id);
    setMonthOpen(true);
    setMonthError('');
    setMonthForm({
      id,
      month: String(row.month),
      price: row.price == null ? '' : String(row.price),
      currency: row.currency || 'INR',
    });
  };

  const monthDuplicate = monthRows.some(
    (row) =>
      row.id !== monthEditingId &&
      monthForm.month &&
      Number(row.month) === Number(monthForm.month),
  );

  const submitMonth = async () => {
    setMonthError('');
    const month = Number(monthForm.month);
    if (!monthForm.month || month < 1 || month > 12) {
      setMonthError('Select a month.');
      return;
    }
    if (monthDuplicate) {
      setMonthError('A price for this month already exists.');
      return;
    }
    const payload = {
      month,
      price: monthForm.price.trim() === '' ? null : Number(monthForm.price),
      currency: monthForm.currency || 'INR',
    };
    const next = (current: MonthRateDraft[]): MonthRateDraft[] => {
      if (monthEditingId)
        return current.map((entry) =>
          entry.id === monthEditingId
            ? { ...entry, month: String(month), price: monthForm.price, currency: monthForm.currency || 'INR' }
            : entry,
        );
      draftSequence += 1;
      return [
        ...current,
        { id: `draft-${draftSequence}`, month: String(month), price: monthForm.price, currency: monthForm.currency || 'INR' },
      ];
    };
    try {
      if (editMode) {
        if (monthEditingId) await months.update(ownerId!, monthEditingId, payload);
        else await months.create(ownerId!, payload);
        closeMonth();
      } else {
        onMonthRatesChange?.(next(monthRows));
        closeMonth();
      }
    } catch (mutationError) {
      setMonthError(mutationError instanceof Error ? mutationError.message : 'Could not save month price.');
    }
  };

  const destroyMonth = async (id: string) => {
    if (!window.confirm('Delete this month price?')) return;
    if (editMode) await months.remove(ownerId!, id);
    else onMonthRatesChange?.(monthRows.filter((entry) => entry.id !== id));
  };

  const closeSeason = () => {
    setSeasonForm(emptySeasonRateDraft());
    setSeasonEditingId(null);
    setSeasonOpen(false);
    setSeasonError('');
  };

  const beginAddSeason = () => {
    setSeasonForm(emptySeasonRateDraft());
    setSeasonEditingId(null);
    setSeasonOpen(true);
    setSeasonError('');
  };

  const beginEditSeason = (id: string) => {
    const row = seasonRows.find((entry) => entry.id === id);
    if (!row) return;
    setSeasonEditingId(id);
    setSeasonOpen(true);
    setSeasonError('');
    setSeasonForm({
      id,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      price: row.price == null ? '' : String(row.price),
      currency: row.currency || 'INR',
    });
  };

  const seasonOverlaps = seasonRows.some(
    (row) =>
      row.id !== seasonEditingId &&
      hasDateOverlap(seasonForm.startDate, seasonForm.endDate, row.startDate, row.endDate),
  );

  const submitSeason = async () => {
    setSeasonError('');
    if (!seasonForm.name.trim()) {
      setSeasonError('Enter a season name.');
      return;
    }
    if (!seasonForm.startDate || !seasonForm.endDate) {
      setSeasonError('Choose a start and end date.');
      return;
    }
    if (seasonForm.endDate < seasonForm.startDate) {
      setSeasonError('End date must be on or after the start date.');
      return;
    }
    if (seasonOverlaps) {
      setSeasonError('This date range overlaps another season of this ' + ownerLabel + '.');
      return;
    }
    const payload = {
      name: seasonForm.name.trim(),
      startDate: new Date(`${seasonForm.startDate}T00:00:00.000Z`),
      endDate: new Date(`${seasonForm.endDate}T00:00:00.000Z`),
      price: seasonForm.price.trim() === '' ? null : Number(seasonForm.price),
      currency: seasonForm.currency || 'INR',
    };
    const next = (current: SeasonRateDraft[]): SeasonRateDraft[] => {
      if (seasonEditingId)
        return current.map((entry) =>
          entry.id === seasonEditingId
            ? {
                ...entry,
                name: seasonForm.name.trim(),
                startDate: seasonForm.startDate,
                endDate: seasonForm.endDate,
                price: seasonForm.price,
                currency: seasonForm.currency || 'INR',
              }
            : entry,
        );
      draftSequence += 1;
      return [
        ...current,
        {
          id: `draft-${draftSequence}`,
          name: seasonForm.name.trim(),
          startDate: seasonForm.startDate,
          endDate: seasonForm.endDate,
          price: seasonForm.price,
          currency: seasonForm.currency || 'INR',
        },
      ];
    };
    try {
      if (editMode) {
        if (seasonEditingId) await seasons.update(ownerId!, seasonEditingId, payload);
        else await seasons.create(ownerId!, payload);
        closeSeason();
      } else {
        onSeasonRatesChange?.(next(seasonRows));
        closeSeason();
      }
    } catch (mutationError) {
      setSeasonError(mutationError instanceof Error ? mutationError.message : 'Could not save season.');
    }
  };

  const destroySeason = async (id: string) => {
    if (!window.confirm('Delete this season and its rate?')) return;
    if (editMode) await seasons.remove(ownerId!, id);
    else onSeasonRatesChange?.(seasonRows.filter((entry) => entry.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed p-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-800">Monthly Rates</h4>
          {canManage && (
            <Button size="sm" variant="secondary" type="button" onClick={beginAddMonth}>
              <Plus className="h-4 w-4" /> Add Month
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Optional. A rate applies to one calendar month; different months can have different prices.
        </p>

        {monthRows.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pl-3 pr-2 font-medium">Month</th>
                  <th className="py-2 pr-2 font-medium">Price</th>
                  <th className="py-2 pr-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monthRows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pl-3 pr-2 font-medium text-slate-800">
                      {MONTH_NAMES[Number(row.month) - 1] ?? `Month ${row.month}`}
                    </td>
                    <td className="py-2 pr-2 text-slate-800">
                      {row.currency} {formatRate(row.price)}
                    </td>
                    <td className="py-2 pl-2 pr-3">
                      {canManage && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            aria-label={`Edit ${ownerLabel} month price for ${MONTH_NAMES[Number(row.month) - 1] ?? row.month}`}
                            onClick={() => beginEditMonth(row.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${ownerLabel} month price for ${MONTH_NAMES[Number(row.month) - 1] ?? row.month}`}
                            onClick={() => void destroyMonth(row.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No monthly rates yet.</p>
        )}

        {monthOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-dashed p-3">
            {monthError && <p className="text-xs font-medium text-red-600">{monthError}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700">
                Month
                <select
                  className={fieldClass}
                  aria-label="Month rate month"
                  value={monthForm.month}
                  onChange={(event) => setMonthForm({ ...monthForm, month: event.target.value })}
                >
                  <option value="">Select month</option>
                  {MONTH_NAMES.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Price
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`${fieldClass} mt-1`}
                  placeholder="Rate (price)"
                  aria-label="Month rate price"
                  value={monthForm.price}
                  onChange={(event) => setMonthForm({ ...monthForm, price: event.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Currency
                <CurrencySelect
                  value={monthForm.currency}
                  onChange={(currency) => setMonthForm({ ...monthForm, currency })}
                  aria-label="Month rate currency"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={closeMonth} type="button">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void submitMonth()}
                type="button"
                isLoading={months.busy}
              >
                Save Month
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed p-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-800">Seasonal Rates</h4>
          {canManage && (
            <Button size="sm" variant="secondary" type="button" onClick={beginAddSeason}>
              <Plus className="h-4 w-4" /> Add Season
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Optional. A rate applies to a specific date range; overlapping ranges on the same{' '}
          {ownerLabel} are rejected.
        </p>

        {seasonRows.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pl-3 pr-2 font-medium">Season</th>
                  <th className="py-2 pr-2 font-medium">From</th>
                  <th className="py-2 pr-2 font-medium">To</th>
                  <th className="py-2 pr-2 font-medium">Price</th>
                  <th className="py-2 pr-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {seasonRows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pl-3 pr-2 font-medium text-slate-800">{row.name}</td>
                    <td className="py-2 pr-2 text-slate-600">{formatDisplayDate(row.startDate)}</td>
                    <td className="py-2 pr-2 text-slate-600">{formatDisplayDate(row.endDate)}</td>
                    <td className="py-2 pr-2 text-slate-800">
                      {row.currency} {formatRate(row.price)}
                    </td>
                    <td className="py-2 pl-2 pr-3">
                      {canManage && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            aria-label={`Edit ${ownerLabel} season ${row.name}`}
                            onClick={() => beginEditSeason(row.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${ownerLabel} season ${row.name}`}
                            onClick={() => void destroySeason(row.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No seasonal rates yet.</p>
        )}

        {seasonOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-dashed p-3">
            {seasonError && <p className="text-xs font-medium text-red-600">{seasonError}</p>}
            <label className="block text-sm font-medium text-slate-700">
              Season Name
              <input
                className={fieldClass}
                placeholder="e.g. Peak Season, Summer"
                aria-label="Season name"
                value={seasonForm.name}
                onChange={(event) => setSeasonForm({ ...seasonForm, name: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Start Date
                <input
                  type="date"
                  className={fieldClass}
                  aria-label="Season start date"
                  value={seasonForm.startDate}
                  onChange={(event) => setSeasonForm({ ...seasonForm, startDate: event.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                End Date
                <input
                  type="date"
                  className={fieldClass}
                  aria-label="Season end date"
                  value={seasonForm.endDate}
                  onChange={(event) => setSeasonForm({ ...seasonForm, endDate: event.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Price
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`${fieldClass} mt-0 min-w-0 flex-1`}
                  placeholder="Season rate (price)"
                  aria-label="Season rate"
                  value={seasonForm.price}
                  onChange={(event) => setSeasonForm({ ...seasonForm, price: event.target.value })}
                />
                <CurrencySelect
                  value={seasonForm.currency}
                  onChange={(currency) => setSeasonForm({ ...seasonForm, currency })}
                  aria-label="Season currency"
                />
              </div>
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={closeSeason} type="button">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void submitSeason()}
                type="button"
                isLoading={seasons.busy}
              >
                Save Season
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MonthApi {
  create: (ownerId: string, input: unknown) => Promise<unknown>;
  update: (ownerId: string, id: string, input: unknown) => Promise<unknown>;
  remove: (ownerId: string, id: string) => Promise<unknown>;
  busy: boolean;
}

interface SeasonApi {
  create: (ownerId: string, input: unknown) => Promise<unknown>;
  update: (ownerId: string, id: string, input: unknown) => Promise<unknown>;
  remove: (ownerId: string, id: string) => Promise<unknown>;
  busy: boolean;
}

/** Bind the correct month-price mutations for the entity kind (all hooks unconditional). */
function useHotelMonthMutations(entityKind: EntityKind, hotelId: string): MonthApi {
  const hotelCreate = useCreateHotelMonthPrice(hotelId);
  const hotelUpdate = useUpdateHotelMonthPrice(hotelId);
  const hotelRemove = useDeleteHotelMonthPrice(hotelId);
  const roomCreate = useCreateRoomTypeMonthPrice(hotelId);
  const roomUpdate = useUpdateRoomTypeMonthPrice(hotelId);
  const roomRemove = useDeleteRoomTypeMonthPrice(hotelId);
  const mealCreate = useCreateMealPlanMonthPrice(hotelId);
  const mealUpdate = useUpdateMealPlanMonthPrice(hotelId);
  const mealRemove = useDeleteMealPlanMonthPrice(hotelId);

  if (entityKind === 'room') {
    return {
      create: (ownerId, input) => roomCreate.mutateAsync({ roomTypeId: ownerId, input: input as never }),
      update: (ownerId, id, input) =>
        roomUpdate.mutateAsync({ roomTypeId: ownerId, id, input: input as never }),
      remove: (ownerId, id) => roomRemove.mutateAsync({ roomTypeId: ownerId, id }),
      busy: roomCreate.isPending || roomUpdate.isPending || roomRemove.isPending,
    };
  }
  if (entityKind === 'meal') {
    return {
      create: (ownerId, input) => mealCreate.mutateAsync({ mealPlanId: ownerId, input: input as never }),
      update: (ownerId, id, input) =>
        mealUpdate.mutateAsync({ mealPlanId: ownerId, id, input: input as never }),
      remove: (ownerId, id) => mealRemove.mutateAsync({ mealPlanId: ownerId, id }),
      busy: mealCreate.isPending || mealUpdate.isPending || mealRemove.isPending,
    };
  }
  return {
    create: (_ownerId, input) => hotelCreate.mutateAsync(input as never),
    update: (_ownerId, id, input) => hotelUpdate.mutateAsync({ id, input: input as never }),
    remove: (_ownerId, id) => hotelRemove.mutateAsync(id),
    busy: hotelCreate.isPending || hotelUpdate.isPending || hotelRemove.isPending,
  };
}

/** Bind the correct season mutations for the entity kind (all hooks unconditional). */
function useHotelSeasonMutations(entityKind: EntityKind, hotelId: string): SeasonApi {
  const hotelCreate = useCreateHotelSeason(hotelId);
  const hotelUpdate = useUpdateHotelSeason(hotelId);
  const hotelRemove = useDeleteHotelSeason(hotelId);
  const roomCreate = useCreateRoomTypeSeason(hotelId);
  const roomUpdate = useUpdateRoomTypeSeason(hotelId);
  const roomRemove = useDeleteRoomTypeSeason(hotelId);
  const mealCreate = useCreateMealPlanSeason(hotelId);
  const mealUpdate = useUpdateMealPlanSeason(hotelId);
  const mealRemove = useDeleteMealPlanSeason(hotelId);

  if (entityKind === 'room') {
    return {
      create: (ownerId, input) => roomCreate.mutateAsync({ roomTypeId: ownerId, input: input as never }),
      update: (ownerId, id, input) =>
        roomUpdate.mutateAsync({ roomTypeId: ownerId, id, input: input as never }),
      remove: (ownerId, id) => roomRemove.mutateAsync({ roomTypeId: ownerId, id }),
      busy: roomCreate.isPending || roomUpdate.isPending || roomRemove.isPending,
    };
  }
  if (entityKind === 'meal') {
    return {
      create: (ownerId, input) => mealCreate.mutateAsync({ mealPlanId: ownerId, input: input as never }),
      update: (ownerId, id, input) =>
        mealUpdate.mutateAsync({ mealPlanId: ownerId, id, input: input as never }),
      remove: (ownerId, id) => mealRemove.mutateAsync({ mealPlanId: ownerId, id }),
      busy: mealCreate.isPending || mealUpdate.isPending || mealRemove.isPending,
    };
  }
  return {
    create: (_ownerId, input) => hotelCreate.mutateAsync(input as never),
    update: (_ownerId, id, input) => hotelUpdate.mutateAsync({ id, input: input as never }),
    remove: (_ownerId, id) => hotelRemove.mutateAsync(id),
    busy: hotelCreate.isPending || hotelUpdate.isPending || hotelRemove.isPending,
  };
}