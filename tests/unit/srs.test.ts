import { describe, expect, it } from 'vitest';
import {
  LADDER,
  firstReviewDate,
  ladderIndex,
  nextConfidence,
  nextInterval,
  ratingFromConfidence,
} from '../../src/services/srs';

describe('spaced repetition rules', () => {
  it('GOOD walks the default 1 -> 3 -> 7 -> 14 -> 30 ladder, then graduates', () => {
    const path: (number | null)[] = [];
    let interval: number | null = 1;
    while (interval !== null) {
      path.push(interval);
      interval = nextInterval(interval, 'GOOD');
    }
    expect(path).toEqual([...LADDER]);
  });

  it('AGAIN resets, HARD repeats, EASY skips a step', () => {
    expect(nextInterval(14, 'AGAIN')).toBe(1);
    expect(nextInterval(7, 'HARD')).toBe(7);
    expect(nextInterval(1, 'EASY')).toBe(7);
    expect(nextInterval(7, 'EASY')).toBe(30);
    expect(nextInterval(14, 'EASY')).toBeNull();
    expect(nextInterval(30, 'HARD')).toBe(30);
  });

  it('maps off-ladder intervals to the step below', () => {
    expect(ladderIndex(5)).toBe(1); // between 3 and 7
    expect(nextInterval(5, 'GOOD')).toBe(7);
    expect(ladderIndex(0)).toBe(0);
  });

  it('maps confidence to ratings', () => {
    expect([1, 2, 3, 4, 5].map(ratingFromConfidence)).toEqual(['AGAIN', 'HARD', 'GOOD', 'GOOD', 'EASY']);
  });

  it('updates confidence from the rating unless given explicitly', () => {
    expect(nextConfidence(3, 'AGAIN')).toBe(2);
    expect(nextConfidence(1, 'AGAIN')).toBe(1);
    expect(nextConfidence(4, 'EASY')).toBe(5);
    expect(nextConfidence(5, 'EASY')).toBe(5);
    expect(nextConfidence(3, 'HARD')).toBe(3);
    expect(nextConfidence(3, 'GOOD', 5)).toBe(5);
  });

  it('never schedules the first review in the past', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const old = new Date('2025-01-01T00:00:00Z');
    expect(firstReviewDate(old, now).toISOString()).toBe('2026-06-16T12:00:00.000Z');
    const future = new Date('2026-06-15T20:00:00Z');
    expect(firstReviewDate(future, now).toISOString()).toBe('2026-06-16T20:00:00.000Z');
  });
});

describe('previewIntervals', () => {
  it('previews every rating from each rung of the ladder', async () => {
    const { previewIntervals } = await import('../../src/services/srs');
    expect(previewIntervals(1)).toEqual({ again: 1, hard: 1, good: 3, easy: 7 });
    expect(previewIntervals(7)).toEqual({ again: 1, hard: 7, good: 14, easy: 30 });
    expect(previewIntervals(14)).toEqual({ again: 1, hard: 14, good: 30, easy: null });
  });
});
