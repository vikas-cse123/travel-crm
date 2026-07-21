import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { remindersService } from './reminders.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const remindersController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await remindersService.list(auth(req), req.query)),
  analytics: async (req: Request, res: Response) =>
    sendSuccess(res, await remindersService.analytics(auth(req))),
  bookingList: async (req: Request, res: Response) =>
    sendSuccess(res, await remindersService.list(auth(req), { ...req.query, bookingOnly: true })),
  bookingAnalytics: async (req: Request, res: Response) =>
    sendSuccess(res, await remindersService.analytics(auth(req), true)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await remindersService.details(auth(req), req.params.reminderId!)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await remindersService.lookups(auth(req))),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.create(auth(req), req.body, context(req)),
      'Reminder created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.update(auth(req), req.params.reminderId!, req.body, context(req)),
      'Reminder updated.',
    ),
  complete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.complete(auth(req), req.params.reminderId!, req.body, context(req)),
      'Reminder completed.',
    ),
  snooze: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.snooze(
        auth(req),
        req.params.reminderId!,
        req.body.until,
        req.body.reason,
        context(req),
      ),
      'Reminder snoozed.',
    ),
  cancel: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.cancel(
        auth(req),
        req.params.reminderId!,
        req.body.reason,
        context(req),
      ),
      'Reminder cancelled.',
    ),
  assign: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.assign(
        auth(req),
        req.params.reminderId!,
        req.body.assignedToId,
        context(req),
      ),
      'Reminder reassigned.',
    ),
  delete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await remindersService.delete(auth(req), req.params.reminderId!, context(req)),
      'Reminder deleted.',
    ),
};
