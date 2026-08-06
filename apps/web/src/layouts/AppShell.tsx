import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { Sidebar } from '@/components/layout/sidebar/Sidebar';
import { useSidebarCollapse } from '@/components/layout/sidebar/sidebar-state';
import { Topbar } from '@/components/layout/Topbar';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { ReminderAlerts } from '@/features/reminders/ReminderAlerts';

/** Derive breadcrumbs from the current path, falling back to the raw segment. */
function useBreadcrumbs(): string[] {
  const { pathname } = useLocation();
  const match = NAV_ITEMS.find((item) => pathname.startsWith(item.to));

  if (match) return ['Home', match.label];

  const segment = pathname.split('/').filter(Boolean)[0];
  return segment ? ['Home', segment.charAt(0).toUpperCase() + segment.slice(1)] : ['Home'];
}

/** The authenticated application frame: sidebar, topbar and page outlet. */
export function AppShell() {
  const { collapsed, toggleCollapsed } = useSidebarCollapse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const breadcrumbs = useBreadcrumbs();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          'transition-[padding-left] duration-200 ease-out',
          collapsed
            ? 'lg:pl-[var(--sidebar-width-collapsed)]'
            : 'lg:pl-[var(--sidebar-width-expanded)]',
        )}
      >
        <Topbar onOpenMobile={() => setMobileOpen(true)} breadcrumbs={breadcrumbs} />

        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <ReminderAlerts />
    </div>
  );
}
