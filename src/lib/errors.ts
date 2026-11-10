import { NextFunction, Request, RequestHandler, Response } from 'express';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * An error with an HTTP status that is safe to show to the client.
 * Every error response has the shape:
 *   { status: 'error', statusCode, code, message, errors?, ...details }
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = defaultCode(statusCode),
    public readonly details?: { errors?: FieldError[]; [key: string]: unknown },
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 429: return 'RATE_LIMITED';
    case 502: return 'UPSTREAM_ERROR';
    case 503: return 'SERVICE_UNAVAILABLE';
    case 504: return 'UPSTREAM_TIMEOUT';
    default: return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}

export const badRequest = (message: string, details?: HttpError['details']) =>
  new HttpError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (message: string, details?: HttpError['details']) =>
  new HttpError(409, message, 'CONFLICT', details);

/** Body for a JSON error response. Used by the error handler and middleware. */
export function errorBody(
  statusCode: number,
  message: string,
  code: string = defaultCode(statusCode),
  details?: Record<string, unknown>,
) {
  return { status: 'error' as const, statusCode, code, message, ...details };
}

/**
 * Wraps an async route handler so rejected promises reach the error handler
 * (Express 4 does not do this by itself).
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
