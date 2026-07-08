import { Router } from 'express';
import { getDueRevisions, completeRevision, getUpcomingRevisions } from '../controllers/revisionController';

const router = Router();

// GET /revisions/due
router.get('/due', getDueRevisions);

// GET /revisions/upcoming
router.get('/upcoming', getUpcomingRevisions);

// POST /revisions/:id/complete
router.post('/:id/complete', completeRevision);

export default router;
