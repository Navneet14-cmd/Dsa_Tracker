/**
 * AI service: picks a provider from AI_PROVIDER (rules | ollama | anthropic)
 * and falls back to the built-in "rules" provider whenever the chosen one
 * fails, times out or returns nothing usable. Every result carries `source`
 * (the provider that actually produced it).
 */
import { prisma } from '../../lib/prisma';
import { HttpError, notFound } from '../../lib/errors';
import { buildUserContext } from './context';
import { practicePicks, rankCandidates } from './analysis';
import { rulesProvider } from './providers/rules';
import { createOllamaProvider } from './providers/ollama';
import { createAnthropicProvider } from './providers/anthropic';
import type { AiProvider, AiSource, JustSolved, Recommendation } from './types';

export type { AiProvider, AiSource } from './types';

const MAX_RECOMMENDATIONS = 5;

export interface Fallback {
  fallbackFrom?: AiSource;
  fallbackReason?: string;
}

export interface AiServiceConfig {
  AI_PROVIDER: AiSource;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_TIMEOUT_MS: number;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_FAST_MODEL: string;
  ANTHROPIC_TIMEOUT_MS: number;
  AI_WEB_SEARCH_MAX_USES: number;
}

export function providerFromConfig(c: AiServiceConfig): AiProvider {
  switch (c.AI_PROVIDER) {
    case 'ollama':
      return createOllamaProvider({ baseUrl: c.OLLAMA_BASE_URL, model: c.OLLAMA_MODEL, timeoutMs: c.OLLAMA_TIMEOUT_MS });
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: c.ANTHROPIC_API_KEY,
        model: c.ANTHROPIC_MODEL,
        fastModel: c.ANTHROPIC_FAST_MODEL,
        timeoutMs: c.ANTHROPIC_TIMEOUT_MS,
        webSearchMaxUses: c.AI_WEB_SEARCH_MAX_USES,
      });
    default:
      return rulesProvider;
  }
}

/** Drop already-solved numbers and duplicates (server-side safety net). */
function filterRecommendations(recs: Recommendation[], exclude: Set<number>) {
  const seen = new Set(exclude);
  const kept: Recommendation[] = [];
  for (const r of recs) {
    if (seen.has(r.number)) continue;
    seen.add(r.number);
    kept.push(r);
  }
  return { kept: kept.slice(0, MAX_RECOMMENDATIONS), filteredOut: recs.length - kept.length };
}

async function loadJustSolved(userId: string, problemId: string): Promise<JustSolved> {
  const p = await prisma.problem.findFirst({
    where: { id: problemId, userId },
    include: {
      topics: { select: { topic: { select: { name: true } } } },
      patterns: { select: { pattern: { select: { name: true } } } },
    },
  });
  if (!p) throw notFound('Just-solved problem');
  return {
    leetcodeNumber: p.leetcodeNumber,
    title: p.title,
    difficulty: p.difficulty,
    confidence: p.confidence,
    solvedAlone: p.solvedAlone,
    timeTakenMins: p.timeTakenMins,
    patterns: p.patterns.map((x) => x.pattern.name),
    topics: p.topics.map((x) => x.topic.name),
  };
}

const reasonCode = (err: unknown) => (err instanceof HttpError && err.code ? err.code : 'AI_ERROR');

export function createAiService(primary: AiProvider) {
  /** Run on the primary provider; on any failure, log and use rules instead. */
  async function withFallback<T>(
    op: string,
    run: (p: AiProvider) => Promise<T>,
  ): Promise<T & { source: AiSource } & Fallback> {
    if (primary.name !== 'rules') {
      try {
        return { ...(await run(primary)), source: primary.name };
      } catch (err) {
        console.warn(`[AI] ${primary.name} ${op} failed (${reasonCode(err)}): ${(err as Error).message}; using rules`);
        return { ...(await run(rulesProvider)), source: 'rules', fallbackFrom: primary.name, fallbackReason: reasonCode(err) };
      }
    }
    return { ...(await run(rulesProvider)), source: 'rules' };
  }

  return {
    provider: primary,

    async recommend(userId: string, problemId: string) {
      const justSolved = await loadJustSolved(userId, problemId);
      const ctx = await buildUserContext(userId);
      const candidates = rankCandidates(justSolved, ctx);
      const exclude = new Set([...ctx.solvedNumbers, justSolved.leetcodeNumber]);
      return withFallback('recommend', async (p) => {
        const out = await p.recommend({ justSolved, ctx, candidates });
        const { kept, filteredOut } = filterRecommendations(out.recommendations, exclude);
        if (kept.length === 0 && p.name !== 'rules') {
          throw new HttpError(502, 'No usable recommendations returned', 'AI_BAD_RESPONSE');
        }
        return { recommendations: kept, overallReason: out.overallReason, filteredOut };
      });
    },

    async analyzeWeakness(userId: string) {
      const ctx = await buildUserContext(userId);
      return withFallback('weakness-analysis', (p) => p.analyzeWeakness(ctx));
    },

    async generateStudyPlan(userId: string, minutesAvailable: number) {
      const ctx = await buildUserContext(userId);
      const practice = practicePicks(ctx);
      return withFallback('study-plan', (p) => p.studyPlan({ ctx, minutesAvailable, practice }));
    },

    async status() {
      const s = await primary.status().catch(() => ({ reachable: false, detail: 'Status check failed' }));
      return {
        provider: primary.name,
        model: 'model' in s ? (s.model ?? null) : null,
        reachable: s.reachable,
        detail: s.detail ?? null,
        fallback: 'rules' as const,
      };
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
