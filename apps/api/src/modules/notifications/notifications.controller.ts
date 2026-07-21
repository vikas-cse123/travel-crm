import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { notificationsService } from './notifications.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const notificationsController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await notificationsService.list(auth(req), req.query)),
  analytics: async (req: Request, res: Response) =>
    sendSuccess(res, await notificationsService.analytics(auth(req))),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await notificationsService.details(auth(req), req.params.notificationId!)),
  read: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await notificationsService.setStatus(
        auth(req),
        req.params.notificationId!,
        'READ',
        context(req),
      ),
      'Notification marked read.',
    ),
  unread: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await notificationsService.setStatus(
        auth(req),
        req.params.notificationId!,
        'UNREAD',
        context(req),
      ),
      'Notification marked unread.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await notificationsService.setStatus(
        auth(req),
        req.params.notificationId!,
        'ARCHIVED',
        context(req),
      ),
      'Notification archived.',
    ),
  readAll: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await notificationsService.readAll(auth(req), context(req)),
      'Notifications marked read.',
    ),
  preferences: async (req: Request, res: Response) =>
    sendSuccess(res, await notificationsService.preferences(auth(req))),
  updatePreferences: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await notificationsService.updatePreferences(auth(req), req.body, context(req)),
      'Notification preferences saved.',
    ),
};
