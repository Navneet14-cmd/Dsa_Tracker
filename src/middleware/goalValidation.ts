import { z } from 'zod';

export const UpsertGoalSchema = z.object({
  topicId: z.string({
    required_error: 'Topic ID is required',
  }).min(1, 'Topic ID cannot be empty'),
  targetCount: z.number({
    required_error: 'Target count is required',
  }).int().positive('Target count must be a positive integer'),
});
