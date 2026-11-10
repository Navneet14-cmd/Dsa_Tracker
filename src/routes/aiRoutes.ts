import { RequestHandler, Router } from 'express';
import { createAiController } from '../controllers/aiController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import { RecommendSchema, StudyPlanSchema, WeaknessAnalysisSchema } from '../schemas';
import type { AiService } from '../services/ai';

/**
 * Mounted at /ai behind requireAuth. GET /status is not rate limited; the
 * generation endpoints go through the per-user AI limiter.
 */
export function createAiRouter(ai: AiService, limiter: RequestHandler): Router {
  const c = createAiController(ai);
  const router = Router();
  router.get('/status', asyncHandler(c.status));
  router.post('/recommend', limiter, validate({ body: RecommendSchema }), asyncHandler(c.recommend));
  router.post('/weakness-analysis', limiter, validate({ body: WeaknessAnalysisSchema }), asyncHandler(c.analyzeWeakness));
  router.post('/study-plan', limiter, validate({ body: StudyPlanSchema }), asyncHandler(c.generateStudyPlan));
  return router;
}
