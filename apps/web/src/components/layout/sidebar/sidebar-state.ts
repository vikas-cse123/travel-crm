import { useCallback, useEffect, useState } from 'react';

/** localStorage key for the desktop sidebar collapse preference. */
export const SIDEBAR_COLLAPSED_KEY = 'interscale.sidebar.collapsed';

/**
 * Safely read the persisted collapse preference. Only the literal string
 * "true" collapses; anything malformed or unavailable falls back to expanded.
 */
export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persist the collapse preference. Storage failures are ignored. */
export function writeSidebarCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch {
    // Storage may be unavailable (private mode, disabled cookies); the
    // preference simply will not survive a reload.
  }
}

/**
 * Desktop sidebar collapse state with localStorage persistence.
 * Defaults to expanded on large desktop screens; never affects the mobile
 * off-canvas drawer (which is controlled separately by AppShell).
 */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState<boolean>(readSidebarCollapsed);

  useEffect(() => {
    writeSidebarCollapsed(collapsed);
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  return { collapsed, toggleCollapsed };
}
