import { Router } from 'express';
import { z } from 'zod';
import { publicAcceptSchema, publicRejectSchema } from '@interscale/shared';
import { asyncHandler } from '../../utils/async-handler.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { optionalAuth } from '../../middleware/authenticate.js';
import { publicQuotationLimiter } from '../../middleware/rate-limiters.js';
import { sendSuccess } from '../../utils/api-response.js';
import { quotationsService } from './quotations.service.js';

const router = Router();
const token = z.object({ token: z.string().min(32).max(200) });
router.use(publicQuotationLimiter);
router.get(
  '/:token',
  optionalAuth,
  validateRequest({ params: token }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await quotationsService.publicView(req.params.token!, {
        userAgent: req.get('user-agent'),
        ip: req.ip ?? null,
        authCompanyId: req.auth?.companyId ?? null,
        customDomainCompanyId: req.customDomain?.companyId ?? null,
      }),
    ),
  ),
);
router.post(
  '/:token/accept',
  validateRequest({ params: token, body: publicAcceptSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await quotationsService.publicDecision(req.params.token!, 'accept', req.body),
      'Quotation accepted.',
    ),
  ),
);
router.post(
  '/:token/reject',
  validateRequest({ params: token, body: publicRejectSchema }),
  asyncHandler(async (req, res) =>
    sendSuccess(
      res,
      await quotationsService.publicDecision(req.params.token!, 'reject', req.body),
      'Quotation rejected.',
    ),
  ),
);
export { router as publicQuotationsRoutes };
