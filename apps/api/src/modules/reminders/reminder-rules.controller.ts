import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { reminderRulesService } from './reminder-rules.service.js';
const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});
export const reminderRulesController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, {
      rules: await reminderRulesService.list(auth(req)),
      leadStages: reminderRulesService.leadStages,
    }),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await reminderRulesService.details(auth(req), req.params.ruleId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await reminderRulesService.create(auth(req), req.body, context(req)),
      'Reminder rule created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await reminderRulesService.update(auth(req), req.params.ruleId!, req.body, context(req)),
      'Reminder rule updated.',
    ),
  delete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await reminderRulesService.delete(auth(req), req.params.ruleId!, context(req)),
      'Reminder rule deleted.',
    ),
  reset: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await reminderRulesService.reset(auth(req), context(req)),
      'Default rules restored.',
    ),
  preview: async (req: Request, res: Response) =>
    sendSuccess(res, await reminderRulesService.preview(auth(req), req.params.ruleId!)),
  runPreview: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await reminderRulesService.runPreview(auth(req), req.params.ruleId!),
      'Rule processed.',
    ),
};
