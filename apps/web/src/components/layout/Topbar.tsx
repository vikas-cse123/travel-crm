import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PERMISSIONS } from '@interscale/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLogout } from '@/features/auth/auth.api';
import { initialsOf } from './navigation';
import { useNotificationAnalytics } from '@/features/reminders/reminders.api';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface TopbarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
  breadcrumbs: string[];
}

export function Topbar({ collapsed, onToggleCollapse, onOpenMobile, breadcrumbs }: TopbarProps) {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canViewNotifications = hasPermission(PERMISSIONS.NOTIFICATIONS_VIEW);
  const notifications = useNotificationAnalytics(canViewNotifications);
  const logout = useLogout();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click or Escape — expected behaviour for a
  // menu, and it keeps keyboard users from being trapped in it.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open navigation"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:block"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <li key={crumb} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-muted-foreground/50" aria-hidden="true">
                  /
                </span>
              )}
              <span
                className={
                  index === breadcrumbs.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
                }
                aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
              >
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {canViewNotifications && (
          <Link
            to="/reminders/notifications"
            aria-label={`${notifications.data?.unread ?? 0} unread notifications`}
            className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Bell className="h-5 w-5" />
            {Boolean(notifications.data?.unread) && (
              <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold text-destructive-foreground">
                {Math.min(notifications.data?.unread ?? 0, 99)}
              </span>
            )}
          </Link>
        )}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initialsOf(user?.fullName ?? '')}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight text-foreground">
                {user?.fullName}
              </span>
              <span className="block max-w-[10rem] truncate text-xs leading-tight text-muted-foreground">
                {user?.company.name}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-popover"
            >
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-medium text-foreground">{user?.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-1 inline-flex rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {user?.role.name}
                </p>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => void handleLogout()}
                disabled={logout.isPending}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {logout.isPending ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
