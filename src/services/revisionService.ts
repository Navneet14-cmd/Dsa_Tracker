import { Prisma, RevisionRating } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, notFound } from '../lib/errors';
import { addDays } from '../lib/dates';
import { CompleteRevisionInput } from '../schemas';
import { firstReviewDate, nextConfidence, nextInterval, ratingFromConfidence, LADDER } from './srs';

type Tx = Prisma.TransactionClient;

/**
 * Locks the problem row for the rest of the transaction so concurrent
 * revision changes for the same problem are serialized. Throws 404 when the
 * problem doesn't exist or belongs to someone else.
 */
export async function lockOwnedProblem(tx: Tx, problemId: string, userId: string) {
  const rows = await tx.$queryRaw<{ id: string; dateSolved: Date; confidence: number }[]>`
    SELECT id, "dateSolved", confidence FROM "Problem"
    WHERE id = ${problemId} AND "userId" = ${userId}
    FOR UPDATE`;
  if (rows.length === 0) throw notFound('Problem');
  return rows[0];
}

export const pendingRevision = (tx: Tx, problemId: string) =>
  tx.revision.findFirst({ where: { problemId, completed: false }, orderBy: { scheduledFor: 'asc' } });

/** Creates the first pending review if the problem has none. */
export async function ensurePendingRevision(tx: Tx, problemId: string, scheduledFor: Date) {
  const existing = await pendingRevision(tx, problemId);
  if (existing) return { revision: existing, created: false };
  const revision = await tx.revision.create({
    data: { problemId, scheduledFor, intervalDays: LADDER[0] },
  });
  return { revision, created: true };
}

/** First review for a freshly logged/flagged problem. */
export const scheduleFirstReview = (tx: Tx, problemId: string, dateSolved: Date) =>
  ensurePendingRevision(tx, problemId, firstReviewDate(dateSolved));

export async function addToRevision(problemId: string, userId: string, dueInDays: number) {
  return prisma.$transaction(async (tx) => {
    await lockOwnedProblem(tx, problemId, userId);
    const result = await ensurePendingRevision(tx, problemId, addDays(new Date(), dueInDays));
    await tx.problem.update({ where: { id: problemId }, data: { needsRevision: true } });
    return result;
  });
}

export async function removeFromRevision(problemId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockOwnedProblem(tx, problemId, userId);
    const { count } = await tx.revision.deleteMany({ where: { problemId, completed: false } });
    await tx.problem.update({ where: { id: problemId }, data: { needsRevision: false } });
    return count;
  });
}

/**
 * Completes a pending revision and schedules the next one.
 * The conditional update (completed = false) makes a second, concurrent
 * completion of the same revision fail with 409 instead of creating two
 * follow-up reviews.
 */
export async function completeRevision(revisionId: string, userId: string, input: CompleteRevisionInput) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const revision = await tx.revision.findFirst({
      where: { id: revisionId, problem: { userId } },
      include: { problem: { select: { id: true, confidence: true } } },
    });
    if (!revision) throw notFound('Revision');

    const rating: RevisionRating =
      input.rating ?? (input.confidence !== undefined ? ratingFromConfidence(input.confidence) : 'GOOD');

    const claimed = await tx.revision.updateMany({
      where: { id: revisionId, completed: false },
      data: { completed: true, completedAt: now, rating },
    });
    if (claimed.count === 0) {
      throw new HttpError(409, 'Revision is already completed', 'ALREADY_COMPLETED');
    }

    const intervalDays = nextInterval(revision.intervalDays, rating);
    const confidence = nextConfidence(revision.problem.confidence, rating, input.confidence);

    const nextRevision =
      intervalDays === null
        ? null
        : await tx.revision.create({
            data: { problemId: revision.problemId, scheduledFor: addDays(now, intervalDays), intervalDays },
          });

    const problem = await tx.problem.update({
      where: { id: revision.problemId },
      // Graduating off the ladder takes the problem out of revision.
      data: { confidence, needsRevision: nextRevision !== null },
      select: { id: true, confidence: true, needsRevision: true },
    });

    const completed = await tx.revision.findUniqueOrThrow({ where: { id: revisionId } });
    return { revision: completed, nextRevision, problem, graduated: nextRevision === null };
  });
}
