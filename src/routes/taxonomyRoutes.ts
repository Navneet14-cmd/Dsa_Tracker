import { Router } from 'express';
import { getPatterns, getTopics } from '../controllers/problemController';
import { requireAuth } from '../middleware/authMiddleware';
import { asyncHandler } from '../lib/errors';

// Explicit /topics and /patterns paths. Auth is applied per route so that
// mounting this router never puts requireAuth in front of unrelated paths.
const router = Router();

router.get('/topics', requireAuth, asyncHandler(getTopics));
router.get('/patterns', requireAuth, asyncHandler(getPatterns));

export default router;
