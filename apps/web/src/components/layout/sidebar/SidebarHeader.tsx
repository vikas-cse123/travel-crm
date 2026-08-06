import { PanelLeftClose, PanelLeftOpen, Plane, X } from 'lucide-react';
import { APP_NAME } from '@interscale/shared';
import { cn } from '@/utils/cn';

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

/**
 * Brand area: logo + product name in the expanded state, a tooltip-wrapped
 * logo in the collapsed state, the collapse/expand control (desktop) and the
 * drawer close control (mobile).
 */
export function SidebarHeader({ collapsed, onToggleCollapse, onCloseMobile }: SidebarHeaderProps) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm',
          collapsed ? 'mx-auto lg:mx-0' : '',
        )}
        aria-hidden="true"
      >
        <Plane className="h-[19px] w-[19px]" />
      </div>

      {!collapsed && (
        <span className="truncate text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
          {APP_NAME}
        </span>
      )}

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="ml-auto hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:block"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-[19px] w-[19px]" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-[19px] w-[19px]" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={onCloseMobile}
        aria-label="Close navigation"
        className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
