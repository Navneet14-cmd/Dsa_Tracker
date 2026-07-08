import { Router } from 'express';
import { getProgressDashboard, getPatternsDashboard } from '../controllers/dashboardController';

const router = Router();

// GET /dashboard/progress
router.get('/progress', getProgressDashboard);

// GET /dashboard/patterns
router.get('/patterns', getPatternsDashboard);

export default router;
