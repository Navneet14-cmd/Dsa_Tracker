import rateLimit, { Options } from 'express-rate-limit';
import { errorBody } from '../lib/errors';

const json429 =
  (message: string): Options['handler'] =>
  (_req, res, _next, options) => {
    res.status(options.statusCode).json(errorBody(options.statusCode, message, 'RATE_LIMITED'));
  };

/** Per-IP limiter for credential endpoints (login, register, change-password). */
export const createAuthLimiter = (limit: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: json429('Too many authentication attempts. Please try again later.'),
  });

/** Per-user limiter for the AI endpoints. Must run after requireAuth. */
export const createAiLimiter = (limit: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.userId}`,
    handler: json429('AI request limit reached. Please try again later.'),
  });
