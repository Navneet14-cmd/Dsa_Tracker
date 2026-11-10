import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { buildUserContext, describeContext, GroupStat, UserContext } from './context';
import { callClaude, isMockMode } from './claude';
import { CATALOG, CatalogProblem, GENERAL } from './catalog';

export { isMockMode };

const Difficulty = z.enum(['EASY', 'MEDIUM', 'HARD']);

const RecommendationsOutput = z.object({
  recommendations: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      difficulty: Difficulty,
      reason: z.string(),
    }),
  ),
  overallReason: z.string(),
});

const WeaknessOutput = z.object({
  strengths: z.array(z.string()),
  weakAreas: z.array(z.string()),
  recommendation: z.string(),
});

const StudyPlanOutput = z.object({
  tasks: z.array(
    z.object({
      type: z.enum(['REVISION', 'PRACTICE', 'BREAK']),
      description: z.string(),
      estMinutes: z.number().int(),
    }),
  ),
  totalMinutes: z.number().int(),
});

type Recommendation = z.infer<typeof RecommendationsOutput>['recommendations'][number];
type Task = z.infer<typeof StudyPlanOutput>['tasks'][number];

const MAX_RECOMMENDATIONS = 5;

/** Drop anything the user already logged (and duplicates), server-side. */
function filterRecommendations(recs: Recommendation[], ctx: UserContext, exclude: number[] = []) {
  const seen = new Set<number>([...ctx.solvedNumbers, ...exclude]);
  const kept: Recommendation[] = [];
  for (const r of recs) {
    if (seen.has(r.number)) continue;
    seen.add(r.number);
    kept.push(r);
  }
  return { kept: kept.slice(0, MAX_RECOMMENDATIONS), filteredOut: recs.length - kept.length };
}

/** Keep the plan within the user's available time. */
function fitPlan(tasks: Task[], minutesAvailable: number) {
  const out: Task[] = [];
  let used = 0;
  for (const t of tasks) {
    if (t.estMinutes <= 0) continue;
    const remaining = minutesAvailable - used;
    if (remaining < 5) break;
    const estMinutes = Math.min(t.estMinutes, remaining);
    out.push({ ...t, estMinutes });
    used += estMinutes;
  }
  // A trailing break is pointless.
  while (out.length && out[out.length - 1].type === 'BREAK') used -= out.pop()!.estMinutes;
  return { tasks: out, totalMinutes: used };
}

// ---------------------------------------------------------------------------
// Weak-area heuristics (used by mock mode and as hints in prompts)
// ---------------------------------------------------------------------------

function weakSignals(ctx: UserContext): string[] {
  const out: string[] = [];
  for (const g of ctx.goals.filter((g) => g.remaining > 0).sort((a, b) => b.remaining - a.remaining)) {
    out.push(`${g.topic}: ${g.solved}/${g.target} toward your goal (${g.remaining} to go)`);
  }
  const practiced = [...ctx.topics, ...ctx.patterns].filter((g) => g.solved > 0);
  for (const g of practiced.filter((g) => (g.avgConfidence ?? 5) < 3)) {
    out.push(`${g.name}: low confidence (${g.avgConfidence}/5 over ${g.solved} problems)`);
  }
  for (const g of practiced.filter((g) => g.solved >= 2 && (g.solvedAlonePct ?? 100) < 50)) {
    out.push(`${g.name}: needed hints on ${Math.round(100 - g.solvedAlonePct!)}% of problems`);
  }
  for (const g of practiced.filter((g) => (g.avgPaceRatio ?? 0) > 1.5)) {
    out.push(`${g.name}: taking ${g.avgPaceRatio}x the expected time`);
  }
  for (const g of ctx.topics.filter((g) => g.solved === 0).slice(0, 3)) {
    out.push(`${g.name}: no problems solved yet`);
  }
  return [...new Set(out)];
}

function weakestAreaNames(ctx: UserContext, n: number): string[] {
  const score = (g: GroupStat) =>
    g.solved === 0 ? 0 : (g.avgConfidence ?? 3) + (g.solvedAlonePct ?? 50) / 50 - Math.max(0, (g.avgPaceRatio ?? 1) - 1);
  const gaps = ctx.goals.filter((g) => g.remaining > 0).map((g) => g.topic);
  const ranked = [...ctx.topics].sort((a, b) => score(a) - score(b)).map((g) => g.name);
  return [...new Set([...gaps, ...ranked])].slice(0, n);
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export async function recommend(userId: string, problemId: string) {
  const justSolved = await prisma.problem.findFirst({
    where: { id: problemId, userId },
    include: {
      topics: { select: { topic: { select: { name: true } } } },
      patterns: { select: { pattern: { select: { name: true } } } },
    },
  });
  if (!justSolved) throw notFound('Just-solved problem');

  const ctx = await buildUserContext(userId);
  const patternNames = justSolved.patterns.map((p) => p.pattern.name);
  const topicNames = justSolved.topics.map((t) => t.topic.name);

  if (isMockMode()) {
    const order: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };
    const target = Math.min(2, order[justSolved.difficulty] + (justSolved.confidence >= 4 ? 1 : 0));
    const pool: (CatalogProblem & { from: string })[] = [
      ...patternNames.flatMap((name) => (CATALOG[name] ?? []).map((c) => ({ ...c, from: name }))),
      ...GENERAL.map((c) => ({ ...c, from: 'core interview set' })),
    ].sort((a, b) => Math.abs(order[a.difficulty] - target) - Math.abs(order[b.difficulty] - target));
    const recs = pool.map((c) => ({
      number: c.number,
      title: c.title,
      difficulty: c.difficulty,
      reason:
        c.from === 'core interview set'
          ? 'A core interview problem you have not logged yet.'
          : `Builds on the ${c.from} technique from #${justSolved.leetcodeNumber}.`,
    }));
    const { kept, filteredOut } = filterRecommendations(recs, ctx, [justSolved.leetcodeNumber]);
    return {
      recommendations: kept.slice(0, 3),
      overallReason: `You solved '${justSolved.title}'. These reinforce ${patternNames.join(', ') || 'the same ideas'} at a similar or slightly harder level.`,
      source: 'mock' as const,
      filteredOut,
    };
  }

  const output = await callClaude({
    system:
      'You recommend LeetCode problems for a student practising data structures and algorithms. ' +
      'Recommend real problems with their exact LeetCode number, title and difficulty, verified with web search. ' +
      'Pick problems that build on the pattern the student just used, pitched at their demonstrated level: ' +
      'step up in difficulty when they were confident, fast and hint-free, consolidate when they were not, ' +
      'and favour areas behind on their goals. Never recommend a problem from their solved list. ' +
      'Give 5 recommendations, each with a one-sentence reason specific to this student.',
    prompt:
      `# Just solved\n#${justSolved.leetcodeNumber} ${justSolved.title} (${justSolved.difficulty}), ` +
      `${justSolved.timeTakenMins} min, confidence ${justSolved.confidence}/5, ` +
      `${justSolved.solvedAlone ? 'without hints' : 'with hints'}. ` +
      `Topics: ${topicNames.join(', ') || '-'}. Patterns: ${patternNames.join(', ') || '-'}.\n\n` +
      `# All solved LeetCode numbers (do not recommend these)\n${[...ctx.solvedNumbers].sort((a, b) => a - b).join(', ')}\n\n` +
      describeContext(ctx),
    schema: RecommendationsOutput,
    webSearch: true,
    effort: 'medium',
  });

  const { kept, filteredOut } = filterRecommendations(output.recommendations, ctx, [justSolved.leetcodeNumber]);
  return { recommendations: kept, overallReason: output.overallReason, source: 'claude' as const, filteredOut };
}

export async function analyzeWeakness(userId: string) {
  const ctx = await buildUserContext(userId);

  if (isMockMode()) {
    const strong = [...ctx.topics, ...ctx.patterns]
      .filter((g) => g.solved > 0 && (g.avgConfidence ?? 0) >= 3.5)
      .sort((a, b) => b.solved - a.solved)
      .slice(0, 3)
      .map((g) => `${g.name}: ${g.solved} solved, avg confidence ${g.avgConfidence}/5`);
    const weak = weakSignals(ctx).slice(0, 4);
    const focus = weakestAreaNames(ctx, 2);
    return {
      strengths: strong,
      weakAreas: weak,
      recommendation:
        ctx.totals.solved === 0
          ? 'Log a few problems first so there is data to analyse. Start with Array and Hash Table fundamentals.'
          : `You have logged ${ctx.totals.solved} problems with ${ctx.totals.solvedAlonePct ?? 0}% solved without hints. ` +
            `Focus next on ${focus.join(' and ')}` +
            (ctx.overdueRevisions.length ? `, and clear your ${ctx.overdueRevisions.length} overdue revision(s) first.` : '.'),
      source: 'mock' as const,
    };
  }

  const output = await callClaude({
    system:
      "You analyse a student's LeetCode practice log. Identify genuine strengths and weak areas using all the " +
      'signals given: volume, confidence, whether they needed hints, time taken against the benchmark, overdue ' +
      'revisions and goal gaps. Each strength or weak area is one short line naming the topic or pattern and the ' +
      'evidence. Finish with one paragraph of concrete, prioritised advice.',
    prompt: `${describeContext(ctx)}\n\n## Signals worth checking\n${weakSignals(ctx).join('\n') || 'None.'}`,
    schema: WeaknessOutput,
    effort: 'low',
  });
  return { ...output, source: 'claude' as const };
}

const REVIEW_MINUTES = { EASY: 10, MEDIUM: 20, HARD: 30 } as const;

export async function generateStudyPlan(userId: string, minutesAvailable: number) {
  const ctx = await buildUserContext(userId);

  if (isMockMode()) {
    const tasks: Task[] = ctx.overdueRevisions.map((r) => ({
      type: 'REVISION',
      description: `Review #${r.leetcodeNumber} - ${r.title} (${r.daysOverdue} days overdue, confidence ${r.confidence}/5)`,
      estMinutes: REVIEW_MINUTES[r.difficulty],
    }));
    const areas = weakestAreaNames(ctx, 4);
    for (let i = 0; i < areas.length; i++) {
      if (i > 0) tasks.push({ type: 'BREAK', description: 'Short break', estMinutes: 5 });
      tasks.push({
        type: 'PRACTICE',
        description: `Practice a new medium-difficulty ${areas[i]} problem`,
        estMinutes: 30,
      });
    }
    return { ...fitPlan(tasks, minutesAvailable), source: 'mock' as const };
  }

  const output = await callClaude({
    system:
      'You plan a single study session for a student practising LeetCode. Put overdue revisions first ' +
      '(most overdue and lowest confidence first), then practise weak areas and goal gaps, with short breaks ' +
      'in long sessions. The task minutes must add up to no more than the time available. Name specific ' +
      'problems for revisions; for practice, name the topic or pattern and a difficulty.',
    prompt: `Time available: ${minutesAvailable} minutes.\n\n${describeContext(ctx)}`,
    schema: StudyPlanOutput,
    effort: 'low',
  });
  return { ...fitPlan(output.tasks, minutesAvailable), source: 'claude' as const };
}
