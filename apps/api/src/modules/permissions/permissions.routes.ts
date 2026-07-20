import { Router } from 'express';
import { PERMISSIONS } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/require-permission.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendSuccess } from '../../utils/api-response.js';
import { permissionCatalogService } from './permissions.service.js';
const r = Router();
r.get(
  '/',
  requireAuth,
  requireVerifiedEmail,
  requireAnyPermission(PERMISSIONS.ROLES_VIEW, PERMISSIONS.PERMISSION_TEMPLATES_VIEW),
  asyncHandler(async (_q, s) => sendSuccess(s, await permissionCatalogService.grouped())),
);
export { r as permissionsRoutes };
