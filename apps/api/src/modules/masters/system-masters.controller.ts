import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { systemMastersService } from './system-masters.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const systemMastersController = {
  hide: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await systemMastersService.hide(
        auth(req),
        req.params.masterType!,
        req.params.masterId!,
        context(req),
      ),
      'Global record hidden for your company.',
    ),

  restore: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await systemMastersService.restore(
        auth(req),
        req.params.masterType!,
        req.params.masterId!,
        context(req),
      ),
      'Global record restored.',
    ),

  listHidden: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await systemMastersService.listHidden(
        auth(req),
        typeof req.query.masterType === 'string' ? req.query.masterType : undefined,
      ),
    ),
};
