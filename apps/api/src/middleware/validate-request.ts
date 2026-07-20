import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';

interface RequestSchemas {
  body?: ZodTypeAny;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

/**
 * Validate and *replace* request parts with their parsed output.
 *
 * Replacing rather than merging is what prevents mass assignment: whatever the
 * schema does not declare never reaches a controller or repository.
 */
export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // req.query has only a getter in Express 5; assign defensively.
        Object.defineProperty(req, 'query', { value: parsed, configurable: true });
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }
      next();
    } catch (error) {
      // ZodError is translated centrally in the error handler.
      next(error);
    }
  };
}
