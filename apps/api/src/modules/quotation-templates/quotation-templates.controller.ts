import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { quotationTemplatesService } from './quotation-templates.service.js';
import { quotationsService } from '../quotations/quotations.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const quotationTemplatesController = {
  async list(req: Request, res: Response) {
    sendSuccess(res, await quotationTemplatesService.list(auth(req), req.query));
  },
  async details(req: Request, res: Response) {
    sendSuccess(res, await quotationTemplatesService.details(auth(req), req.params.templateId!));
  },
  async preview(req: Request, res: Response) {
    sendSuccess(res, await quotationTemplatesService.preview(auth(req), req.params.templateId!));
  },
  async create(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationTemplatesService.create(auth(req), req.body, context(req)),
      'Quotation template created.',
      201,
    );
  },
  async update(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationTemplatesService.update(
        auth(req),
        req.params.templateId!,
        req.body,
        context(req),
      ),
      'Quotation template updated.',
    );
  },
  async duplicate(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationTemplatesService.duplicate(auth(req), req.params.templateId!, context(req)),
      'Quotation template duplicated.',
      201,
    );
  },
  async status(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationTemplatesService.status(
        auth(req),
        req.params.templateId!,
        req.body.status,
        context(req),
      ),
      'Template status updated.',
    );
  },
  async archive(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationTemplatesService.archive(auth(req), req.params.templateId!, context(req)),
      'Quotation template archived.',
    );
  },
  async apply(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.create(
        auth(req),
        { queryId: req.params.queryId!, templateId: req.params.templateId! },
        context(req),
      ),
      'Quotation created from template.',
      201,
    );
  },
};
