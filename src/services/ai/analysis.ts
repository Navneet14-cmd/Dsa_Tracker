/**
 * Deterministic analysis of a user's practice data. Powers the "rules"
 * provider and builds the candidate shortlists handed to LLM providers.
 * Everything here is pure: same input, same output.
 */
import type { Difficulty } from '@prisma/client';
import { CATALOG, CatalogProblem, DIFFICULTY_ORDER } from '../../data/catalog';
import { PATTERN_NAMES, TOPICS } from '../../data/taxonomy';
import type { GroupStat, UserContext } from './context';
import { EXPECTED_MINUTES } from './context';
import type { Candidate, JustSolved, Recommendation, StudyTask } from './types';

const DIFFS: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const lower = (d: Difficulty) => d.toLowerCase();

const patternOrder = new Map<string, number>(PATTERN_NAMES.map((p, i) => [p, i]));
const topicOrder = new Map<string, number>(TOPICS.map((t, i) => [t, i]));
const catalogIndex = new Map<number, number>(CATALOG.map((p, i) => [p.number, i]));

// Thresholds for "weak" signals
export const LOW_CONFIDENCE = 3;
export const LOW_SOLVED_ALONE_PCT = 50;
export const SLOW_PACE = 1.5;

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/**
 * Difficulty to aim for next: one step up, unless the user struggled
 * (confidence <= 2), in which case stay at the same level to consolidate.
 */
export function targetDifficulty(js: Pick<JustSolved, 'difficulty' | 'confidence'>): Difficulty {
  const i = DIFFICULTY_ORDER[js.difficulty];
  return js.confidence <= 2 ? js.difficulty : DIFFS[Math.min(2, i + 1)];
}

/**
 * Unsolved catalog problems ranked for "what next" after `justSolved`:
 * same pattern first, then same topic, then closeness to the target
 * difficulty, then catalog order (fundamentals first).
 */
export function rankCandidates(js: JustSolved, ctx: UserContext, limit = 20): Candidate[] {
  const exclude = new Set([...ctx.solvedNumbers, js.leetcodeNumber]);
  const target = DIFFICULTY_ORDER[targetDifficulty(js)];
  const base = DIFFICULTY_ORDER[js.difficulty];

  // Nothing to anchor on: fall back to the user's weakest patterns.
  const anchorPatterns = js.patterns.length || js.topics.length ? js.patterns : weakestPatterns(ctx).slice(0, 2);

  const scored = CATALOG.filter((p) => !exclude.has(p.number)).map((p) => {
    const matchedPatterns = p.patterns.filter((x) => anchorPatterns.includes(x));
    const matchedTopics = p.topics.filter((x) => js.topics.includes(x));
    const d = DIFFICULTY_ORDER[p.difficulty];
    const score =
      (matchedPatterns.length ? 1000 + 50 * matchedPatterns.length : 0) +
      10 * matchedTopics.length -
      30 * Math.abs(d - target);
    return { problem: p, matchedPatterns, matchedTopics, difficultyDelta: d - base, score };
  });

  scored.sort((a, b) => b.score - a.score || catalogIndex.get(a.problem.number)! - catalogIndex.get(b.problem.number)!);
  return scored.slice(0, limit).map(({ score: _s, ...c }) => c);
}

export function candidateReason(c: Candidate): string {
  const p = c.matchedPatterns[0];
  const level = lower(c.problem.difficulty);
  if (p) {
    if (c.difficultyDelta > 0) return `Same pattern (${p}), one step up to ${level}.`;
    if (c.difficultyDelta === 0) return `Same pattern (${p}) at the same level, to lock it in.`;
    return `Same pattern (${p}) on an ${level} problem, to rebuild confidence.`;
  }
  if (c.matchedTopics[0]) return `Same topic (${c.matchedTopics[0]}) with a different technique.`;
  return 'A core interview problem you have not logged yet.';
}

export const toRecommendation = (c: Candidate, reason = candidateReason(c)): Recommendation => ({
  number: c.problem.number,
  title: c.problem.title,
  difficulty: c.problem.difficulty,
  reason,
});

// ---------------------------------------------------------------------------
// Weak areas
// ---------------------------------------------------------------------------

const isWeak = (g: GroupStat) =>
  g.solved > 0 &&
  ((g.avgConfidence ?? 5) < LOW_CONFIDENCE ||
    (g.solved >= 2 && (g.solvedAlonePct ?? 100) < LOW_SOLVED_ALONE_PCT) ||
    (g.avgPaceRatio ?? 0) > SLOW_PACE);

/** Lower = weaker. Combines confidence, independence and pace. */
const strengthScore = (g: GroupStat) =>
  (g.avgConfidence ?? 3) + (g.solvedAlonePct ?? 50) / 50 - Math.max(0, (g.avgPaceRatio ?? 1) - 1);

const byPatternOrder = (a: GroupStat, b: GroupStat) =>
  (patternOrder.get(a.name) ?? 999) - (patternOrder.get(b.name) ?? 999);

/**
 * Patterns ordered weakest first: practiced-but-weak (by score), then
 * untouched (fundamentals first), then the rest (by score).
 */
export function weakestPatterns(ctx: UserContext): string[] {
  const weak = ctx.patterns.filter(isWeak).sort((a, b) => strengthScore(a) - strengthScore(b) || byPatternOrder(a, b));
  const untouched = ctx.patterns.filter((g) => g.solved === 0).sort(byPatternOrder);
  const rest = ctx.patterns
    .filter((g) => g.solved > 0 && !isWeak(g))
    .sort((a, b) => strengthScore(a) - strengthScore(b) || byPatternOrder(a, b));
  return [...weak, ...untouched, ...rest].map((g) => g.name);
}

/** Human-readable weak-area lines, most important first. */
export function weakSignals(ctx: UserContext): string[] {
  const out: string[] = [];
  const groups = [...ctx.topics, ...ctx.patterns];

  for (const g of [...ctx.goals].filter((g) => g.remaining > 0).sort((a, b) => b.remaining - a.remaining || a.topic.localeCompare(b.topic))) {
    out.push(`${g.topic}: ${g.solved}/${g.target} toward your goal (${g.remaining} to go)`);
  }
  for (const g of groups.filter((g) => g.solved > 0 && (g.avgConfidence ?? 5) < LOW_CONFIDENCE).sort((a, b) => a.avgConfidence! - b.avgConfidence!)) {
    out.push(`${g.name}: low confidence (${g.avgConfidence}/5 over ${g.solved} problem${g.solved === 1 ? '' : 's'})`);
  }
  for (const g of groups.filter((g) => g.solved >= 2 && (g.solvedAlonePct ?? 100) < LOW_SOLVED_ALONE_PCT)) {
    out.push(`${g.name}: needed hints on ${Math.round(100 - g.solvedAlonePct!)}% of problems`);
  }
  for (const g of groups.filter((g) => g.solved > 0 && (g.avgPaceRatio ?? 0) > SLOW_PACE)) {
    out.push(`${g.name}: taking ${g.avgPaceRatio}x the expected time for the difficulty`);
  }
  const untouchedTopics = ctx.topics.filter((g) => g.solved === 0).sort((a, b) => (topicOrder.get(a.name) ?? 99) - (topicOrder.get(b.name) ?? 99));
  for (const g of untouchedTopics.slice(0, 3)) out.push(`${g.name}: no problems solved yet`);
  const untouchedPatterns = ctx.patterns.filter((g) => g.solved === 0).sort(byPatternOrder);
  for (const g of untouchedPatterns.slice(0, 3)) out.push(`${g.name} pattern: not practised yet`);

  return [...new Set(out)];
}

export function strengths(ctx: UserContext): string[] {
  return [...ctx.topics, ...ctx.patterns]
    .filter(
      (g) =>
        g.solved >= 2 &&
        (g.avgConfidence ?? 0) >= 3.5 &&
        (g.solvedAlonePct ?? 0) >= 60 &&
        (g.avgPaceRatio ?? 0) <= SLOW_PACE,
    )
    .sort((a, b) => b.solved - a.solved || b.avgConfidence! - a.avgConfidence! || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((g) => `${g.name}: ${g.solved} solved, avg confidence ${g.avgConfidence}/5, ${g.solvedAlonePct}% without hints`);
}

// ---------------------------------------------------------------------------
// Study plan
// ---------------------------------------------------------------------------

export const REVIEW_MINUTES: Record<Difficulty, number> = { EASY: 10, MEDIUM: 20, HARD: 30 };

/** Overdue reviews, most overdue then least confident first. */
export const orderedRevisions = (ctx: UserContext) =>
  [...ctx.overdueRevisions].sort((a, b) => b.daysOverdue - a.daysOverdue || a.confidence - b.confidence || a.leetcodeNumber - b.leetcodeNumber);

/**
 * Unsolved practice problems for the weakest areas: up to `perArea` per
 * pattern, easiest first for untouched or low-confidence patterns.
 */
export function practicePicks(ctx: UserContext, limit = 12, perArea = 2): { problem: CatalogProblem; area: string }[] {
  const picks: { problem: CatalogProblem; area: string }[] = [];
  const taken = new Set(ctx.solvedNumbers);
  const stats = new Map(ctx.patterns.map((g) => [g.name, g]));

  for (const area of weakestPatterns(ctx)) {
    if (picks.length >= limit) break;
    const g = stats.get(area);
    const gentle = !g || g.solved === 0 || (g.avgConfidence ?? 0) < LOW_CONFIDENCE;
    const ranked = CATALOG.filter((p) => p.patterns.includes(area as never) && !taken.has(p.number)).sort(
      (a, b) =>
        (gentle ? DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] : Math.abs(DIFFICULTY_ORDER[a.difficulty] - 1) - Math.abs(DIFFICULTY_ORDER[b.difficulty] - 1)) ||
        catalogIndex.get(a.number)! - catalogIndex.get(b.number)!,
    );
    for (const p of ranked.slice(0, perArea)) {
      picks.push({ problem: p, area });
      taken.add(p.number);
    }
  }
  return picks.slice(0, limit);
}

/**
 * Keep a plan within the available time. Tasks that don't fit are skipped
 * (a later, shorter task may still fit) rather than squeezed; breaks never
 * start, end or double up.
 */
export function fitPlan(tasks: StudyTask[], minutesAvailable: number) {
  const fitted: StudyTask[] = [];
  let used = 0;
  for (const t of tasks) {
    if (t.estMinutes <= 0 || used + t.estMinutes > minutesAvailable) continue;
    fitted.push({ ...t });
    used += t.estMinutes;
  }
  const out: StudyTask[] = [];
  let pendingBreak: StudyTask | null = null;
  for (const t of fitted) {
    if (t.type === 'BREAK') {
      if (out.length && !pendingBreak) pendingBreak = t;
      continue;
    }
    if (pendingBreak) out.push(pendingBreak);
    pendingBreak = null;
    out.push(t);
  }
  return { tasks: out, totalMinutes: out.reduce((s, t) => s + t.estMinutes, 0) };
}

export const practiceMinutes = (d: Difficulty) => EXPECTED_MINUTES[d];
