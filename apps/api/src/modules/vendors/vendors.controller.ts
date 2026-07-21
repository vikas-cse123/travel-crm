import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { vendorsService as service } from './vendors.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});
const vendorId = (req: Request) => req.params.vendorId!;

export const vendorsController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await service.list(auth(req), req.query)),
  analytics: async (req: Request, res: Response) =>
    sendSuccess(res, await service.analytics(auth(req))),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await service.lookups(auth(req))),
  export: async (req: Request, res: Response) =>
    sendSuccess(res, await service.export(auth(req), req.query)),
  duplicates: async (req: Request, res: Response) =>
    sendSuccess(res, await service.duplicates(auth(req), req.query)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.create(auth(req), req.body, context(req)),
      'Vendor created.',
      201,
    ),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await service.details(auth(req), vendorId(req))),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.update(auth(req), vendorId(req), req.body, context(req)),
      'Vendor updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.archive(auth(req), vendorId(req), context(req)),
      'Vendor archived.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.status(auth(req), vendorId(req), req.body.status, context(req)),
      'Vendor status updated.',
    ),
  rating: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.rating(auth(req), vendorId(req), req.body.rating, context(req)),
      'Vendor rating updated.',
    ),
  contacts: async (req: Request, res: Response) =>
    sendSuccess(res, await service.contacts(auth(req), vendorId(req))),
  createContact: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createContact(auth(req), vendorId(req), req.body, context(req)),
      'Contact created.',
      201,
    ),
  updateContact: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.updateContact(
        auth(req),
        vendorId(req),
        req.params.contactId!,
        req.body,
        context(req),
      ),
      'Contact updated.',
    ),
  deleteContact: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deleteContact(auth(req), vendorId(req), req.params.contactId!),
      'Contact deleted.',
    ),
  services: async (req: Request, res: Response) =>
    sendSuccess(res, await service.services(auth(req), vendorId(req))),
  service: async (req: Request, res: Response) =>
    sendSuccess(res, await service.service(auth(req), vendorId(req), req.params.serviceId!)),
  createService: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createService(auth(req), vendorId(req), req.body, context(req)),
      'Service created.',
      201,
    ),
  updateService: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.updateService(
        auth(req),
        vendorId(req),
        req.params.serviceId!,
        req.body,
        context(req),
      ),
      'Service updated.',
    ),
  deleteService: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deleteService(auth(req), vendorId(req), req.params.serviceId!, context(req)),
      'Service archived.',
    ),
  serviceStatus: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.serviceStatus(
        auth(req),
        vendorId(req),
        req.params.serviceId!,
        req.body.status,
        context(req),
      ),
      'Service status updated.',
    ),
  rates: async (req: Request, res: Response) =>
    sendSuccess(res, await service.rates(auth(req), vendorId(req), req.params.serviceId!)),
  createRate: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createRate(
        auth(req),
        vendorId(req),
        req.params.serviceId!,
        req.body,
        context(req),
      ),
      'Rate created.',
      201,
    ),
  updateRate: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.updateRate(
        auth(req),
        vendorId(req),
        req.params.serviceId!,
        req.params.rateId!,
        req.body,
        context(req),
      ),
      'Rate updated.',
    ),
  deleteRate: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deleteRate(auth(req), vendorId(req), req.params.serviceId!, req.params.rateId!),
      'Rate deleted.',
    ),
  payables: async (req: Request, res: Response) =>
    sendSuccess(res, await service.payables(auth(req), vendorId(req))),
  createPayable: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createPayable(auth(req), vendorId(req), req.body, context(req)),
      'Payable created.',
      201,
    ),
  updatePayable: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.updatePayable(
        auth(req),
        vendorId(req),
        req.params.payableId!,
        req.body,
        context(req),
      ),
      'Payable updated.',
    ),
  deletePayable: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deletePayable(auth(req), vendorId(req), req.params.payableId!),
      'Payable deleted.',
    ),
  payments: async (req: Request, res: Response) =>
    sendSuccess(res, await service.payments(auth(req), vendorId(req))),
  payment: async (req: Request, res: Response) =>
    sendSuccess(res, await service.payment(auth(req), vendorId(req), req.params.paymentId!)),
  createPayment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createPayment(auth(req), vendorId(req), req.body, context(req)),
      'Payment recorded.',
      201,
    ),
  reversePayment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.reversePayment(
        auth(req),
        vendorId(req),
        req.params.paymentId!,
        req.body.reason,
        context(req),
      ),
      'Payment reversed.',
    ),
  bankAccounts: async (req: Request, res: Response) =>
    sendSuccess(res, await service.bankAccounts(auth(req), vendorId(req))),
  createBankAccount: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createBankAccount(auth(req), vendorId(req), req.body),
      'Bank account created.',
      201,
    ),
  updateBankAccount: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.updateBankAccount(
        auth(req),
        vendorId(req),
        req.params.bankAccountId!,
        req.body,
      ),
      'Bank account updated.',
    ),
  deleteBankAccount: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deleteBankAccount(auth(req), vendorId(req), req.params.bankAccountId!),
      'Bank account deleted.',
    ),
  documents: async (req: Request, res: Response) =>
    sendSuccess(res, await service.documents(auth(req), vendorId(req))),
  requestDocumentUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.requestDocumentUpload(auth(req), vendorId(req), req.body),
      'Upload approved.',
      201,
    ),
  confirmDocumentUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.confirmDocumentUpload(
        auth(req),
        vendorId(req),
        req.params.documentId!,
        context(req),
      ),
      'Upload confirmed.',
    ),
  documentUrl: async (req: Request, res: Response) =>
    sendSuccess(res, await service.documentUrl(auth(req), vendorId(req), req.params.documentId!)),
  deleteDocument: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deleteDocument(auth(req), vendorId(req), req.params.documentId!, context(req)),
      'Document deleted.',
    ),
  notes: async (req: Request, res: Response) =>
    sendSuccess(res, await service.notes(auth(req), vendorId(req))),
  createNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.createNote(auth(req), vendorId(req), req.body, context(req)),
      'Note created.',
      201,
    ),
  updateNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.updateNote(auth(req), vendorId(req), req.params.noteId!, req.body),
      'Note updated.',
    ),
  deleteNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await service.deleteNote(auth(req), vendorId(req), req.params.noteId!),
      'Note deleted.',
    ),
  bookings: async (req: Request, res: Response) =>
    sendSuccess(res, await service.relationship(auth(req), vendorId(req), 'bookings')),
  bookingServices: async (req: Request, res: Response) =>
    sendSuccess(res, await service.relationship(auth(req), vendorId(req), 'booking-services')),
  costs: async (req: Request, res: Response) =>
    sendSuccess(res, await service.relationship(auth(req), vendorId(req), 'costs')),
  timeline: async (req: Request, res: Response) =>
    sendSuccess(res, await service.timeline(auth(req), vendorId(req), req.query)),
};
