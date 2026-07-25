import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/utils/cn';

type Tone = 'error' | 'success' | 'info';

// Tonal inline messages: a soft colour wash + a readable foreground of the
// same family, tokenised so each stays accessible in light and dark.
const TONES: Record<Tone, { classes: string; Icon: typeof Info }> = {
  error: { classes: 'bg-destructive/10 text-destructive border-destructive/20', Icon: AlertCircle },
  success: {
    classes: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    Icon: CheckCircle2,
  },
  info: { classes: 'bg-primary/10 text-primary border-primary/20', Icon: Info },
};

interface AlertProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}

/**
 * Inline status message.
 *
 * Errors use `role="alert"` (assertive) so failures interrupt; success and
 * info use `role="status"` (polite) so they do not cut off other announcements.
 */
export function Alert({ tone = 'info', children, className }: AlertProps) {
  const { classes, Icon } = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', classes, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
