import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { reportsService } from './reports.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

/** Reports are read-only: no request writes an activity log. */
export const reportsController = {
  summary: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.summary(auth(req), req.query as never)),
  leads: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.leads(auth(req), req.query as never)),
  quotations: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.quotations(auth(req), req.query as never)),
  bookings: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.bookings(auth(req), req.query as never)),
  clientPayments: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.clientPayments(auth(req), req.query as never)),
  vendorPayables: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.vendorPayables(auth(req), req.query as never)),
  staffConversions: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.staffConversions(auth(req), req.query as never)),
  staffFinancials: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.staffFinancials(auth(req), req.query as never)),
  leadSources: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.leadSources(auth(req), req.query as never)),
  destinations: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.destinations(auth(req), req.query as never)),

  // CSV exports keep the existing { fileName, mimeType, content } contract and
  // add exportedCount / truncated / rowLimit metadata.
  quotationsCsv: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.quotationsCsv(auth(req), req.query as never)),
  bookingsCsv: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.bookingsCsv(auth(req), req.query as never)),
  clientPaymentsCsv: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.clientPaymentsCsv(auth(req), req.query as never)),
  vendorPayablesCsv: async (req: Request, res: Response) =>
    sendSuccess(res, await reportsService.vendorPayablesCsv(auth(req), req.query as never)),
};
