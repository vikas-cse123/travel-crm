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
import { RemindersPage } from '@/pages/reminders/RemindersPage';
import { ReminderFormPage } from '@/pages/reminders/ReminderFormPage';
import { BookingRemindersPage } from '@/pages/reminders/BookingRemindersPage';
import { NotificationsPage } from '@/pages/reminders/NotificationsPage';
import { NotificationSettingsPage } from '@/pages/reminders/NotificationSettingsPage';
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
import { VendorsPage } from '@/pages/vendors/VendorsPage';
import { VendorFormPage } from '@/pages/vendors/VendorFormPage';
import { VendorWorkspacePage } from '@/pages/vendors/VendorWorkspacePage';
import { VendorServicesPage } from '@/pages/vendors/VendorServicesPage';
import { VendorServiceFormPage } from '@/pages/vendors/VendorServiceFormPage';
import { CitiesPage } from '@/pages/masters/CitiesPage';
import { CityDetailsPage } from '@/pages/masters/CityDetailsPage';
import { CityFormPage } from '@/pages/masters/CityFormPage';
import { DestinationsPage } from '@/pages/masters/DestinationsPage';
import { DestinationDetailsPage } from '@/pages/masters/DestinationDetailsPage';
import { DestinationFormPage } from '@/pages/masters/DestinationFormPage';
import { HotelsPage } from '@/pages/masters/HotelsPage';
import { HotelDetailsPage } from '@/pages/masters/HotelDetailsPage';
import { HotelFormPage } from '@/pages/masters/HotelFormPage';
import { AirlinesPage } from '@/pages/masters/AirlinesPage';
import { AirlineDetailsPage } from '@/pages/masters/AirlineDetailsPage';
import { AirlineFormPage } from '@/pages/masters/AirlineFormPage';
import { CruisesPage } from '@/pages/masters/CruisesPage';
import { CruiseDetailsPage } from '@/pages/masters/CruiseDetailsPage';
import { CruiseFormPage } from '@/pages/masters/CruiseFormPage';
import { VehiclesPage } from '@/pages/masters/VehiclesPage';
import { VehicleDetailsPage } from '@/pages/masters/VehicleDetailsPage';
import { VehicleFormPage } from '@/pages/masters/VehicleFormPage';
import { SightseeingPage } from '@/pages/masters/SightseeingPage';
import { SightseeingDetailsPage } from '@/pages/masters/SightseeingDetailsPage';
import { SightseeingFormPage } from '@/pages/masters/SightseeingFormPage';
import { AddOnServicesPage } from '@/pages/masters/AddOnServicesPage';
import { AddOnServiceDetailsPage } from '@/pages/masters/AddOnServiceDetailsPage';
import { AddOnServiceFormPage } from '@/pages/masters/AddOnServiceFormPage';

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
          <Route
            path="/dashboard"
            element={
              <PermissionRoute permission={PERMISSIONS.DASHBOARD_VIEW}>
                <DashboardPage />
              </PermissionRoute>
            }
          />
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
          <Route path="/follow-ups" element={<Navigate to="/reminders" replace />} />
          <Route
            path="/reminders"
            element={
              <PermissionRoute permission={PERMISSIONS.REMINDERS_VIEW}>
                <RemindersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/reminders/new"
            element={
              <PermissionRoute permission={PERMISSIONS.REMINDERS_CREATE}>
                <ReminderFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/reminders/bookings"
            element={
              <PermissionRoute permission={PERMISSIONS.BOOKING_REMINDERS_VIEW}>
                <BookingRemindersPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/reminders/notifications"
            element={
              <PermissionRoute permission={PERMISSIONS.NOTIFICATIONS_VIEW}>
                <NotificationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/reminders/settings"
            element={
              <PermissionRoute permission={PERMISSIONS.NOTIFICATIONS_SETTINGS}>
                <NotificationSettingsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/reminders/:reminderId"
            element={
              <PermissionRoute permission={PERMISSIONS.REMINDERS_VIEW}>
                <ReminderFormPage />
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
            path="/vendors"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_VIEW}>
                <VendorsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/vendors/new"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_CREATE}>
                <VendorFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/vendors/:vendorId"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_VIEW}>
                <VendorWorkspacePage />
              </PermissionRoute>
            }
          />
          <Route
            path="/vendors/:vendorId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_UPDATE}>
                <VendorFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/vendors/:vendorId/services"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_VIEW}>
                <VendorServicesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/vendors/:vendorId/services/new"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_MANAGE_SERVICES}>
                <VendorServiceFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/vendors/:vendorId/services/:serviceId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.VENDORS_MANAGE_SERVICES}>
                <VendorServiceFormPage />
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
          <Route
            path="/masters/cities"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CITIES_VIEW}>
                <CitiesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cities/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CITIES_CREATE}>
                <CityFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cities/:cityId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CITIES_VIEW}>
                <CityDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cities/:cityId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CITIES_UPDATE}>
                <CityFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/destinations"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_DESTINATIONS_VIEW}>
                <DestinationsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/destinations/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_DESTINATIONS_CREATE}>
                <DestinationFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/destinations/:destinationId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_DESTINATIONS_VIEW}>
                <DestinationDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/destinations/:destinationId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_DESTINATIONS_UPDATE}>
                <DestinationFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/hotels"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_HOTELS_VIEW}>
                <HotelsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/hotels/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_HOTELS_CREATE}>
                <HotelFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/hotels/:hotelId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_HOTELS_VIEW}>
                <HotelDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/hotels/:hotelId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_HOTELS_UPDATE}>
                <HotelFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/airlines"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_AIRLINES_VIEW}>
                <AirlinesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/airlines/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_AIRLINES_CREATE}>
                <AirlineFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/airlines/:airlineId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_AIRLINES_VIEW}>
                <AirlineDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/airlines/:airlineId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_AIRLINES_UPDATE}>
                <AirlineFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cruises"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CRUISES_VIEW}>
                <CruisesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cruises/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CRUISES_CREATE}>
                <CruiseFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cruises/:cruiseId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CRUISES_VIEW}>
                <CruiseDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/cruises/:cruiseId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_CRUISES_UPDATE}>
                <CruiseFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/vehicles"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_VEHICLES_VIEW}>
                <VehiclesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/vehicles/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_VEHICLES_CREATE}>
                <VehicleFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/vehicles/:vehicleId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_VEHICLES_VIEW}>
                <VehicleDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/vehicles/:vehicleId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_VEHICLES_UPDATE}>
                <VehicleFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/sightseeing"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_SIGHTSEEING_VIEW}>
                <SightseeingPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/sightseeing/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_SIGHTSEEING_CREATE}>
                <SightseeingFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/sightseeing/:sightseeingId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_SIGHTSEEING_VIEW}>
                <SightseeingDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/sightseeing/:sightseeingId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_SIGHTSEEING_UPDATE}>
                <SightseeingFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/add-on-services"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW}>
                <AddOnServicesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/add-on-services/new"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_ADD_ON_SERVICES_CREATE}>
                <AddOnServiceFormPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/add-on-services/:addOnServiceId"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW}>
                <AddOnServiceDetailsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/masters/add-on-services/:addOnServiceId/edit"
            element={
              <PermissionRoute permission={PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE}>
                <AddOnServiceFormPage />
              </PermissionRoute>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
