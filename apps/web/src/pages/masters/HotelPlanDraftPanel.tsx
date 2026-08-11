import { Plus, X } from 'lucide-react';
import { fieldClass } from './MasterUi';

/** A room-type / meal-plan row collected locally before the hotel exists. */
export interface PlanDraft {
  name: string;
  description: string;
  price: string;
}

export const emptyPlanDraft = (): PlanDraft => ({ name: '', description: '', price: '' });

/**
 * Repeatable inline blocks for "Room Types" / "Meal Plans", matching the
 * reference create-hotel screen. Each block edits name / description / price;
 * "+ Add" appends another block. Rows are persisted after the hotel is created.
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
                <span className="mt-3 block text-sm font-semibold text-slate-800">Price</span>
                <div className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
                  <span className="flex items-center bg-slate-100 px-3 text-sm text-slate-500">
                    $
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-card px-3 py-2 text-sm text-slate-800 outline-none"
                    type="number"
                    placeholder="Enter price"
                    value={draft.price}
                    onChange={(event) => update(index, { price: event.target.value })}
                    aria-label={`${itemLabel} ${index + 1} price`}
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
