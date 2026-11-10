import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { dayKey, daysBetween } from '../lib/dates';
import { CompleteRevisionInput, IdParams, TimeZoneQuery } from '../schemas';
import { completeRevision as completeRevisionTx } from '../services/revisionService';

const revisionProblem = {
  problem: {
    select: { id: true, leetcodeNumber: true, title: true, difficulty: true, confidence: true },
  },
} as const;

/** GET /revisions/due — pending reviews scheduled at or before now. */
export const getDueRevisions = async (req: Request, res: Response) => {
  const revisions = await prisma.revision.findMany({
    where: { completed: false, scheduledFor: { lte: new Date() }, problem: { userId: req.userId } },
    include: revisionProblem,
    orderBy: { scheduledFor: 'asc' },
  });
  res.status(200).json({ status: 'success', revisions });
};

/**
 * GET /revisions/upcoming?tz=Area/City
 * Future reviews bucketed by their real scheduled calendar day in the
 * caller's time zone: later today, tomorrow, within the next 7 days, later.
 */
export const getUpcomingRevisions = async (req: Request, res: Response) => {
  const { tz } = req.query as unknown as z.infer<typeof TimeZoneQuery>;
  const now = new Date();

  const upcoming = await prisma.revision.findMany({
    where: { completed: false, scheduledFor: { gt: now }, problem: { userId: req.userId } },
    include: revisionProblem,
    orderBy: { scheduledFor: 'asc' },
  });

  const today = dayKey(now, tz);
  const buckets = {
    today: [] as typeof upcoming,
    tomorrow: [] as typeof upcoming,
    thisWeek: [] as typeof upcoming,
    later: [] as typeof upcoming,
  };
  for (const r of upcoming) {
    const diff = daysBetween(today, dayKey(r.scheduledFor, tz));
    if (diff <= 0) buckets.today.push(r);
    else if (diff === 1) buckets.tomorrow.push(r);
    else if (diff <= 7) buckets.thisWeek.push(r);
    else buckets.later.push(r);
  }

  res.status(200).json({ status: 'success', timeZone: tz, data: buckets });
};

/**
 * POST /revisions/:id/complete
 * Optional body: { rating: "again" | "hard" | "good" | "easy" } and/or
 * { confidence: 1-5 }. With no body the review counts as "good".
 */
export const completeRevision = async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const result = await completeRevisionTx(id, req.userId!, req.body as CompleteRevisionInput);
  res.status(200).json({ status: 'success', ...result });
};
