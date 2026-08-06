import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';
import type { NavItem } from '../navigation';

export interface NavItemTooltipHandlers {
  /** Called with the item's bounding rect when hover/focus begins. */
  onShowTooltip: (item: NavItem, rect: DOMRect) => void;
  onHideTooltip: () => void;
}

interface SidebarNavItemProps {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
  tooltip?: NavItemTooltipHandlers;
}

/**
 * A single flat navigation link. On the collapsed desktop rail the label is
 * hidden (but kept for the mobile drawer) and a delayed tooltip appears; the
 * link always carries an accessible name via `aria-label`. Active links get
 * `aria-current="page"`.
 */
export function SidebarNavItem({
  item,
  collapsed,
  active,
  onNavigate,
  tooltip,
}: SidebarNavItemProps) {
  const Icon = item.icon;

  const tooltipProps = collapsed
    ? {
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) =>
          tooltip?.onShowTooltip(item, event.currentTarget.getBoundingClientRect()),
        onMouseLeave: () => tooltip?.onHideTooltip(),
        onFocus: (event: React.FocusEvent<HTMLElement>) =>
          tooltip?.onShowTooltip(item, event.currentTarget.getBoundingClientRect()),
        onBlur: () => tooltip?.onHideTooltip(),
      }
    : {};

  const baseClasses =
    'flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:ring-sidebar-ring';

  if (!item.available) {
    return (
      <div
        aria-disabled="true"
        aria-label={`${item.label} — coming soon`}
        title={`${item.label} — coming soon`}
        className={cn(
          baseClasses,
          'cursor-not-allowed text-muted-foreground/60',
          collapsed && 'lg:justify-center',
        )}
      >
        <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
        <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
        <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Soon
        </span>
      </div>
    );
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      {...tooltipProps}
      className={cn(
        baseClasses,
        active
          ? 'bg-sidebar-primary/10 font-semibold text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/15'
          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        collapsed && 'lg:justify-center',
      )}
    >
      <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" strokeWidth={2} />
      <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
    </Link>
  );
}
