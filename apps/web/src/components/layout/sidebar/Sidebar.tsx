import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  isNavItemActive,
  isNavPathActive,
  NAV_ITEMS,
  NAV_SECTION_ORDER,
  type NavItem,
  type NavSection,
} from '../navigation';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarCollapsibleGroup } from './SidebarCollapsibleGroup';
import { SidebarSection } from './SidebarSection';
import { SidebarTooltip, type SidebarTooltipData } from './SidebarTooltip';
import { SidebarAppSwitcher } from './SidebarAppSwitcher';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/** Tooltip delay before a collapsed item's tooltip appears. */
const TOOLTIP_DELAY_MS = 300;

/**
 * Primary navigation.
 *
 * Desktop: a fixed rail with expanded (260px) and collapsed (72px) states, a
 * collapsible Masters group, section headings and icon tooltips. Mobile: the
 * same content as a full-width off-canvas drawer that ignores the collapsed
 * preference. Permission filtering stays a presentation concern — the route
 * guards remain the security boundary.
 */
export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const { hasPermission, isSystemAdmin, isOwner } = useAuth();
  const { pathname } = useLocation();

  const visibleItems = useMemo<NavItem[]>(() => {
    const visible = (item: NavItem): boolean =>
      (!item.hideForSystemAdmin || !isSystemAdmin) &&
      (!item.hideUnlessOwner || isOwner) &&
      (!item.permission || hasPermission(item.permission) || Boolean(item.children?.length));

    const result: NavItem[] = [];
    for (const item of NAV_ITEMS) {
      const filtered: NavItem = item.children?.length
        ? {
            ...item,
            children: item.children.filter(
              (child) =>
                (!child.hideForSystemAdmin || !isSystemAdmin) &&
                (!child.hideUnlessOwner || isOwner) &&
                (!child.permission || hasPermission(child.permission)),
            ),
          }
        : item;
      if (visible(filtered)) result.push(filtered);
    }
    return result;
  }, [hasPermission, isSystemAdmin, isOwner]);

  const sections = useMemo(() => {
    const bySection = new Map<NavSection, NavItem[]>();
    for (const item of visibleItems) {
      const list = bySection.get(item.section) ?? [];
      list.push(item);
      bySection.set(item.section, list);
    }
    return NAV_SECTION_ORDER.map((section) => ({
      section,
      items: bySection.get(section) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [visibleItems]);

  // Group open state (Reminders, Masters). Groups whose child route is active
  // auto-expand, so the active child is always visible.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      let changed = false;
      for (const item of visibleItems) {
        if (item.children?.length && isNavItemActive(pathname, item) && !next.has(item.label)) {
          next.add(item.label);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [pathname, visibleItems]);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Collapsed icon tooltips.
  const [tooltip, setTooltip] = useState<SidebarTooltipData | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  const showTooltip = useCallback((item: NavItem, rect: DOMRect) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ label: item.label, left: rect.right + 10, top: rect.top + rect.height / 2 });
    }, TOOLTIP_DELAY_MS);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimer.current) {
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
    setTooltip(null);
  }, []);

  // Mobile drawer: lock body scroll and close on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const tooltipHandlers = collapsed
    ? { onShowTooltip: showTooltip, onHideTooltip: hideTooltip }
    : undefined;
  const tooltipProps = tooltipHandlers ? { tooltip: tooltipHandlers } : {};

  return (
    <>
      {/* Scrim: tapping outside closes the drawer. */}
      {mobileOpen && (
        <div
          data-testid="sidebar-scrim"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-out',
          'w-[var(--sidebar-width-mobile)]',
          collapsed
            ? 'lg:w-[var(--sidebar-width-collapsed)]'
            : 'lg:w-[var(--sidebar-width-expanded)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <SidebarHeader
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          onCloseMobile={onCloseMobile}
        />

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3" aria-label="Primary">
          {sections.map((group, index) => (
            <SidebarSection
              key={group.section}
              section={group.section}
              collapsed={collapsed}
              isFirst={index === 0}
            >
              {group.items.map((item) =>
                item.children?.length ? (
                  <SidebarCollapsibleGroup
                    key={item.label}
                    item={item}
                    collapsed={collapsed}
                    open={openGroups.has(item.label)}
                    active={isNavItemActive(pathname, item)}
                    onToggle={() => {
                      // Collapsed mode routes the click through onExpandSidebar,
                      // which already opens the group.
                      if (!collapsed) toggleGroup(item.label);
                    }}
                    onExpandSidebar={() => {
                      onToggleCollapse();
                      toggleGroup(item.label);
                    }}
                    onNavigate={onCloseMobile}
                    {...tooltipProps}
                  >
                    {item.children.map((child) => (
                      <SidebarNavItem
                        key={child.to}
                        item={child}
                        collapsed={collapsed}
                        active={isNavPathActive(pathname, child.to, child.matchPaths)}
                        onNavigate={onCloseMobile}
                      />
                    ))}
                  </SidebarCollapsibleGroup>
                ) : (
                  <SidebarNavItem
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                    active={isNavPathActive(pathname, item.to, item.matchPaths)}
                    onNavigate={onCloseMobile}
                    {...tooltipProps}
                  />
                ),
              )}
            </SidebarSection>
          ))}
        </nav>

        {/* Cross-app launcher to the sister product, pinned below the nav. */}
        <SidebarAppSwitcher collapsed={collapsed} />

        <SidebarTooltip tip={tooltip} />
      </aside>
    </>
  );
}
