import { Router } from 'express';
import { z } from 'zod';
import { LeadSource, LeadStage, LeadType, QueryPriority, ServiceType } from '@prisma/client';
import {
  assignmentInputSchema,
  followUpCancelSchema,
  followUpCompleteSchema,
  followUpInputSchema,
  followUpUpdateSchema,
  noteInputSchema,
  noteUpdateSchema,
  PERMISSIONS,
  queryInputSchema,
  queryUpdateSchema,
  stageInputSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { queriesController } from './queries.controller.js';

const router = Router();
const queryId = z.object({ queryId: z.string().uuid() });
const noteId = queryId.extend({ noteId: z.string().uuid() });
const followUpId = queryId.extend({ followUpId: z.string().uuid() });
const date = z.coerce.date();
const paging = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
};
const list = z.object({
  ...paging,
  search: z.string().trim().max(120).optional(),
  leadStage: z.nativeEnum(LeadStage).optional(),
  leadType: z.nativeEnum(LeadType).optional(),
  leadSource: z.nativeEnum(LeadSource).optional(),
  priority: z.nativeEnum(QueryPriority).optional(),
  assignedToId: z.string().uuid().optional(),
  createdById: z.string().uuid().optional(),
  destination: z.string().trim().max(120).optional(),
  serviceType: z.nativeEnum(ServiceType).optional(),
  quotationRequired: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  travelFrom: date.optional(),
  travelTo: date.optional(),
  followUpFrom: date.optional(),
  followUpTo: date.optional(),
  createdFrom: date.optional(),
  createdTo: date.optional(),
  sortBy: z
    .enum([
      'queryNumber',
      'customerName',
      'leadStage',
      'leadType',
      'priority',
      'travelStartDate',
      'nextFollowUpAt',
      'expectedAmount',
      'createdAt',
      'updatedAt',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const timeline = z.object(paging);
const phone = z.object({ phone: z.string().trim().min(5).max(32) });

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/analytics',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  asyncHandler(queriesController.analytics),
);
router.get(
  '/lookups',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  asyncHandler(queriesController.lookups),
);
router.get(
  '/search-by-phone',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  validateRequest({ query: phone }),
  asyncHandler(queriesController.phone),
);
router.get(
  '/',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  validateRequest({ query: list }),
  asyncHandler(queriesController.list),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.QUERIES_CREATE),
  validateRequest({ body: queryInputSchema }),
  asyncHandler(queriesController.create),
);
router.get(
  '/:queryId',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  validateRequest({ params: queryId }),
  asyncHandler(queriesController.details),
);
router.patch(
  '/:queryId',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: queryId, body: queryUpdateSchema }),
  asyncHandler(queriesController.update),
);
router.delete(
  '/:queryId',
  requirePermission(PERMISSIONS.QUERIES_DELETE),
  validateRequest({ params: queryId }),
  asyncHandler(queriesController.archive),
);
router.patch(
  '/:queryId/stage',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: queryId, body: stageInputSchema }),
  asyncHandler(queriesController.stage),
);
router.patch(
  '/:queryId/assignment',
  requirePermission(PERMISSIONS.QUERIES_ASSIGN),
  validateRequest({ params: queryId, body: assignmentInputSchema }),
  asyncHandler(queriesController.assignment),
);
router.get(
  '/:queryId/notes',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  validateRequest({ params: queryId }),
  asyncHandler(queriesController.notes),
);
router.post(
  '/:queryId/notes',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: queryId, body: noteInputSchema }),
  asyncHandler(queriesController.addNote),
);
router.patch(
  '/:queryId/notes/:noteId',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: noteId, body: noteUpdateSchema }),
  asyncHandler(queriesController.updateNote),
);
router.delete(
  '/:queryId/notes/:noteId',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: noteId }),
  asyncHandler(queriesController.deleteNote),
);
router.get(
  '/:queryId/follow-ups',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  validateRequest({ params: queryId }),
  asyncHandler(queriesController.followUps),
);
router.post(
  '/:queryId/follow-ups',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: queryId, body: followUpInputSchema }),
  asyncHandler(queriesController.addFollowUp),
);
router.patch(
  '/:queryId/follow-ups/:followUpId',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: followUpId, body: followUpUpdateSchema }),
  asyncHandler(queriesController.updateFollowUp),
);
router.patch(
  '/:queryId/follow-ups/:followUpId/complete',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: followUpId, body: followUpCompleteSchema }),
  asyncHandler(queriesController.completeFollowUp),
);
router.patch(
  '/:queryId/follow-ups/:followUpId/cancel',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: followUpId, body: followUpCancelSchema }),
  asyncHandler(queriesController.cancelFollowUp),
);
router.delete(
  '/:queryId/follow-ups/:followUpId',
  requirePermission(PERMISSIONS.QUERIES_UPDATE),
  validateRequest({ params: followUpId }),
  asyncHandler(queriesController.deleteFollowUp),
);
router.get(
  '/:queryId/timeline',
  requirePermission(PERMISSIONS.QUERIES_VIEW),
  validateRequest({ params: queryId, query: timeline }),
  asyncHandler(queriesController.timeline),
);
export { router as queriesRoutes };
