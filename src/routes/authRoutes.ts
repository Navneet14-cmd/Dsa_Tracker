import { RequestHandler, Router } from 'express';
import { changePassword, getMe, login, register, updateMe } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import { ChangePasswordSchema, LoginSchema, RegisterSchema, UpdateMeSchema } from '../schemas';

export function createAuthRouter(credentialLimiter: RequestHandler): Router {
  const router = Router();

  router.post('/register', credentialLimiter, validate({ body: RegisterSchema }), asyncHandler(register));
  router.post('/login', credentialLimiter, validate({ body: LoginSchema }), asyncHandler(login));

  router.get('/me', requireAuth, asyncHandler(getMe));
  router.patch('/me', requireAuth, validate({ body: UpdateMeSchema }), asyncHandler(updateMe));
  router.post(
    '/change-password',
    credentialLimiter,
    requireAuth,
    validate({ body: ChangePasswordSchema }),
    asyncHandler(changePassword),
  );

  return router;
}
