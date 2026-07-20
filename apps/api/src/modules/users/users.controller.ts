import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { usersService } from './users.service.js';

function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
function context(req: Request) {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export const usersController = {
  async list(req: Request, res: Response) {
    sendSuccess(res, await usersService.list(auth(req), req.query));
  },
  async details(req: Request, res: Response) {
    sendSuccess(res, await usersService.details(auth(req), req.params.userId!));
  },
  async lookups(req: Request, res: Response) {
    sendSuccess(res, await usersService.lookups(auth(req)));
  },
  async create(req: Request, res: Response) {
    sendSuccess(
      res,
      await usersService.create(auth(req), req.body, context(req)),
      'User created.',
      201,
    );
  },
  async update(req: Request, res: Response) {
    sendSuccess(
      res,
      await usersService.update(auth(req), req.params.userId!, req.body, context(req)),
      'User updated.',
    );
  },
  async status(req: Request, res: Response) {
    sendSuccess(
      res,
      await usersService.changeStatus(
        auth(req),
        req.params.userId!,
        req.body.status,
        req.body.reason,
        context(req),
      ),
      'User status updated.',
    );
  },
  async archive(req: Request, res: Response) {
    sendSuccess(
      res,
      await usersService.archive(auth(req), req.params.userId!, context(req)),
      'User archived.',
    );
  },
  async reset(req: Request, res: Response) {
    sendSuccess(
      res,
      await usersService.sendPasswordReset(auth(req), req.params.userId!, context(req)),
      'Password-reset instructions have been sent.',
    );
  },
  async activity(req: Request, res: Response) {
    sendSuccess(res, await usersService.activity(auth(req), req.params.userId!, req.query));
  },
};
