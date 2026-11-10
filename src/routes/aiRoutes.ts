import { Router } from 'express';
import { analyzeWeakness, generateStudyPlan, recommend } from '../controllers/aiController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import { RecommendSchema, StudyPlanSchema, WeaknessAnalysisSchema } from '../schemas';

// Mounted at /ai (behind requireAuth and the per-user AI rate limiter)
const router = Router();

router.post('/recommend', validate({ body: RecommendSchema }), asyncHandler(recommend));
router.post('/weakness-analysis', validate({ body: WeaknessAnalysisSchema }), asyncHandler(analyzeWeakness));
router.post('/study-plan', validate({ body: StudyPlanSchema }), asyncHandler(generateStudyPlan));

export default router;
