import { Router } from 'express';
import { completeRevision, getDueRevisions, getUpcomingRevisions } from '../controllers/revisionController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import { CompleteRevisionSchema, IdParams, TimeZoneQuery } from '../schemas';

// Mounted at /revisions
const router = Router();

router.get('/due', asyncHandler(getDueRevisions));
router.get('/upcoming', validate({ query: TimeZoneQuery }), asyncHandler(getUpcomingRevisions));
router.post('/:id/complete', validate({ params: IdParams, body: CompleteRevisionSchema }), asyncHandler(completeRevision));

export default router;
