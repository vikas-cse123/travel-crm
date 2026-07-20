import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/utils/cn';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, { classes: string; Icon: typeof Info }> = {
  error: { classes: 'bg-red-50 text-red-800 border-red-200', Icon: AlertCircle },
  success: { classes: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
  info: { classes: 'bg-brand-50 text-brand-800 border-brand-200', Icon: Info },
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
