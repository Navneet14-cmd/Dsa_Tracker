import { Router } from 'express';
import {
  createProblem,
  getProblems,
  getProblemById,
  updateProblem,
  deleteProblem,
  getTopics,
  getPatterns,
} from '../controllers/problemController';
import {
  validateBody,
  validateQuery,
  CreateProblemSchema,
  UpdateProblemSchema,
  GetProblemsQuerySchema,
} from '../middleware/problemValidation';

const router = Router();

// Taxonomy Endpoints (For dropdowns)
router.get('/topics', getTopics);
router.get('/patterns', getPatterns);

// Problem CRUD Endpoints
router.post('/problems', validateBody(CreateProblemSchema), createProblem);
router.get('/problems', validateQuery(GetProblemsQuerySchema), getProblems);
router.get('/problems/:id', getProblemById);
router.patch('/problems/:id', validateBody(UpdateProblemSchema), updateProblem);
router.delete('/problems/:id', deleteProblem);

export default router;
