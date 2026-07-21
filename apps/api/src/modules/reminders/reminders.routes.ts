import { Router } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  REMINDER_PRIORITIES,
  REMINDER_SOURCES,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  reminderAssignmentSchema,
  reminderCancelSchema,
  reminderCompleteSchema,
  reminderInputSchema,
  reminderSnoozeSchema,
  reminderUpdateSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { remindersController } from './reminders.controller.js';

const router = Router();
export const reminderListSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(REMINDER_STATUSES).optional(),
  priority: z.enum(REMINDER_PRIORITIES).optional(),
  reminderType: z.enum(REMINDER_TYPES).optional(),
  source: z.enum(REMINDER_SOURCES).optional(),
  assignedToId: z.string().uuid().optional(),
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  sortBy: z.enum(['scheduledAt', 'createdAt', 'reminderPriority', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const id = z.object({ reminderId: z.string().uuid() });

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/analytics',
  requirePermission(PERMISSIONS.REMINDERS_VIEW),
  asyncHandler(remindersController.analytics),
);
router.get(
  '/lookups',
  requirePermission(PERMISSIONS.REMINDERS_VIEW),
  asyncHandler(remindersController.lookups),
);
router.get(
  '/',
  requirePermission(PERMISSIONS.REMINDERS_VIEW),
  validateRequest({ query: reminderListSchema }),
  asyncHandler(remindersController.list),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.REMINDERS_CREATE),
  validateRequest({ body: reminderInputSchema }),
  asyncHandler(remindersController.create),
);
router.get(
  '/:reminderId',
  requirePermission(PERMISSIONS.REMINDERS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(remindersController.details),
);
router.patch(
  '/:reminderId',
  requirePermission(PERMISSIONS.REMINDERS_UPDATE),
  validateRequest({ params: id, body: reminderUpdateSchema }),
  asyncHandler(remindersController.update),
);
router.patch(
  '/:reminderId/complete',
  requirePermission(PERMISSIONS.REMINDERS_COMPLETE),
  validateRequest({ params: id, body: reminderCompleteSchema }),
  asyncHandler(remindersController.complete),
);
router.post(
  '/:reminderId/complete',
  requirePermission(PERMISSIONS.REMINDERS_COMPLETE),
  validateRequest({ params: id, body: reminderCompleteSchema }),
  asyncHandler(remindersController.complete),
);
router.patch(
  '/:reminderId/snooze',
  requirePermission(PERMISSIONS.REMINDERS_SNOOZE),
  validateRequest({ params: id, body: reminderSnoozeSchema }),
  asyncHandler(remindersController.snooze),
);
router.post(
  '/:reminderId/snooze',
  requirePermission(PERMISSIONS.REMINDERS_SNOOZE),
  validateRequest({ params: id, body: reminderSnoozeSchema }),
  asyncHandler(remindersController.snooze),
);
router.patch(
  '/:reminderId/cancel',
  requirePermission(PERMISSIONS.REMINDERS_UPDATE),
  validateRequest({ params: id, body: reminderCancelSchema }),
  asyncHandler(remindersController.cancel),
);
router.post(
  '/:reminderId/cancel',
  requirePermission(PERMISSIONS.REMINDERS_UPDATE),
  validateRequest({ params: id, body: reminderCancelSchema }),
  asyncHandler(remindersController.cancel),
);
router.patch(
  '/:reminderId/assignment',
  requirePermission(PERMISSIONS.REMINDERS_REASSIGN),
  validateRequest({ params: id, body: reminderAssignmentSchema }),
  asyncHandler(remindersController.assign),
);
router.delete(
  '/:reminderId',
  requirePermission(PERMISSIONS.REMINDERS_DELETE),
  validateRequest({ params: id }),
  asyncHandler(remindersController.delete),
);
export { router as remindersRoutes };
