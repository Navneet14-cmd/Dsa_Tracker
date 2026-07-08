import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Log a new LeetCode problem solved
 */
export const createProblem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      leetcodeNumber,
      title,
      difficulty,
      topicIds,
      patternIds,
      timeTakenMins,
      dateSolved,
      solvedAlone,
      notes,
      needsRevision,
      confidence,
    } = req.body;

    const userId = req.userId!;

    const problem = await prisma.$transaction(async (tx) => {
      // 1. Create the main problem record
      const newProblem = await tx.problem.create({
        data: {
          userId,
          leetcodeNumber,
          title,
          difficulty,
          timeTakenMins,
          dateSolved,
          solvedAlone,
          notes: notes || null,
          needsRevision,
          confidence,
        },
      });

      // 2. Associate with Topics
      if (topicIds && topicIds.length > 0) {
        await tx.problemTopic.createMany({
          data: topicIds.map((topicId: string) => ({
            problemId: newProblem.id,
            topicId,
          })),
        });
      }

      // 3. Associate with Patterns
      if (patternIds && patternIds.length > 0) {
        await tx.problemPattern.createMany({
          data: patternIds.map((patternId: string) => ({
            problemId: newProblem.id,
            patternId,
          })),
        });
      }

      // 4. Create first revision if flagged needsRevision
      if (needsRevision) {
        const scheduledFor = new Date(dateSolved);
        scheduledFor.setDate(scheduledFor.getDate() + 1); // Date solved + 1 day

        await tx.revision.create({
          data: {
            problemId: newProblem.id,
            scheduledFor,
            intervalDays: 1,
          },
        });
      }

      return newProblem;
    });

    // Fetch the complete problem with relations to return
    const fullProblem = await prisma.problem.findUnique({
      where: { id: problem.id },
      include: {
        topics: {
          select: {
            topic: {
              select: { id: true, name: true }
            }
          }
        },
        patterns: {
          select: {
            pattern: {
              select: { id: true, name: true }
            }
          }
        },
        revisions: true,
      },
    });

    return res.status(201).json({
      status: 'success',
      problem: fullProblem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List paginated and filterable problems for current user
 */
export const getProblems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, topicId, patternId, difficulty, startDate, endDate, search } = req.query as any;

    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {
      userId: req.userId!,
    };

    if (difficulty) {
      where.difficulty = difficulty;
    }

    if (topicId) {
      where.topics = {
        some: {
          topicId,
        },
      };
    }

    if (patternId) {
      where.patterns = {
        some: {
          patternId,
        },
      };
    }

    if (startDate || endDate) {
      where.dateSolved = {};
      if (startDate) {
        where.dateSolved.gte = new Date(startDate);
      }
      if (endDate) {
        where.dateSolved.lte = new Date(endDate);
      }
    }

    if (search) {
      const parsedNum = parseInt(search, 10);
      if (!isNaN(parsedNum)) {
        where.OR = [
          { leetcodeNumber: parsedNum },
          { title: { contains: search, mode: 'insensitive' } },
        ];
      } else {
        where.title = { contains: search, mode: 'insensitive' };
      }
    }

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        skip,
        take,
        orderBy: { dateSolved: 'desc' },
        include: {
          topics: {
            select: {
              topic: {
                select: { id: true, name: true }
              }
            }
          },
          patterns: {
            select: {
              pattern: {
                select: { id: true, name: true }
              }
            }
          },
        },
      }),
      prisma.problem.count({ where }),
    ]);

    return res.status(200).json({
      status: 'success',
      problems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a single logged problem
 */
export const getProblemById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        topics: {
          select: {
            topic: {
              select: { id: true, name: true }
            }
          }
        },
        patterns: {
          select: {
            pattern: {
              select: { id: true, name: true }
            }
          }
        },
        revisions: true,
      },
    });

    if (!problem || problem.userId !== req.userId) {
      return res.status(404).json({
        status: 'error',
        message: 'Problem not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      problem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update details of a logged problem
 */
export const updateProblem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      leetcodeNumber,
      title,
      difficulty,
      topicIds,
      patternIds,
      timeTakenMins,
      dateSolved,
      solvedAlone,
      notes,
      needsRevision,
      confidence,
    } = req.body;

    const existingProblem = await prisma.problem.findUnique({
      where: { id },
    });

    if (!existingProblem || existingProblem.userId !== req.userId) {
      return res.status(404).json({
        status: 'error',
        message: 'Problem not found',
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update basic fields
      const updatedProblem = await tx.problem.update({
        where: { id },
        data: {
          leetcodeNumber,
          title,
          difficulty,
          timeTakenMins,
          dateSolved,
          solvedAlone,
          notes,
          needsRevision,
          confidence,
        },
      });

      // 2. Re-associate Topics if topicIds are explicitly passed
      if (topicIds !== undefined) {
        await tx.problemTopic.deleteMany({
          where: { problemId: id },
        });

        if (topicIds.length > 0) {
          await tx.problemTopic.createMany({
            data: topicIds.map((topicId: string) => ({
              problemId: id,
              topicId,
            })),
          });
        }
      }

      // 3. Re-associate Patterns if patternIds are explicitly passed
      if (patternIds !== undefined) {
        await tx.problemPattern.deleteMany({
          where: { problemId: id },
        });

        if (patternIds.length > 0) {
          await tx.problemPattern.createMany({
            data: patternIds.map((patternId: string) => ({
              problemId: id,
              patternId,
            })),
          });
        }
      }

      // 4. Handle revision scheduling triggers
      if (needsRevision === true) {
        // Create revision if no active uncompleted revision exists
        const activeRevision = await tx.revision.findFirst({
          where: { problemId: id, completed: false },
        });

        if (!activeRevision) {
          const targetDate = dateSolved || updatedProblem.dateSolved;
          const scheduledFor = new Date(targetDate);
          scheduledFor.setDate(scheduledFor.getDate() + 1); // 1 day interval

          await tx.revision.create({
            data: {
              problemId: id,
              scheduledFor,
              intervalDays: 1,
            },
          });
        }
      } else if (needsRevision === false) {
        // Delete all uncompleted revisions since user marked revision as false
        await tx.revision.deleteMany({
          where: {
            problemId: id,
            completed: false,
          },
        });
      }
    });

    // Fetch the updated problem complete with relations
    const fullProblem = await prisma.problem.findUnique({
      where: { id },
      include: {
        topics: {
          select: {
            topic: {
              select: { id: true, name: true }
            }
          }
        },
        patterns: {
          select: {
            pattern: {
              select: { id: true, name: true }
            }
          }
        },
        revisions: true,
      },
    });

    return res.status(200).json({
      status: 'success',
      problem: fullProblem,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a logged problem
 */
export const deleteProblem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const problem = await prisma.problem.findUnique({
      where: { id },
    });

    if (!problem || problem.userId !== req.userId) {
      return res.status(404).json({
        status: 'error',
        message: 'Problem not found',
      });
    }

    // Delete the problem. Cascade onDelete rule cleans up relations.
    await prisma.problem.delete({
      where: { id },
    });

    return res.status(200).json({
      status: 'success',
      message: 'Problem deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch seeded topics
 */
export const getTopics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const topics = await prisma.topic.findMany({
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({
      status: 'success',
      topics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch seeded patterns
 */
export const getPatterns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patterns = await prisma.pattern.findMany({
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({
      status: 'success',
      patterns,
    });
  } catch (error) {
    next(error);
  }
};
