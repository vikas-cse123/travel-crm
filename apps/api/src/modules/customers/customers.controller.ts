import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { customersService } from './customers.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});
const customerId = (req: Request) => req.params.customerId!;

export const customersController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.list(auth(req), req.query)),
  analytics: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.analytics(auth(req))),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.lookups(auth(req))),
  export: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.export(auth(req))),
  duplicates: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.duplicates(auth(req), req.query)),
  checkDuplicates: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.duplicates(auth(req), req.body)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.create(auth(req), req.body, context(req)),
      'Customer created.',
      201,
    ),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.details(auth(req), customerId(req))),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.update(auth(req), customerId(req), req.body, context(req)),
      'Customer updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.archive(auth(req), customerId(req), context(req)),
      'Customer archived.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.status(auth(req), customerId(req), req.body.status, context(req)),
      'Customer status updated.',
    ),
  assignment: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.assignment(
        auth(req),
        customerId(req),
        req.body.assignedToId,
        context(req),
      ),
      'Customer assignment updated.',
    ),
  addresses: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.addresses(auth(req), customerId(req))),
  createAddress: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.createAddress(auth(req), customerId(req), req.body),
      'Address added.',
      201,
    ),
  updateAddress: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.updateAddress(
        auth(req),
        customerId(req),
        req.params.addressId!,
        req.body,
      ),
      'Address updated.',
    ),
  deleteAddress: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.deleteAddress(auth(req), customerId(req), req.params.addressId!),
      'Address removed.',
    ),
  tags: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.tags(auth(req))),
  createTag: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.createTag(auth(req), req.body), 'Tag created.', 201),
  updateTag: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.updateTag(auth(req), req.params.tagId!, req.body),
      'Tag updated.',
    ),
  deleteTag: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.deleteTag(auth(req), req.params.tagId!),
      'Tag deleted.',
    ),
  attachTag: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.attachTag(auth(req), customerId(req), req.body.tagId, context(req)),
      'Tag attached.',
    ),
  detachTag: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.detachTag(auth(req), customerId(req), req.params.tagId!, context(req)),
      'Tag detached.',
    ),
  notes: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.notes(auth(req), customerId(req))),
  createNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.createNote(auth(req), customerId(req), req.body, context(req)),
      'Note added.',
      201,
    ),
  updateNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.updateNote(
        auth(req),
        customerId(req),
        req.params.noteId!,
        req.body,
        context(req),
      ),
      'Note updated.',
    ),
  deleteNote: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.deleteNote(
        auth(req),
        customerId(req),
        req.params.noteId!,
        context(req),
      ),
      'Note deleted.',
    ),
  communications: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.communications(auth(req), customerId(req))),
  createCommunication: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.createCommunication(
        auth(req),
        customerId(req),
        req.body,
        context(req),
      ),
      'Communication recorded.',
      201,
    ),
  updateCommunication: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.updateCommunication(
        auth(req),
        customerId(req),
        req.params.communicationId!,
        req.body,
        context(req),
      ),
      'Communication updated.',
    ),
  deleteCommunication: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.deleteCommunication(
        auth(req),
        customerId(req),
        req.params.communicationId!,
        context(req),
      ),
      'Communication deleted.',
    ),
  leads: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.relationships(auth(req), customerId(req), 'leads')),
  quotations: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.relationships(auth(req), customerId(req), 'quotations'),
    ),
  bookings: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.relationships(auth(req), customerId(req), 'bookings')),
  travellers: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.relationships(auth(req), customerId(req), 'travellers'),
    ),
  payments: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.relationships(auth(req), customerId(req), 'payments')),
  documents: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.documents(auth(req), customerId(req))),
  requestDocumentUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.requestDocumentUpload(auth(req), customerId(req), req.body),
      'Upload approved.',
      201,
    ),
  confirmDocumentUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.confirmDocumentUpload(
        auth(req),
        customerId(req),
        req.params.documentId!,
        context(req),
      ),
      'Document upload confirmed.',
    ),
  documentUrl: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.documentUrl(auth(req), customerId(req), req.params.documentId!),
    ),
  deleteDocument: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.deleteDocument(
        auth(req),
        customerId(req),
        req.params.documentId!,
        context(req),
      ),
      'Document deleted.',
    ),
  timeline: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.timeline(auth(req), customerId(req), req.query)),
  mergePreview: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.mergePreview(auth(req), req.body)),
  mergePreviewByPath: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.mergePreview(auth(req), {
        sourceCustomerId: req.params.sourceCustomerId!,
        targetCustomerId: req.params.targetCustomerId!,
        fieldChoices: {},
      }),
    ),
  merge: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.merge(auth(req), req.body, context(req)),
      'Customers merged.',
    ),
  mergeByPath: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await customersService.merge(
        auth(req),
        {
          ...req.body,
          sourceCustomerId: req.params.sourceCustomerId!,
          targetCustomerId: req.params.targetCustomerId!,
        },
        context(req),
      ),
      'Customers merged.',
    ),
  mergeHistory: async (req: Request, res: Response) =>
    sendSuccess(res, await customersService.mergeHistory(auth(req), customerId(req))),
};
