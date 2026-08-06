export interface SidebarTooltipData {
  label: string;
  /** Viewport-space anchor point: right edge of the icon and vertical centre. */
  left: number;
  top: number;
}

interface SidebarTooltipProps {
  tip: SidebarTooltipData | null;
}

/**
 * Fixed-position tooltip for collapsed icon-only navigation items.
 * Rendered once near the end of the sidebar so it is never clipped by the
 * nav's overflow rules, and positioned in viewport space so it always appears
 * beside the rail.
 */
export function SidebarTooltip({ tip }: SidebarTooltipProps) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      style={{ left: tip.left, top: tip.top }}
      className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-card"
    >
      {tip.label}
    </div>
  );
}
