import { Router } from 'express';
import { z } from 'zod';
import {
  quotationTemplateInputSchema,
  quotationTemplateUpdateSchema,
  PERMISSIONS,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { quotationTemplatesController as controller } from './quotation-templates.controller.js';

const router = Router();
const id = z.object({ templateId: z.string().uuid() });
const applyId = id.extend({ queryId: z.string().uuid() });
const list = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  destination: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  createdById: z.string().uuid().optional(),
  durationMin: z.coerce.number().int().min(1).optional(),
  durationMax: z.coerce.number().int().min(1).optional(),
  sortBy: z
    .enum(['name', 'durationDays', 'adultBasePrice', 'usageCount', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_VIEW),
  validateRequest({ query: list }),
  asyncHandler(controller.list),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_CREATE),
  validateRequest({ body: quotationTemplateInputSchema }),
  asyncHandler(controller.create),
);
router.get(
  '/:templateId/preview',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_VIEW),
  validateRequest({ params: id }),
  asyncHandler(controller.preview),
);
router.post(
  '/:templateId/duplicate',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_CREATE),
  validateRequest({ params: id }),
  asyncHandler(controller.duplicate),
);
router.patch(
  '/:templateId/status',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_UPDATE),
  validateRequest({ params: id, body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }) }),
  asyncHandler(controller.status),
);
router.post(
  '/:templateId/apply-to-query/:queryId',
  requirePermission(PERMISSIONS.QUOTATIONS_CREATE),
  validateRequest({ params: applyId }),
  asyncHandler(controller.apply),
);
router.get(
  '/:templateId',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_VIEW),
  validateRequest({ params: id }),
  asyncHandler(controller.details),
);
router.patch(
  '/:templateId',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_UPDATE),
  validateRequest({ params: id, body: quotationTemplateUpdateSchema }),
  asyncHandler(controller.update),
);
router.delete(
  '/:templateId',
  requirePermission(PERMISSIONS.QUOTATION_TEMPLATES_DELETE),
  validateRequest({ params: id }),
  asyncHandler(controller.archive),
);
export { router as quotationTemplatesRoutes };
