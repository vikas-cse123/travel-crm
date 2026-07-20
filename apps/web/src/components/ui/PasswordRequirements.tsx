import { Check, X } from 'lucide-react';
import { PASSWORD_REQUIREMENTS } from '@interscale/shared';
import { cn } from '@/utils/cn';

/**
 * Live password-policy checklist.
 *
 * Driven by the same `PASSWORD_REQUIREMENTS` the Zod schema uses, so the list
 * can never claim a rule the server does not enforce. `aria-live="polite"`
 * announces items as they are satisfied without interrupting typing.
 */
export function PasswordRequirements({ value }: { value: string }) {
  return (
    <ul aria-live="polite" className="mt-2 grid gap-1 sm:grid-cols-2">
      {PASSWORD_REQUIREMENTS.map((requirement) => {
        const met = requirement.test(value);
        return (
          <li
            key={requirement.id}
            className={cn(
              'flex items-center gap-1.5 text-xs',
              met ? 'text-emerald-700' : 'text-slate-500',
            )}
          >
            {met ? (
              <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <X className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
            )}
            <span>{requirement.label}</span>
            <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
