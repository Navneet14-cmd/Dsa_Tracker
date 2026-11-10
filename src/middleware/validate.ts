import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

const toFieldErrors = (error: z.ZodError, prefix?: string) =>
  error.issues.map((issue) => ({
    field: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    message: issue.message,
  }));

/**
 * Validates and replaces req.body / req.query / req.params with the parsed
 * (coerced, defaulted) values. Responds 400 with every issue on failure; the
 * top-level `message` is the first issue so simple clients can show it as-is.
 */
export const validate = (schemas: Schemas) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      for (const key of ['params', 'query', 'body'] as const) {
        const schema = schemas[key];
        if (!schema) continue;
        const result = await schema.safeParseAsync(req[key]);
        if (!result.success) {
          const errors = toFieldErrors(result.error, key === 'body' ? undefined : key);
          throw new HttpError(400, errors[0]?.message ?? 'Validation failed', 'VALIDATION_ERROR', {
            errors,
          });
        }
        // req.query is a getter in newer Express versions; define it explicitly.
        Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true, enumerable: true });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
