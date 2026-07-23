import { Router } from 'express';
import { PERMISSIONS, dashboardQuerySchema } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { dashboardController as c } from './dashboard.controller.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail);

router.get(
  '/analytics',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  validateRequest({ query: dashboardQuerySchema }),
  asyncHandler(c.analytics),
);
router.get(
  '/operations',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  validateRequest({ query: dashboardQuerySchema }),
  asyncHandler(c.operations),
);

export { router as dashboardRoutes };
