import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PERMISSIONS, type HotelMealPlanType } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useCreateMealPlan,
  useCreateRoomType,
  useUpdateMealPlan,
  useUpdateRoomType,
  type Hotel,
} from '@/features/masters/masters.api';
import { fieldClass, StatusBadge } from './MasterUi';

interface Props {
  kind: 'room' | 'meal';
  hotel: Hotel;
  mealTypes?: readonly string[];
}

export function HotelPlansEditor({ kind, hotel, mealTypes = [] }: Props) {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PERMISSIONS.MASTER_HOTELS_UPDATE);
  const canManageCosting = hasPermission(PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
  const canViewCosting = hasPermission(PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
  const createRoom = useCreateRoomType(hotel.id);
  const updateRoom = useUpdateRoomType(hotel.id);
  const createMeal = useCreateMealPlan(hotel.id);
  const updateMeal = useUpdateMealPlan(hotel.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [extra, setExtra] = useState(''); // bed type (room) or meal type key
  const [baseCost, setBaseCost] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [error, setError] = useState('');

  const items = kind === 'room' ? hotel.roomTypes : hotel.mealPlans;
  const title = kind === 'room' ? 'Room Types' : 'Meal Plans';
  const pending = createRoom.isPending || createMeal.isPending;

  const reset = () => {
    setName('');
    setExtra('');
    setBaseCost('');
    setSellingPrice('');
    setError('');
    setOpen(false);
  };

  const num = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : null;
  };

  const submit = async () => {
    if (name.trim().length < 1) {
      setError('Enter a name.');
      return;
    }
    const cost = canManageCosting
      ? { baseCost: num(baseCost), sellingPrice: num(sellingPrice) }
      : {};
    try {
      if (kind === 'room') {
        await createRoom.mutateAsync({
          name: name.trim(),
          bedType: extra.trim() || null,
          status: 'ACTIVE',
          currency: 'INR',
          ...cost,
        });
      } else {
        await createMeal.mutateAsync({
          name: name.trim(),
          type: (extra || 'CUSTOM') as HotelMealPlanType,
          status: 'ACTIVE',
          currency: 'INR',
          ...cost,
        });
      }
      reset();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Could not save.');
    }
  };

  const archive = async (id: string) => {
    if (!window.confirm('Archive this item?')) return;
    if (kind === 'room') await updateRoom.mutateAsync({ id, input: { status: 'ARCHIVED' } });
    else await updateMeal.mutateAsync({ id, input: { status: 'ARCHIVED' } });
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {canUpdate && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
            <Plus className="h-4 w-4" /> Add {kind === 'room' ? 'Room Type' : 'Meal Plan'}
          </Button>
        )}
      </div>
      <div className="space-y-3 p-5">
        {!items.length && <p className="text-sm text-slate-500">No {title.toLowerCase()} added yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
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
                {canViewCosting && item.sellingPrice != null && (
                  <> · {item.currency} {item.sellingPrice}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={item.status} />
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
        ))}
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
            {canManageCosting && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={fieldClass}
                  type="number"
                  placeholder="Base cost"
                  value={baseCost}
                  onChange={(event) => setBaseCost(event.target.value)}
                  aria-label="Base cost"
                />
                <input
                  className={fieldClass}
                  type="number"
                  placeholder="Selling price"
                  value={sellingPrice}
                  onChange={(event) => setSellingPrice(event.target.value)}
                  aria-label="Selling price"
                />
              </div>
            )}
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
