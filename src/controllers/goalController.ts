import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { IdParams, UpsertGoalSchema } from '../schemas';

const withTopic = { topic: { select: { id: true, name: true } } } as const;

/** POST /goals — create or update the target count for a topic. */
export const upsertGoal = async (req: Request, res: Response) => {
  const { topicId, targetCount } = req.body as z.infer<typeof UpsertGoalSchema>;
  const userId = req.userId!;

  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) throw badRequest('Invalid topicId. Topic does not exist.', { code: 'INVALID_REFERENCE' });

  const goal = await prisma.goal.upsert({
    where: { userId_topicId: { userId, topicId } },
    update: { targetCount },
    create: { userId, topicId, targetCount },
    include: withTopic,
  });

  res.status(200).json({ status: 'success', goal });
};

/** GET /goals — goals with current progress. */
export const getGoals = async (req: Request, res: Response) => {
  const userId = req.userId!;
  const goals = await prisma.goal.findMany({
    where: { userId },
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          _count: { select: { problems: { where: { problem: { userId } } } } },
        },
      },
    },
    orderBy: { topic: { name: 'asc' } },
  });

  res.status(200).json({
    status: 'success',
    goals: goals.map(({ topic: { _count, ...topic }, ...goal }) => ({
      ...goal,
      topic,
      solvedCount: _count.problems,
      progressPct: Math.min(100, Math.round((_count.problems / goal.targetCount) * 1000) / 10),
    })),
  });
};

/** DELETE /goals/:id */
export const deleteGoal = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const { count } = await prisma.goal.deleteMany({ where: { id, userId: req.userId } });
  if (count === 0) throw notFound('Goal');
  res.status(200).json({ status: 'success', message: 'Goal deleted' });
};
