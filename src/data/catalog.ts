import type { Difficulty } from '@prisma/client';
import raw from './leetcode-problems.json';
import type { PatternName, TopicName } from './taxonomy';

/**
 * Curated set of real LeetCode problems (NeetCode-150 style coverage plus
 * extras so every seeded pattern has problems at several difficulties).
 * Premium-only problems are left out. Order matters: earlier entries are the
 * more fundamental ones and win ties.
 */
export interface CatalogProblem {
  number: number;
  title: string;
  difficulty: Difficulty;
  patterns: PatternName[];
  topics: TopicName[];
}

export const CATALOG: readonly CatalogProblem[] = raw as CatalogProblem[];

export const DIFFICULTY_ORDER: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };
