import { Router } from 'express';
import { deleteGoal, getGoals, upsertGoal } from '../controllers/goalController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import { IdParams, UpsertGoalSchema } from '../schemas';

// Mounted at /goals
const router = Router();

router.post('/', validate({ body: UpsertGoalSchema }), asyncHandler(upsertGoal));
router.get('/', asyncHandler(getGoals));
router.delete('/:id', validate({ params: IdParams }), asyncHandler(deleteGoal));

export default router;
