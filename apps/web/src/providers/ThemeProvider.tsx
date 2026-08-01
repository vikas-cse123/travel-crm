import { createContext, useContext, useEffect, useMemo } from 'react';

/**
 * Frontend-only appearance theming.
 *
 * `preference` is what the user picked (light / dark / follow the system);
 * `resolved` is the concrete mode currently painted. The `.dark` class on
 * <html> is the single source of truth Tailwind reads — this provider keeps it
 * in sync with the preference and, for the "system" preference, with the OS.
 *
 * No API or database is involved: the choice lives in localStorage only. The
 * inline boot script in index.html applies the saved class before first paint,
 * so there is no theme flash; this provider re-applies it on every change.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'interscale-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyResolved(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The app ships light-only. Pin light on mount and clear any previously
  // stored dark/system preference so it never reappears. The `useTheme` API is
  // kept as a light-only no-op so existing consumers keep working.
  useEffect(() => {
    applyResolved('light');
    try {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Private-mode storage failures must not break theming.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference: 'light',
      resolved: 'light',
      setPreference: () => {},
      toggle: () => {},
    }),
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Colocated with its provider, matching AuthProvider's convention.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
