import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLogout } from '@/features/auth/auth.api';
import { initialsOf } from './navigation';

interface TopbarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
  breadcrumbs: string[];
}

export function Topbar({ collapsed, onToggleCollapse, onOpenMobile, breadcrumbs }: TopbarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open navigation"
        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:block"
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
                <span className="text-slate-300" aria-hidden="true">
                  /
                </span>
              )}
              <span
                className={
                  index === breadcrumbs.length - 1 ? 'font-medium text-slate-900' : 'text-slate-500'
                }
                aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
              >
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initialsOf(user?.fullName ?? '')}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight text-slate-900">
              {user?.fullName}
            </span>
            <span className="block max-w-[10rem] truncate text-xs leading-tight text-slate-500">
              {user?.company.name}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1.5 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <div className="border-b border-slate-100 px-3 py-2.5">
              <p className="truncate text-sm font-medium text-slate-900">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
              <p className="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {user?.role.name}
              </p>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleLogout()}
              disabled={logout.isPending}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {logout.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
