/**
 * "rules" provider: no model, always available, deterministic. Also the
 * automatic fallback when another provider fails or times out.
 */
import {
  REVIEW_MINUTES,
  fitPlan,
  orderedRevisions,
  practiceMinutes,
  strengths,
  targetDifficulty,
  toRecommendation,
  weakSignals,
  weakestPatterns,
} from '../analysis';
import type { AiProvider, StudyTask } from '../types';

const MAX_RECOMMENDATIONS = 5;
const WORK_BLOCK_MINUTES = 50; // insert a short break after this much work

export const rulesProvider: AiProvider = {
  name: 'rules',

  async recommend({ justSolved, candidates }) {
    const picks = candidates.slice(0, MAX_RECOMMENDATIONS).map((c) => toRecommendation(c));
    const anchor = justSolved.patterns[0] ?? justSolved.topics[0];
    const target = targetDifficulty(justSolved);
    const step =
      target === justSolved.difficulty
        ? `at the same ${target.toLowerCase()} level to consolidate`
        : `stepping up to ${target.toLowerCase()}`;
    return {
      recommendations: picks,
      overallReason: anchor
        ? `Unsolved problems that reuse ${anchor} from #${justSolved.leetcodeNumber} ${justSolved.title}, ${step}.`
        : `Core problems you haven't logged yet, starting with your weakest patterns.`,
    };
  },

  async analyzeWeakness(ctx) {
    const weak = weakSignals(ctx).slice(0, 6);
    const focus = weakestPatterns(ctx).slice(0, 2);
    const t = ctx.totals;
    let recommendation: string;
    if (t.solved === 0) {
      recommendation = 'Log a few problems first so there is data to analyse. Start with Hash Map and Two Pointer fundamentals.';
    } else {
      const parts = [
        `You have logged ${t.solved} problem${t.solved === 1 ? '' : 's'}, ${t.solvedAlonePct ?? 0}% without hints, with an average confidence of ${t.avgConfidence}/5.`,
      ];
      if (ctx.overdueRevisions.length) {
        parts.push(`Clear your ${ctx.overdueRevisions.length} overdue revision${ctx.overdueRevisions.length === 1 ? '' : 's'} first.`);
      }
      parts.push(`Then focus on ${focus.join(' and ')}.`);
      recommendation = parts.join(' ');
    }
    return { strengths: strengths(ctx), weakAreas: weak, recommendation };
  },

  async studyPlan({ ctx, minutesAvailable, practice }) {
    const tasks: StudyTask[] = orderedRevisions(ctx).map((r) => ({
      type: 'REVISION',
      description: `Review #${r.leetcodeNumber} ${r.title} (${r.daysOverdue} day${r.daysOverdue === 1 ? '' : 's'} overdue, confidence ${r.confidence}/5)`,
      estMinutes: REVIEW_MINUTES[r.difficulty],
    }));

    for (const { problem, area } of practice) {
      tasks.push({
        type: 'PRACTICE',
        description: `Practice #${problem.number} ${problem.title} (${area}, ${problem.difficulty.toLowerCase()})`,
        estMinutes: practiceMinutes(problem.difficulty),
      });
    }

    // Short break after each ~50 minutes of work.
    const withBreaks: StudyTask[] = [];
    let sinceBreak = 0;
    for (const t of tasks) {
      if (sinceBreak >= WORK_BLOCK_MINUTES) {
        withBreaks.push({ type: 'BREAK', description: 'Short break', estMinutes: 5 });
        sinceBreak = 0;
      }
      withBreaks.push(t);
      sinceBreak += t.estMinutes;
    }
    return fitPlan(withBreaks, minutesAvailable);
  },

  async status() {
    return { reachable: true, detail: 'Built-in rules; always available' };
  },
};
