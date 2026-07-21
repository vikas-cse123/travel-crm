import { Router } from 'express';
import { z } from 'zod';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_STATUSES, PERMISSIONS } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { notificationsController } from './notifications.controller.js';

const router = Router();
const id = z.object({ notificationId: z.string().uuid() });
router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/analytics',
  requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW),
  asyncHandler(notificationsController.analytics),
);
router.get(
  '/',
  requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW),
  validateRequest({
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
      search: z.string().trim().max(120).optional(),
      status: z.enum(NOTIFICATION_STATUSES).optional(),
      category: z.enum(NOTIFICATION_CATEGORIES).optional(),
    }),
  }),
  asyncHandler(notificationsController.list),
);
router.patch(
  '/read-all',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  asyncHandler(notificationsController.readAll),
);
router.post(
  '/read-all',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  asyncHandler(notificationsController.readAll),
);
router.get(
  '/:notificationId',
  requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.details),
);
router.patch(
  '/:notificationId/read',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.read),
);
router.post(
  '/:notificationId/read',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.read),
);
router.patch(
  '/:notificationId/unread',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.unread),
);
router.post(
  '/:notificationId/unread',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.unread),
);
router.patch(
  '/:notificationId/archive',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.archive),
);
router.post(
  '/:notificationId/archive',
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE),
  validateRequest({ params: id }),
  asyncHandler(notificationsController.archive),
);
export { router as notificationsRoutes };
