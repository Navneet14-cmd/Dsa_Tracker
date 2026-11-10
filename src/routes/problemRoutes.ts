import { Router } from 'express';
import {
  addProblemToRevision,
  createProblem,
  deleteProblem,
  getProblemById,
  getProblemRevisionHistory,
  getProblems,
  removeProblemFromRevision,
  updateProblem,
} from '../controllers/problemController';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/errors';
import {
  AddToRevisionSchema,
  CreateProblemSchema,
  GetProblemsQuerySchema,
  IdParams,
  UpdateProblemSchema,
} from '../schemas';

// Mounted at /problems
const router = Router();

router.post('/', validate({ body: CreateProblemSchema }), asyncHandler(createProblem));
router.get('/', validate({ query: GetProblemsQuerySchema }), asyncHandler(getProblems));
router.get('/:id', validate({ params: IdParams }), asyncHandler(getProblemById));
router.patch('/:id', validate({ params: IdParams, body: UpdateProblemSchema }), asyncHandler(updateProblem));
router.delete('/:id', validate({ params: IdParams }), asyncHandler(deleteProblem));

// Revision management for a single problem
router.get('/:id/revisions', validate({ params: IdParams }), asyncHandler(getProblemRevisionHistory));
router.post('/:id/revision', validate({ params: IdParams, body: AddToRevisionSchema }), asyncHandler(addProblemToRevision));
router.delete('/:id/revision', validate({ params: IdParams }), asyncHandler(removeProblemFromRevision));

export default router;
