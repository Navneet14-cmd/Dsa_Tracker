/**
 * "ollama" provider: a local model served by Ollama (/api/chat with a JSON
 * schema in `format`). There's no web search, so recommendations are picked
 * from a shortlist of curated problems; the schema restricts `number` to
 * that shortlist and results are checked against it again afterwards.
 */
import { z } from 'zod';
import { HttpError } from '../../../lib/errors';
import { describeContext } from '../context';
import { REVIEW_MINUTES, candidateReason, fitPlan, orderedRevisions, weakSignals } from '../analysis';
import { outputFormat } from './anthropic';
import {
  AiProvider,
  RecommendationsOutput,
  StudyPlanOutput,
  WeaknessOutput,
  type Candidate,
} from '../types';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** For tests. */
  fetchImpl?: typeof fetch;
}

const SHORTLIST_SIZE = 12;
const MAX_RECOMMENDATIONS = 5;

export function createOllamaProvider(opts: OllamaOptions): AiProvider {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;

  async function chat<T extends z.ZodType>(system: string, user: string, schema: T, jsonSchema?: object): Promise<z.infer<T>> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          stream: false,
          format: jsonSchema ?? outputFormat(schema).schema,
          keep_alive: '30m',
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw timedOut
        ? new HttpError(504, 'Local AI took too long to respond', 'AI_TIMEOUT')
        : new HttpError(503, `Local AI (Ollama) is not reachable at ${baseUrl}`, 'AI_UNAVAILABLE');
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HttpError(502, `Local AI returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`, 'AI_UPSTREAM_ERROR');
    }

    const payload = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
    const content = payload?.message?.content;
    if (!content) throw new HttpError(502, 'Local AI returned no answer', 'AI_BAD_RESPONSE');

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new HttpError(502, 'Local AI returned malformed JSON', 'AI_BAD_RESPONSE');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new HttpError(502, 'Local AI response did not match the expected format', 'AI_BAD_RESPONSE');
    return parsed.data;
  }

  return {
    name: 'ollama',

    async recommend({ justSolved, ctx, candidates }) {
      const shortlist = candidates.slice(0, SHORTLIST_SIZE);
      if (shortlist.length === 0) throw new HttpError(502, 'No candidate problems left to recommend', 'AI_BAD_RESPONSE');
      const byNumber = new Map<number, Candidate>(shortlist.map((c) => [c.problem.number, c]));

      const Picks = z.object({
        picks: z.array(z.object({ number: z.number().int(), reason: z.string() })),
        overallReason: z.string(),
      });
      const jsonSchema = {
        type: 'object',
        properties: {
          picks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'integer', enum: shortlist.map((c) => c.problem.number) },
                reason: { type: 'string' },
              },
              required: ['number', 'reason'],
              additionalProperties: false,
            },
          },
          overallReason: { type: 'string' },
        },
        required: ['picks', 'overallReason'],
        additionalProperties: false,
      };

      const out = await chat(
        'You are a coach choosing the next LeetCode problems for a student. Choose 3 to 5 problems ONLY from the ' +
          'candidate list, by number. Prefer the same pattern one difficulty step up when the student was confident ' +
          'and solved it without hints; otherwise stay at the same level. Give a one-sentence reason for each pick ' +
          'and one sentence overall. Answer in JSON.',
        `Just solved: #${justSolved.leetcodeNumber} ${justSolved.title} (${justSolved.difficulty}), ${justSolved.timeTakenMins} min, ` +
          `confidence ${justSolved.confidence}/5, ${justSolved.solvedAlone ? 'without hints' : 'with hints'}. ` +
          `Patterns: ${justSolved.patterns.join(', ') || '-'}. Topics: ${justSolved.topics.join(', ') || '-'}.\n\n` +
          `Candidates:\n${shortlist
            .map((c) => `${c.problem.number}: ${c.problem.title} (${c.problem.difficulty}; patterns: ${c.problem.patterns.join(', ') || '-'}) - ${candidateReason(c)}`)
            .join('\n')}\n\n${describeContext(ctx)}`,
        Picks,
        jsonSchema,
      );

      const seen = new Set<number>();
      const recommendations = out.picks
        .filter((p) => byNumber.has(p.number) && !seen.has(p.number) && seen.add(p.number))
        .slice(0, MAX_RECOMMENDATIONS)
        .map((p) => {
          const c = byNumber.get(p.number)!;
          return { number: c.problem.number, title: c.problem.title, difficulty: c.problem.difficulty, reason: p.reason };
        });
      if (recommendations.length === 0) throw new HttpError(502, 'Local AI picked no valid problems', 'AI_BAD_RESPONSE');
      return RecommendationsOutput.parse({ recommendations, overallReason: out.overallReason });
    },

    async analyzeWeakness(ctx) {
      return chat(
        "You analyse a student's LeetCode practice log. List genuine strengths and weak areas, one short line each, " +
          'naming the topic or pattern and the evidence (confidence, hints needed, time vs benchmark, goal gaps, ' +
          'overdue revisions, untouched areas). Then give one paragraph of prioritised advice. Answer in JSON.',
        `${describeContext(ctx)}\n\n## Signals worth checking\n${weakSignals(ctx).join('\n') || 'None.'}`,
        WeaknessOutput,
      );
    },

    async studyPlan({ ctx, minutesAvailable, practice }) {
      const revisions = orderedRevisions(ctx);
      const out = await chat(
        'You plan one study session for a student practising LeetCode. Put overdue revisions first, then practice ' +
          'problems from the list provided (use their numbers and titles), with a 5-minute break after about 50 ' +
          `minutes of work. The task minutes must add up to at most ${minutesAvailable}. Answer in JSON.`,
        `Time available: ${minutesAvailable} minutes.\n\n` +
          `Overdue revisions (suggested minutes):\n${revisions.map((r) => `#${r.leetcodeNumber} ${r.title} (${r.difficulty}, ${r.daysOverdue} days overdue, confidence ${r.confidence}/5) - ${REVIEW_MINUTES[r.difficulty]} min`).join('\n') || 'None.'}\n\n` +
          `Practice problems for weak areas:\n${practice.map((p) => `#${p.problem.number} ${p.problem.title} (${p.area}, ${p.problem.difficulty})`).join('\n') || 'None.'}\n\n` +
          describeContext(ctx),
        StudyPlanOutput,
      );
      return fitPlan(out.tasks, minutesAvailable);
    },

    async status() {
      try {
        const res = await doFetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return { reachable: false, model: opts.model, detail: `Ollama returned HTTP ${res.status}` };
        const body = (await res.json()) as { models?: { name: string }[] };
        const names = (body.models ?? []).map((m) => m.name);
        const installed = names.some((n) => n === opts.model || n === `${opts.model}:latest`);
        return installed
          ? { reachable: true, model: opts.model, detail: `Ollama at ${baseUrl}` }
          : { reachable: false, model: opts.model, detail: `Model not installed; run: ollama pull ${opts.model}` };
      } catch {
        return { reachable: false, model: opts.model, detail: `Ollama not reachable at ${baseUrl}` };
      }
    },
  };
}
