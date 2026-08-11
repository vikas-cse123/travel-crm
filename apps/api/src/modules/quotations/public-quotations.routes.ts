import { Router } from 'express';
import { z } from 'zod';
import { publicAcceptSchema, publicRejectSchema, quotationTrackSchema } from '@interscale/shared';
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
        userAgent: req.get('user-agent') ?? null,
        ip: req.ip ?? null,
        authCompanyId: req.auth?.companyId ?? null,
        customDomainCompanyId: req.customDomain?.companyId ?? null,
      }),
    ),
  ),
);
router.post(
  '/:token/track',
  optionalAuth,
  validateRequest({ params: token, body: quotationTrackSchema }),
  asyncHandler(async (req, res) => {
    await quotationsService.trackWeblinkVisit(req.params.token!, req.body, {
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip ?? null,
      authCompanyId: req.auth?.companyId ?? null,
      customDomainCompanyId: req.customDomain?.companyId ?? null,
    });
    sendSuccess(res, { ok: true });
  }),
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
