import { Router } from 'express';
import { z } from 'zod';
import {
  BOOKING_PAYMENT_STATUSES,
  BOOKING_STATUSES,
  OPERATIONAL_STATUSES,
  PERMISSIONS,
  bookingAssignmentInputSchema,
  bookingCostInputSchema,
  bookingCostStatusSchema,
  bookingCostUpdateSchema,
  bookingDocumentUploadSchema,
  bookingEmailInputSchema,
  bookingItineraryInputSchema,
  bookingItineraryReorderSchema,
  bookingItineraryUpdateSchema,
  bookingManualInputSchema,
  bookingNoteInputSchema,
  bookingNoteUpdateSchema,
  bookingPaymentInputSchema,
  bookingPaymentReversalSchema,
  bookingPaymentScheduleInputSchema,
  bookingPaymentScheduleUpdateSchema,
  bookingPaymentUpdateSchema,
  bookingServiceInputSchema,
  bookingServiceStatusSchema,
  bookingServiceUpdateSchema,
  vendorBookingLinkSchema,
  bookingStatusInputSchema,
  bookingUpdateSchema,
  travellerInputSchema,
  travellerUpdateSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { bookingsController as c } from './bookings.controller.js';

const router = Router();
const bookingId = z.object({ bookingId: z.string().uuid() });
const childId = (name: string) => bookingId.extend({ [name]: z.string().uuid() });
const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  bookingStatus: z.enum(BOOKING_STATUSES).optional(),
  operationalStatus: z.enum(OPERATIONAL_STATUSES).optional(),
  paymentStatus: z.enum(BOOKING_PAYMENT_STATUSES).optional(),
  assignedToId: z.string().uuid().optional(),
  bookedById: z.string().uuid().optional(),
  destination: z.string().trim().max(120).optional(),
  travelFrom: z.coerce.date().optional(),
  travelTo: z.coerce.date().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  paymentDueFrom: z.coerce.date().optional(),
  paymentDueTo: z.coerce.date().optional(),
  amountMin: z.coerce.number().min(0).optional(),
  amountMax: z.coerce.number().min(0).optional(),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
const timelineQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});
const force = z.object({ force: z.boolean().optional() }).default({});

router.use(requireAuth, requireVerifiedEmail);
router.get(
  '/',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ query: listSchema }),
  asyncHandler(c.list),
);
router.get('/analytics', requirePermission(PERMISSIONS.BOOKINGS_VIEW), asyncHandler(c.analytics));
router.get('/lookups', requirePermission(PERMISSIONS.BOOKINGS_VIEW), asyncHandler(c.lookups));
router.post(
  '/',
  requirePermission(PERMISSIONS.BOOKINGS_CREATE),
  validateRequest({ body: bookingManualInputSchema }),
  asyncHandler(c.create),
);
router.get(
  '/:bookingId',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.details),
);
router.patch(
  '/:bookingId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: bookingId, body: bookingUpdateSchema }),
  asyncHandler(c.update),
);
router.delete(
  '/:bookingId',
  requirePermission(PERMISSIONS.BOOKINGS_DELETE),
  validateRequest({ params: bookingId }),
  asyncHandler(c.archive),
);
router.patch(
  '/:bookingId/status',
  requirePermission(PERMISSIONS.BOOKINGS_CHANGE_STATUS),
  validateRequest({ params: bookingId, body: bookingStatusInputSchema }),
  asyncHandler(c.status),
);
router.patch(
  '/:bookingId/assignment',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: bookingId, body: bookingAssignmentInputSchema }),
  asyncHandler(c.assignment),
);

router.get(
  '/:bookingId/travellers',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.travellers),
);
router.post(
  '/:bookingId/travellers',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_TRAVELLERS),
  validateRequest({ params: bookingId, body: travellerInputSchema }),
  asyncHandler(c.createTraveller),
);
router.patch(
  '/:bookingId/travellers/:travellerId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_TRAVELLERS),
  validateRequest({ params: childId('travellerId'), body: travellerUpdateSchema }),
  asyncHandler(c.updateTraveller),
);
router.delete(
  '/:bookingId/travellers/:travellerId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_TRAVELLERS),
  validateRequest({ params: childId('travellerId') }),
  asyncHandler(c.deleteTraveller),
);

router.get(
  '/:bookingId/services',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.services),
);
router.post(
  '/:bookingId/services',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: bookingId, body: bookingServiceInputSchema }),
  asyncHandler(c.createService),
);
router.patch(
  '/:bookingId/services/:serviceId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('serviceId'), body: bookingServiceUpdateSchema }),
  asyncHandler(c.updateService),
);
router.patch(
  '/:bookingId/services/:serviceId/status',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('serviceId'), body: bookingServiceStatusSchema }),
  asyncHandler(c.serviceStatus),
);
router.patch(
  '/:bookingId/services/:serviceId/vendor',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('serviceId'), body: vendorBookingLinkSchema }),
  asyncHandler(c.linkServiceVendor),
);
router.delete(
  '/:bookingId/services/:serviceId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('serviceId') }),
  asyncHandler(c.deleteService),
);

router.get(
  '/:bookingId/itinerary',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.itinerary),
);
router.post(
  '/:bookingId/itinerary',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: bookingId, body: bookingItineraryInputSchema }),
  asyncHandler(c.createItinerary),
);
router.patch(
  '/:bookingId/itinerary/:dayId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('dayId'), body: bookingItineraryUpdateSchema }),
  asyncHandler(c.updateItinerary),
);
router.delete(
  '/:bookingId/itinerary/:dayId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('dayId') }),
  asyncHandler(c.deleteItinerary),
);
router.post(
  '/:bookingId/itinerary/reorder',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: bookingId, body: bookingItineraryReorderSchema }),
  asyncHandler(c.reorderItinerary),
);

router.get(
  '/:bookingId/payment-schedules',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.schedules),
);
router.post(
  '/:bookingId/payment-schedules',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS),
  validateRequest({ params: bookingId, body: bookingPaymentScheduleInputSchema }),
  asyncHandler(c.createSchedule),
);
router.patch(
  '/:bookingId/payment-schedules/:scheduleId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS),
  validateRequest({ params: childId('scheduleId'), body: bookingPaymentScheduleUpdateSchema }),
  asyncHandler(c.updateSchedule),
);
router.delete(
  '/:bookingId/payment-schedules/:scheduleId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS),
  validateRequest({ params: childId('scheduleId') }),
  asyncHandler(c.deleteSchedule),
);

router.get(
  '/:bookingId/payments',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW_FINANCIALS),
  validateRequest({ params: bookingId }),
  asyncHandler(c.payments),
);
router.post(
  '/:bookingId/payments',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS),
  validateRequest({ params: bookingId, body: bookingPaymentInputSchema }),
  asyncHandler(c.createPayment),
);
router.patch(
  '/:bookingId/payments/:paymentId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS),
  validateRequest({ params: childId('paymentId'), body: bookingPaymentUpdateSchema }),
  asyncHandler(c.updatePayment),
);
router.post(
  '/:bookingId/payments/:paymentId/reverse',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_PAYMENTS),
  validateRequest({ params: childId('paymentId'), body: bookingPaymentReversalSchema }),
  asyncHandler(c.reversePayment),
);

router.get(
  '/:bookingId/costs',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW_FINANCIALS),
  validateRequest({ params: bookingId }),
  asyncHandler(c.costs),
);
router.post(
  '/:bookingId/costs',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_COSTS),
  validateRequest({ params: bookingId, body: bookingCostInputSchema }),
  asyncHandler(c.createCost),
);
router.patch(
  '/:bookingId/costs/:costId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_COSTS),
  validateRequest({ params: childId('costId'), body: bookingCostUpdateSchema }),
  asyncHandler(c.updateCost),
);
router.patch(
  '/:bookingId/costs/:costId/status',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_COSTS),
  validateRequest({ params: childId('costId'), body: bookingCostStatusSchema }),
  asyncHandler(c.costStatus),
);
router.delete(
  '/:bookingId/costs/:costId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_COSTS),
  validateRequest({ params: childId('costId') }),
  asyncHandler(c.deleteCost),
);

router.get(
  '/:bookingId/documents',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.documents),
);
router.post(
  '/:bookingId/documents/uploads',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_DOCUMENTS),
  validateRequest({ params: bookingId, body: bookingDocumentUploadSchema }),
  asyncHandler(c.requestUpload),
);
router.post(
  '/:bookingId/documents/uploads/:documentId/confirm',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_DOCUMENTS),
  validateRequest({ params: childId('documentId') }),
  asyncHandler(c.confirmUpload),
);
router.get(
  '/:bookingId/documents/:documentId/download-url',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: childId('documentId') }),
  asyncHandler(c.download),
);
router.delete(
  '/:bookingId/documents/:documentId',
  requirePermission(PERMISSIONS.BOOKINGS_MANAGE_DOCUMENTS),
  validateRequest({ params: childId('documentId') }),
  asyncHandler(c.deleteDocument),
);

router.get(
  '/:bookingId/notes',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.notes),
);
router.post(
  '/:bookingId/notes',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: bookingId, body: bookingNoteInputSchema }),
  asyncHandler(c.createNote),
);
router.patch(
  '/:bookingId/notes/:noteId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('noteId'), body: bookingNoteUpdateSchema }),
  asyncHandler(c.updateNote),
);
router.delete(
  '/:bookingId/notes/:noteId',
  requirePermission(PERMISSIONS.BOOKINGS_UPDATE),
  validateRequest({ params: childId('noteId') }),
  asyncHandler(c.deleteNote),
);
router.get(
  '/:bookingId/timeline',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId, query: timelineQuery }),
  asyncHandler(c.timeline),
);

router.post(
  '/:bookingId/generate-confirmation',
  requirePermission(PERMISSIONS.BOOKINGS_EXPORT),
  validateRequest({ params: bookingId, body: force }),
  asyncHandler(c.generateConfirmation),
);
router.post(
  '/:bookingId/send-confirmation',
  requirePermission(PERMISSIONS.BOOKINGS_SEND_CONFIRMATION),
  validateRequest({ params: bookingId, body: bookingEmailInputSchema }),
  asyncHandler(c.sendConfirmation),
);
router.post(
  '/:bookingId/send-payment-reminder',
  requirePermission(PERMISSIONS.BOOKINGS_SEND_CONFIRMATION),
  validateRequest({ params: bookingId, body: bookingEmailInputSchema }),
  asyncHandler(c.sendReminder),
);
router.get(
  '/:bookingId/email-history',
  requirePermission(PERMISSIONS.BOOKINGS_VIEW),
  validateRequest({ params: bookingId }),
  asyncHandler(c.emailHistory),
);

export { router as bookingsRoutes };
