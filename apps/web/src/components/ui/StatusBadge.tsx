import { cn } from '@/utils/cn';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

// Tonal badges in wacrm's language: a soft same-family wash, a readable
// foreground, and a hairline inset ring. Alpha-composed off each hue so the
// business meaning (green = good, amber = attention, red = problem) survives
// in both light and dark.
const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-700 ring-amber-500/25',
  danger: 'bg-destructive/10 text-destructive ring-destructive/25',
  neutral: 'bg-muted text-muted-foreground ring-border',
  info: 'bg-primary/10 text-primary ring-primary/25',
};

interface StatusBadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
