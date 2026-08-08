import { PanelLeftClose, PanelLeftOpen, Plane, X } from 'lucide-react';
import { APP_NAME } from '@interscale/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/utils/cn';

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

/** Whether the browser is on the authenticated Company's ACTIVE custom domain. */
function isOnCustomDomain(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const current = window.location.hostname.trim().toLowerCase().replace(/\.$/, '');
  return current === hostname.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Brand area: logo + product name in the expanded state, a tooltip-wrapped
 * logo in the collapsed state, the collapse/expand control (desktop) and the
 * drawer close control (mobile).
 *
 * When the CRM is accessed through the Company's ACTIVE custom domain, the
 * top-left branding shows that Company's logo + name from Company Settings;
 * otherwise the shared platform branding is shown.
 */
export function SidebarHeader({ collapsed, onToggleCollapse, onCloseMobile }: SidebarHeaderProps) {
  const { user } = useAuth();
  const company = user?.company;
  const customerBranding = Boolean(company && isOnCustomDomain(company.customDomain?.hostname));
  const logoUrl = customerBranding ? (company?.logoUrl ?? null) : null;
  const displayName = customerBranding && company ? company.name : APP_NAME;

  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm',
          collapsed ? 'mx-auto lg:mx-0' : '',
          logoUrl ? 'bg-sidebar' : 'bg-primary text-primary-foreground',
        )}
        aria-hidden="true"
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full rounded-lg object-contain"
            onError={(event) => {
              // A broken logo falls back to the platform mark without breaking
              // the shell; the image element is hidden so the box keeps its size.
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Plane className="h-[19px] w-[19px]" />
        )}
      </div>

      {!collapsed && (
        <span
          className="truncate text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground"
          title={displayName}
        >
          {displayName}
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
