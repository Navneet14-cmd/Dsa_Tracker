import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get progress data for topics and difficulty stats
 */
export const getProgressDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    // Query in parallel
    const [topics, difficultyCounts] = await Promise.all([
      // Optimized query: fetches all topics, nested goals for the user, and the filtered count of user solved problems
      prisma.topic.findMany({
        select: {
          id: true,
          name: true,
          goals: {
            where: { userId },
            select: { targetCount: true },
          },
          _count: {
            select: {
              problems: {
                where: {
                  problem: { userId },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),

      // Fetches difficulty statistics grouped by EASY, MEDIUM, HARD
      prisma.problem.groupBy({
        by: ['difficulty'],
        where: { userId },
        _count: { id: true },
      }),
    ]);

    // Format topic progress list
    const topicsProgress = topics.map((t) => ({
      topicId: t.id,
      topicName: t.name,
      solvedCount: t._count.problems,
      targetCount: t.goals[0]?.targetCount ?? null,
    }));

    // Format overall difficulty stats
    const difficultyStats = {
      easy: 0,
      medium: 0,
      hard: 0,
      total: 0,
    };

    difficultyCounts.forEach((group) => {
      const count = group._count.id;
      if (group.difficulty === 'EASY') difficultyStats.easy = count;
      else if (group.difficulty === 'MEDIUM') difficultyStats.medium = count;
      else if (group.difficulty === 'HARD') difficultyStats.hard = count;
    });

    difficultyStats.total = difficultyStats.easy + difficultyStats.medium + difficultyStats.hard;

    return res.status(200).json({
      status: 'success',
      data: {
        topics: topicsProgress,
        difficultyStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get patterns progress statistics
 */
export const getPatternsDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    // Fetch all patterns, topics mapped to each pattern, and solved counts
    const patterns = await prisma.pattern.findMany({
      select: {
        id: true,
        name: true,
        topics: {
          select: {
            topic: {
              select: { id: true, name: true },
            },
          },
        },
        _count: {
          select: {
            problems: {
              where: {
                problem: { userId },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const patternsProgress = patterns.map((p) => ({
      patternId: p.id,
      patternName: p.name,
      solvedCount: p._count.problems,
      topics: p.topics.map((pt) => ({
        topicId: pt.topic.id,
        topicName: pt.topic.name,
      })),
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        patterns: patternsProgress,
      },
    });
  } catch (error) {
    next(error);
  }
};
