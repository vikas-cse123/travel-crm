import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { rolesService } from './roles.service.js';
const auth = (r: Request) => {
  if (!r.auth) throw new UnauthorizedError();
  return r.auth;
};
const ctx = (r: Request) => ({ ipAddress: r.ip ?? null, userAgent: r.get('user-agent') ?? null });
export const rolesController = {
  list: async (r: Request, s: Response) =>
    sendSuccess(s, await rolesService.list(auth(r), r.query)),
  details: async (r: Request, s: Response) =>
    sendSuccess(s, await rolesService.details(auth(r), r.params.roleId!)),
  create: async (r: Request, s: Response) =>
    sendSuccess(s, await rolesService.create(auth(r), r.body, ctx(r)), 'Role created.', 201),
  update: async (r: Request, s: Response) =>
    sendSuccess(
      s,
      await rolesService.update(auth(r), r.params.roleId!, r.body, ctx(r)),
      'Role updated.',
    ),
  remove: async (r: Request, s: Response) =>
    sendSuccess(s, await rolesService.remove(auth(r), r.params.roleId!, ctx(r)), 'Role deleted.'),
};
