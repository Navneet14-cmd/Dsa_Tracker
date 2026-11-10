import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { HttpError, conflict, notFound } from '../lib/errors';
import { ChangePasswordSchema, LoginSchema, RegisterSchema, UpdateMeSchema } from '../schemas';

const publicUser = { id: true, email: true, name: true, createdAt: true } as const;

const signToken = (userId: string) =>
  jwt.sign({ userId }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

// Compared against when the email is unknown so response time doesn't reveal
// which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/** POST /auth/register */
export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body as z.infer<typeof RegisterSchema>;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict('Email is already registered');

  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  // A concurrent registration can still hit the unique index; the error
  // handler maps that P2002 to the same 409.
  const user = await prisma.user.create({
    data: { email, name: name ?? null, passwordHash },
    select: publicUser,
  });

  res.status(201).json({ status: 'success', token: signToken(user.id), user });
};

/** POST /auth/login */
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as z.infer<typeof LoginSchema>;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

  const { passwordHash: _omit, ...safeUser } = user;
  res.status(200).json({ status: 'success', token: signToken(user.id), user: safeUser });
};

/** GET /auth/me */
export const getMe = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: publicUser });
  if (!user) throw notFound('User');
  res.status(200).json({ status: 'success', user });
};

/** PATCH /auth/me */
export const updateMe = async (req: Request, res: Response) => {
  const { name } = req.body as z.infer<typeof UpdateMeSchema>;
  // P2025 (user deleted) maps to 404 in the error handler.
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name: name ?? null },
    select: publicUser,
  });
  res.status(200).json({ status: 'success', user });
};

/** POST /auth/change-password */
export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof ChangePasswordSchema>;

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw notFound('User');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');

  const passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  res.status(200).json({
    status: 'success',
    message: 'Password updated',
    token: signToken(user.id),
  });
};
