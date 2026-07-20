import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { ProtectedRoute, PublicOnlyRoute, VerificationRoute } from '@/routes/guards';
import { SignupPage } from '@/pages/auth/SignupPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { UsersPage } from '@/pages/users/UsersPage';
import { NewUserPage } from '@/pages/users/NewUserPage';
import { UserDetailsPage } from '@/pages/users/UserDetailsPage';
import { EditUserPage } from '@/pages/users/EditUserPage';

/**
 * Route table.
 *
 * Three access tiers, each with a matching server-side guard:
 *  - PublicOnlyRoute   — signed-out only; a signed-in user is redirected on.
 *  - VerificationRoute — signed in but NOT yet verified.
 *  - ProtectedRoute    — signed in AND verified. Everything CRM lives here.
 *
 * `/reset-password/:token` is intentionally outside PublicOnlyRoute: a signed-in
 * user following a reset link from their inbox should still be able to use it.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      <Route element={<VerificationRoute />}>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Retained from Phase 1 for infrastructure checks. */}
          <Route path="/system-status" element={<SystemStatusPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/new" element={<NewUserPage />} />
          <Route path="/users/:userId" element={<UserDetailsPage />} />
          <Route path="/users/:userId/edit" element={<EditUserPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
