import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../lib/config';
import { errorBody } from '../lib/errors';

const deny = (res: Response, message: string) =>
  res.status(401).json(errorBody(401, message, 'UNAUTHORIZED'));

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return deny(res, 'Authorization header is missing');

  // Expecting header format: "Bearer <token>"
  const [scheme, token, ...rest] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    return deny(res, 'Authorization header must follow the format: Bearer <token>');
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || typeof decoded.userId !== 'string' || !decoded.userId) {
      return deny(res, 'Invalid token payload');
    }
    req.userId = decoded.userId;
    next();
  } catch {
    return deny(res, 'Invalid or expired token');
  }
};
