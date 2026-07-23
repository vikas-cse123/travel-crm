import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { dashboardService } from './dashboard.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

export const dashboardController = {
  analytics: async (req: Request, res: Response) =>
    sendSuccess(res, await dashboardService.analytics(auth(req), req.query as never)),
  operations: async (req: Request, res: Response) =>
    sendSuccess(res, await dashboardService.operations(auth(req), req.query as never)),
};
