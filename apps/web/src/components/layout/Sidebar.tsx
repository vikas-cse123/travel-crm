import { NavLink } from 'react-router-dom';
import { Plane, X } from 'lucide-react';
import { APP_NAME } from '@interscale/shared';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/auth/AuthProvider';
import { NAV_ITEMS } from './navigation';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * Primary navigation.
 *
 * One component serves both breakpoints: a fixed rail on desktop and an
 * off-canvas drawer on mobile. Unbuilt modules render as disabled buttons with
 * a "Soon" badge rather than being hidden, so the product's shape is visible
 * without offering dead links.
 *
 * Styling follows wacrm's sidebar treatment: a dedicated sidebar surface, an
 * active item rendered as a tinted primary pill, and muted idle text that
 * brightens on hover — all theme-tokenised for light and dark.
 */
export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { hasPermission } = useAuth();

  const items = NAV_ITEMS.map((item) => ({
    ...item,
    children: item.children?.filter(
      (child) => !child.permission || hasPermission(child.permission),
    ),
  })).filter(
    (item) => !item.permission || hasPermission(item.permission) || Boolean(item.children?.length),
  );

  return (
    <>
      {/* Scrim: tapping outside closes the drawer. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200',
          collapsed ? 'lg:w-16' : 'lg:w-60',
          'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-4 w-4" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              {APP_NAME}
            </span>
          )}

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((item, index) => {
            const Icon = item.icon;

            if (!item.available) {
              return (
                <div
                  key={item.label}
                  aria-disabled="true"
                  title={`${item.label} — coming soon`}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground/60"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    </>
                  )}
                </div>
              );
            }

            return (
              <div key={item.label}>
                {item.group && items[index - 1]?.group !== item.group && !collapsed && (
                  <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.group}
                  </p>
                )}
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-primary/10 text-sidebar-primary'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
                {item.children && !collapsed && (
                  <div className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.to === '/reminders'}
                          onClick={onCloseMobile}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                              isActive
                                ? 'bg-sidebar-primary/10 text-sidebar-primary'
                                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                            )
                          }
                        >
                          <ChildIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-sidebar-border p-3">
            <p className="text-[11px] text-muted-foreground">
              More modules arrive in upcoming releases.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
