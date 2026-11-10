import { describe, expect, it } from 'vitest';
import { buildHeatmap, computeStreaks } from '../../src/services/stats';
import { dayKey, daysBetween } from '../../src/lib/dates';

describe('streaks', () => {
  it('handles no activity', () => {
    expect(computeStreaks([], '2026-03-10')).toEqual({ current: 0, longest: 0, lastSolvedDate: null });
  });

  it('counts the current streak through today', () => {
    const days = ['2026-03-08', '2026-03-09', '2026-03-10'];
    expect(computeStreaks(days, '2026-03-10')).toMatchObject({ current: 3, longest: 3 });
  });

  it('keeps the streak alive if nothing is solved yet today', () => {
    expect(computeStreaks(['2026-03-08', '2026-03-09'], '2026-03-10').current).toBe(2);
  });

  it('breaks after a missed day and tracks the longest run', () => {
    const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-03-07', '2026-03-08'];
    expect(computeStreaks(days, '2026-03-10')).toEqual({ current: 0, longest: 4, lastSolvedDate: '2026-03-08' });
  });

  it('handles month and leap-year boundaries', () => {
    expect(computeStreaks(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01').current).toBe(3);
  });
});

describe('heatmap', () => {
  it('is dense, oldest first, and ends today', () => {
    const map = buildHeatmap(new Map([['2026-03-10', 2], ['2026-03-01', 1]]), '2026-03-10', 365);
    expect(map).toHaveLength(365);
    expect(map.at(-1)).toEqual({ date: '2026-03-10', count: 2 });
    expect(map[0].date).toBe('2025-03-11');
    expect(map.reduce((s, d) => s + d.count, 0)).toBe(3);
  });
});

describe('time zone day keys', () => {
  it('assigns an instant to the local calendar day', () => {
    const instant = new Date('2026-03-10T20:00:00Z');
    expect(dayKey(instant, 'UTC')).toBe('2026-03-10');
    expect(dayKey(instant, 'Asia/Kolkata')).toBe('2026-03-11');
    expect(dayKey(instant, 'America/Los_Angeles')).toBe('2026-03-10');
    expect(daysBetween('2026-03-10', '2026-03-11')).toBe(1);
  });
});
