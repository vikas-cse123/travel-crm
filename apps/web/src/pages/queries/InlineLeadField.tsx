import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { labelForLookup } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useUpdateLeadField,
  type Lead,
  type LeadInlineField,
} from '@/features/queries/queries.api';

export interface LeadFieldOption {
  value: string;
  label: string;
}

const fieldLabel: Record<LeadInlineField, string> = {
  leadType: 'type',
  leadStage: 'stage',
};

/** Stages that require a textual reason before the update may proceed. */
const REASON_REQUIRED_STAGES = ['LOST', 'CANCELLED', 'INVALID'];

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
 * Lead form. Authorized users get a keyboard-accessible dropdown; others see a
 * static badge.
 *
 * Stage changes to reason-required stages (Lost, Cancelled, Invalid) open a
 * small inline reason prompt scoped to THIS row only — the lead's stage is not
 * updated until a valid reason is confirmed, and the validation error (e.g.
 * "A lost reason is required.") can only ever appear for the row that is
 * actually moving to that stage. Non-reason stage changes apply immediately.
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
  // Row-scoped pending reason-required stage change.
  const [pendingStage, setPendingStage] = useState<LeadFieldOption | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [pendingPos, setPendingPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const update = useUpdateLeadField(lead.id);
  const value = field === 'leadType' ? lead.leadType : lead.leadStage;
  const label = labelForLookup(value);
  const labelNoun = fieldLabel[field];

  // Available options that match the current Create Lead list.
  const optionsWithCurrent = options.length > 0 ? options : [{ value, label }];

  const close = () => {
    setOpen(false);
    setHighlight(0);
  };

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 176);
    const estimatedHeight = Math.min(288, optionsWithCurrent.length * 36 + 8);
    const measuredHeight = menuRef.current?.offsetHeight;
    const needed = measuredHeight && measuredHeight > 0 ? measuredHeight : estimatedHeight;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const shouldFlip = spaceBelow < needed && spaceAbove > spaceBelow;
    let top: number;
    let maxHeight: number;
    if (shouldFlip) {
      maxHeight = Math.min(288, spaceAbove - 4);
      const height = Math.min(needed, maxHeight);
      top = rect.top - height - 4;
    } else {
      maxHeight = Math.min(288, spaceBelow - 4);
      top = rect.bottom + 4;
    }
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - menuWidth - viewportPadding;
    }
    if (left < viewportPadding) left = viewportPadding;
    setMenuPos({ top, left, width: menuWidth, maxHeight: Math.max(120, maxHeight) });
  }, [optionsWithCurrent.length]);

  const updatePendingPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !pendingStage) return;
    const rect = trigger.getBoundingClientRect();
    const width = 288;
    const viewportPadding = 8;
    const estimatedHeight = 160;
    const measuredHeight = pendingRef.current?.offsetHeight;
    const needed = measuredHeight && measuredHeight > 0 ? measuredHeight : estimatedHeight;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const shouldFlip = spaceBelow < needed && spaceAbove > spaceBelow;
    let top: number;
    if (shouldFlip) {
      top = rect.top - needed - 4;
      if (top < viewportPadding) top = viewportPadding;
    } else {
      top = rect.bottom + 4;
    }
    let left = rect.left;
    if (left + width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - width - viewportPadding;
    }
    if (left < viewportPadding) left = viewportPadding;
    setPendingPos({ top, left });
  }, [pendingStage]);

  useLayoutEffect(() => {
    if (open) updateMenuPosition();
  }, [open, updateMenuPosition]);

  useLayoutEffect(() => {
    if (pendingStage) updatePendingPosition();
  }, [pendingStage, updatePendingPosition]);

  useEffect(() => {
    if (!open && !pendingStage) return;
    const handleReposition = () => {
      if (open) updateMenuPosition();
      if (pendingStage) updatePendingPosition();
    };
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, pendingStage, updateMenuPosition, updatePendingPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideRoot = rootRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideRoot && !insideMenu) close();
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

  useEffect(() => {
    if (!pendingStage) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideRoot = rootRef.current?.contains(target);
      const insidePending = pendingRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideRoot && !insidePending && !insideMenu) cancelPending();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelPending();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pendingStage]);

  const cancelPending = () => {
    setPendingStage(null);
    setReason('');
    setReasonError(null);
  };

  const openMenu = () => {
    // Reopening the menu cancels any in-progress reason-required change.
    if (pendingStage) cancelPending();
    const currentIndex = optionsWithCurrent.findIndex((o) => o.value === value);
    setHighlight(currentIndex >= 0 ? currentIndex : 0);
    setOpen(true);
  };

  const choose = (option: LeadFieldOption) => {
    setOpen(false);
    setHighlight(0);
    if (option.value === value || update.isPending) return; // no-op on same value
    if (field === 'leadStage' && REASON_REQUIRED_STAGES.includes(option.value)) {
      setPendingStage(option);
      setReason('');
      setReasonError(null);
      // Focus the reason input as soon as the prompt mounts.
      requestAnimationFrame(() => reasonInputRef.current?.focus());
      return;
    }
    // Non-reason stage (and every type change) applies immediately.
    update.mutate({ field, value: option.value });
  };

  const submitPending = () => {
    if (!pendingStage || update.isPending) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError(
        pendingStage.value === 'LOST' ? 'A lost reason is required.' : 'A reason is required.',
      );
      return;
    }
    const isLost = pendingStage.value === 'LOST';
    update.mutate(
      {
        field: 'leadStage',
        value: pendingStage.value,
        ...(isLost ? { lostReason: trimmed } : { reason: trimmed }),
      },
      {
        onSuccess: cancelPending,
      },
    );
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
        aria-label={`Change lead ${labelNoun} from ${label}`}
        disabled={update.isPending}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${fieldColor(value)} ${update.isPending ? 'opacity-60' : ''}`}
      >
        {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            id={`${id}-menu`}
            aria-label={`Change lead ${labelNoun}`}
            onKeyDown={onListKeyDown}
            style={
              menuPos
                ? {
                    position: 'fixed',
                    top: menuPos.top,
                    left: menuPos.left,
                    width: menuPos.width,
                    maxHeight: menuPos.maxHeight,
                  }
                : { position: 'fixed', visibility: 'hidden' as const }
            }
            className="z-[80] min-w-44 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
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
          </ul>,
          document.body,
        )}

      {pendingStage ? (
        createPortal(
          <div
            ref={pendingRef}
            style={
              pendingPos
                ? {
                    position: 'fixed',
                    top: pendingPos.top,
                    left: pendingPos.left,
                  }
                : { position: 'fixed', visibility: 'hidden' as const }
            }
            className="z-[80] w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg"
          >
          <p className="text-xs font-medium text-slate-700">
            Moving to {labelForLookup(pendingStage.value)}
          </p>
          <input
            ref={reasonInputRef}
            aria-label="Stage reason"
            className="mt-1.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder={pendingStage.value === 'LOST' ? 'Lost reason required' : 'Reason required'}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (reasonError) setReasonError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitPending();
              if (event.key === 'Escape') cancelPending();
            }}
          />
          {(reasonError || (update.isError ? errorMessage : null)) && (
            <p role="alert" className="mt-1 text-xs text-red-700">
              {reasonError ?? errorMessage}
            </p>
          )}
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" isLoading={update.isPending} onClick={submitPending}>
              Update stage
            </Button>
            <Button size="sm" variant="secondary" onClick={cancelPending}>
              Cancel
            </Button>
          </div>
          </div>,
          document.body,
        )
      ) : (
        update.isError &&
        errorMessage && (
          <p
            role="alert"
            className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
          >
            {errorMessage}
          </p>
        )
      )}
    </div>
  );
}
