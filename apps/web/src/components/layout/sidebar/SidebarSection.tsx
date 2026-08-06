import type { ReactNode } from 'react';
import { NAV_SECTION_LABELS, type NavSection } from '../navigation';
import { cn } from '@/utils/cn';

interface SidebarSectionProps {
  section: NavSection;
  collapsed: boolean;
  /** First rendered section gets tighter top spacing. */
  isFirst: boolean;
  children: ReactNode;
}

/**
 * One labelled group of navigation items. In the collapsed rail the heading is
 * replaced by a subtle divider; empty sections are filtered by the caller.
 */
export function SidebarSection({ section, collapsed, isFirst, children }: SidebarSectionProps) {
  if (collapsed) {
    return (
      <section aria-label={NAV_SECTION_LABELS[section]} className={cn(isFirst ? '' : 'mt-2')}>
        <div className="mx-3 my-2 border-t border-sidebar-border/70" aria-hidden="true" />
        {children}
      </section>
    );
  }

  return (
    <section aria-label={NAV_SECTION_LABELS[section]} className={cn(isFirst ? '' : 'mt-4')}>
      <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {NAV_SECTION_LABELS[section]}
      </p>
      {children}
    </section>
  );
}
