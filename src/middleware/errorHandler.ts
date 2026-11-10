import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError, errorBody } from '../lib/errors';

interface Mapped {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): Mapped | null {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | string | undefined) ?? undefined;
      const fields = Array.isArray(target) ? target.join(', ') : target;
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: fields ? `A record with this ${fields} already exists` : 'Duplicate record',
      };
    }
    case 'P2003':
      // Foreign key violation, e.g. a topicId/patternId that does not exist.
      return {
        statusCode: 400,
        code: 'INVALID_REFERENCE',
        message: 'A referenced record does not exist (check topicIds/patternIds)',
      };
    case 'P2025':
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Record not found' };
    default:
      return null;
  }
}

function mapError(err: unknown): Mapped {
  if (err instanceof HttpError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    if (mapped) return mapped;
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, code: 'BAD_REQUEST', message: 'Invalid request data' };
  }
  // body-parser errors carry `type` and `status`
  const e = err as { type?: string; status?: number; statusCode?: number; message?: string };
  if (e?.type === 'entity.parse.failed') {
    return { statusCode: 400, code: 'INVALID_JSON', message: 'Request body is not valid JSON' };
  }
  if (e?.type === 'entity.too.large') {
    return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
  }
  const status = e?.statusCode ?? e?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { statusCode: status, code: 'BAD_REQUEST', message: e.message || 'Bad request' };
  }
  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal Server Error' };
}

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const isProd = process.env.NODE_ENV === 'production';
  const mapped = mapError(err);

  if (mapped.statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl} ->`, err);
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(`[Error] ${mapped.statusCode} ${req.method} ${req.originalUrl}: ${mapped.message}`);
  }

  if (res.headersSent) return;

  const stack = !isProd && err instanceof Error && mapped.statusCode >= 500 ? { stack: err.stack } : {};
  res
    .status(mapped.statusCode)
    .json(errorBody(mapped.statusCode, mapped.message, mapped.code, { ...mapped.details, ...stack }));
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json(errorBody(404, `Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
};
