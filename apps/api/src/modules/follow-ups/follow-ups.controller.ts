import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { followUpsService } from './follow-ups.service.js';

function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
function context(req: Request) {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export const followUpsController = {
  async list(req: Request, res: Response) {
    sendSuccess(res, await followUpsService.list(auth(req), req.query));
  },
  async analytics(req: Request, res: Response) {
    sendSuccess(res, await followUpsService.analytics(auth(req)));
  },
  async details(req: Request, res: Response) {
    sendSuccess(res, await followUpsService.details(auth(req), req.params.followUpId!));
  },
  async update(req: Request, res: Response) {
    sendSuccess(
      res,
      await followUpsService.update(auth(req), req.params.followUpId!, req.body, context(req)),
      'Follow-up updated.',
    );
  },
  async complete(req: Request, res: Response) {
    sendSuccess(
      res,
      await followUpsService.complete(auth(req), req.params.followUpId!, req.body, context(req)),
      'Follow-up completed.',
    );
  },
  async cancel(req: Request, res: Response) {
    sendSuccess(
      res,
      await followUpsService.cancel(
        auth(req),
        req.params.followUpId!,
        req.body.reason,
        context(req),
      ),
      'Follow-up cancelled.',
    );
  },
  async delete(req: Request, res: Response) {
    sendSuccess(
      res,
      await followUpsService.delete(auth(req), req.params.followUpId!, context(req)),
      'Follow-up deleted.',
    );
  },
};
