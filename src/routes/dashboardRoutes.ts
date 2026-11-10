import { Router } from 'express';
import { getPatternsDashboard, getProgressDashboard } from '../controllers/dashboardController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import { TimeZoneQuery } from '../schemas';

// Mounted at /dashboard
const router = Router();

router.get('/progress', validate({ query: TimeZoneQuery }), asyncHandler(getProgressDashboard));
router.get('/patterns', asyncHandler(getPatternsDashboard));

export default router;
