import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';

/**
 * Register a new user
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name } = req.body;

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'A valid email is required',
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Password is required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is already registered',
      });
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user and explicitly project select fields to exclude passwordHash
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name ? String(name).trim() : null,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Sign JWT token
    const token = jwt.sign({ userId: user.id }, config.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(201).json({
      status: 'success',
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Retrieve user including passwordHash for verification
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    // Verify password match
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    // Exclude passwordHash from user model response
    const { passwordHash: _, ...safeUser } = user;

    // Sign JWT token
    const token = jwt.sign({ userId: user.id }, config.JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(200).json({
      status: 'success',
      token,
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
};
