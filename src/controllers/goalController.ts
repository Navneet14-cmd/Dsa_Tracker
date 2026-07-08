import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Create or update a target goal count for a topic
 */
export const upsertGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { topicId, targetCount } = req.body;
    const userId = req.userId!;

    // Validate that the topic exists first
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid topicId. Topic does not exist.',
      });
    }

    // Upsert the goal
    const goal = await prisma.goal.upsert({
      where: {
        userId_topicId: {
          userId,
          topicId,
        },
      },
      update: {
        targetCount,
      },
      create: {
        userId,
        topicId,
        targetCount,
      },
      include: {
        topic: {
          select: { id: true, name: true },
        },
      },
    });

    return res.status(200).json({
      status: 'success',
      goal,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all goals for the logged-in user
 */
export const getGoals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    const goals = await prisma.goal.findMany({
      where: { userId },
      include: {
        topic: {
          select: { id: true, name: true },
        },
      },
      orderBy: {
        topic: {
          name: 'asc',
        },
      },
    });

    return res.status(200).json({
      status: 'success',
      goals,
    });
  } catch (error) {
    next(error);
  }
};
