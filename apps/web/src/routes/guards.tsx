import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Route guards.
 *
 * These are a UX layer, not a security boundary — every guard here has a
 * matching server-side check (`requireAuth`, `requireVerifiedEmail`). Hiding a
 * route only stops an honest user wandering somewhere useless; the API is what
 * actually refuses.
 */

/** Full-screen placeholder while the session lookup is in flight. */
function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span role="status">Loading…</span>
      </span>
    </div>
  );
}

/**
 * Requires a signed-in AND verified user.
 *
 * Unauthenticated visitors are sent to /login with the route they wanted, so
 * they land back on it after signing in. Unverified users go to /verify-email.
 */
export function ProtectedRoute() {
  const { isLoading, isAuthenticated, needsEmailVerification } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (needsEmailVerification) {
    return <Navigate to="/verify-email" replace />;
  }

  return <Outlet />;
}

/**
 * For /login, /signup, /forgot-password: an already-signed-in user has no
 * business here and is bounced onward.
 */
export function PublicOnlyRoute() {
  const { isLoading, isAuthenticated, needsEmailVerification } = useAuth();

  if (isLoading) return <SessionLoading />;

  if (isAuthenticated) {
    return <Navigate to={needsEmailVerification ? '/verify-email' : '/dashboard'} replace />;
  }

  return <Outlet />;
}

/**
 * For /verify-email: requires a session but NOT a verified email — it is the
 * one authenticated route an unverified user may reach. A verified user is
 * redirected away, since there is nothing left to do.
 */
export function VerificationRoute() {
  const { isLoading, isAuthenticated, needsEmailVerification } = useAuth();

  if (isLoading) return <SessionLoading />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!needsEmailVerification) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
