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
 */
export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { hasPermission } = useAuth();

  const items = NAV_ITEMS.filter(
    // Unbuilt modules have no permission yet, so they are always listed;
    // built ones are filtered by the user's effective permissions.
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <>
      {/* Scrim: tapping outside closes the drawer. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-all duration-200',
          collapsed ? 'lg:w-16' : 'lg:w-60',
          'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Plane className="h-4 w-4" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold text-slate-900">{APP_NAME}</span>
          )}

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
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
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-400"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
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
                  <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {item.group}
                  </p>
                )}
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </div>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-slate-200 p-3">
            <p className="text-[11px] text-slate-400">More modules arrive in upcoming releases.</p>
          </div>
        )}
      </aside>
    </>
  );
}
