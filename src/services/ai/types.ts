import { z } from 'zod';
import type { Difficulty } from '@prisma/client';
import type { CatalogProblem } from '../../data/catalog';
import type { UserContext } from './context';

export type AiSource = 'rules' | 'ollama' | 'anthropic';
export const AI_SOURCES: readonly AiSource[] = ['rules', 'ollama', 'anthropic'];

// Response shapes shared by every provider (zod-validated for LLM providers).
export const Difficulty_ = z.enum(['EASY', 'MEDIUM', 'HARD']);

export const RecommendationsOutput = z.object({
  recommendations: z.array(
    z.object({ number: z.number().int(), title: z.string(), difficulty: Difficulty_, reason: z.string() }),
  ),
  overallReason: z.string(),
});
export const WeaknessOutput = z.object({
  strengths: z.array(z.string()),
  weakAreas: z.array(z.string()),
  recommendation: z.string(),
});
export const StudyPlanOutput = z.object({
  tasks: z.array(
    z.object({
      type: z.enum(['REVISION', 'PRACTICE', 'BREAK']),
      description: z.string(),
      estMinutes: z.number().int(),
    }),
  ),
  totalMinutes: z.number().int(),
});

export type RecommendResult = z.infer<typeof RecommendationsOutput>;
export type Recommendation = RecommendResult['recommendations'][number];
export type WeaknessResult = z.infer<typeof WeaknessOutput>;
export type StudyPlanResult = z.infer<typeof StudyPlanOutput>;
export type StudyTask = StudyPlanResult['tasks'][number];

export interface JustSolved {
  leetcodeNumber: number;
  title: string;
  difficulty: Difficulty;
  confidence: number;
  solvedAlone: boolean;
  timeTakenMins: number;
  patterns: string[];
  topics: string[];
}

export interface Candidate {
  problem: CatalogProblem;
  matchedPatterns: string[];
  matchedTopics: string[];
  /** Candidate difficulty minus the just-solved difficulty (-2..2). */
  difficultyDelta: number;
}

export interface RecommendInput {
  justSolved: JustSolved;
  ctx: UserContext;
  /** Unsolved catalog problems, best first. */
  candidates: Candidate[];
}

export interface StudyPlanInput {
  ctx: UserContext;
  minutesAvailable: number;
  /** Unsolved catalog problems for the weakest areas, best first. */
  practice: { problem: CatalogProblem; area: string }[];
}

export interface ProviderStatus {
  reachable: boolean;
  model?: string;
  detail?: string;
}

export interface AiProvider {
  readonly name: AiSource;
  recommend(input: RecommendInput): Promise<RecommendResult>;
  analyzeWeakness(ctx: UserContext): Promise<WeaknessResult>;
  studyPlan(input: StudyPlanInput): Promise<StudyPlanResult>;
  status(): Promise<ProviderStatus>;
}
