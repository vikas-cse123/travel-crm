import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { NavItem } from '../navigation';
import type { NavItemTooltipHandlers } from './SidebarNavItem';

interface SidebarCollapsibleGroupProps {
  item: NavItem;
  collapsed: boolean;
  open: boolean;
  /** True when the group or any of its children is active. */
  active: boolean;
  onToggle: () => void;
  /** Collapsed mode: expand the rail and open the group. */
  onExpandSidebar: () => void;
  onNavigate?: () => void;
  tooltip?: NavItemTooltipHandlers;
  children: ReactNode;
}

/**
 * A parent navigation item whose children expand below it (Reminders, Masters).
 * Collapsed mode collapses to an icon that expands the whole rail on click.
 */
export function SidebarCollapsibleGroup({
  item,
  collapsed,
  open,
  active,
  onToggle,
  onExpandSidebar,
  onNavigate,
  tooltip,
  children,
}: SidebarCollapsibleGroupProps) {
  const Icon = item.icon;

  const tooltipProps = collapsed
    ? {
        onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) =>
          tooltip?.onShowTooltip(item, event.currentTarget.getBoundingClientRect()),
        onMouseLeave: () => tooltip?.onHideTooltip(),
        onFocus: (event: React.FocusEvent<HTMLButtonElement>) =>
          tooltip?.onShowTooltip(item, event.currentTarget.getBoundingClientRect()),
        onBlur: () => tooltip?.onHideTooltip(),
      }
    : {};

  const handleClick = () => {
    if (collapsed) onExpandSidebar();
    onToggle();
    onNavigate?.();
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={open}
        aria-label={item.label}
        {...tooltipProps}
        className={cn(
          'flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:ring-sidebar-ring',
          active
            ? 'bg-sidebar-primary/10 font-semibold text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/15'
            : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          collapsed && 'lg:justify-center',
        )}
      >
        <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" strokeWidth={2} />
        <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
        <ChevronRight
          className={cn(
            'ml-auto h-4 w-4 shrink-0 transition-transform duration-200',
            open && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="relative ml-[18px] mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
