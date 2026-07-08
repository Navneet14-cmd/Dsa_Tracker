import { Router } from 'express';
import { recommend, analyzeWeakness, generateStudyPlan } from '../controllers/aiController';

const router = Router();

// POST /ai/recommend
router.post('/recommend', recommend);

// POST /ai/weakness-analysis
router.post('/weakness-analysis', analyzeWeakness);

// POST /ai/study-plan
router.post('/study-plan', generateStudyPlan);

export default router;
