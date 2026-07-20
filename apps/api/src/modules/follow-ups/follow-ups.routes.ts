import { Router } from 'express';
import { z } from 'zod';
import {
  FollowUpOutcome,
  FollowUpStatus,
  LeadStage,
  LeadType,
  QueryPriority,
} from '@prisma/client';
import {
  followUpCancelSchema,
  followUpCompleteSchema,
  followUpUpdateSchema,
  PERMISSIONS,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { followUpsController } from './follow-ups.controller.js';

const router = Router();
const id = z.object({ followUpId: z.string().uuid() });
const date = z.coerce.date();
const list = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  quick: z.enum(['due_today', 'overdue', 'upcoming', 'completed', 'cancelled', 'all']).optional(),
  status: z.nativeEnum(FollowUpStatus).optional(),
  outcome: z.nativeEnum(FollowUpOutcome).optional(),
  assignedToId: z.string().uuid().optional(),
  leadStage: z.nativeEnum(LeadStage).optional(),
  leadType: z.nativeEnum(LeadType).optional(),
  priority: z.nativeEnum(QueryPriority).optional(),
  destination: z.string().trim().max(120).optional(),
  scheduledFrom: date.optional(),
  scheduledTo: date.optional(),
  completedFrom: date.optional(),
  completedTo: date.optional(),
  createdFrom: date.optional(),
  createdTo: date.optional(),
  sortBy: z
    .enum(['scheduledAt', 'completedAt', 'createdAt', 'customerName', 'priority'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/analytics',
  requirePermission(PERMISSIONS.FOLLOWUPS_VIEW),
  asyncHandler(followUpsController.analytics),
);
router.get(
  '/',
  requirePermission(PERMISSIONS.FOLLOWUPS_VIEW),
  validateRequest({ query: list }),
  asyncHandler(followUpsController.list),
);
router.get(
  '/:followUpId',
  requirePermission(PERMISSIONS.FOLLOWUPS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(followUpsController.details),
);
router.patch(
  '/:followUpId',
  requirePermission(PERMISSIONS.FOLLOWUPS_UPDATE),
  validateRequest({ params: id, body: followUpUpdateSchema }),
  asyncHandler(followUpsController.update),
);
router.patch(
  '/:followUpId/complete',
  requirePermission(PERMISSIONS.FOLLOWUPS_UPDATE),
  validateRequest({ params: id, body: followUpCompleteSchema }),
  asyncHandler(followUpsController.complete),
);
router.patch(
  '/:followUpId/cancel',
  requirePermission(PERMISSIONS.FOLLOWUPS_UPDATE),
  validateRequest({ params: id, body: followUpCancelSchema }),
  asyncHandler(followUpsController.cancel),
);
router.delete(
  '/:followUpId',
  requirePermission(PERMISSIONS.FOLLOWUPS_DELETE),
  validateRequest({ params: id }),
  asyncHandler(followUpsController.delete),
);

export { router as followUpsRoutes };
