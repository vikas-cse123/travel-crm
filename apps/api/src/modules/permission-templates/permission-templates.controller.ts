import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { permissionTemplatesService as service } from './permission-templates.service.js';
const auth = (r: Request) => {
  if (!r.auth) throw new UnauthorizedError();
  return r.auth;
};
const ctx = (r: Request) => ({ ipAddress: r.ip ?? null, userAgent: r.get('user-agent') ?? null });
export const permissionTemplatesController = {
  list: async (r: Request, s: Response) => sendSuccess(s, await service.list(auth(r), r.query)),
  details: async (r: Request, s: Response) =>
    sendSuccess(s, await service.details(auth(r), r.params.templateId!)),
  create: async (r: Request, s: Response) =>
    sendSuccess(s, await service.create(auth(r), r.body, ctx(r)), 'Template created.', 201),
  update: async (r: Request, s: Response) =>
    sendSuccess(
      s,
      await service.update(auth(r), r.params.templateId!, r.body, ctx(r)),
      'Template updated.',
    ),
  duplicate: async (r: Request, s: Response) =>
    sendSuccess(
      s,
      await service.duplicate(auth(r), r.params.templateId!, ctx(r)),
      'Template duplicated.',
      201,
    ),
  status: async (r: Request, s: Response) =>
    sendSuccess(
      s,
      await service.status(auth(r), r.params.templateId!, r.body.status, ctx(r)),
      'Template status updated.',
    ),
  remove: async (r: Request, s: Response) =>
    sendSuccess(
      s,
      await service.remove(auth(r), r.params.templateId!, ctx(r)),
      'Template deleted.',
    ),
};
