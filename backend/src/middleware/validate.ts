import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/apiResponse';

type ValidateTarget = 'body' | 'query' | 'params';

/**
 * Returns an Express middleware that validates req[target] against the given Zod schema.
 * On success it replaces req[target] with the parsed (and coerced) value.
 * On failure it short-circuits with 400.
 */
export function validate(schema: ZodSchema, target: ValidateTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const details = (result.error as ZodError).issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      sendError(res, 'Validation failed', 400, 'VALIDATION_ERROR', details);
      return;
    }

    // Replace with parsed/coerced value
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
