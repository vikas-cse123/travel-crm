import { Router } from 'express';
import { notificationPreferenceSchema, PERMISSIONS } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { notificationsController } from './notifications.controller.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/',
  requirePermission(PERMISSIONS.NOTIFICATIONS_SETTINGS),
  asyncHandler(notificationsController.preferences),
);
router.patch(
  '/',
  requirePermission(PERMISSIONS.NOTIFICATIONS_SETTINGS),
  validateRequest({ body: notificationPreferenceSchema }),
  asyncHandler(notificationsController.updatePreferences),
);
export { router as notificationPreferencesRoutes };
