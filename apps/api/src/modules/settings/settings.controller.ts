import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { settingsService } from './settings.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const settingsController = {
  get: async (req: Request, res: Response) =>
    sendSuccess(res, await settingsService.get(auth(req))),
  updateProfile: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await settingsService.updateProfile(auth(req), req.body, context(req)),
      'Company profile updated.',
    ),
  updateBranding: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await settingsService.updateBranding(auth(req), req.body, context(req)),
      'Branding updated.',
    ),
  updateTax: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await settingsService.updateTax(auth(req), req.body, context(req)),
      'Tax settings updated.',
    ),
  updatePreferences: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await settingsService.updatePreferences(auth(req), req.body, context(req)),
      'Preferences updated.',
    ),
  updateDefaultTerms: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await settingsService.updateDefaultTerms(auth(req), req.body, context(req)),
      'Default terms updated.',
    ),
  getBankAccount: async (req: Request, res: Response) =>
    sendSuccess(res, await settingsService.getBankAccount(auth(req))),
  putBankAccount: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await settingsService.putBankAccount(auth(req), req.body, context(req)),
      'Bank account saved.',
    ),
  requestLogoUpload: async (req: Request, res: Response) =>
    sendSuccess(res, await settingsService.requestLogoUpload(auth(req), req.body)),
  confirmLogo: async (req: Request, res: Response) =>
    sendSuccess(res, await settingsService.confirmLogo(auth(req), context(req)), 'Logo updated.'),
  logoUrl: async (req: Request, res: Response) =>
    sendSuccess(res, await settingsService.getLogoUrl(auth(req))),
  deleteLogo: async (req: Request, res: Response) =>
    sendSuccess(res, await settingsService.deleteLogo(auth(req), context(req)), 'Logo removed.'),
};
