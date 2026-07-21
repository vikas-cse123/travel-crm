import { Router } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  quotationInputSchema,
  quotationUpdateSchema,
  quotationVersionInputSchema,
  quotationVersionUpdateSchema,
  quotationSendSchema,
  publicLinkSchema,
  uploadRequestSchema,
  quotationConversionInputSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { quotationsController as controller } from './quotations.controller.js';
import { bookingsController } from '../bookings/bookings.controller.js';

const router = Router();
const id = z.object({ quotationId: z.string().uuid() });
const versionId = id.extend({ versionId: z.string().uuid() });
const documentId = id.extend({ documentId: z.string().uuid() });
const list = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  status: z
    .enum(['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'ARCHIVED'])
    .optional(),
  createdById: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  destination: z.string().trim().max(120).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ query: list }),
  asyncHandler(controller.list),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.QUOTATIONS_CREATE),
  validateRequest({ body: quotationInputSchema }),
  asyncHandler(controller.create),
);
router.post(
  '/:quotationId/convert-to-booking',
  requireAnyPermission(PERMISSIONS.BOOKINGS_CONVERT_FROM_QUOTATION, PERMISSIONS.BOOKINGS_CREATE),
  validateRequest({ params: id, body: quotationConversionInputSchema }),
  asyncHandler(bookingsController.convertFromQuotation),
);
router.get(
  '/:quotationId/versions',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(controller.versions),
);
router.post(
  '/:quotationId/versions',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({
    params: id,
    body: z
      .object({
        sourceVersionId: z.string().uuid().optional(),
        version: quotationVersionInputSchema.optional(),
      })
      .refine(
        (v) => v.sourceVersionId || v.version,
        'A source version or version body is required.',
      ),
  }),
  asyncHandler(controller.createVersion),
);
router.get(
  '/:quotationId/versions/:versionId',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ params: versionId }),
  asyncHandler(controller.version),
);
router.post(
  '/:quotationId/versions/:versionId/duplicate',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: versionId }),
  asyncHandler(controller.duplicateVersion),
);
router.patch(
  '/:quotationId/versions/:versionId',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: versionId, body: quotationVersionUpdateSchema }),
  asyncHandler(controller.updateVersion),
);
router.post(
  '/:quotationId/versions/:versionId/finalize',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: versionId }),
  asyncHandler(controller.finalize),
);
router.post(
  '/:quotationId/versions/:versionId/generate-pdf',
  requirePermission(PERMISSIONS.QUOTATIONS_GENERATE_PDF),
  validateRequest({
    params: versionId,
    body: z.object({ force: z.boolean().optional() }).default({}),
  }),
  asyncHandler(controller.pdf),
);
router.get(
  '/:quotationId/documents',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(controller.documents),
);
router.get(
  '/:quotationId/documents/:documentId/download-url',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ params: documentId }),
  asyncHandler(controller.download),
);
router.delete(
  '/:quotationId/documents/:documentId',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: documentId }),
  asyncHandler(controller.deleteDocument),
);
router.post(
  '/:quotationId/uploads',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: id, body: uploadRequestSchema }),
  asyncHandler(controller.requestUpload),
);
router.post(
  '/:quotationId/uploads/:documentId/confirm',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: documentId }),
  asyncHandler(controller.confirmUpload),
);
router.post(
  '/:quotationId/send',
  requirePermission(PERMISSIONS.QUOTATIONS_SEND),
  validateRequest({ params: id, body: quotationSendSchema }),
  asyncHandler(controller.send),
);
router.get(
  '/:quotationId/email-history',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(controller.emailHistory),
);
router.post(
  '/:quotationId/public-link',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: id, body: publicLinkSchema }),
  asyncHandler(controller.publicLink),
);
router.delete(
  '/:quotationId/public-link',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: id }),
  asyncHandler(controller.revokePublicLink),
);
router.get(
  '/:quotationId',
  requirePermission(PERMISSIONS.QUOTATIONS_VIEW),
  validateRequest({ params: id }),
  asyncHandler(controller.details),
);
router.patch(
  '/:quotationId',
  requirePermission(PERMISSIONS.QUOTATIONS_UPDATE),
  validateRequest({ params: id, body: quotationUpdateSchema }),
  asyncHandler(controller.update),
);
router.delete(
  '/:quotationId',
  requirePermission(PERMISSIONS.QUOTATIONS_DELETE),
  validateRequest({ params: id }),
  asyncHandler(controller.archive),
);
export { router as quotationsRoutes };
