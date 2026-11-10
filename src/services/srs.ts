/**
 * Spaced-repetition rules. Pure functions only; persistence lives in
 * revisionService.
 */
import { addDays } from '../lib/dates';
import type { Rating } from '../schemas';

/** Default review ladder, in days. GOOD on every review walks this path. */
export const LADDER = [1, 3, 7, 14, 30] as const;

/** Index of the ladder step for an interval (largest step <= interval). */
export function ladderIndex(intervalDays: number): number {
  let idx = 0;
  for (let i = 0; i < LADDER.length; i++) {
    if (LADDER[i] <= intervalDays) idx = i;
  }
  return idx;
}

/**
 * Interval for the next review, or null when the problem graduates
 * (no further reviews scheduled).
 *   AGAIN -> back to the first step (1 day)
 *   HARD  -> repeat the current step
 *   GOOD  -> next step (the default 1 -> 3 -> 7 -> 14 -> 30 path)
 *   EASY  -> skip a step
 */
export function nextInterval(currentIntervalDays: number, rating: Rating): number | null {
  const i = ladderIndex(currentIntervalDays);
  const step = (n: number) => (n < LADDER.length ? LADDER[n] : null);
  switch (rating) {
    case 'AGAIN': return LADDER[0];
    case 'HARD': return LADDER[i];
    case 'GOOD': return step(i + 1);
    case 'EASY': return step(i + 2);
  }
}

/** Map a 1-5 confidence self-score onto a rating. */
export function ratingFromConfidence(confidence: number): Rating {
  if (confidence <= 1) return 'AGAIN';
  if (confidence === 2) return 'HARD';
  if (confidence >= 5) return 'EASY';
  return 'GOOD';
}

/**
 * New problem confidence after a review. An explicit 1-5 score wins;
 * otherwise AGAIN lowers it, EASY raises it, HARD/GOOD keep it.
 */
export function nextConfidence(current: number, rating: Rating, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const clamp = (n: number) => Math.min(5, Math.max(1, n));
  switch (rating) {
    case 'AGAIN': return clamp(current - 1);
    case 'EASY': return clamp(current + 1);
    default: return clamp(current);
  }
}

/**
 * When the first review of a problem is due. Counted from the later of
 * dateSolved and now, so back-dated logs are never created already overdue.
 */
export function firstReviewDate(dateSolved: Date, now: Date = new Date(), days: number = LADDER[0]): Date {
  const base = dateSolved.getTime() > now.getTime() ? dateSolved : now;
  return addDays(base, days);
}
