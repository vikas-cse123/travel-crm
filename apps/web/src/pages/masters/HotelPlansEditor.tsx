import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { PERMISSIONS, type HotelMealPlanType } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  createMealPlanMonthPrice,
  createMealPlanSeason,
  createRoomTypeMonthPrice,
  createRoomTypeSeason,
  useCreateMealPlan,
  useCreateRoomType,
  useUpdateMealPlan,
  useUpdateRoomType,
  type Hotel,
  type HotelMealPlan,
  type HotelRoomType,
} from '@/features/masters/masters.api';
import { fieldClass, StatusBadge, CurrencySelect } from './MasterUi';
import {
  HotelRatesEditor,
  type MonthRateDraft,
  type SeasonRateDraft,
} from './HotelRatesEditor';

interface Props {
  kind: 'room' | 'meal';
  hotel: Hotel;
  mealTypes?: readonly string[];
  headerClass?: string;
}

const rateCount = (months?: unknown[], seasons?: unknown[]): number =>
  (months?.length ?? 0) + (seasons?.length ?? 0);

/** Compact base-price + monthly + seasonal pricing editor for one room/meal. */
function PricingPanel({
  kind,
  hotelId,
  item,
}: {
  kind: 'room' | 'meal';
  hotelId: string;
  item: HotelRoomType | HotelMealPlan;
}) {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE);
  const updateRoom = useUpdateRoomType(hotelId);
  const updateMeal = useUpdateMealPlan(hotelId);
  const [price, setPrice] = useState(item.sellingPrice == null ? '' : String(item.sellingPrice));
  const [currency, setCurrency] = useState(item.currency || 'INR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPrice(item.sellingPrice == null ? '' : String(item.sellingPrice));
    setCurrency(item.currency || 'INR');
  }, [item.sellingPrice, item.currency]);

  const saveBase = async () => {
    setSaving(true);
    setError('');
    try {
      const input = {
        sellingPrice: price.trim() === '' ? null : Number(price),
        currency: currency || 'INR',
      };
      if (kind === 'room') await updateRoom.mutateAsync({ id: item.id, input });
      else await updateMeal.mutateAsync({ id: item.id, input });
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">Base Price</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          className={`${fieldClass} mt-0 min-w-0 flex-1`}
          type="number"
          min={0}
          step={0.01}
          placeholder="Base price"
          disabled={!canUpdate}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          aria-label={`${kind === 'room' ? 'Room type' : 'Meal plan'} base price`}
        />
        <CurrencySelect
          value={currency}
          onChange={setCurrency}
          aria-label={`${kind === 'room' ? 'Room type' : 'Meal plan'} base currency`}
        />
        {canUpdate && (
          <Button size="sm" onClick={() => void saveBase()} type="button" isLoading={saving}>
            Save
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">Used when no monthly or seasonal rate applies.</p>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <HotelRatesEditor
        entityKind={kind}
        hotelId={hotelId}
        ownerId={item.id}
        monthRates={item.monthPrices as never}
        seasonRates={item.seasons as never}
      />
    </div>
  );
}

export function HotelPlansEditor({ kind, hotel, mealTypes = [], headerClass }: Props) {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE);
  const createRoom = useCreateRoomType(hotel.id);
  const createMeal = useCreateMealPlan(hotel.id);
  const updateRoom = useUpdateRoomType(hotel.id);
  const updateMeal = useUpdateMealPlan(hotel.id);
  const [open, setOpen] = useState(false);
  const [pricingId, setPricingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [extra, setExtra] = useState(''); // bed type (room) or meal type key
  const [draftPrice, setDraftPrice] = useState('');
  const [draftCurrency, setDraftCurrency] = useState('INR');
  const [draftMonths, setDraftMonths] = useState<MonthRateDraft[]>([]);
  const [draftSeasons, setDraftSeasons] = useState<SeasonRateDraft[]>([]);
  const [error, setError] = useState('');

  const items = kind === 'room' ? hotel.roomTypes : hotel.mealPlans;
  const title = kind === 'room' ? 'Room Types' : 'Meal Plans';
  const pending = createRoom.isPending || createMeal.isPending;

  const reset = () => {
    setName('');
    setExtra('');
    setDraftPrice('');
    setDraftCurrency('INR');
    setDraftMonths([]);
    setDraftSeasons([]);
    setError('');
    setOpen(false);
  };

  const submit = async () => {
    if (name.trim().length < 1) {
      setError('Enter a name.');
      return;
    }
    try {
      const existingIds = new Set(items.map((item) => item.id));
      let createdId: string | undefined;
      if (kind === 'room') {
        const result = await createRoom.mutateAsync({
          name: name.trim(),
          bedType: extra.trim() || null,
          status: 'ACTIVE',
          currency: draftCurrency || 'INR',
          ...(draftPrice.trim() ? { sellingPrice: Number(draftPrice) } : {}),
        });
        createdId = result.roomTypes.find((room) => !existingIds.has(room.id))?.id;
      } else {
        const result = await createMeal.mutateAsync({
          name: name.trim(),
          type: (extra || 'CUSTOM') as HotelMealPlanType,
          status: 'ACTIVE',
          currency: draftCurrency || 'INR',
          ...(draftPrice.trim() ? { sellingPrice: Number(draftPrice) } : {}),
        });
        createdId = result.mealPlans.find((plan) => !existingIds.has(plan.id))?.id;
      }
      if (createdId) {
        for (const month of draftMonths) {
          if (!month.month) continue;
          const payload = {
            month: Number(month.month),
            price: month.price.trim() === '' ? null : Number(month.price),
            currency: month.currency || 'INR',
          };
          if (kind === 'room') await createRoomTypeMonthPrice(hotel.id, createdId, payload);
          else await createMealPlanMonthPrice(hotel.id, createdId, payload);
        }
        for (const season of draftSeasons) {
          if (!season.name.trim() || !season.startDate || !season.endDate) continue;
          const payload = {
            name: season.name.trim(),
            startDate: new Date(`${season.startDate}T00:00:00.000Z`),
            endDate: new Date(`${season.endDate}T00:00:00.000Z`),
            price: season.price.trim() === '' ? null : Number(season.price),
            currency: season.currency || 'INR',
          };
          if (kind === 'room') await createRoomTypeSeason(hotel.id, createdId, payload);
          else await createMealPlanSeason(hotel.id, createdId, payload);
        }
      }
      reset();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Could not save.');
    }
  };

  const archive = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    if (kind === 'room') await updateRoom.mutateAsync({ id, input: { status: 'ARCHIVED' } });
    else await updateMeal.mutateAsync({ id, input: { status: 'ARCHIVED' } });
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div
        className={
          headerClass
            ? `flex items-center justify-between px-5 py-3 text-white ${headerClass}`
            : 'flex items-center justify-between border-b bg-slate-50 px-5 py-3'
        }
      >
        <h3 className={headerClass ? 'font-semibold' : 'text-sm font-semibold text-slate-700'}>
          {title}
        </h3>
        {canUpdate &&
          (headerClass ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 text-sm font-medium hover:bg-white/30"
            >
              <Plus className="h-4 w-4" /> Add {kind === 'room' ? 'Room Type' : 'Meal Plan'}
            </button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
              <Plus className="h-4 w-4" /> Add {kind === 'room' ? 'Room Type' : 'Meal Plan'}
            </Button>
          ))}
      </div>
      <div className="space-y-3 p-5">
        {!items.length && (
          <p className="text-sm text-slate-500">No {title.toLowerCase()} added yet.</p>
        )}
        {items.map((item) => {
          const months = (kind === 'room'
            ? (item as Hotel['roomTypes'][number]).monthPrices
            : (item as Hotel['mealPlans'][number]).monthPrices) ?? [];
          const seasons = (kind === 'room'
            ? (item as Hotel['roomTypes'][number]).seasons
            : (item as Hotel['mealPlans'][number]).seasons) ?? [];
          const extraRates = rateCount(months, seasons);
          return (
            <div key={item.id} className="space-y-3 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {kind === 'room'
                      ? [
                          (item as Hotel['roomTypes'][number]).bedType,
                          (item as Hotel['roomTypes'][number]).maxOccupancy
                            ? `Sleeps ${(item as Hotel['roomTypes'][number]).maxOccupancy}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'
                      : (item as Hotel['mealPlans'][number]).type.replaceAll('_', ' ')}
                    {' · '}
                    <span>
                      {item.currency} {item.sellingPrice != null ? item.sellingPrice : '—'}
                    </span>
                    {extraRates > 0 && <span> · {extraRates} extra rate{extraRates === 1 ? '' : 's'}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={item.status} />
                  {canUpdate && item.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      aria-label={`Toggle pricing for ${item.name}`}
                      onClick={() => setPricingId((current) => (current === item.id ? null : item.id))}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                    >
                      {pricingId === item.id ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Pricing
                    </button>
                  )}
                  {canUpdate && item.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 hover:underline"
                      onClick={() => archive(item.id)}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
              {item.status !== 'ARCHIVED' && pricingId === item.id && (
                <PricingPanel kind={kind} hotelId={hotel.id} item={item} />
              )}
            </div>
          );
        })}
        {open && (
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <input
              className={fieldClass}
              placeholder={kind === 'room' ? 'Room type name' : 'Meal plan name'}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={`${title} name`}
            />
            {kind === 'room' ? (
              <input
                className={fieldClass}
                placeholder="Bed type (optional)"
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                aria-label="Bed type"
              />
            ) : (
              <select
                className={fieldClass}
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                aria-label="Meal plan type"
              >
                <option value="">Select type</option>
                {mealTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            )}
            <div className="rounded-lg border border-dashed p-3">
              <span className="text-sm font-semibold text-slate-800">Base Price</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  className={`${fieldClass} mt-0 min-w-0 flex-1`}
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Base price"
                  value={draftPrice}
                  onChange={(event) => setDraftPrice(event.target.value)}
                  aria-label={`${title} base price`}
                />
                <CurrencySelect
                  value={draftCurrency}
                  onChange={setDraftCurrency}
                  aria-label={`${title} base currency`}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Used when no monthly or seasonal rate applies.
              </p>
            </div>
            <HotelRatesEditor
              entityKind={kind}
              monthRates={draftMonths}
              seasonRates={draftSeasons}
              onMonthRatesChange={setDraftMonths}
              onSeasonRatesChange={setDraftSeasons}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={reset} type="button">
                Cancel
              </Button>
              <Button size="sm" onClick={submit} type="button" isLoading={pending}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}