import { useId } from 'react';
import { cn } from '@/utils/cn';

interface FormFieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  /** Receives the ids to wire up label, error and hint associations. */
  children:
    | React.ReactNode
    | ((props: {
        id: string;
        'aria-invalid': boolean;
        'aria-describedby': string | undefined;
      }) => React.ReactNode);
}

/**
 * Label + control + error, with the ARIA wiring done once here.
 *
 * `aria-describedby` points at whichever of hint/error exists so a screen
 * reader announces the validation message with the field, and `role="alert"`
 * makes it announced as soon as it appears.
 */
export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {typeof children === 'function'
        ? children({
            id,
            'aria-invalid': Boolean(error),
            'aria-describedby': describedBy || undefined,
          })
        : children}

      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Shared input styling, colocated with the field it belongs to. Not a
// component, so Fast Refresh is not relevant here.
// eslint-disable-next-line react-refresh/only-export-components
export const inputClasses = (hasError: boolean) =>
  cn(
    'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm',
    'placeholder:text-slate-400',
    'disabled:cursor-not-allowed disabled:bg-slate-50',
    hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-brand-500',
  );
