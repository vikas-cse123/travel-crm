import { useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import { cn } from '@/utils/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 overflow-hidden rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export function MetricInfoTooltip({
  title,
  description,
  formula,
}: {
  title: string;
  description: string;
  formula: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={`More info about ${title}`}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-full',
              'border border-current/15 bg-white/15',
              'text-current opacity-60 hover:opacity-100 hover:bg-white/25',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              'transition-colors duration-150',
            )}
          >
            <Info className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={8}
            collisionPadding={12}
            avoidCollisions
            className={cn(
              'z-[80] w-[300px] rounded-xl border bg-card p-4 shadow-popover',
              'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
              'data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
              'origin-[var(--radix-tooltip-content-transform-origin)]',
              'transition-all duration-200',
            )}
          >
            <div className="space-y-3">
              <h4 className="text-sm font-semibold leading-none text-slate-900">{title}</h4>
              <p className="text-xs leading-relaxed text-slate-600">{description}</p>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Formula
                </p>
                <p className="font-mono text-xs font-medium leading-relaxed text-slate-800">
                  {formula}
                </p>
              </div>
            </div>
            <TooltipPrimitive.Arrow className="fill-card" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}
