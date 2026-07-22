import { useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';

/**
 * A type-ahead picker over a travel master.
 *
 * Built on a plain `<input list>` + `<datalist>` so it adds no dependency and
 * keeps working with the keyboard and with screen readers. The selected id is
 * held by the caller, never derived from the visible text: typing a name that
 * matches nothing simply clears the id, which is a valid state — every builder
 * row stays usable as free text.
 *
 * A row may reference a master that is archived and therefore missing from the
 * options; `fallbackLabel` keeps that row readable instead of blanking it.
 */

export interface MasterOption {
  id: string;
  label: string;
  /** Secondary text shown inside the datalist entry, e.g. a city or price. */
  hint?: string | undefined;
}

interface MasterSelectProps {
  ariaLabel: string;
  placeholder: string;
  options: MasterOption[];
  value: string | null | undefined;
  onSelect: (option: MasterOption | null) => void;
  loading?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Shown when `value` is set but absent from `options` (archived master). */
  fallbackLabel?: string | undefined;
}

export function MasterSelect({
  ariaLabel,
  placeholder,
  options,
  value,
  onSelect,
  loading = false,
  disabled = false,
  fallbackLabel,
}: MasterSelectProps) {
  const listId = useId();
  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );
  // Text the user is typing. Null means "show whatever the selection implies",
  // so an externally changed value (clearing a hotel resets its room type) is
  // reflected without the caller having to reset this component.
  const [typed, setTyped] = useState<string | null>(null);
  const display = typed ?? selected?.label ?? (value ? (fallbackLabel ?? '') : '');

  const commit = (text: string) => {
    setTyped(text);
    const match = options.find(
      (option) => option.label.toLowerCase() === text.trim().toLowerCase(),
    );
    if (match) {
      setTyped(null);
      onSelect(match);
    } else if (value) {
      // Editing away from a selection unlinks it; the typed text is kept by the
      // caller's own snapshot field, which this component never writes.
      onSelect(null);
    }
  };

  return (
    <div className="relative">
      <input
        aria-label={ariaLabel}
        placeholder={loading ? 'Loading…' : placeholder}
        list={listId}
        disabled={disabled || loading}
        value={display}
        onChange={(event) => commit(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm disabled:bg-slate-100"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.label}>
            {option.hint}
          </option>
        ))}
      </datalist>
      {value ? (
        <button
          type="button"
          aria-label={`Clear ${ariaLabel}`}
          onClick={() => {
            setTyped(null);
            onSelect(null);
          }}
          className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
