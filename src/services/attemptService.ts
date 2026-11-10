import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { CreateAttemptInput } from '../schemas';
import { completeRevisionInTx, lockOwnedProblem } from './revisionService';

/**
 * Logs a re-attempt of an already-logged problem:
 *  - records the attempt,
 *  - sets the problem's confidence to the attempt's (latest) confidence,
 *  - completes the problem's pending review if it is due, using the
 *    attempt's confidence as the rating (1 again, 2 hard, 3-4 good, 5 easy).
 */
export async function logAttempt(problemId: string, userId: string, input: CreateAttemptInput) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const locked = await lockOwnedProblem(tx, problemId, userId);

    const attempt = await tx.problemAttempt.create({
      data: {
        problemId,
        attemptedAt: input.attemptedAt ?? now,
        timeTakenMins: input.timeTakenMins,
        solvedAlone: input.solvedAlone,
        confidence: input.confidence,
        notes: input.notes || null,
      },
    });

    const due = await tx.revision.findFirst({
      where: { problemId, completed: false, scheduledFor: { lte: now } },
      orderBy: { scheduledFor: 'asc' },
    });

    let review = null;
    if (due) {
      review = await completeRevisionInTx(tx, due, locked.confidence, { confidence: input.confidence }, now);
    } else {
      await tx.problem.update({ where: { id: problemId }, data: { confidence: input.confidence } });
    }

    const problem = await tx.problem.findUniqueOrThrow({
      where: { id: problemId },
      select: { id: true, leetcodeNumber: true, title: true, confidence: true, needsRevision: true },
    });

    return {
      attempt,
      problem,
      completedRevision: review?.revision ?? null,
      nextRevision: review?.nextRevision ?? null,
    };
  });
}

export async function listAttempts(problemId: string, userId: string) {
  const problem = await prisma.problem.findFirst({ where: { id: problemId, userId }, select: { id: true } });
  if (!problem) throw notFound('Problem');
  return prisma.problemAttempt.findMany({ where: { problemId }, orderBy: { attemptedAt: 'desc' } });
}

export async function deleteAttempt(problemId: string, attemptId: string, userId: string) {
  const { count } = await prisma.problemAttempt.deleteMany({
    where: { id: attemptId, problemId, problem: { userId } },
  });
  if (count === 0) throw notFound('Attempt');
}
