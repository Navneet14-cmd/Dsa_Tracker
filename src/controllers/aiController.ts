import { Request, Response } from 'express';
import { z } from 'zod';
import { RecommendSchema, StudyPlanSchema } from '../schemas';
import * as ai from '../services/ai';

/** POST /ai/recommend { problemId } */
export const recommend = async (req: Request, res: Response) => {
  const { problemId } = req.body as z.infer<typeof RecommendSchema>;
  const result = await ai.recommend(req.userId!, problemId);
  res.status(200).json({ status: 'success', ...result });
};

/** POST /ai/weakness-analysis */
export const analyzeWeakness = async (req: Request, res: Response) => {
  const result = await ai.analyzeWeakness(req.userId!);
  res.status(200).json({ status: 'success', ...result });
};

/** POST /ai/study-plan { minutesAvailable } */
export const generateStudyPlan = async (req: Request, res: Response) => {
  const { minutesAvailable } = req.body as z.infer<typeof StudyPlanSchema>;
  const result = await ai.generateStudyPlan(req.userId!, minutesAvailable);
  res.status(200).json({ status: 'success', ...result });
};
