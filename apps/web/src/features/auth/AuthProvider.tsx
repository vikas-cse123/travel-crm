import { createContext, useContext, useMemo } from 'react';
import type { AuthenticatedUser } from '@interscale/shared';
import { useCurrentUser } from './auth.api';

/**
 * Session state for the whole app.
 *
 * The user lives ONLY in the TanStack Query cache — never in localStorage.
 * That means a signed-out user is one cache invalidation away, there is no
 * stale copy to go out of sync with the server, and nothing sensitive
 * survives in storage a script could read.
 */

interface AuthContextValue {
  user: AuthenticatedUser | null;
  /** True while the initial session lookup is still in flight. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Authenticated but still needs to verify their email address. */
  needsEmailVerification: boolean;
  /** Authenticated AND verified — the only state allowed into the CRM. */
  isFullyAuthenticated: boolean;
  permissions: string[];
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useCurrentUser();

  const value = useMemo<AuthContextValue>(() => {
    const user = data?.user ?? null;
    const isAuthenticated = user !== null;
    const needsEmailVerification = isAuthenticated && !user.emailVerified;
    const permissions = user?.permissions ?? [];

    return {
      user,
      isLoading: isPending,
      isAuthenticated,
      needsEmailVerification,
      isFullyAuthenticated: isAuthenticated && user.emailVerified,
      permissions,
      hasPermission: (key: string) => permissions.includes(key),
    };
  }, [data, isPending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook is intentionally colocated with its provider; this file's Fast
// Refresh boundary is not meaningful in practice.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
