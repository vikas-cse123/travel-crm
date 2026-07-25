import { cn } from '@/utils/cn';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';

// General-purpose pill in wacrm's badge language (h-5, fully rounded, xs).
// StatusBadge remains the semantic business-status component; this is the
// neutral/branded counterpart for counts, labels and filters.
const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border border-border text-foreground',
  success: 'bg-emerald-500/10 text-emerald-700',
  warning: 'bg-amber-500/15 text-amber-700',
  destructive: 'bg-destructive/10 text-destructive',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
