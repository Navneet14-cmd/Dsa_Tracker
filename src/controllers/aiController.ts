import { Request, Response } from 'express';
import { z } from 'zod';
import { RecommendSchema, StudyPlanSchema } from '../schemas';
import type { AiService } from '../services/ai';

export function createAiController(ai: AiService) {
  return {
    /** GET /ai/status */
    status: async (_req: Request, res: Response) => {
      res.status(200).json({ status: 'success', ...(await ai.status()) });
    },

    /** POST /ai/recommend { problemId } */
    recommend: async (req: Request, res: Response) => {
      const { problemId } = req.body as z.infer<typeof RecommendSchema>;
      res.status(200).json({ status: 'success', ...(await ai.recommend(req.userId!, problemId)) });
    },

    /** POST /ai/weakness-analysis */
    analyzeWeakness: async (req: Request, res: Response) => {
      res.status(200).json({ status: 'success', ...(await ai.analyzeWeakness(req.userId!)) });
    },

    /** POST /ai/study-plan { minutesAvailable } */
    generateStudyPlan: async (req: Request, res: Response) => {
      const { minutesAvailable } = req.body as z.infer<typeof StudyPlanSchema>;
      res.status(200).json({ status: 'success', ...(await ai.generateStudyPlan(req.userId!, minutesAvailable)) });
    },
  };
}
