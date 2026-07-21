import { Router } from 'express';
import { z } from 'zod';
import {
  CUSTOMER_LIFECYCLE_STAGES,
  CUSTOMER_STATUSES,
  PERMISSIONS,
  customerAddressInputSchema,
  customerAssignmentSchema,
  customerCommunicationInputSchema,
  customerCommunicationUpdateSchema,
  customerDocumentUploadSchema,
  customerDuplicateCheckSchema,
  customerInputSchema,
  customerMergeSchema,
  customerNoteInputSchema,
  customerNoteUpdateSchema,
  customerStatusSchema,
  customerTagAssignmentSchema,
  customerTagInputSchema,
  customerUpdateSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { customersController as c } from './customers.controller.js';

const router = Router();
const customerId = z.object({ customerId: z.string().uuid() });
const child = (name: string) => customerId.extend({ [name]: z.string().uuid() });
const tagId = z.object({ tagId: z.string().uuid() });
const mergeIds = z.object({
  sourceCustomerId: z.string().uuid(),
  targetCustomerId: z.string().uuid(),
});
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(160).optional(),
  customerType: z.enum(['INDIVIDUAL', 'CORPORATE', 'AGENT', 'GROUP']).optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  lifecycleStage: z.enum(CUSTOMER_LIFECYCLE_STAGES).optional(),
  assignedToId: z.string().uuid().optional(),
  createdById: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  tagIds: z.union([z.string().uuid(), z.string().regex(/^[0-9a-fA-F,-]+$/)]).optional(),
  isRepeatCustomer: booleanQuery.optional(),
  isVip: booleanQuery.optional(),
  hasOutstandingBalance: booleanQuery.optional(),
  lastBookingFrom: z.coerce.date().optional(),
  lastBookingTo: z.coerce.date().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  minBookedValue: z.coerce.number().min(0).optional(),
  maxBookedValue: z.coerce.number().min(0).optional(),
  totalBookingValueMin: z.coerce.number().min(0).optional(),
  totalBookingValueMax: z.coerce.number().min(0).optional(),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const timelineSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ query: listSchema }),
  asyncHandler(c.list),
);
router.post(
  '/check-duplicates',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ body: customerDuplicateCheckSchema }),
  asyncHandler(c.checkDuplicates),
);
router.get('/analytics', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(c.analytics));
router.get('/lookups', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(c.lookups));
router.get('/export', requirePermission(PERMISSIONS.CUSTOMERS_EXPORT), asyncHandler(c.export));
router.get(
  '/duplicates',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ query: customerDuplicateCheckSchema }),
  asyncHandler(c.duplicates),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMERS_CREATE),
  validateRequest({ body: customerInputSchema }),
  asyncHandler(c.create),
);

router.get('/tags', requirePermission(PERMISSIONS.CUSTOMERS_VIEW), asyncHandler(c.tags));
router.post(
  '/tags',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ body: customerTagInputSchema }),
  asyncHandler(c.createTag),
);
router.patch(
  '/tags/:tagId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ params: tagId, body: customerTagInputSchema.partial() }),
  asyncHandler(c.updateTag),
);
router.delete(
  '/tags/:tagId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ params: tagId }),
  asyncHandler(c.deleteTag),
);

router.post(
  '/merge/preview',
  requirePermission(PERMISSIONS.CUSTOMERS_MERGE),
  validateRequest({ body: customerMergeSchema }),
  asyncHandler(c.mergePreview),
);
router.post(
  '/merge',
  requirePermission(PERMISSIONS.CUSTOMERS_MERGE),
  validateRequest({ body: customerMergeSchema }),
  asyncHandler(c.merge),
);
router.get(
  '/:sourceCustomerId/merge-preview/:targetCustomerId',
  requirePermission(PERMISSIONS.CUSTOMERS_MERGE),
  validateRequest({ params: mergeIds }),
  asyncHandler(c.mergePreviewByPath),
);
router.post(
  '/:sourceCustomerId/merge/:targetCustomerId',
  requirePermission(PERMISSIONS.CUSTOMERS_MERGE),
  validateRequest({
    params: mergeIds,
    body: customerMergeSchema.omit({ sourceCustomerId: true, targetCustomerId: true }).extend({
      confirmation: z.literal(true),
    }),
  }),
  asyncHandler(c.mergeByPath),
);

router.get(
  '/:customerId',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.details),
);
router.patch(
  '/:customerId',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  validateRequest({ params: customerId, body: customerUpdateSchema }),
  asyncHandler(c.update),
);
router.delete(
  '/:customerId',
  requirePermission(PERMISSIONS.CUSTOMERS_DELETE),
  validateRequest({ params: customerId }),
  asyncHandler(c.archive),
);
router.patch(
  '/:customerId/status',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  validateRequest({ params: customerId, body: customerStatusSchema }),
  asyncHandler(c.status),
);
router.patch(
  '/:customerId/assignment',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  validateRequest({ params: customerId, body: customerAssignmentSchema }),
  asyncHandler(c.assignment),
);

router.get(
  '/:customerId/addresses',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.addresses),
);
router.post(
  '/:customerId/addresses',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  validateRequest({ params: customerId, body: customerAddressInputSchema }),
  asyncHandler(c.createAddress),
);
router.patch(
  '/:customerId/addresses/:addressId',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  validateRequest({ params: child('addressId'), body: customerAddressInputSchema.partial() }),
  asyncHandler(c.updateAddress),
);
router.delete(
  '/:customerId/addresses/:addressId',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  validateRequest({ params: child('addressId') }),
  asyncHandler(c.deleteAddress),
);

router.post(
  '/:customerId/tags',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ params: customerId, body: customerTagAssignmentSchema }),
  asyncHandler(c.attachTag),
);
router.delete(
  '/:customerId/tags/:tagId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_TAGS),
  validateRequest({ params: child('tagId') }),
  asyncHandler(c.detachTag),
);

router.get(
  '/:customerId/notes',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.notes),
);
router.post(
  '/:customerId/notes',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES),
  validateRequest({ params: customerId, body: customerNoteInputSchema }),
  asyncHandler(c.createNote),
);
router.patch(
  '/:customerId/notes/:noteId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES),
  validateRequest({ params: child('noteId'), body: customerNoteUpdateSchema }),
  asyncHandler(c.updateNote),
);
router.delete(
  '/:customerId/notes/:noteId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES),
  validateRequest({ params: child('noteId') }),
  asyncHandler(c.deleteNote),
);

router.get(
  '/:customerId/communications',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.communications),
);
router.post(
  '/:customerId/communications',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES),
  validateRequest({ params: customerId, body: customerCommunicationInputSchema }),
  asyncHandler(c.createCommunication),
);
router.patch(
  '/:customerId/communications/:communicationId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES),
  validateRequest({ params: child('communicationId'), body: customerCommunicationUpdateSchema }),
  asyncHandler(c.updateCommunication),
);
router.delete(
  '/:customerId/communications/:communicationId',
  requirePermission(PERMISSIONS.CUSTOMERS_MANAGE_NOTES),
  validateRequest({ params: child('communicationId') }),
  asyncHandler(c.deleteCommunication),
);

router.get(
  '/:customerId/leads',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.leads),
);
router.get(
  '/:customerId/quotations',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.quotations),
);
router.get(
  '/:customerId/bookings',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.bookings),
);
router.get(
  '/:customerId/travellers',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId }),
  asyncHandler(c.travellers),
);
router.get(
  '/:customerId/payments',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW_FINANCIALS),
  validateRequest({ params: customerId }),
  asyncHandler(c.payments),
);
router.get(
  '/:customerId/timeline',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  validateRequest({ params: customerId, query: timelineSchema }),
  asyncHandler(c.timeline),
);

router.get(
  '/:customerId/documents',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
  validateRequest({ params: customerId }),
  asyncHandler(c.documents),
);
router.post(
  '/:customerId/documents/upload',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
  validateRequest({ params: customerId, body: customerDocumentUploadSchema }),
  asyncHandler(c.requestDocumentUpload),
);
router.post(
  '/:customerId/documents/:documentId/confirm',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
  validateRequest({ params: child('documentId') }),
  asyncHandler(c.confirmDocumentUpload),
);
router.get(
  '/:customerId/documents/:documentId/url',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
  validateRequest({ params: child('documentId') }),
  asyncHandler(c.documentUrl),
);
router.delete(
  '/:customerId/documents/:documentId',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW_DOCUMENTS),
  validateRequest({ params: child('documentId') }),
  asyncHandler(c.deleteDocument),
);
router.get(
  '/:customerId/merge-history',
  requirePermission(PERMISSIONS.CUSTOMERS_MERGE),
  validateRequest({ params: customerId }),
  asyncHandler(c.mergeHistory),
);

export { router as customersRoutes };
