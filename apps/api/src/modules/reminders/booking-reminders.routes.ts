import { Router } from 'express';
import { PERMISSIONS, reminderCompleteSchema, reminderCancelSchema } from '@interscale/shared';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { remindersController } from './reminders.controller.js';
import { reminderListSchema } from './reminders.routes.js';

const router = Router();
const id = z.object({ reminderId: z.string().uuid() });
router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/analytics',
  requirePermission(PERMISSIONS.BOOKING_REMINDERS_VIEW),
  asyncHandler(remindersController.bookingAnalytics),
);
router.get(
  '/',
  requirePermission(PERMISSIONS.BOOKING_REMINDERS_VIEW),
  validateRequest({ query: reminderListSchema }),
  asyncHandler(remindersController.bookingList),
);
router.patch(
  '/:reminderId/complete',
  requirePermission(PERMISSIONS.BOOKING_REMINDERS_MANAGE),
  validateRequest({ params: id, body: reminderCompleteSchema }),
  asyncHandler(remindersController.complete),
);
router.post(
  '/:reminderId/complete',
  requirePermission(PERMISSIONS.BOOKING_REMINDERS_MANAGE),
  validateRequest({ params: id, body: reminderCompleteSchema }),
  asyncHandler(remindersController.complete),
);
router.patch(
  '/:reminderId/cancel',
  requirePermission(PERMISSIONS.BOOKING_REMINDERS_MANAGE),
  validateRequest({ params: id, body: reminderCancelSchema }),
  asyncHandler(remindersController.cancel),
);
router.post(
  '/:reminderId/cancel',
  requirePermission(PERMISSIONS.BOOKING_REMINDERS_MANAGE),
  validateRequest({ params: id, body: reminderCancelSchema }),
  asyncHandler(remindersController.cancel),
);
export { router as bookingRemindersRoutes };
