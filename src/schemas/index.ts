import { z } from 'zod';
import { dateInput, id, optionalBody, req, timeZone } from './common';

export * from './common';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const email = z
  .string(req('Email', 'a string'))
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'A valid email is required' }));

// bcrypt only uses the first 72 bytes, so longer passwords are rejected
// rather than silently truncated.
const newPassword = (label = 'Password') =>
  z
    .string(req(label, 'a string'))
    .min(8, { error: `${label} must be at least 8 characters long` })
    .max(72, { error: `${label} must be at most 72 characters long` });

const displayName = z
  .string({ error: 'Name must be a string' })
  .trim()
  .max(100, { error: 'Name must be at most 100 characters' })
  .nullable()
  .transform((v) => (v ? v : null));

export const RegisterSchema = z.object({
  email,
  password: newPassword(),
  name: displayName.optional(),
});

export const LoginSchema = z.object({
  email,
  password: z.string(req('Password', 'a string')).min(1, { error: 'Password is required' }),
});

export const UpdateMeSchema = z.object({
  name: displayName.refine((v) => v !== undefined, { error: 'Name is required' }),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string(req('Current password', 'a string')).min(1, { error: 'Current password is required' }),
    newPassword: newPassword('New password'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    error: 'New password must be different from the current password',
    path: ['newPassword'],
  });

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
const difficulty = z.enum(DIFFICULTIES, { error: 'Difficulty must be EASY, MEDIUM, or HARD' });

const idList = (label: string) =>
  z
    .array(id(label), { error: `${label}s must be an array of ids` })
    .max(25, { error: `At most 25 ${label}s are allowed` })
    .transform((ids) => [...new Set(ids)]);

// Allow a day of slack for clients in time zones ahead of the server.
const MAX_FUTURE_MS = 36 * 60 * 60 * 1000;

// Base fields with no defaults: zod v4 applies .default() even inside
// .partial(), which would inject values into PATCH requests.
const problemFields = {
  leetcodeNumber: z.number(req('LeetCode number', 'a number')).int().positive().max(100_000),
  title: z.string(req('Title', 'a string')).trim().min(1, { error: 'Title cannot be empty' }).max(200),
  difficulty,
  topicIds: idList('topicId'),
  patternIds: idList('patternId'),
  timeTakenMins: z.number(req('Time taken in minutes', 'a number')).int().nonnegative().max(24 * 60),
  dateSolved: dateInput('Date solved').refine((d) => d.getTime() <= Date.now() + MAX_FUTURE_MS, {
    error: 'Date solved cannot be in the future',
  }),
  solvedAlone: z.boolean(req('Solved alone', 'a boolean')),
  notes: z.string({ error: 'Notes must be a string' }).max(10_000).nullable().optional(),
  needsRevision: z.boolean(req('Needs revision', 'a boolean')),
  confidence: z
    .number(req('Confidence score (1-5)', 'a number'))
    .int()
    .min(1, { error: 'Confidence must be between 1 and 5' })
    .max(5, { error: 'Confidence must be between 1 and 5' }),
};

export const CreateProblemSchema = z.object({
  ...problemFields,
  topicIds: problemFields.topicIds.default([]),
  patternIds: problemFields.patternIds.default([]),
  needsRevision: problemFields.needsRevision.default(false),
});
export type CreateProblemInput = z.infer<typeof CreateProblemSchema>;

export const UpdateProblemSchema = z
  .object(problemFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { error: 'No fields to update' });
export type UpdateProblemInput = z.infer<typeof UpdateProblemSchema>;

export const GetProblemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  topicId: id('topicId').optional(),
  patternId: id('patternId').optional(),
  difficulty: difficulty.optional(),
  startDate: dateInput('startDate').optional(),
  endDate: dateInput('endDate').optional(),
  search: z.string().trim().max(200).optional(),
});
export type GetProblemsQuery = z.infer<typeof GetProblemsQuerySchema>;

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export const RATINGS = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export type Rating = (typeof RATINGS)[number];

export const CompleteRevisionSchema = optionalBody(
  z.object({
    rating: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
        z.enum(RATINGS, { error: 'Rating must be one of again, hard, good, easy' }),
      )
      .optional(),
    confidence: z
      .number({ error: 'Confidence must be a number' })
      .int()
      .min(1, { error: 'Confidence must be between 1 and 5' })
      .max(5, { error: 'Confidence must be between 1 and 5' })
      .optional(),
  }),
);
export type CompleteRevisionInput = z.infer<typeof CompleteRevisionSchema>;

export const AddToRevisionSchema = optionalBody(
  z.object({
    dueInDays: z.number({ error: 'dueInDays must be a number' }).int().min(0).max(365).default(1),
  }),
);

export const TimeZoneQuery = z.object({ tz: timeZone });

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const UpsertGoalSchema = z.object({
  topicId: id('topicId'),
  targetCount: z
    .number(req('Target count', 'a number'))
    .int({ error: 'Target count must be an integer' })
    .positive({ error: 'Target count must be a positive integer' })
    .max(10_000),
});

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export const RecommendSchema = z.object({ problemId: id('problemId') });
export const WeaknessAnalysisSchema = optionalBody(z.object({}));
export const StudyPlanSchema = z.object({
  minutesAvailable: z
    .number(req('minutesAvailable', 'a number'))
    .int({ error: 'minutesAvailable must be a whole number of minutes' })
    .min(5, { error: 'minutesAvailable must be at least 5' })
    .max(720, { error: 'minutesAvailable must be at most 720 (12 hours)' }),
});
