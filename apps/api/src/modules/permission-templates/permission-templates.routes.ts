import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, templateInputSchema, templateUpdateSchema } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { permissionTemplatesController as c } from './permission-templates.controller.js';
const r = Router(),
  id = z.object({ templateId: z.string().uuid() }),
  q = z.object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    createdById: z.string().uuid().optional(),
    sortBy: z.enum(['name', 'status', 'createdAt', 'updatedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  });
r.use(requireAuth, requireVerifiedEmail);
r.get(
  '/',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_VIEW),
  validateRequest({ query: q }),
  asyncHandler(c.list),
);
r.post(
  '/',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_CREATE),
  validateRequest({ body: templateInputSchema }),
  asyncHandler(c.create),
);
r.post(
  '/:templateId/duplicate',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_DUPLICATE),
  validateRequest({ params: id }),
  asyncHandler(c.duplicate),
);
r.patch(
  '/:templateId/status',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_CHANGE_STATUS),
  validateRequest({ params: id, body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }) }),
  asyncHandler(c.status),
);
r.get(
  '/:templateId',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_VIEW),
  validateRequest({ params: id }),
  asyncHandler(c.details),
);
r.patch(
  '/:templateId',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_UPDATE),
  validateRequest({ params: id, body: templateUpdateSchema }),
  asyncHandler(c.update),
);
r.delete(
  '/:templateId',
  requirePermission(PERMISSIONS.PERMISSION_TEMPLATES_DELETE),
  validateRequest({ params: id }),
  asyncHandler(c.remove),
);
export { r as permissionTemplatesRoutes };
