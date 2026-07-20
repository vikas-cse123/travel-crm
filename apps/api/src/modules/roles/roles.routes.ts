import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, roleInputSchema, roleUpdateSchema } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { rolesController } from './roles.controller.js';
const r = Router(),
  id = z.object({ roleId: z.string().uuid() }),
  q = z.object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().max(100).optional(),
    isSystem: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    sortBy: z.enum(['name', 'hierarchyLevel', 'createdAt', 'updatedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  });
r.use(requireAuth, requireVerifiedEmail);
r.get(
  '/',
  requirePermission(PERMISSIONS.ROLES_VIEW),
  validateRequest({ query: q }),
  asyncHandler(rolesController.list),
);
r.post(
  '/',
  requirePermission(PERMISSIONS.ROLES_CREATE),
  validateRequest({ body: roleInputSchema }),
  asyncHandler(rolesController.create),
);
r.get(
  '/:roleId',
  requirePermission(PERMISSIONS.ROLES_VIEW),
  validateRequest({ params: id }),
  asyncHandler(rolesController.details),
);
r.patch(
  '/:roleId',
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validateRequest({ params: id, body: roleUpdateSchema }),
  asyncHandler(rolesController.update),
);
r.delete(
  '/:roleId',
  requirePermission(PERMISSIONS.ROLES_DELETE),
  validateRequest({ params: id }),
  asyncHandler(rolesController.remove),
);
export { r as rolesRoutes };
