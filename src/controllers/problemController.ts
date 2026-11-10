import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, badRequest, notFound, unauthorized } from '../lib/errors';
import {
  CreateProblemInput,
  GetProblemsQuery,
  IdParams,
  UpdateProblemInput,
  AddToRevisionSchema,
  CreateAttemptInput,
} from '../schemas';
import { deleteAttempt, listAttempts, logAttempt } from '../services/attemptService';
import { z } from 'zod';
import {
  addToRevision,
  lockOwnedProblem,
  removeFromRevision,
  scheduleFirstReview,
} from '../services/revisionService';

type Tx = Prisma.TransactionClient;

const problemInclude = {
  topics: { select: { topic: { select: { id: true, name: true } } } },
  patterns: { select: { pattern: { select: { id: true, name: true } } } },
  revisions: { orderBy: { scheduledFor: 'asc' } },
  attempts: { orderBy: { attemptedAt: 'desc' } },
} satisfies Prisma.ProblemInclude;

/** 400 listing any topic/pattern ids that don't exist. */
async function assertTaxonomyExists(topicIds: string[] = [], patternIds: string[] = []) {
  const [topics, patterns] = await Promise.all([
    topicIds.length ? prisma.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true } }) : [],
    patternIds.length ? prisma.pattern.findMany({ where: { id: { in: patternIds } }, select: { id: true } }) : [],
  ]);
  const found = new Set([...topics, ...patterns].map((r) => r.id));
  const errors = [
    ...topicIds.filter((id) => !found.has(id)).map((id) => ({ field: 'topicIds', message: `Unknown topicId: ${id}` })),
    ...patternIds.filter((id) => !found.has(id)).map((id) => ({ field: 'patternIds', message: `Unknown patternId: ${id}` })),
  ];
  if (errors.length) throw badRequest(errors[0].message, { code: 'INVALID_REFERENCE', errors });
}

/**
 * One entry per LeetCode problem per user. Logging the same number again
 * returns 409 DUPLICATE_PROBLEM with the existing entry's id; the client then
 * offers to log a re-attempt (POST /problems/:id/attempts) or open the entry.
 * The user row lock serializes concurrent logs for the same user.
 */
async function assertNotDuplicate(tx: Tx, userId: string, leetcodeNumber: number, exceptId?: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  if (locked.length === 0) throw unauthorized('User no longer exists');

  const dup = await tx.problem.findFirst({
    where: { userId, leetcodeNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, title: true },
  });
  if (dup) {
    throw new HttpError(
      409,
      `You've already logged LeetCode #${leetcodeNumber} ("${dup.title}"). Log a re-attempt or open the existing entry.`,
      'DUPLICATE_PROBLEM',
      { existingProblemId: dup.id },
    );
  }
}

/** POST /problems */
export const createProblem = async (req: Request, res: Response) => {
  const input = req.body as CreateProblemInput;
  const userId = req.userId!;

  await assertTaxonomyExists(input.topicIds, input.patternIds);

  const problem = await prisma.$transaction(async (tx) => {
    await assertNotDuplicate(tx, userId, input.leetcodeNumber);

    const created = await tx.problem.create({
      data: {
        userId,
        leetcodeNumber: input.leetcodeNumber,
        title: input.title,
        difficulty: input.difficulty,
        timeTakenMins: input.timeTakenMins,
        dateSolved: input.dateSolved,
        solvedAlone: input.solvedAlone,
        notes: input.notes || null,
        needsRevision: input.needsRevision,
        confidence: input.confidence,
        topics: { create: input.topicIds.map((topicId) => ({ topicId })) },
        patterns: { create: input.patternIds.map((patternId) => ({ patternId })) },
      },
    });

    if (input.needsRevision) await scheduleFirstReview(tx, created.id, input.dateSolved);

    return tx.problem.findUniqueOrThrow({ where: { id: created.id }, include: problemInclude });
  });

  res.status(201).json({ status: 'success', problem });
};

/** GET /problems */
export const getProblems = async (req: Request, res: Response) => {
  const { page, limit, topicId, patternId, difficulty, startDate, endDate, search } =
    req.query as unknown as GetProblemsQuery;

  const where: Prisma.ProblemWhereInput = { userId: req.userId! };
  if (difficulty) where.difficulty = difficulty;
  if (topicId) where.topics = { some: { topicId } };
  if (patternId) where.patterns = { some: { patternId } };
  if (startDate || endDate) where.dateSolved = { gte: startDate, lte: endDate };
  if (search) {
    where.OR = /^\d+$/.test(search)
      ? [{ leetcodeNumber: Number(search) }, { title: { contains: search, mode: 'insensitive' } }]
      : [{ title: { contains: search, mode: 'insensitive' } }];
  }

  const [problems, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ dateSolved: 'desc' }, { id: 'desc' }],
      include: { topics: problemInclude.topics, patterns: problemInclude.patterns },
    }),
    prisma.problem.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    problems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

/** GET /problems/:id */
export const getProblemById = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const problem = await prisma.problem.findFirst({ where: { id, userId: req.userId }, include: problemInclude });
  if (!problem) throw notFound('Problem');
  res.status(200).json({ status: 'success', problem });
};

/** PATCH /problems/:id */
export const updateProblem = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const input = req.body as UpdateProblemInput;
  const userId = req.userId!;

  await assertTaxonomyExists(input.topicIds, input.patternIds);

  const problem = await prisma.$transaction(async (tx) => {
    const existing = await lockOwnedProblem(tx, id, userId);
    if (input.leetcodeNumber !== undefined) await assertNotDuplicate(tx, userId, input.leetcodeNumber, id);

    const { topicIds, patternIds, needsRevision, ...fields } = input;
    await tx.problem.update({
      where: { id },
      data: {
        ...fields,
        ...(needsRevision !== undefined ? { needsRevision } : {}),
        ...(topicIds ? { topics: { deleteMany: {}, create: topicIds.map((topicId) => ({ topicId })) } } : {}),
        ...(patternIds ? { patterns: { deleteMany: {}, create: patternIds.map((patternId) => ({ patternId })) } } : {}),
      },
    });

    if (needsRevision === true) {
      // No-op when a review is already pending.
      await scheduleFirstReview(tx, id, input.dateSolved ?? existing.dateSolved);
    } else if (needsRevision === false) {
      await tx.revision.deleteMany({ where: { problemId: id, completed: false } });
    }

    return tx.problem.findUniqueOrThrow({ where: { id }, include: problemInclude });
  });

  res.status(200).json({ status: 'success', problem });
};

/** DELETE /problems/:id */
export const deleteProblem = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  // Cascades remove topic/pattern links and revisions.
  const { count } = await prisma.problem.deleteMany({ where: { id, userId: req.userId } });
  if (count === 0) throw notFound('Problem');
  res.status(200).json({ status: 'success', message: 'Problem deleted successfully' });
};

/** POST /problems/:id/revision — put a problem (back) into the review queue. */
export const addProblemToRevision = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const { dueInDays } = req.body as z.infer<typeof AddToRevisionSchema>;
  const { revision, created } = await addToRevision(id, req.userId!, dueInDays);
  res.status(created ? 201 : 200).json({ status: 'success', created, revision });
};

/** DELETE /problems/:id/revision — take a problem out of the review queue. */
export const removeProblemFromRevision = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const removed = await removeFromRevision(id, req.userId!);
  res.status(200).json({ status: 'success', removedPendingRevisions: removed });
};

/** GET /problems/:id/revisions — full review history for one problem. */
export const getProblemRevisionHistory = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const problem = await prisma.problem.findFirst({
    where: { id, userId: req.userId },
    select: {
      id: true,
      leetcodeNumber: true,
      title: true,
      confidence: true,
      needsRevision: true,
      revisions: { orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }] },
      attempts: { orderBy: { attemptedAt: 'desc' } },
    },
  });
  if (!problem) throw notFound('Problem');

  const { revisions, attempts, ...summary } = problem;
  const completed = revisions.filter((r) => r.completed);
  res.status(200).json({
    status: 'success',
    problem: summary,
    revisions,
    attempts,
    stats: {
      attemptCount: attempts.length,
      completedCount: completed.length,
      pending: revisions.find((r) => !r.completed) ?? null,
      lastCompletedAt: completed.at(-1)?.completedAt ?? null,
      lastRating: completed.at(-1)?.rating ?? null,
      ratings: {
        again: completed.filter((r) => r.rating === 'AGAIN').length,
        hard: completed.filter((r) => r.rating === 'HARD').length,
        good: completed.filter((r) => r.rating === 'GOOD').length,
        easy: completed.filter((r) => r.rating === 'EASY').length,
      },
    },
  });
};

/** POST /problems/:id/attempts — log a re-solve of an existing problem. */
export const createAttempt = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const result = await logAttempt(id, req.userId!, req.body as CreateAttemptInput);
  res.status(201).json({ status: 'success', ...result });
};

/** GET /problems/:id/attempts */
export const getAttempts = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  res.status(200).json({ status: 'success', attempts: await listAttempts(id, req.userId!) });
};

/** DELETE /problems/:id/attempts/:attemptId */
export const removeAttempt = async (req: Request, res: Response) => {
  const { id, attemptId } = req.params as unknown as { id: string; attemptId: string };
  await deleteAttempt(id, attemptId, req.userId!);
  res.status(200).json({ status: 'success', message: 'Attempt deleted' });
};

/** GET /topics */
export const getTopics = async (_req: Request, res: Response) => {
  const topics = await prisma.topic.findMany({ orderBy: { name: 'asc' } });
  res.status(200).json({ status: 'success', topics });
};

/** GET /patterns */
export const getPatterns = async (_req: Request, res: Response) => {
  const patterns = await prisma.pattern.findMany({
    orderBy: { name: 'asc' },
    include: { topics: { select: { topicId: true } } },
  });
  res.status(200).json({
    status: 'success',
    // topicIds is additive; id/name are unchanged.
    patterns: patterns.map(({ topics, ...p }) => ({ ...p, topicIds: topics.map((t) => t.topicId) })),
  });
};
