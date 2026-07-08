import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Schema for POST /problems
export const CreateProblemSchema = z.object({
  leetcodeNumber: z.number({
    required_error: 'LeetCode number is required',
  }).int().positive(),
  title: z.string({
    required_error: 'Title is required',
  }).min(1, 'Title cannot be empty'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD'], {
    required_error: 'Difficulty must be EASY, MEDIUM, or HARD',
  }),
  topicIds: z.array(z.string()).default([]),
  patternIds: z.array(z.string()).default([]),
  timeTakenMins: z.number({
    required_error: 'Time taken in minutes is required',
  }).int().nonnegative(),
  dateSolved: z.coerce.date({
    required_error: 'A valid date solved is required',
  }),
  solvedAlone: z.boolean({
    required_error: 'Solved alone status is required',
  }),
  notes: z.string().optional().nullable(),
  needsRevision: z.boolean().default(false),
  confidence: z.number({
    required_error: 'Confidence score (1-5) is required',
  }).int().min(1).max(5),
});

// Schema for PATCH /problems/:id
export const UpdateProblemSchema = CreateProblemSchema.partial().extend({
  topicIds: z.array(z.string()).optional(),
  patternIds: z.array(z.string()).optional(),
});

// Schema for GET /problems query parameters
export const GetProblemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  topicId: z.string().optional(),
  patternId: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().optional(),
});

/**
 * Middleware to validate request body using Zod schema
 */
export const validateBody = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

/**
 * Middleware to validate query parameters using Zod schema
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Query validation failed',
          errors: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};
