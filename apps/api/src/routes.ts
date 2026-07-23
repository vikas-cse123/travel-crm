import { Router } from 'express';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { rolesRoutes } from './modules/roles/roles.routes.js';
import { permissionTemplatesRoutes } from './modules/permission-templates/permission-templates.routes.js';
import { permissionsRoutes } from './modules/permissions/permissions.routes.js';
import { activityLogsRoutes } from './modules/activity-logs/activity-logs.routes.js';
import { queriesRoutes } from './modules/queries/queries.routes.js';
import { followUpsRoutes } from './modules/follow-ups/follow-ups.routes.js';
import { quotationTemplatesRoutes } from './modules/quotation-templates/quotation-templates.routes.js';
import { quotationsRoutes } from './modules/quotations/quotations.routes.js';
import { bookingsRoutes } from './modules/bookings/bookings.routes.js';
import { customersRoutes } from './modules/customers/customers.routes.js';
import { customerTagsRoutes } from './modules/customers/customer-tags.routes.js';
import { vendorsRoutes } from './modules/vendors/vendors.routes.js';
import { remindersRoutes } from './modules/reminders/reminders.routes.js';
import { bookingRemindersRoutes } from './modules/reminders/booking-reminders.routes.js';
import { reminderRulesRoutes } from './modules/reminders/reminder-rules.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { notificationPreferencesRoutes } from './modules/notifications/notification-preferences.routes.js';
import { mastersRoutes } from './modules/masters/masters.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';

/**
 * Single mount point for every module router.
 * Phase 4+ adds: users, roles, permission-templates, activity-logs and
 * companies.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/permission-templates', permissionTemplatesRoutes);
router.use('/activity-logs', activityLogsRoutes);
router.use('/queries', queriesRoutes);
router.use('/follow-ups', followUpsRoutes);
router.use('/quotation-templates', quotationTemplatesRoutes);
router.use('/quotations', quotationsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/customers', customersRoutes);
router.use('/customer-tags', customerTagsRoutes);
router.use('/vendors', vendorsRoutes);
router.use('/reminders', remindersRoutes);
router.use('/booking-reminders', bookingRemindersRoutes);
router.use('/reminder-rules', reminderRulesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/notification-preferences', notificationPreferencesRoutes);
router.use('/masters', mastersRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);

export { router as apiRoutes };
