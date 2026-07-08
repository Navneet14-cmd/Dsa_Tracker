import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get all revisions that are currently due or overdue
 */
export const getDueRevisions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    const dueRevisions = await prisma.revision.findMany({
      where: {
        completed: false,
        scheduledFor: {
          lte: new Date(),
        },
        problem: {
          userId,
        },
      },
      include: {
        problem: {
          select: {
            leetcodeNumber: true,
            title: true,
            difficulty: true,
          },
        },
      },
      orderBy: {
        scheduledFor: 'asc',
      },
    });

    return res.status(200).json({
      status: 'success',
      revisions: dueRevisions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a revision as completed and schedule the next interval
 */
export const completeRevision = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Find revision and verify ownership
    const revision = await prisma.revision.findUnique({
      where: { id },
      include: {
        problem: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!revision || revision.problem.userId !== userId) {
      return res.status(404).json({
        status: 'error',
        message: 'Revision not found',
      });
    }

    if (revision.completed) {
      return res.status(400).json({
        status: 'error',
        message: 'Revision is already completed',
      });
    }

    // Determine the next interval days (1 -> 3 -> 7 -> 14 -> 30)
    const nextIntervalDays = (() => {
      switch (revision.intervalDays) {
        case 1: return 3;
        case 3: return 7;
        case 7: return 14;
        case 14: return 30;
        default: return null; // Ends the repetition cycle
      }
    })();

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Mark current revision completed
      const completedRevision = await tx.revision.update({
        where: { id },
        data: {
          completed: true,
          completedAt: new Date(),
        },
      });

      // 2. Create the next revision scheduled for now + nextIntervalDays
      if (nextIntervalDays !== null) {
        const nextScheduledFor = new Date();
        nextScheduledFor.setDate(nextScheduledFor.getDate() + nextIntervalDays);

        await tx.revision.create({
          data: {
            problemId: revision.problemId,
            scheduledFor: nextScheduledFor,
            intervalDays: nextIntervalDays,
          },
        });
      }

      return completedRevision;
    });

    return res.status(200).json({
      status: 'success',
      revision: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get upcoming revisions grouped into Tomorrow, In 3 Days, and In 7 Days
 */
export const getUpcomingRevisions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    // Retrieve all future uncompleted revisions
    const upcoming = await prisma.revision.findMany({
      where: {
        completed: false,
        scheduledFor: {
          gt: new Date(),
        },
        problem: {
          userId,
        },
      },
      include: {
        problem: {
          select: {
            leetcodeNumber: true,
            title: true,
            difficulty: true,
          },
        },
      },
      orderBy: {
        scheduledFor: 'asc',
      },
    });

    // Group directly by the record's intervalDays
    const tomorrow: typeof upcoming = [];
    const in3Days: typeof upcoming = [];
    const in7Days: typeof upcoming = []; // Collapses 7, 14, and 30 day intervals

    upcoming.forEach((r) => {
      if (r.intervalDays === 1) {
        tomorrow.push(r);
      } else if (r.intervalDays === 3) {
        in3Days.push(r);
      } else if (r.intervalDays >= 7) {
        in7Days.push(r);
      }
    });

    return res.status(200).json({
      status: 'success',
      data: {
        tomorrow,
        in3Days,
        in7Days,
      },
    });
  } catch (error) {
    next(error);
  }
};
