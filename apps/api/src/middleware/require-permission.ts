import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { asyncHandler } from '../utils/async-handler.js';
import { permissionsService } from '../modules/auth/permissions.service.js';

export function requirePermission(permission: string) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!(await permissionsService.userHasPermission(req.auth.userId, permission))) {
      throw new ForbiddenError();
    }
    next();
  });
}

export function requireAnyPermission(...permissions: string[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw new UnauthorizedError();
    const keys = await permissionsService.resolveForUser(req.auth.userId);
    if (!permissions.some((permission) => keys.includes(permission))) throw new ForbiddenError();
    next();
  });
}
