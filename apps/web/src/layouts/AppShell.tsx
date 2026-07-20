import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { NAV_ITEMS } from '@/components/layout/navigation';

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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const breadcrumbs = useBreadcrumbs();

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <Topbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          onOpenMobile={() => setMobileOpen(true)}
          breadcrumbs={breadcrumbs}
        />

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
