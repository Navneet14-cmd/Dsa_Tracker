import { addDaysToKey, daysBetween } from '../lib/dates';

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const avg = (xs: number[]): number | null => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
export const pct = (part: number, whole: number): number | null => (whole > 0 ? round1((part / whole) * 100) : null);

export interface Streak {
  current: number;
  longest: number;
  lastSolvedDate: string | null;
}

/**
 * Daily solving streaks from the set of days ("YYYY-MM-DD") with at least
 * one solve. The current streak stays alive through today: if nothing has
 * been solved yet today, it counts back from yesterday.
 */
export function computeStreaks(days: Iterable<string>, today: string): Streak {
  const sorted = [...new Set(days)].filter((d) => d <= today).sort();
  if (sorted.length === 0) return { current: 0, longest: 0, lastSolvedDate: null };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const set = new Set(sorted);
  const last = sorted[sorted.length - 1];
  let current = 0;
  if (daysBetween(last, today) <= 1) {
    let cursor = last;
    while (set.has(cursor)) {
      current++;
      cursor = addDaysToKey(cursor, -1);
    }
  }
  return { current, longest, lastSolvedDate: last };
}

/** Dense per-day counts for the `days` days ending today, oldest first. */
export function buildHeatmap(counts: Map<string, number>, today: string, days = 365) {
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysToKey(today, -i);
    out.push({ date, count: counts.get(date) ?? 0 });
  }
  return out;
}
