import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { quotationsService } from './quotations.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const quotationsController = {
  async list(req: Request, res: Response) {
    sendSuccess(res, await quotationsService.list(auth(req), req.query));
  },
  async details(req: Request, res: Response) {
    sendSuccess(res, await quotationsService.details(auth(req), req.params.quotationId!));
  },
  async create(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.create(auth(req), req.body, context(req)),
      'Quotation created.',
      201,
    );
  },
  async update(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.update(auth(req), req.params.quotationId!, req.body, context(req)),
      'Quotation updated.',
    );
  },
  async archive(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.archive(auth(req), req.params.quotationId!, context(req)),
      'Quotation archived.',
    );
  },
  async versions(req: Request, res: Response) {
    sendSuccess(res, await quotationsService.versions(auth(req), req.params.quotationId!));
  },
  async version(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.version(auth(req), req.params.quotationId!, req.params.versionId!),
    );
  },
  async createVersion(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.createRevision(
        auth(req),
        req.params.quotationId!,
        req.body.version,
        req.body.sourceVersionId,
        context(req),
      ),
      'Quotation revision created.',
      201,
    );
  },
  async duplicateVersion(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.createRevision(
        auth(req),
        req.params.quotationId!,
        undefined,
        req.params.versionId!,
        context(req),
      ),
      'Quotation version duplicated.',
      201,
    );
  },
  async updateVersion(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.updateVersion(
        auth(req),
        req.params.quotationId!,
        req.params.versionId!,
        req.body,
        context(req),
      ),
      'Quotation version updated.',
    );
  },
  async finalize(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.finalize(
        auth(req),
        req.params.quotationId!,
        req.params.versionId!,
        context(req),
      ),
      'Quotation version finalized.',
    );
  },
  async pdf(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.generatePdf(
        auth(req),
        req.params.quotationId!,
        req.params.versionId!,
        context(req),
        req.body.force === true,
      ),
      'Quotation PDF ready.',
    );
  },
  async documents(req: Request, res: Response) {
    sendSuccess(res, await quotationsService.documents(auth(req), req.params.quotationId!));
  },
  async download(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.downloadUrl(
        auth(req),
        req.params.quotationId!,
        req.params.documentId!,
      ),
    );
  },
  async requestUpload(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.requestUpload(auth(req), req.params.quotationId!, req.body),
      'Upload approved.',
      201,
    );
  },
  async confirmUpload(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.confirmUpload(
        auth(req),
        req.params.quotationId!,
        req.params.documentId!,
        context(req),
      ),
      'Upload confirmed.',
    );
  },
  async deleteDocument(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.deleteDocument(
        auth(req),
        req.params.quotationId!,
        req.params.documentId!,
        context(req),
      ),
      'Document deleted.',
    );
  },
  async send(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.send(auth(req), req.params.quotationId!, req.body, context(req)),
      'Quotation sent.',
    );
  },
  async emailHistory(req: Request, res: Response) {
    sendSuccess(res, await quotationsService.emailHistory(auth(req), req.params.quotationId!));
  },
  async publicLink(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.createPublicLink(
        auth(req),
        req.params.quotationId!,
        req.body.quotationVersionId,
        req.body.expiresAt,
        context(req),
      ),
      'Public link created.',
    );
  },
  async revokePublicLink(req: Request, res: Response) {
    sendSuccess(
      res,
      await quotationsService.revokePublicLink(auth(req), req.params.quotationId!, context(req)),
      'Public link revoked.',
    );
  },
};
