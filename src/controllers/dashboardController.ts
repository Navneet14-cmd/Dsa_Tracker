import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { dayKey } from '../lib/dates';
import { TimeZoneQuery } from '../schemas';
import { avg, buildHeatmap, computeStreaks, pct, round1 } from '../services/stats';

const groupAvg = (map: Map<string, number[]>, key: string) => avg(map.get(key) ?? []);

/**
 * GET /dashboard/progress?tz=Area/City
 * Original fields (topics[].{topicId, topicName, solvedCount, targetCount},
 * difficultyStats) are unchanged; everything else is additive.
 */
export const getProgressDashboard = async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { tz } = req.query as unknown as z.infer<typeof TimeZoneQuery>;
  const now = new Date();

  const [topics, problems, attempts, revisionsDue] = await Promise.all([
    prisma.topic.findMany({
      select: {
        id: true,
        name: true,
        goals: { where: { userId }, select: { targetCount: true } },
        _count: { select: { problems: { where: { problem: { userId } } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.problem.findMany({
      where: { userId },
      select: {
        difficulty: true,
        timeTakenMins: true,
        solvedAlone: true,
        confidence: true,
        dateSolved: true,
        topics: { select: { topicId: true } },
      },
    }),
    prisma.problemAttempt.findMany({
      where: { problem: { userId } },
      select: { attemptedAt: true },
    }),
    prisma.revision.count({ where: { completed: false, scheduledFor: { lte: now }, problem: { userId } } }),
  ]);

  // Per-difficulty and per-topic aggregates
  const difficultyStats = { easy: 0, medium: 0, hard: 0, total: problems.length };
  const timeByDifficulty = { EASY: [] as number[], MEDIUM: [] as number[], HARD: [] as number[] };
  const confidenceByTopic = new Map<string, number[]>();
  const perDay = new Map<string, number>();
  let solvedAlone = 0;

  for (const p of problems) {
    if (p.difficulty === 'EASY') difficultyStats.easy++;
    else if (p.difficulty === 'MEDIUM') difficultyStats.medium++;
    else difficultyStats.hard++;
    timeByDifficulty[p.difficulty].push(p.timeTakenMins);
    if (p.solvedAlone) solvedAlone++;
    for (const { topicId } of p.topics) {
      if (!confidenceByTopic.has(topicId)) confidenceByTopic.set(topicId, []);
      confidenceByTopic.get(topicId)!.push(p.confidence);
    }
    const day = dayKey(p.dateSolved, tz);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  // Re-attempts count as activity for streaks and the heatmap.
  for (const a of attempts) {
    const day = dayKey(a.attemptedAt, tz);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  const topicsProgress = topics.map((t) => {
    const targetCount = t.goals[0]?.targetCount ?? null;
    const solvedCount = t._count.problems;
    return {
      topicId: t.id,
      topicName: t.name,
      solvedCount,
      targetCount,
      avgConfidence: groupAvg(confidenceByTopic, t.id),
      goalProgressPct: targetCount ? Math.min(100, pct(solvedCount, targetCount)!) : null,
    };
  });

  const withGoals = topicsProgress.filter((t) => t.targetCount !== null);
  const targetSum = withGoals.reduce((s, t) => s + t.targetCount!, 0);
  const cappedSolved = withGoals.reduce((s, t) => s + Math.min(t.solvedCount, t.targetCount!), 0);

  const today = dayKey(now, tz);

  res.status(200).json({
    status: 'success',
    data: {
      topics: topicsProgress,
      difficultyStats,
      timeZone: tz,
      streak: computeStreaks(perDay.keys(), today),
      heatmap: buildHeatmap(perDay, today, 365),
      avgTimeByDifficulty: {
        easy: avg(timeByDifficulty.EASY),
        medium: avg(timeByDifficulty.MEDIUM),
        hard: avg(timeByDifficulty.HARD),
        overall: avg(problems.map((p) => p.timeTakenMins)),
      },
      solvedAlonePct: pct(solvedAlone, problems.length),
      avgConfidence: avg(problems.map((p) => p.confidence)),
      goalProgress: {
        goalsSet: withGoals.length,
        goalsMet: withGoals.filter((t) => t.solvedCount >= t.targetCount!).length,
        overallPct: targetSum > 0 ? round1((cappedSolved / targetSum) * 100) : null,
      },
      revisionsDue,
      totalAttempts: attempts.length,
    },
  });
};

/**
 * GET /dashboard/patterns
 * Adds avgConfidence and solvedAlonePct per pattern to the original shape.
 */
export const getPatternsDashboard = async (req: Request, res: Response) => {
  const userId = req.userId!;

  const [patterns, links] = await Promise.all([
    prisma.pattern.findMany({
      select: {
        id: true,
        name: true,
        topics: { select: { topic: { select: { id: true, name: true } } } },
        _count: { select: { problems: { where: { problem: { userId } } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.problemPattern.findMany({
      where: { problem: { userId } },
      select: { patternId: true, problem: { select: { confidence: true, solvedAlone: true } } },
    }),
  ]);

  const confidence = new Map<string, number[]>();
  const alone = new Map<string, number>();
  for (const l of links) {
    if (!confidence.has(l.patternId)) confidence.set(l.patternId, []);
    confidence.get(l.patternId)!.push(l.problem.confidence);
    if (l.problem.solvedAlone) alone.set(l.patternId, (alone.get(l.patternId) ?? 0) + 1);
  }

  res.status(200).json({
    status: 'success',
    data: {
      patterns: patterns.map((p) => ({
        patternId: p.id,
        patternName: p.name,
        solvedCount: p._count.problems,
        topics: p.topics.map((pt) => ({ topicId: pt.topic.id, topicName: pt.topic.name })),
        avgConfidence: groupAvg(confidence, p.id),
        solvedAlonePct: pct(alone.get(p.id) ?? 0, p._count.problems),
      })),
    },
  });
};
