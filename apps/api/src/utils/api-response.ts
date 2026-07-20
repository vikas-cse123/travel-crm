import type { Response } from 'express';
import type { ApiFailure, ApiSuccess, ErrorCode, FieldErrors } from '@interscale/shared';

/** Write a success envelope. Every controller returns through here. */
export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode = 200): void {
  const body: ApiSuccess<T> = message ? { success: true, data, message } : { success: true, data };
  res.status(statusCode).json(body);
}

/** Write a failure envelope. Normally only the error handler calls this. */
export function sendError(
  res: Response,
  statusCode: number,
  code: ErrorCode,
  message: string,
  options: { fields?: FieldErrors; requestId?: string } = {},
): void {
  const body: ApiFailure = {
    success: false,
    error: {
      code,
      message,
      ...(options.fields ? { fields: options.fields } : {}),
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  };
  res.status(statusCode).json(body);
}
