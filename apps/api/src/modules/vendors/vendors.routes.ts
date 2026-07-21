import { Router } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  VENDOR_CONTRACT_TYPES,
  VENDOR_PAYMENT_STATUSES,
  VENDOR_PAYMENT_TERMS,
  VENDOR_SERVICE_STATUSES,
  VENDOR_STATUSES,
  VENDOR_TYPES,
  vendorBankAccountInputSchema,
  vendorContactInputSchema,
  vendorDocumentUploadSchema,
  vendorDuplicateSchema,
  vendorInputSchema,
  vendorNoteInputSchema,
  vendorPayableInputSchema,
  vendorPaymentInputSchema,
  vendorRateInputSchema,
  vendorRateUpdateSchema,
  vendorServiceInputSchema,
  vendorServiceUpdateSchema,
  vendorUpdateSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { vendorsController as c } from './vendors.controller.js';

const router = Router();
const vendor = z.object({ vendorId: z.string().uuid() });
const child = (key: string) => vendor.extend({ [key]: z.string().uuid() });
const serviceChild = (key?: string) =>
  vendor.extend({ serviceId: z.string().uuid(), ...(key ? { [key]: z.string().uuid() } : {}) });
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const list = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  vendorType: z.enum(VENDOR_TYPES).optional(),
  status: z.enum(VENDOR_STATUSES).optional(),
  paymentStatus: z.enum(VENDOR_PAYMENT_STATUSES).optional(),
  contractType: z.enum(VENDOR_CONTRACT_TYPES).optional(),
  paymentTerm: z.enum(VENDOR_PAYMENT_TERMS).optional(),
  coverageArea: z.string().trim().max(160).optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  hasOutstanding: bool.optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const timeline = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ query: list }),
  asyncHandler(c.list),
);
router.get('/analytics', requirePermission(PERMISSIONS.VENDORS_VIEW), asyncHandler(c.analytics));
router.get('/lookups', requirePermission(PERMISSIONS.VENDORS_VIEW), asyncHandler(c.lookups));
router.get(
  '/duplicates',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ query: vendorDuplicateSchema }),
  asyncHandler(c.duplicates),
);
router.get(
  '/export',
  requirePermission(PERMISSIONS.VENDORS_EXPORT),
  validateRequest({ query: list }),
  asyncHandler(c.export),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.VENDORS_CREATE),
  validateRequest({ body: vendorInputSchema }),
  asyncHandler(c.create),
);
router.get(
  '/:vendorId',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.details),
);
router.patch(
  '/:vendorId',
  requirePermission(PERMISSIONS.VENDORS_UPDATE),
  validateRequest({ params: vendor, body: vendorUpdateSchema }),
  asyncHandler(c.update),
);
router.delete(
  '/:vendorId',
  requirePermission(PERMISSIONS.VENDORS_DELETE),
  validateRequest({ params: vendor }),
  asyncHandler(c.archive),
);
router.patch(
  '/:vendorId/status',
  requirePermission(PERMISSIONS.VENDORS_CHANGE_STATUS),
  validateRequest({ params: vendor, body: z.object({ status: z.enum(VENDOR_STATUSES) }) }),
  asyncHandler(c.status),
);
router.post(
  '/:vendorId/rating',
  requirePermission(PERMISSIONS.VENDORS_UPDATE),
  validateRequest({ params: vendor, body: z.object({ rating: z.coerce.number().min(0).max(5) }) }),
  asyncHandler(c.rating),
);

router.get(
  '/:vendorId/contacts',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.contacts),
);
router.post(
  '/:vendorId/contacts',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_CONTACTS),
  validateRequest({ params: vendor, body: vendorContactInputSchema }),
  asyncHandler(c.createContact),
);
router.patch(
  '/:vendorId/contacts/:contactId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_CONTACTS),
  validateRequest({ params: child('contactId'), body: vendorContactInputSchema.partial() }),
  asyncHandler(c.updateContact),
);
router.delete(
  '/:vendorId/contacts/:contactId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_CONTACTS),
  validateRequest({ params: child('contactId') }),
  asyncHandler(c.deleteContact),
);

router.get(
  '/:vendorId/services',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.services),
);
router.post(
  '/:vendorId/services',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({ params: vendor, body: vendorServiceInputSchema }),
  asyncHandler(c.createService),
);
router.get(
  '/:vendorId/services/:serviceId',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: serviceChild() }),
  asyncHandler(c.service),
);
router.patch(
  '/:vendorId/services/:serviceId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({ params: serviceChild(), body: vendorServiceUpdateSchema }),
  asyncHandler(c.updateService),
);
router.delete(
  '/:vendorId/services/:serviceId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({ params: serviceChild() }),
  asyncHandler(c.deleteService),
);
router.patch(
  '/:vendorId/services/:serviceId/status',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({
    params: serviceChild(),
    body: z.object({ status: z.enum(VENDOR_SERVICE_STATUSES) }),
  }),
  asyncHandler(c.serviceStatus),
);
router.get(
  '/:vendorId/services/:serviceId/rates',
  requirePermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS),
  validateRequest({ params: serviceChild() }),
  asyncHandler(c.rates),
);
router.post(
  '/:vendorId/services/:serviceId/rates',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({ params: serviceChild(), body: vendorRateInputSchema }),
  asyncHandler(c.createRate),
);
router.patch(
  '/:vendorId/services/:serviceId/rates/:rateId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({ params: serviceChild('rateId'), body: vendorRateUpdateSchema }),
  asyncHandler(c.updateRate),
);
router.delete(
  '/:vendorId/services/:serviceId/rates/:rateId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_SERVICES),
  validateRequest({ params: serviceChild('rateId') }),
  asyncHandler(c.deleteRate),
);

router.get(
  '/:vendorId/payables',
  requirePermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS),
  validateRequest({ params: vendor }),
  asyncHandler(c.payables),
);
router.post(
  '/:vendorId/payables',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYABLES),
  validateRequest({ params: vendor, body: vendorPayableInputSchema }),
  asyncHandler(c.createPayable),
);
router.patch(
  '/:vendorId/payables/:payableId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYABLES),
  validateRequest({ params: child('payableId'), body: vendorPayableInputSchema.partial() }),
  asyncHandler(c.updatePayable),
);
router.delete(
  '/:vendorId/payables/:payableId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYABLES),
  validateRequest({ params: child('payableId') }),
  asyncHandler(c.deletePayable),
);
router.get(
  '/:vendorId/payments',
  requirePermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS),
  validateRequest({ params: vendor }),
  asyncHandler(c.payments),
);
router.post(
  '/:vendorId/payments',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS),
  validateRequest({ params: vendor, body: vendorPaymentInputSchema }),
  asyncHandler(c.createPayment),
);
router.get(
  '/:vendorId/payments/:paymentId',
  requirePermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS),
  validateRequest({ params: child('paymentId') }),
  asyncHandler(c.payment),
);
router.post(
  '/:vendorId/payments/:paymentId/reverse',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS),
  validateRequest({
    params: child('paymentId'),
    body: z.object({ reason: z.string().trim().min(3).max(2000) }),
  }),
  asyncHandler(c.reversePayment),
);

router.get(
  '/:vendorId/bank-accounts',
  requirePermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS),
  validateRequest({ params: vendor }),
  asyncHandler(c.bankAccounts),
);
router.post(
  '/:vendorId/bank-accounts',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS),
  validateRequest({ params: vendor, body: vendorBankAccountInputSchema }),
  asyncHandler(c.createBankAccount),
);
router.patch(
  '/:vendorId/bank-accounts/:bankAccountId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS),
  validateRequest({ params: child('bankAccountId'), body: vendorBankAccountInputSchema.partial() }),
  asyncHandler(c.updateBankAccount),
);
router.delete(
  '/:vendorId/bank-accounts/:bankAccountId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_PAYMENTS),
  validateRequest({ params: child('bankAccountId') }),
  asyncHandler(c.deleteBankAccount),
);

router.get(
  '/:vendorId/documents',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.documents),
);
router.post(
  '/:vendorId/documents/uploads',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_DOCUMENTS),
  validateRequest({ params: vendor, body: vendorDocumentUploadSchema }),
  asyncHandler(c.requestDocumentUpload),
);
router.post(
  '/:vendorId/documents/uploads/:documentId/confirm',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_DOCUMENTS),
  validateRequest({ params: child('documentId') }),
  asyncHandler(c.confirmDocumentUpload),
);
router.get(
  '/:vendorId/documents/:documentId/download-url',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: child('documentId') }),
  asyncHandler(c.documentUrl),
);
router.delete(
  '/:vendorId/documents/:documentId',
  requirePermission(PERMISSIONS.VENDORS_MANAGE_DOCUMENTS),
  validateRequest({ params: child('documentId') }),
  asyncHandler(c.deleteDocument),
);

router.get(
  '/:vendorId/notes',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.notes),
);
router.post(
  '/:vendorId/notes',
  requirePermission(PERMISSIONS.VENDORS_UPDATE),
  validateRequest({ params: vendor, body: vendorNoteInputSchema }),
  asyncHandler(c.createNote),
);
router.patch(
  '/:vendorId/notes/:noteId',
  requirePermission(PERMISSIONS.VENDORS_UPDATE),
  validateRequest({ params: child('noteId'), body: vendorNoteInputSchema.partial() }),
  asyncHandler(c.updateNote),
);
router.delete(
  '/:vendorId/notes/:noteId',
  requirePermission(PERMISSIONS.VENDORS_UPDATE),
  validateRequest({ params: child('noteId') }),
  asyncHandler(c.deleteNote),
);
router.get(
  '/:vendorId/bookings',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.bookings),
);
router.get(
  '/:vendorId/booking-services',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor }),
  asyncHandler(c.bookingServices),
);
router.get(
  '/:vendorId/costs',
  requirePermission(PERMISSIONS.VENDORS_VIEW_FINANCIALS),
  validateRequest({ params: vendor }),
  asyncHandler(c.costs),
);
router.get(
  '/:vendorId/timeline',
  requirePermission(PERMISSIONS.VENDORS_VIEW),
  validateRequest({ params: vendor, query: timeline }),
  asyncHandler(c.timeline),
);

export { router as vendorsRoutes };
