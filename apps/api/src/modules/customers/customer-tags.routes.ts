import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, customerTagInputSchema } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { customersController as c } from './customers.controller.js';

const router = Router();
const params = z.object({ tagId: z.string().uuid() });

router.use(requireAuth, requireVerifiedEmail);
router.get('/', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(c.tags));
router.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ body: customerTagInputSchema }),
  asyncHandler(c.createTag),
);
router.patch(
  '/:tagId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ params, body: customerTagInputSchema.partial() }),
  asyncHandler(c.updateTag),
);
router.delete(
  '/:tagId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ params }),
  asyncHandler(c.deleteTag),
);

export { router as customerTagsRoutes };
