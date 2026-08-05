import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { labelForLookup } from '@interscale/shared';
import { useUpdateLeadField, type Lead, type LeadInlineField } from '@/features/queries/queries.api';

export interface LeadFieldOption {
  value: string;
  label: string;
}

const fieldLabel: Record<LeadInlineField, string> = {
  leadType: 'type',
  leadStage: 'stage',
};

const fieldColor = (value: string) =>
  value === 'HOT' || value === 'URGENT' || value === 'LOST'
    ? 'bg-red-50 text-red-700'
    : value === 'BOOKING_CONFIRMED' || value === 'QUALIFIED'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-blue-50 text-blue-700';

/**
 * Inline-editable column badge for a lead's Type or Stage on the Leads List.
 *
 * Options come from the same single source (useLeadLookups) used by the Create
 * Lead form, so the menu always matches Create Lead. Authorized users get a
 * keyboard-accessible dropdown; others see a static badge.
 */
export function InlineLeadField({
  lead,
  field,
  options,
  canEdit,
}: {
  lead: Lead;
  field: LeadInlineField;
  options: LeadFieldOption[];
  canEdit: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const update = useUpdateLeadField(lead.id);
  const value = field === 'leadType' ? lead.leadType : lead.leadStage;
  const label = labelForLookup(value);
  const labelNoun = fieldLabel[field];

  // Available options that match the current Create Lead list.
  const currentLabel = label;
  const optionsWithCurrent =
    options.length > 0
      ? options
      : [{ value, label }];

  const close = () => {
    setOpen(false);
    setHighlight(0);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openMenu = () => {
    const currentIndex = optionsWithCurrent.findIndex((o) => o.value === value);
    setHighlight(currentIndex >= 0 ? currentIndex : 0);
    setOpen(true);
  };

  const choose = (option: LeadFieldOption) => {
    setOpen(false);
    setHighlight(0);
    if (option.value === value || update.isPending) return; // no-op on same value
    update.mutate({ field, value: option.value });
  };

  const errorMessage = update.isError
    ? (update.error as Error)?.message || `Unable to update ${labelNoun}.`
    : null;

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && !open) {
      event.preventDefault();
      openMenu();
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => (h + 1) % optionsWithCurrent.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => (h - 1 + optionsWithCurrent.length) % optionsWithCurrent.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = optionsWithCurrent[highlight];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      close();
      triggerRef.current?.focus();
    }
  };

  if (!canEdit) {
    return (
      <span
        className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${fieldColor(value)}`}
      >
        {label}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Change lead ${labelNoun} from ${currentLabel}`}
        disabled={update.isPending}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${fieldColor(value)} ${update.isPending ? 'opacity-60' : ''}`}
      >
        {update.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : null}
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          id={`${id}-menu`}
          aria-label={`Change lead ${labelNoun}`}
          onKeyDown={onListKeyDown}
          className="absolute left-0 z-30 mt-1 max-h-72 min-w-44 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {optionsWithCurrent.map((option, index) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(option)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  highlight === index ? 'bg-slate-100' : ''
                }`}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {errorMessage && (
        <p role="alert" className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
