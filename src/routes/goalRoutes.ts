import { Router } from 'express';
import { upsertGoal, getGoals } from '../controllers/goalController';
import { validateBody } from '../middleware/problemValidation';
import { UpsertGoalSchema } from '../middleware/goalValidation';

const router = Router();

// POST /goals
router.post('/', validateBody(UpsertGoalSchema), upsertGoal);

// GET /goals
router.get('/', getGoals);

export default router;
