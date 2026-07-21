import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { bookingsService } from './bookings.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});
const id = (req: Request) => req.params.bookingId!;

export const bookingsController = {
  convertFromQuotation: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.convertFromQuotation(
        auth(req),
        req.params.quotationId!,
        req.body,
        context(req),
      ),
      'Quotation converted to booking.',
      201,
    ),
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.list(auth(req), req.query)),
  analytics: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.analytics(auth(req))),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.lookups(auth(req))),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.details(auth(req), id(req))),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.create(auth(req), req.body, context(req)),
      'Booking created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.update(auth(req), id(req), req.body, context(req)),
      'Booking updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.archive(auth(req), id(req), context(req)),
      'Booking archived.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.changeStatus(auth(req), id(req), req.body, context(req)),
      'Booking status updated.',
    ),
  assignment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.assign(auth(req), id(req), req.body.assignedToId, context(req)),
      'Booking assignment updated.',
    ),
  travellers: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.travellers(auth(req), id(req))),
  createTraveller: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createTraveller(auth(req), id(req), req.body, context(req)),
      'Traveller added.',
      201,
    ),
  updateTraveller: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updateTraveller(
        auth(req),
        id(req),
        req.params.travellerId!,
        req.body,
        context(req),
      ),
      'Traveller updated.',
    ),
  deleteTraveller: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deleteTraveller(
        auth(req),
        id(req),
        req.params.travellerId!,
        context(req),
      ),
      'Traveller removed.',
    ),
  services: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.services(auth(req), id(req))),
  createService: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createService(auth(req), id(req), req.body, context(req)),
      'Service added.',
      201,
    ),
  updateService: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updateService(
        auth(req),
        id(req),
        req.params.serviceId!,
        req.body,
        context(req),
      ),
      'Service updated.',
    ),
  serviceStatus: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.changeServiceStatus(
        auth(req),
        id(req),
        req.params.serviceId!,
        req.body,
        context(req),
      ),
      'Service status updated.',
    ),
  linkServiceVendor: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.linkServiceVendor(
        auth(req),
        id(req),
        req.params.serviceId!,
        req.body,
        context(req),
      ),
      'Vendor link updated.',
    ),
  deleteService: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deleteService(auth(req), id(req), req.params.serviceId!, context(req)),
      'Service removed.',
    ),
  itinerary: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.itinerary(auth(req), id(req))),
  createItinerary: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createItineraryDay(auth(req), id(req), req.body, context(req)),
      'Itinerary day added.',
      201,
    ),
  updateItinerary: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updateItineraryDay(
        auth(req),
        id(req),
        req.params.dayId!,
        req.body,
        context(req),
      ),
      'Itinerary updated.',
    ),
  deleteItinerary: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deleteItineraryDay(auth(req), id(req), req.params.dayId!, context(req)),
      'Itinerary day removed.',
    ),
  reorderItinerary: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.reorderItinerary(auth(req), id(req), req.body.orderedIds, context(req)),
      'Itinerary reordered.',
    ),
  schedules: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.paymentSchedules(auth(req), id(req))),
  createSchedule: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createPaymentSchedule(auth(req), id(req), req.body, context(req)),
      'Payment schedule added.',
      201,
    ),
  updateSchedule: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updatePaymentSchedule(
        auth(req),
        id(req),
        req.params.scheduleId!,
        req.body,
        context(req),
      ),
      'Payment schedule updated.',
    ),
  deleteSchedule: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deletePaymentSchedule(
        auth(req),
        id(req),
        req.params.scheduleId!,
        context(req),
      ),
      'Payment schedule removed.',
    ),
  payments: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.payments(auth(req), id(req))),
  createPayment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createPayment(auth(req), id(req), req.body, context(req)),
      'Payment recorded.',
      201,
    ),
  updatePayment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updatePayment(
        auth(req),
        id(req),
        req.params.paymentId!,
        req.body,
        context(req),
      ),
      'Payment updated.',
    ),
  reversePayment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.reversePayment(
        auth(req),
        id(req),
        req.params.paymentId!,
        req.body.reason,
        context(req),
      ),
      'Payment reversed.',
    ),
  costs: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.costs(auth(req), id(req))),
  createCost: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createCost(auth(req), id(req), req.body, context(req)),
      'Cost recorded.',
      201,
    ),
  updateCost: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updateCost(
        auth(req),
        id(req),
        req.params.costId!,
        req.body,
        context(req),
      ),
      'Cost updated.',
    ),
  costStatus: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.changeCostStatus(
        auth(req),
        id(req),
        req.params.costId!,
        req.body,
        context(req),
      ),
      'Cost status updated.',
    ),
  deleteCost: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deleteCost(auth(req), id(req), req.params.costId!, context(req)),
      'Cost removed.',
    ),
  documents: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.documents(auth(req), id(req))),
  requestUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.requestDocumentUpload(auth(req), id(req), req.body),
      'Upload approved.',
      201,
    ),
  confirmUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.confirmDocumentUpload(
        auth(req),
        id(req),
        req.params.documentId!,
        context(req),
      ),
      'Upload confirmed.',
    ),
  download: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.documentDownloadUrl(auth(req), id(req), req.params.documentId!),
    ),
  deleteDocument: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deleteDocument(
        auth(req),
        id(req),
        req.params.documentId!,
        context(req),
      ),
      'Document removed.',
    ),
  notes: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.notes(auth(req), id(req))),
  createNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.createNote(auth(req), id(req), req.body, context(req)),
      'Note added.',
      201,
    ),
  updateNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.updateNote(auth(req), id(req), req.params.noteId!, req.body),
      'Note updated.',
    ),
  deleteNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.deleteNote(auth(req), id(req), req.params.noteId!),
      'Note removed.',
    ),
  timeline: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.timeline(auth(req), id(req), req.query)),
  generateConfirmation: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.generateConfirmationPdf(
        auth(req),
        id(req),
        context(req),
        req.body.force === true,
      ),
      'Booking confirmation ready.',
    ),
  sendConfirmation: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.sendEmail(auth(req), id(req), req.body, 'CONFIRMATION', context(req)),
      'Booking confirmation sent.',
    ),
  sendReminder: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await bookingsService.sendEmail(
        auth(req),
        id(req),
        req.body,
        'PAYMENT_REMINDER',
        context(req),
      ),
      'Payment reminder sent.',
    ),
  emailHistory: async (req: Request, res: Response) =>
    sendSuccess(res, await bookingsService.emailHistory(auth(req), id(req))),
};
