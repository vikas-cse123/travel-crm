import { Router } from 'express';
import { z } from 'zod';
import { ActivityAction, UserStatus } from '@prisma/client';
import { createUserSchema, updateUserSchema, PERMISSIONS } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { usersController } from './users.controller.js';

const router = Router();
const id = z.object({ userId: z.string().uuid() });
const date = z.coerce.date();
const paging = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
};
const list = z.object({
  ...paging,
  search: z.string().trim().max(120).optional(),
  roleId: z.string().uuid().optional(),
  status: z.nativeEnum(UserStatus).optional(),
  sortBy: z
    .enum(['fullName', 'username', 'email', 'status', 'lastLoginAt', 'createdAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  createdFrom: date.optional(),
  createdTo: date.optional(),
});
const activity = z.object({
  ...paging,
  action: z.nativeEnum(ActivityAction).optional(),
  dateFrom: date.optional(),
  dateTo: date.optional(),
});
const status = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  reason: z.string().trim().max(500).optional(),
});

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/lookups',
  requirePermission(PERMISSIONS.USERS_VIEW),
  asyncHandler(usersController.lookups),
);
router.get(
  '/',
  requirePermission(PERMISSIONS.USERS_VIEW),
  validateRequest({ query: list }),
  asyncHandler(usersController.list),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.USERS_CREATE),
  validateRequest({ body: createUserSchema }),
  asyncHandler(usersController.create),
);
router.get(
  '/:userId/activity',
  requirePermission(PERMISSIONS.USERS_VIEW),
  validateRequest({ params: id, query: activity }),
  asyncHandler(usersController.activity),
);
router.post(
  '/:userId/send-password-reset',
  requirePermission(PERMISSIONS.USERS_RESET_PASSWORD),
  validateRequest({ params: id }),
  asyncHandler(usersController.reset),
);
router.patch(
  '/:userId/status',
  requirePermission(PERMISSIONS.USERS_CHANGE_STATUS),
  validateRequest({ params: id, body: status }),
  asyncHandler(usersController.status),
);
router.get(
  '/:userId',
  requirePermission(PERMISSIONS.USERS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(usersController.details),
);
router.patch(
  '/:userId',
  requirePermission(PERMISSIONS.USERS_UPDATE),
  validateRequest({ params: id, body: updateUserSchema }),
  asyncHandler(usersController.update),
);
router.delete(
  '/:userId',
  requirePermission(PERMISSIONS.USERS_ARCHIVE),
  validateRequest({ params: id }),
  asyncHandler(usersController.archive),
);
export { router as usersRoutes };
