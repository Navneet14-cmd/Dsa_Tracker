import { PATTERN_NAMES, TOPICS } from '../../src/data/taxonomy';
import type { GroupStat, UserContext } from '../../src/services/ai/context';
import type { JustSolved } from '../../src/services/ai/types';

const empty = (name: string): GroupStat => ({ name, solved: 0, avgConfidence: null, solvedAlonePct: null, avgPaceRatio: null });

/** A small, fixed practice history. */
export function seededContext(): UserContext {
  const patterns = PATTERN_NAMES.map(empty);
  const topics = TOPICS.map(empty);
  const set = (list: GroupStat[], name: string, s: Partial<GroupStat>) => Object.assign(list.find((g) => g.name === name)!, s);

  set(patterns, 'Two Pointer', { solved: 3, avgConfidence: 4.3, solvedAlonePct: 100, avgPaceRatio: 0.9 });
  set(patterns, 'Hash Map', { solved: 2, avgConfidence: 4, solvedAlonePct: 100, avgPaceRatio: 0.8 });
  set(patterns, 'Sliding Window', { solved: 2, avgConfidence: 2, solvedAlonePct: 0, avgPaceRatio: 1.8 });
  set(topics, 'Array', { solved: 5, avgConfidence: 3.8, solvedAlonePct: 80, avgPaceRatio: 1 });
  set(topics, 'String', { solved: 2, avgConfidence: 2, solvedAlonePct: 0, avgPaceRatio: 1.8 });

  return {
    totals: { solved: 7, solvedAlonePct: 71, avgConfidence: 3.6, avgMinutes: { EASY: 14, MEDIUM: 40, HARD: null } },
    topics,
    patterns,
    goals: [{ topic: 'Trees', target: 5, solved: 0, remaining: 5 }],
    overdueRevisions: [
      { leetcodeNumber: 3, title: 'Longest Substring Without Repeating Characters', difficulty: 'MEDIUM', confidence: 2, intervalDays: 1, daysOverdue: 2 },
      { leetcodeNumber: 1, title: 'Two Sum', difficulty: 'EASY', confidence: 4, intervalDays: 3, daysOverdue: 5 },
    ],
    pendingRevisionCount: 3,
    recent: [],
    solvedNumbers: new Set([1, 3, 11, 15, 125, 167, 217]),
  };
}

export const justSolvedTwoPointer: JustSolved = {
  leetcodeNumber: 125,
  title: 'Valid Palindrome',
  difficulty: 'EASY',
  confidence: 4,
  solvedAlone: true,
  timeTakenMins: 10,
  patterns: ['Two Pointer'],
  topics: ['String'],
};
