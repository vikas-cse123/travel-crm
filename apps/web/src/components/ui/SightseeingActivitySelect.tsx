import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * A searchable combobox for picking a sightseeing activity.
 *
 * Shows the reference-style special options (Day at Leisure, Custom
 * Sightseeing, Arrival and Check-in) plus the tenant's active sightseeing
 * masters grouped under the day's city heading. Built without dependencies
 * (plain focus/click popover + listbox) so it matches the rest of the UI.
 */

export interface SightseeingSelectOption {
  id: string;
  label: string;
  hint?: string | null;
  /** Extra text used for search matching (city, destination, description). */
  searchText?: string | null;
}

interface SightseeingActivitySelectProps {
  ariaLabel: string;
  placeholder: string;
  /** Heading for the master group, e.g. "Activities in Singapore". */
  groupLabel: string;
  specialOptions: SightseeingSelectOption[];
  masterOptions: SightseeingSelectOption[];
  /** Currently associated master id (sightseeingId). */
  value: string | null;
  /** Saved name/title used when nothing is selected (custom/legacy text). */
  displayLabel: string | null;
  onSelect: (option: SightseeingSelectOption | null) => void;
  /** Loading, error, or explicit empty state for the master group. */
  status?: {
    loading?: boolean;
    error?: boolean;
    empty?: boolean;
  };
}

export function SightseeingActivitySelect({
  ariaLabel,
  placeholder,
  groupLabel,
  specialOptions,
  masterOptions,
  value,
  displayLabel,
  onSelect,
  status,
}: SightseeingActivitySelectProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const specialSelected = useMemo(() => {
    const label = displayLabel?.trim().toLowerCase();
    if (!label) return null;
    return specialOptions.find((option) => option.label.trim().toLowerCase() === label) ?? null;
  }, [specialOptions, displayLabel]);
  const masterSelected = useMemo(
    () => masterOptions.find((option) => option.id === value) ?? null,
    [masterOptions, value],
  );

  const filteredMasters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return masterOptions;
    return masterOptions.filter((option) =>
      [option.label, option.hint, option.searchText]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(needle)),
    );
  }, [masterOptions, query]);

  const visibleSpecial = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return specialOptions;
    return specialOptions.filter((option) => option.label.toLowerCase().includes(needle));
  }, [specialOptions, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setHighlight(0);
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const commit = (option: SightseeingSelectOption) => {
    setQuery('');
    setOpen(false);
    onSelect(option);
    inputRef.current?.focus();
  };

  const commitExactOrClear = (text: string) => {
    setQuery(text);
    const needle = text.trim().toLowerCase();
    if (!needle) {
      if (value || masterSelected || specialSelected) onSelect(null);
      return;
    }
    const match = [...visibleSpecial, ...filteredMasters].find(
      (option) => option.label.trim().toLowerCase() === needle,
    );
    if (match) {
      commit(match);
    }
  };

  const displayValue = query ?? '';
  const currentLabel = masterSelected?.label ?? specialSelected?.label ?? displayLabel ?? '';

  const totalOptions = visibleSpecial.length + filteredMasters.length;

  const selectHighlighted = () => {
    const option =
      highlight < visibleSpecial.length
        ? visibleSpecial[highlight]
        : filteredMasters[highlight - visibleSpecial.length];
    if (option) commit(option);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={displayValue || currentLabel}
          onFocus={() => setOpen(true)}
          onMouseDown={() => setOpen((current) => !current)}
          onChange={(event) => commitExactOrClear(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) setOpen(true);
              else setHighlight((current) => (current + 1) % totalOptions);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((current) => (current - 1 + totalOptions) % totalOptions);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (open) selectHighlighted();
            } else if (event.key === 'Escape') {
              close();
              inputRef.current?.blur();
            }
          }}
          className="w-full rounded-lg border border-slate-300 bg-card py-2 pl-3 pr-8 text-sm"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        {(value || masterSelected || specialSelected) && (
          <button
            type="button"
            aria-label={`Clear ${ariaLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              setQuery('');
              onSelect(null);
              inputRef.current?.focus();
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {visibleSpecial.map((option, index) => (
            <li key={option.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => commit(option)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  highlight === index ? 'bg-slate-100' : ''
                }`}
              >
                {option.label}
                {option.label === currentLabel && (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
              </button>
            </li>
          ))}
          {visibleSpecial.length > 0 && (
            <li aria-hidden="true" className="my-1 border-t border-slate-100" />
          )}
          <li
            aria-hidden="true"
            className="bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {groupLabel}
          </li>
          {status?.loading ? (
            <li aria-hidden="true" className="px-3 py-2 text-sm text-slate-400">
              Loading activities...
            </li>
          ) : status?.error ? (
            <li aria-hidden="true" className="px-3 py-2 text-sm text-red-400">
              Unable to load sightseeing activities.
            </li>
          ) : status?.empty ? (
            <li aria-hidden="true" className="px-3 py-2 text-sm text-slate-400">
              No sightseeing activities found
              {groupLabel ? ` for ${groupLabel.replace(/^Activities\s+in\s+/i, '')}.` : '.'}
            </li>
          ) : filteredMasters.length === 0 ? (
            <li aria-hidden="true" className="px-3 py-2 text-sm text-slate-400">
              {query.trim() ? `No activities match "${query.trim()}"` : 'No matching activities'}
            </li>
          ) : null}
          {filteredMasters.map((option, index) => {
            const optionIndex = visibleSpecial.length + index;
            return (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(optionIndex)}
                  onClick={() => commit(option)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    highlight === optionIndex ? 'bg-slate-100' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block text-xs text-slate-400">{option.hint}</span>
                    )}
                  </span>
                  {option.id === value && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
