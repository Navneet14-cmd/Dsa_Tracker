import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/data/catalog';
import { PATTERN_NAMES, TOPICS } from '../../src/data/taxonomy';
import { fitPlan, practicePicks, rankCandidates, targetDifficulty, weakestPatterns } from '../../src/services/ai/analysis';
import { rulesProvider } from '../../src/services/ai/providers/rules';
import { justSolvedTwoPointer, seededContext } from './fixtures';

describe('curated problem dataset', () => {
  it('has unique numbers and only known tags, and covers every pattern', () => {
    expect(new Set(CATALOG.map((p) => p.number)).size).toBe(CATALOG.length);
    for (const p of CATALOG) {
      expect(['EASY', 'MEDIUM', 'HARD']).toContain(p.difficulty);
      for (const x of p.patterns) expect(PATTERN_NAMES).toContain(x);
      for (const t of p.topics) expect(TOPICS).toContain(t);
      expect(p.title.length).toBeGreaterThan(0);
    }
    for (const pattern of PATTERN_NAMES) {
      expect(CATALOG.filter((p) => p.patterns.includes(pattern)).length, pattern).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('rules provider', () => {
  it('targets the next difficulty unless the user struggled', () => {
    expect(targetDifficulty({ difficulty: 'EASY', confidence: 4 })).toBe('MEDIUM');
    expect(targetDifficulty({ difficulty: 'MEDIUM', confidence: 3 })).toBe('HARD');
    expect(targetDifficulty({ difficulty: 'HARD', confidence: 5 })).toBe('HARD');
    expect(targetDifficulty({ difficulty: 'MEDIUM', confidence: 2 })).toBe('MEDIUM');
  });

  it('recommends unsolved same-pattern problems one step up, deterministically', async () => {
    const ctx = seededContext();
    const candidates = rankCandidates(justSolvedTwoPointer, ctx);
    const out = await rulesProvider.recommend({ justSolved: justSolvedTwoPointer, ctx, candidates });

    expect(out.recommendations).toHaveLength(5);
    const numbers = out.recommendations.map((r) => r.number);
    for (const n of numbers) expect(ctx.solvedNumbers.has(n)).toBe(false);
    // Same pattern and MEDIUM (the next step) come first.
    const first = CATALOG.find((p) => p.number === numbers[0])!;
    expect(first.patterns).toContain('Two Pointer');
    expect(first.difficulty).toBe('MEDIUM');
    expect(out.recommendations[0].reason).toBe('Same pattern (Two Pointer), one step up to medium.');
    expect(out.overallReason).toBe(
      'Unsolved problems that reuse Two Pointer from #125 Valid Palindrome, stepping up to medium.',
    );

    // Same input, same output.
    const again = await rulesProvider.recommend({ justSolved: justSolvedTwoPointer, ctx, candidates: rankCandidates(justSolvedTwoPointer, ctx) });
    expect(again).toEqual(out);
  });

  it('ranks practised-but-weak patterns first, then untouched ones', () => {
    const order = weakestPatterns(seededContext());
    expect(order[0]).toBe('Sliding Window');
    expect(order[1]).toBe('Binary Search'); // first untouched pattern in taxonomy order (after Two Pointer, Sliding Window, Hash Map)
    expect(order.slice(-2)).toEqual(expect.arrayContaining(['Two Pointer', 'Hash Map']));
  });

  it('analyses weak areas from confidence, hints, pace, goals and untouched areas', async () => {
    const out = await rulesProvider.analyzeWeakness(seededContext());
    expect(out.weakAreas[0]).toBe('Trees: 0/5 toward your goal (5 to go)');
    expect(out.weakAreas).toContain('String: low confidence (2/5 over 2 problems)');
    expect(out.weakAreas).toContain('String: needed hints on 100% of problems');
    expect(out.weakAreas.length).toBeLessThanOrEqual(6);
    expect(out.strengths[0]).toBe('Array: 5 solved, avg confidence 3.8/5, 80% without hints');
    expect(out.recommendation).toBe(
      'You have logged 7 problems, 71% without hints, with an average confidence of 3.6/5. Clear your 2 overdue revisions first. Then focus on Sliding Window and Binary Search.',
    );
  });

  it('plans overdue revisions first, then practice for the weakest pattern, within the time', async () => {
    const ctx = seededContext();
    const out = await rulesProvider.studyPlan({ ctx, minutesAvailable: 90, practice: practicePicks(ctx) });
    expect(out.tasks.slice(0, 2).map((t) => t.type)).toEqual(['REVISION', 'REVISION']);
    expect(out.tasks[0].description).toContain('#1 Two Sum'); // most overdue first
    expect(out.tasks[1].description).toContain('#3 ');
    const practice = out.tasks.filter((t) => t.type === 'PRACTICE');
    expect(practice[0].description).toMatch(/^Practice #\d+ .*\(Sliding Window, easy\)$/);
    expect(out.totalMinutes).toBe(out.tasks.reduce((s, t) => s + t.estMinutes, 0));
    expect(out.totalMinutes).toBeLessThanOrEqual(90);
    expect(out.tasks.at(-1)!.type).not.toBe('BREAK');
    expect(out.tasks[0].type).not.toBe('BREAK');
  });

  it('fits plans to the available time without squeezing tasks or leaving stray breaks', () => {
    const plan = fitPlan(
      [
        { type: 'BREAK', description: 'b', estMinutes: 5 },
        { type: 'PRACTICE', description: 'a', estMinutes: 30 },
        { type: 'BREAK', description: 'b', estMinutes: 5 },
        { type: 'PRACTICE', description: 'too long', estMinutes: 45 },
        { type: 'REVISION', description: 'fits', estMinutes: 10 },
        { type: 'BREAK', description: 'b', estMinutes: 5 },
      ],
      50,
    );
    expect(plan.tasks.map((t) => t.description)).toEqual(['a', 'b', 'fits']);
    expect(plan.totalMinutes).toBe(45);
  });
});
