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
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
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
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// Shared input styling, colocated with the field it belongs to. Not a
// component, so Fast Refresh is not relevant here. Matches wacrm's control
// language: token surface, muted placeholder, focus ring on the accent.
// eslint-disable-next-line react-refresh/only-export-components
export const inputClasses = (hasError: boolean) =>
  cn(
    'block w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors',
    'placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring/50',
    'disabled:cursor-not-allowed disabled:bg-muted',
    hasError ? 'border-destructive focus:border-destructive' : 'border-input focus:border-ring',
  );
