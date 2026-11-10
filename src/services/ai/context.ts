import { Difficulty } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { avg, pct, round1 } from '../stats';

/** Rough interview-pace benchmarks used to judge time taken. */
export const EXPECTED_MINUTES: Record<Difficulty, number> = { EASY: 15, MEDIUM: 30, HARD: 45 };

export interface GroupStat {
  name: string;
  solved: number;
  avgConfidence: number | null;
  solvedAlonePct: number | null;
  /** Mean of timeTaken / expected time for the difficulty (1.0 = on pace). */
  avgPaceRatio: number | null;
}

export interface GoalGap {
  topic: string;
  target: number;
  solved: number;
  remaining: number;
}

export interface RevisionItem {
  leetcodeNumber: number;
  title: string;
  difficulty: Difficulty;
  confidence: number;
  intervalDays: number;
  daysOverdue: number;
}

export interface UserContext {
  totals: {
    solved: number;
    solvedAlonePct: number | null;
    avgConfidence: number | null;
    avgMinutes: Record<Difficulty, number | null>;
  };
  topics: GroupStat[];
  patterns: GroupStat[];
  goals: GoalGap[];
  overdueRevisions: RevisionItem[];
  pendingRevisionCount: number;
  recent: {
    leetcodeNumber: number;
    title: string;
    difficulty: Difficulty;
    confidence: number;
    solvedAlone: boolean;
    timeTakenMins: number;
    topics: string[];
    patterns: string[];
  }[];
  /** Every LeetCode number the user has logged. */
  solvedNumbers: Set<number>;
}

interface Acc {
  confidence: number[];
  alone: number;
  pace: number[];
}

const groupStat = (name: string, acc: Acc | undefined): GroupStat => ({
  name,
  solved: acc?.confidence.length ?? 0,
  avgConfidence: acc ? avg(acc.confidence) : null,
  solvedAlonePct: acc ? pct(acc.alone, acc.confidence.length) : null,
  avgPaceRatio: acc && acc.pace.length ? round1(acc.pace.reduce((a, b) => a + b, 0) / acc.pace.length) : null,
});

/** Gathers everything the AI flows need about a user in one place. */
export async function buildUserContext(userId: string): Promise<UserContext> {
  const now = new Date();
  const [problems, topics, patterns, goals, pending] = await Promise.all([
    prisma.problem.findMany({
      where: { userId },
      orderBy: { dateSolved: 'desc' },
      select: {
        leetcodeNumber: true,
        title: true,
        difficulty: true,
        timeTakenMins: true,
        solvedAlone: true,
        confidence: true,
        topics: { select: { topic: { select: { id: true, name: true } } } },
        patterns: { select: { pattern: { select: { id: true, name: true } } } },
      },
    }),
    prisma.topic.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.pattern.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.goal.findMany({ where: { userId }, select: { topicId: true, targetCount: true } }),
    prisma.revision.findMany({
      where: { completed: false, problem: { userId } },
      orderBy: { scheduledFor: 'asc' },
      select: {
        scheduledFor: true,
        intervalDays: true,
        problem: { select: { leetcodeNumber: true, title: true, difficulty: true, confidence: true } },
      },
    }),
  ]);

  const byTopic = new Map<string, Acc>();
  const byPattern = new Map<string, Acc>();
  const add = (map: Map<string, Acc>, key: string, p: (typeof problems)[number]) => {
    let acc = map.get(key);
    if (!acc) map.set(key, (acc = { confidence: [], alone: 0, pace: [] }));
    acc.confidence.push(p.confidence);
    if (p.solvedAlone) acc.alone++;
    acc.pace.push(p.timeTakenMins / EXPECTED_MINUTES[p.difficulty]);
  };
  for (const p of problems) {
    p.topics.forEach(({ topic }) => add(byTopic, topic.id, p));
    p.patterns.forEach(({ pattern }) => add(byPattern, pattern.id, p));
  }

  const topicStats = topics.map((t) => groupStat(t.name, byTopic.get(t.id)));
  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  const topicSolved = new Map(topics.map((t) => [t.id, byTopic.get(t.id)?.confidence.length ?? 0]));

  const minutes = (d: Difficulty) => avg(problems.filter((p) => p.difficulty === d).map((p) => p.timeTakenMins));

  return {
    totals: {
      solved: problems.length,
      solvedAlonePct: pct(problems.filter((p) => p.solvedAlone).length, problems.length),
      avgConfidence: avg(problems.map((p) => p.confidence)),
      avgMinutes: { EASY: minutes('EASY'), MEDIUM: minutes('MEDIUM'), HARD: minutes('HARD') },
    },
    topics: topicStats,
    patterns: patterns.map((p) => groupStat(p.name, byPattern.get(p.id))),
    goals: goals.map((g) => {
      const solved = topicSolved.get(g.topicId) ?? 0;
      return {
        topic: topicName.get(g.topicId) ?? g.topicId,
        target: g.targetCount,
        solved,
        remaining: Math.max(0, g.targetCount - solved),
      };
    }),
    overdueRevisions: pending
      .filter((r) => r.scheduledFor <= now)
      .map((r) => ({
        ...r.problem,
        intervalDays: r.intervalDays,
        daysOverdue: Math.floor((now.getTime() - r.scheduledFor.getTime()) / 86_400_000),
      })),
    pendingRevisionCount: pending.length,
    recent: problems.slice(0, 30).map((p) => ({
      leetcodeNumber: p.leetcodeNumber,
      title: p.title,
      difficulty: p.difficulty,
      confidence: p.confidence,
      solvedAlone: p.solvedAlone,
      timeTakenMins: p.timeTakenMins,
      topics: p.topics.map((t) => t.topic.name),
      patterns: p.patterns.map((x) => x.pattern.name),
    })),
    solvedNumbers: new Set(problems.map((p) => p.leetcodeNumber)),
  };
}

const fmtGroup = (g: GroupStat) =>
  g.solved === 0
    ? `${g.name}: 0 solved`
    : `${g.name}: ${g.solved} solved, avg confidence ${g.avgConfidence}/5, ` +
      `${g.solvedAlonePct}% without hints, pace ${g.avgPaceRatio}x expected time`;

/** Compact plain-text rendering of the context for prompts. */
export function describeContext(ctx: UserContext): string {
  const t = ctx.totals;
  const lines = [
    `## Overall`,
    `${t.solved} problems logged; ${t.solvedAlonePct ?? 0}% solved without hints; average confidence ${t.avgConfidence ?? 'n/a'}/5.`,
    `Average minutes - Easy: ${t.avgMinutes.EASY ?? 'n/a'} (benchmark ${EXPECTED_MINUTES.EASY}), ` +
      `Medium: ${t.avgMinutes.MEDIUM ?? 'n/a'} (benchmark ${EXPECTED_MINUTES.MEDIUM}), ` +
      `Hard: ${t.avgMinutes.HARD ?? 'n/a'} (benchmark ${EXPECTED_MINUTES.HARD}).`,
    ``,
    `## Topics`,
    ...ctx.topics.map(fmtGroup),
    ``,
    `## Patterns`,
    ...ctx.patterns.map(fmtGroup),
    ``,
    `## Goals`,
    ...(ctx.goals.length
      ? ctx.goals.map((g) => `${g.topic}: ${g.solved}/${g.target} (${g.remaining} to go)`)
      : ['No goals set.']),
    ``,
    `## Revisions`,
    `${ctx.pendingRevisionCount} pending, ${ctx.overdueRevisions.length} due now.`,
    ...ctx.overdueRevisions.map(
      (r) =>
        `#${r.leetcodeNumber} ${r.title} (${r.difficulty}, confidence ${r.confidence}/5, ` +
        `step ${r.intervalDays}d, ${r.daysOverdue} days overdue)`,
    ),
    ``,
    `## Most recent problems`,
    ...(ctx.recent.length
      ? ctx.recent.map(
          (p) =>
            `#${p.leetcodeNumber} ${p.title} (${p.difficulty}, ${p.timeTakenMins} min, confidence ${p.confidence}/5, ` +
            `${p.solvedAlone ? 'no hints' : 'with hints'}; topics: ${p.topics.join(', ') || '-'}; patterns: ${p.patterns.join(', ') || '-'})`,
        )
      : ['None yet.']),
  ];
  return lines.join('\n');
}
