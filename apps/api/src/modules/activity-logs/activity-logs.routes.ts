import { Router } from 'express';
import { z } from 'zod';
import { ActivityAction } from '@prisma/client';
import { PERMISSIONS } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { activityLogsService } from './activity-logs.service.js';
const r = Router(),
  q = z.object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().max(100).optional(),
    actorUserId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
    action: z.nativeEnum(ActivityAction).optional(),
    entityType: z.string().trim().max(40).optional(),
    entityId: z.string().uuid().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  });
r.get(
  '/',
  requireAuth,
  requireVerifiedEmail,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_VIEW),
  validateRequest({ query: q }),
  asyncHandler(async (req, res) => {
    if (!req.auth) throw new UnauthorizedError();
    sendSuccess(res, await activityLogsService.list(req.auth, req.query));
  }),
);
export { r as activityLogsRoutes };
