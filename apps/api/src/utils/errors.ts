import { ERROR_CODES, type ErrorCode, type FieldErrors } from '@interscale/shared';

/**
 * Base class for every error the API raises deliberately.
 *
 * `isOperational` separates "expected, safe to show the client" from
 * programmer errors and unexpected crashes, which the handler masks.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly fields: FieldErrors | undefined;
  readonly isOperational = true;

  constructor(message: string, statusCode: number, code: ErrorCode, fields?: FieldErrors) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The submitted data is invalid.', fields?: FieldErrors) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR, fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'That record already exists.') {
    super(message, 409, ERROR_CODES.CONFLICT);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again shortly.') {
    super(message, 429, ERROR_CODES.RATE_LIMITED);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'A required service is unavailable.') {
    super(message, 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
