import { Plus, X } from 'lucide-react';
import { fieldClass, CurrencySelect } from './MasterUi';
import {
  HotelRatesEditor,
  type MonthRateDraft,
  type SeasonRateDraft,
} from './HotelRatesEditor';

/** A room-type / meal-plan row collected locally before the hotel exists. */
export interface PlanDraft {
  name: string;
  description: string;
  price: string;
  extraBedPrice: string;
  childWithoutBedPrice: string;
  currency: string;
  monthRates: MonthRateDraft[];
  seasonRates: SeasonRateDraft[];
}

export const emptyPlanDraft = (): PlanDraft => ({
  name: '',
  description: '',
  price: '',
  extraBedPrice: '',
  childWithoutBedPrice: '',
  currency: 'INR',
  monthRates: [],
  seasonRates: [],
});

/**
 * Repeatable inline blocks for "Room Types" / "Meal Plans", matching the
 * reference create-hotel screen. Each block edits name / description, its own
 * base price/currency and optional monthly & seasonal rates. "+ Add" appends
 * another block. Rows are persisted after the hotel is created.
 */
export function HotelPlanDraftPanel({
  kind,
  headerClass,
  drafts,
  onChange,
}: {
  kind: 'room' | 'meal';
  headerClass: string;
  drafts: PlanDraft[];
  onChange: (drafts: PlanDraft[]) => void;
}) {
  const title = kind === 'room' ? 'Room Types' : 'Meal Plans';
  const addLabel = kind === 'room' ? 'Add Room Type' : 'Add Meal Plan';
  const itemLabel = kind === 'room' ? 'Room Type' : 'Meal Plan';
  const namePlaceholder =
    kind === 'room'
      ? 'Enter room type (e.g. Standard, Deluxe, Suite)'
      : 'Enter meal plan (e.g. Breakfast, Half Board, All Inclusive)';
  const descPlaceholder =
    kind === 'room' ? 'Enter room description' : 'Enter meal plan description';

  const update = (index: number, patch: Partial<PlanDraft>) =>
    onChange(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  const add = () => onChange([...drafts, emptyPlanDraft()]);
  const remove = (index: number) => onChange(drafts.filter((_, i) => i !== index));

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className={`flex items-center justify-between px-5 py-3 text-white ${headerClass}`}>
        <h3 className="font-semibold">{title}</h3>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2.5 py-1 text-sm font-medium hover:bg-white/30"
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      </div>
      <div className="p-5">
        {drafts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No {title.toLowerCase()} added yet. Click &quot;{addLabel}&quot; to add one.
          </p>
        ) : (
          <div className="space-y-6">
            {drafts.map((draft, index) => (
              <div key={index} className={index > 0 ? 'border-t pt-6' : ''}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{itemLabel}</span>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>
                <input
                  className={`${fieldClass} mt-1`}
                  placeholder={namePlaceholder}
                  value={draft.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  aria-label={`${itemLabel} ${index + 1} name`}
                />
                <span className="mt-3 block text-sm font-semibold text-slate-800">Description</span>
                <textarea
                  className={`${fieldClass} mt-1`}
                  rows={2}
                  placeholder={descPlaceholder}
                  value={draft.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                  aria-label={`${itemLabel} ${index + 1} description`}
                />
                <div className="mt-3 rounded-lg border border-dashed p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">Base Price</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className={`${fieldClass} mt-0 min-w-0 flex-1`}
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Base price"
                      value={draft.price}
                      onChange={(event) => update(index, { price: event.target.value })}
                      aria-label={`${itemLabel} ${index + 1} base price`}
                    />
                    <CurrencySelect
                      value={draft.currency}
                      onChange={(currency) => update(index, { currency })}
                      aria-label={`${itemLabel} ${index + 1} base currency`}
                    />
                  </div>
                  {kind === 'room' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        className={fieldClass}
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="Extra bed price"
                        value={draft.extraBedPrice}
                        onChange={(event) => update(index, { extraBedPrice: event.target.value })}
                        aria-label={`${itemLabel} ${index + 1} extra bed base price`}
                      />
                      <input
                        className={fieldClass}
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="Child without bed price"
                        value={draft.childWithoutBedPrice}
                        onChange={(event) => update(index, { childWithoutBedPrice: event.target.value })}
                        aria-label={`${itemLabel} ${index + 1} child without bed base price`}
                      />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Used when no monthly or seasonal rate applies.
                  </p>
                </div>
                <div className="mt-3">
                  <HotelRatesEditor
                    entityKind={kind}
                    monthRates={draft.monthRates}
                    seasonRates={draft.seasonRates}
                    onMonthRatesChange={(rows) => update(index, { monthRates: rows })}
                    onSeasonRatesChange={(rows) => update(index, { seasonRates: rows })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}