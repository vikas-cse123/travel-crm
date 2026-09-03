import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

// wacrm button language: solid primary, bordered "outline" secondary, muted
// ghost, tonal destructive. Tokenised so both light and dark are covered.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover disabled:hover:bg-primary',
  secondary: 'border border-border bg-card text-foreground hover:bg-muted disabled:hover:bg-card',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
  danger:
    'bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:hover:bg-destructive/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
}

/**
 * forwardRef so Radix primitives that clone a single child (`TooltipTrigger
 * asChild`, `DropdownMenuTrigger asChild`, …) can attach their ref to the
 * rendered <button> instead of logging "Function components cannot be given
 * refs" and silently losing focus/tooltip anchoring.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, fullWidth = false, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // Disabled while loading so a double-click cannot submit twice.
      disabled={disabled === true || isLoading}
      // Tells assistive tech the control is working, not frozen.
      aria-busy={isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all',
        'active:enabled:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
