import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { LEAD_SEARCH_DEBOUNCE_MS, useLead, useLeadSearch, type Lead } from './queries.api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/**
 * A searchable picker over the leads the caller may see.
 *
 * Matching happens on the server through the leads list endpoint's `search`
 * parameter, so the same tenant/RBAC/visibility rules that govern the Leads
 * page govern this field — a user who can list twenty leads can only ever
 * search those twenty. Typing is debounced so one request is made per pause,
 * not per keystroke.
 *
 * Built the same way as {@link SightseeingActivitySelect}: a plain input plus a
 * listbox popover, no new dependency, so it matches the rest of the UI.
 */

interface LeadSearchSelectProps {
  /** Currently selected lead id, or '' when nothing is chosen. */
  value: string;
  onChange: (leadId: string) => void;
  /** Locks the field to `value` — used when the route already fixes the lead. */
  disabled?: boolean;
  ariaLabel?: string;
}

/** "Aarav Mehta · QRY-1" — what the closed field shows. */
const leadLabel = (lead: Lead) => `${lead.customerName} · ${lead.queryNumber}`;

/** "QRY-1 · +91 90000 00000 · aarav@example.com" — the option's second line. */
const leadDetail = (lead: Lead) =>
  [lead.queryNumber, lead.phone, lead.email].filter(Boolean).join(' · ');

export function LeadSearchSelect({
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Lead',
}: LeadSearchSelectProps) {
  const listboxId = useId();
  const [selected, setSelected] = useState<Lead | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebouncedValue(query, LEAD_SEARCH_DEBOUNCE_MS);
  const results = useLeadSearch(debouncedQuery, { enabled: !disabled });

  // A lead id can arrive from the route or the query string without ever having
  // passed through the list (`/queries/:id/quotations/new`, `?queryId=…`).
  // Resolve just that one lead so the field can name it.
  const needsPreset = Boolean(value) && selected?.id !== value;
  const preset = useLead(needsPreset ? value : undefined);
  const current = selected?.id === value ? selected : (preset.data ?? null);

  const options = results.data?.data ?? [];

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

  // A fresh set of matches invalidates whichever row was highlighted.
  useEffect(() => setHighlight(0), [debouncedQuery]);

  // Focus returns to the input after a pick so the keyboard stays put, but that
  // focus must not re-open the list the pick just closed.
  const justCommitted = useRef(false);

  const commit = (lead: Lead) => {
    setSelected(lead);
    setQuery('');
    setOpen(false);
    onChange(lead.id);
    justCommitted.current = true;
    inputRef.current?.focus();
    justCommitted.current = false;
  };

  const clear = () => {
    setSelected(null);
    setQuery('');
    onChange('');
    inputRef.current?.focus();
  };

  // `results` keeps the previous page on screen while the next one loads, so
  // "searching" is the honest state whenever the debounced term is in flight.
  const searching = results.isFetching;
  const failed = results.isError;
  const noMatches = !searching && !failed && options.length === 0;

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
          {...(open && options[highlight]
            ? { 'aria-activedescendant': `${listboxId}-${options[highlight].id}` }
            : {})}
          disabled={disabled}
          placeholder="Search leads by name, phone, email or lead ID…"
          value={query || (current ? leadLabel(current) : '')}
          onFocus={() => {
            if (!justCommitted.current) setOpen(true);
          }}
          onMouseDown={() => setOpen((isOpen) => !isOpen)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) setOpen(true);
              else if (options.length) setHighlight((row) => (row + 1) % options.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (options.length)
                setHighlight((row) => (row - 1 + options.length) % options.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const lead = options[highlight];
              if (open && lead) commit(lead);
            } else if (event.key === 'Escape') {
              close();
              inputRef.current?.blur();
            }
          }}
          className="w-full rounded-lg border border-slate-300 bg-card py-2 pl-3 pr-8 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label={`Clear ${ariaLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              clear();
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          // Deliberately distinct from the input's label: sharing it would give
          // the field two elements with the same accessible name.
          aria-label={`${ariaLabel} search results`}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {searching && (
            <li aria-hidden="true" className="px-3 py-2 text-sm text-slate-400">
              Searching leads…
            </li>
          )}
          {failed && (
            <li className="px-3 py-2 text-sm text-red-600" role="alert">
              Unable to search leads.
            </li>
          )}
          {noMatches && (
            <li aria-hidden="true" className="px-3 py-2 text-sm text-slate-400">
              No leads found
            </li>
          )}
          {!failed &&
            options.map((lead, index) => (
              // `role="none"` on the wrapper so the button itself is the
              // listbox's option — an option must not contain a separate
              // focusable child.
              <li key={lead.id} role="none">
                <button
                  type="button"
                  role="option"
                  id={`${listboxId}-${lead.id}`}
                  aria-selected={lead.id === value}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => commit(lead)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    highlight === index ? 'bg-slate-100' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{lead.customerName}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {leadDetail(lead)}
                    </span>
                  </span>
                  {lead.id === value && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
