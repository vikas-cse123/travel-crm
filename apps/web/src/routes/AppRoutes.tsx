import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import {
  PermissionRoute,
  ProtectedRoute,
  PublicOnlyRoute,
  VerificationRoute,
} from '@/routes/guards';
import { PERMISSIONS } from '@interscale/shared';
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
import { RolesPage } from '@/pages/administration/RolesPage';
import { RoleFormPage } from '@/pages/administration/RoleFormPage';
import { RoleDetailsPage } from '@/pages/administration/RoleDetailsPage';
import { TemplatesPage } from '@/pages/administration/TemplatesPage';
import { TemplateFormPage } from '@/pages/administration/TemplateFormPage';
import { TemplateDetailsPage } from '@/pages/administration/TemplateDetailsPage';
import { ActivityLogsPage } from '@/pages/administration/ActivityLogsPage';
import { LeadsPage } from '@/pages/queries/LeadsPage';
import { LeadFormPage } from '@/pages/queries/LeadFormPage';
import { LeadDetailsPage } from '@/pages/queries/LeadDetailsPage';
import { FollowUpsPage } from '@/pages/follow-ups/FollowUpsPage';
import { QuotationTemplatesPage } from '@/pages/quotations/QuotationTemplatesPage';
import { QuotationTemplateDetailsPage } from '@/pages/quotations/QuotationTemplateDetailsPage';
import { QuotationTemplateFormPage } from '@/pages/quotations/QuotationTemplateFormPage';
import { QuotationsPage } from '@/pages/quotations/QuotationsPage';
import { NewQuotationPage } from '@/pages/quotations/NewQuotationPage';
import { QuotationDetailsPage } from '@/pages/quotations/QuotationDetailsPage';
import { QuotationBuilderPage } from '@/pages/quotations/QuotationBuilderPage';
import { PublicQuotationPage } from '@/pages/quotations/PublicQuotationPage';
import { BookingsPage } from '@/pages/bookings/BookingsPage';
import { NewBookingPage } from '@/pages/bookings/NewBookingPage';
import { BookingWorkspacePage } from '@/pages/bookings/BookingWorkspacePage';
import { CustomersPage } from '@/pages/customers/CustomersPage';
import { CustomerFormPage } from '@/pages/customers/CustomerFormPage';
import { CustomerWorkspacePage } from '@/pages/customers/CustomerWorkspacePage';

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
      <Route path="/q/:token" element={<PublicQuotationPage />} />

      <Route element={<VerificationRoute />}>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Retained from Phase 1 for infrastructure checks. */}
          <Route path="/system-status" element={<SystemStatusPage />} />
          <Route
            path="/queries"
            element={
              <PermissionRoute permission={PERMISSIONS.QUERIES_VIEW}>
                <LeadsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/queries/new"
            element={
              <PermissionRoute permission={PERMISSIONS.QUERIES_CREATE}>
                <LeadFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/queries/:queryId"
            element={
              <PermissionRoute permission={PERMISSIONS.QUERIES_VIEW}>
                <LeadDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/follow-ups"
            element={
              <PermissionRoute permission={PERMISSIONS.FOLLOWUPS_VIEW}>
                <FollowUpsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotation-templates"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATION_TEMPLATES_VIEW}>
                <QuotationTemplatesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotation-templates/new"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATION_TEMPLATES_CREATE}>
                <QuotationTemplateFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotation-templates/:templateId"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATION_TEMPLATES_VIEW}>
                <QuotationTemplateDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotation-templates/:templateId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATION_TEMPLATES_UPDATE}>
                <QuotationTemplateFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotations"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATIONS_VIEW}>
                <QuotationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotations/new"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATIONS_CREATE}>
                <NewQuotationPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/queries/:queryId/quotations/new"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATIONS_CREATE}>
                <NewQuotationPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotations/:quotationId"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATIONS_VIEW}>
                <QuotationDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotations/:quotationId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATIONS_UPDATE}>
                <QuotationDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotations/:quotationId/versions/:versionId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.QUOTATIONS_UPDATE}>
                <QuotationBuilderPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <PermissionRoute permission={PERMISSIONS.BOOKINGS_VIEW}>
                <BookingsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/bookings/new"
            element={
              <PermissionRoute permission={PERMISSIONS.BOOKINGS_CREATE}>
                <NewBookingPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/quotations/:quotationId/convert-to-booking"
            element={
              <PermissionRoute permission={PERMISSIONS.BOOKINGS_CONVERT_FROM_QUOTATION}>
                <NewBookingPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/bookings/:bookingId"
            element={
              <PermissionRoute permission={PERMISSIONS.BOOKINGS_VIEW}>
                <BookingWorkspacePage />
              </PermissionRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <PermissionRoute permission={PERMISSIONS.CUSTOMERS_VIEW}>
                <CustomersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/customers/new"
            element={
              <PermissionRoute permission={PERMISSIONS.CUSTOMERS_CREATE}>
                <CustomerFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/customers/:customerId"
            element={
              <PermissionRoute permission={PERMISSIONS.CUSTOMERS_VIEW}>
                <CustomerWorkspacePage />
              </PermissionRoute>
            }
          />
          <Route
            path="/customers/:customerId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.CUSTOMERS_UPDATE}>
                <CustomerFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/queries/:queryId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.QUERIES_UPDATE}>
                <LeadFormPage />
              </PermissionRoute>
            }
          />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/new" element={<NewUserPage />} />
          <Route path="/users/:userId" element={<UserDetailsPage />} />
          <Route path="/users/:userId/edit" element={<EditUserPage />} />
          <Route
            path="/roles"
            element={
              <PermissionRoute permission={PERMISSIONS.ROLES_VIEW}>
                <RolesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/roles/new"
            element={
              <PermissionRoute permission={PERMISSIONS.ROLES_CREATE}>
                <RoleFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/roles/:id"
            element={
              <PermissionRoute permission={PERMISSIONS.ROLES_VIEW}>
                <RoleDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/roles/:id/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.ROLES_UPDATE}>
                <RoleFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/permission-templates"
            element={
              <PermissionRoute permission={PERMISSIONS.PERMISSION_TEMPLATES_VIEW}>
                <TemplatesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/permission-templates/new"
            element={
              <PermissionRoute permission={PERMISSIONS.PERMISSION_TEMPLATES_CREATE}>
                <TemplateFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/permission-templates/:id"
            element={
              <PermissionRoute permission={PERMISSIONS.PERMISSION_TEMPLATES_VIEW}>
                <TemplateDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/permission-templates/:id/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.PERMISSION_TEMPLATES_UPDATE}>
                <TemplateFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/activity-logs"
            element={
              <PermissionRoute permission={PERMISSIONS.ACTIVITY_LOGS_VIEW}>
                <ActivityLogsPage />
              </PermissionRoute>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
