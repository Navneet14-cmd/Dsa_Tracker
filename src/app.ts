import express, { Express } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import { config } from './lib/config';
import { prisma } from './lib/prisma';
import { asyncHandler } from './lib/errors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/authMiddleware';
import { createAiLimiter, createAuthLimiter } from './middleware/rateLimit';
import { createAuthRouter } from './routes/authRoutes';
import taxonomyRoutes from './routes/taxonomyRoutes';
import problemRoutes from './routes/problemRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import goalRoutes from './routes/goalRoutes';
import revisionRoutes from './routes/revisionRoutes';
import aiRoutes from './routes/aiRoutes';

export interface AppOptions {
  authRateLimitMax?: number;
  aiRateLimitMax?: number;
}

function corsOptions(): CorsOptions {
  const origins = config.CORS_ORIGINS;
  if (origins.includes('*')) return { origin: true };
  if (origins.length > 0) return { origin: origins };
  // Unset: permissive in development, deny cross-origin browsers in production.
  return { origin: config.NODE_ENV !== 'production' };
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '100kb' }));

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        uptime: process.uptime(),
      });
    }),
  );

  const credentialLimiter = createAuthLimiter(
    options.authRateLimitMax ?? config.AUTH_RATE_LIMIT_MAX,
    config.AUTH_RATE_LIMIT_WINDOW_MS,
  );
  const aiLimiter = createAiLimiter(options.aiRateLimitMax ?? config.AI_RATE_LIMIT_MAX, config.AI_RATE_LIMIT_WINDOW_MS);

  app.use('/auth', createAuthRouter(credentialLimiter));
  app.use(taxonomyRoutes); // GET /topics, GET /patterns
  app.use('/problems', requireAuth, problemRoutes);
  app.use('/dashboard', requireAuth, dashboardRoutes);
  app.use('/goals', requireAuth, goalRoutes);
  app.use('/revisions', requireAuth, revisionRoutes);
  app.use('/ai', requireAuth, aiLimiter, aiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
