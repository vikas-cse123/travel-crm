import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, reminderRuleInputSchema, reminderRuleUpdateSchema } from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { reminderRulesController } from './reminder-rules.controller.js';
const router = Router();
const id = z.object({ ruleId: z.string().uuid() });
router.use(
  requireAuth,
  requireVerifiedEmail,
  requirePermission(PERMISSIONS.REMINDERS_MANAGE_RULES),
);
router.get('/', asyncHandler(reminderRulesController.list));
router.post(
  '/',
  validateRequest({ body: reminderRuleInputSchema }),
  asyncHandler(reminderRulesController.create),
);
router.post('/reset-defaults', asyncHandler(reminderRulesController.reset));
router.get(
  '/:ruleId',
  validateRequest({ params: id }),
  asyncHandler(reminderRulesController.details),
);
router.patch(
  '/:ruleId',
  validateRequest({ params: id, body: reminderRuleUpdateSchema }),
  asyncHandler(reminderRulesController.update),
);
router.delete(
  '/:ruleId',
  validateRequest({ params: id }),
  asyncHandler(reminderRulesController.delete),
);
router.get(
  '/:ruleId/preview',
  validateRequest({ params: id }),
  asyncHandler(reminderRulesController.preview),
);
router.post(
  '/:ruleId/run-preview',
  validateRequest({ params: id }),
  asyncHandler(reminderRulesController.runPreview),
);
export { router as reminderRulesRoutes };
