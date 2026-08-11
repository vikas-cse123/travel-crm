import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ERROR_CODES, type FieldErrors } from '@interscale/shared';
import { logger } from '../config/logger.js';
import { isAppError } from '../utils/errors.js';
import { sendError } from '../utils/api-response.js';
import { NotFoundError } from '../utils/errors.js';
import { getRequestId } from './request-id.js';

/** Flatten a ZodError into `{ fieldPath: [messages] }` for form rendering. */
export function zodErrorToFields(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    const existing = fields[key];
    if (existing) {
      existing.push(issue.message);
    } else {
      fields[key] = [issue.message];
    }
  }
  return fields;
}

/** 404 for any route that reached the end of the stack unmatched. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

function isDatabaseUnavailableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Error &&
      /can't reach database server|database server is running|connection refused/i.test(
        error.message,
      ))
  );
}

/**
 * Terminal error handler. Nothing leaves the API without passing through here,
 * which guarantees a consistent envelope and that internals stay internal.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Delegate to Express if the response has already begun streaming.
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = getRequestId(req);

  if (error instanceof ZodError) {
    logger.warn({ requestId, issues: error.issues }, 'Request validation failed');
    sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, 'The submitted data is invalid.', {
      fields: zodErrorToFields(error),
      requestId,
    });
    return;
  }

  if (isAppError(error)) {
    const logAt = error.statusCode >= 500 ? 'error' : 'warn';
    logger[logAt]({ requestId, code: error.code, err: error }, error.message);
    sendError(res, error.statusCode, error.code, error.message, {
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
      requestId,
    });
    return;
  }

  if (isDatabaseUnavailableError(error)) {
    logger.error({ requestId, err: error }, 'Database unavailable');
    sendError(
      res,
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'Database is temporarily unavailable. Please try again shortly.',
      { requestId },
    );
    return;
  }

  // Anything reaching here is unexpected. Log it fully, tell the client nothing.
  logger.error({ requestId, err: error }, 'Unhandled error');
  sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong. Please try again.', {
    requestId,
  });
}
