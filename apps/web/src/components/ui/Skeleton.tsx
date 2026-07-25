import { cn } from '@/utils/cn';

/**
 * Loading placeholder. A muted block with a subtle shimmer sweep, matching
 * wacrm's skeleton treatment. Decorative, so it is hidden from assistive tech;
 * wrap a group in an element with `aria-busy`/`role="status"` for announcement.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent',
        className,
      )}
    />
  );
}
