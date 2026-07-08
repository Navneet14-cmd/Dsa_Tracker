import express from 'express';
import cors from 'cors';
import { config } from './lib/config';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './lib/prisma';
import authRoutes from './routes/authRoutes';
import { requireAuth } from './middleware/authMiddleware';

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res, next) => {
  try {
    // Basic database connection check
    await prisma.$queryRaw`SELECT 1`;
    
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime(),
    });
  } catch (error) {
    next(error);
  }
});

// Mount Authentication Routes
app.use('/auth', authRoutes);

// Protected Identity Verification Route (Test protected endpoint)
app.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    res.status(200).json({
      status: 'success',
      user,
    });
  } catch (error) {
    next(error);
  }
});

// Mount Problem Logger & Taxonomy Routes
import problemRoutes from './routes/problemRoutes';
app.use('/', requireAuth, problemRoutes);

// Mount Dashboard Routes
import dashboardRoutes from './routes/dashboardRoutes';
app.use('/dashboard', requireAuth, dashboardRoutes);

// Mount Goals Routes
import goalRoutes from './routes/goalRoutes';
app.use('/goals', requireAuth, goalRoutes);

// Mount Revisions Routes
import revisionRoutes from './routes/revisionRoutes';
app.use('/revisions', requireAuth, revisionRoutes);

// Mount AI Routes
import aiRoutes from './routes/aiRoutes';
app.use('/ai', requireAuth, aiRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(config.PORT, () => {
  console.log(`==========================================`);
  console.log(`🚀 DSA Tracker server started on port ${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`==========================================`);
});
