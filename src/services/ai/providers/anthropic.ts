/**
 * "anthropic" provider: Claude via the Anthropic API. Recommendations use the
 * main model with web search (to verify problem numbers); weakness analysis
 * and study plans use the faster model. Responses are constrained to a JSON
 * schema (structured outputs) and validated with zod.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { HttpError } from '../../../lib/errors';
import { describeContext } from '../context';
import { REVIEW_MINUTES, fitPlan, orderedRevisions, weakSignals } from '../analysis';
import { AiProvider, RecommendationsOutput, StudyPlanOutput, WeaknessOutput } from '../types';

export interface AnthropicOptions {
  apiKey?: string;
  /** Used for recommendations (with web search). */
  model: string;
  /** Used for weakness analysis and study plans. */
  fastModel: string;
  timeoutMs: number;
  webSearchMaxUses: number;
}

const PLACEHOLDER_KEYS = new Set(['your_anthropic_api_key_here', 'sk-ant-...']);

// JSON Schema keywords structured outputs don't support. Responses are
// re-validated with the full zod schema, so dropping them loses nothing.
const UNSUPPORTED_KEYWORDS = new Set([
  '$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems',
]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (!UNSUPPORTED_KEYWORDS.has(k)) out[k] = stripUnsupported(v);
    }
    if (out.type === 'object') out.additionalProperties = false;
    return out;
  }
  return node;
}

/** JSON-schema output format for a zod schema (enums kept as real enums). */
export function outputFormat(schema: z.ZodType) {
  return {
    type: 'json_schema' as const,
    schema: stripUnsupported(z.toJSONSchema(schema, { target: 'draft-2020-12' })) as Record<string, unknown>,
  };
}

/**
 * With web search the reply has several text blocks (a preamble before the
 * searches, text around citations, ...). The structured JSON is the final
 * text block; parse it and validate it with the zod schema.
 */
export function parseFinalJson<T extends z.ZodType>(
  content: ReadonlyArray<{ type: string; text?: string }>,
  schema: T,
): z.infer<T> {
  const text = content.filter((b) => b.type === 'text').at(-1)?.text;
  if (!text) throw new HttpError(502, 'The AI assistant returned no answer', 'AI_BAD_RESPONSE');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The AI assistant returned malformed JSON', 'AI_BAD_RESPONSE');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(502, 'The AI response did not match the expected format', 'AI_BAD_RESPONSE');
  }
  return parsed.data;
}

// Server tools can return stop_reason "pause_turn"; resume a bounded number of times.
const MAX_CONTINUATIONS = 3;

function toHttpError(err: unknown, aborted: boolean): HttpError {
  if (err instanceof HttpError) return err;
  if (aborted || err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return new HttpError(504, 'Claude took too long to respond', 'AI_TIMEOUT');
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    return new HttpError(503, 'Claude is busy right now', 'AI_UNAVAILABLE');
  }
  if (err instanceof Anthropic.APIError) {
    // Log the detail; never forward it to clients.
    console.error('[AI] Anthropic API error:', err.status, err.message);
    return new HttpError(502, 'Claude request failed', 'AI_UPSTREAM_ERROR');
  }
  return new HttpError(502, 'Claude request failed', 'AI_UPSTREAM_ERROR');
}

export function createAnthropicProvider(opts: AnthropicOptions): AiProvider {
  const hasKey = !!opts.apiKey && !PLACEHOLDER_KEYS.has(opts.apiKey);
  let client: Anthropic | null = null;
  const getClient = () =>
    (client ??= new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 1 }));

  async function call<T extends z.ZodType>(req: {
    model: string;
    system: string;
    prompt: string;
    schema: T;
    webSearch?: boolean;
    effort: 'low' | 'medium' | 'high';
  }): Promise<z.infer<T>> {
    if (!hasKey) throw new HttpError(503, 'ANTHROPIC_API_KEY is not set', 'AI_NOT_CONFIGURED');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: req.prompt }];
    try {
      for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
        const response = await getClient().messages.create(
          {
            model: req.model,
            max_tokens: 16_000,
            system: req.system,
            messages,
            output_config: { effort: req.effort, format: outputFormat(req.schema) },
            ...(req.webSearch
              ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: opts.webSearchMaxUses }] }
              : {}),
          },
          { signal: controller.signal },
        );
        if (response.stop_reason === 'pause_turn') {
          messages.push({ role: 'assistant', content: response.content });
          continue;
        }
        if (response.stop_reason === 'refusal') throw new HttpError(502, 'Claude declined this request', 'AI_REFUSED');
        if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'Claude response was cut off', 'AI_BAD_RESPONSE');
        return parseFinalJson(response.content, req.schema);
      }
      throw new HttpError(504, 'Claude took too many steps', 'AI_TIMEOUT');
    } catch (err) {
      throw toHttpError(err, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'anthropic',

    async recommend({ justSolved, ctx, candidates }) {
      return call({
        model: opts.model,
        effort: 'medium',
        webSearch: true,
        schema: RecommendationsOutput,
        system:
          'You recommend LeetCode problems for a student practising data structures and algorithms. Recommend real ' +
          'problems with their exact LeetCode number, title and difficulty; verify them with web search if unsure. ' +
          'Build on the pattern the student just used, one difficulty step up when they were confident and ' +
          'hint-free, otherwise at the same level. Never recommend a problem from their solved list. Give 5 ' +
          'recommendations, each with a one-sentence reason specific to this student.',
        prompt:
          `# Just solved\n#${justSolved.leetcodeNumber} ${justSolved.title} (${justSolved.difficulty}), ${justSolved.timeTakenMins} min, ` +
          `confidence ${justSolved.confidence}/5, ${justSolved.solvedAlone ? 'without hints' : 'with hints'}. ` +
          `Patterns: ${justSolved.patterns.join(', ') || '-'}. Topics: ${justSolved.topics.join(', ') || '-'}.\n\n` +
          `# Solved LeetCode numbers (do not recommend)\n${[...ctx.solvedNumbers].sort((a, b) => a - b).join(', ') || 'none'}\n\n` +
          `# Good candidates from a curated list (optional)\n${candidates.slice(0, 10).map((c) => `#${c.problem.number} ${c.problem.title} (${c.problem.difficulty})`).join('\n')}\n\n` +
          describeContext(ctx),
      });
    },

    async analyzeWeakness(ctx) {
      return call({
        model: opts.fastModel,
        effort: 'low',
        schema: WeaknessOutput,
        system:
          "You analyse a student's LeetCode practice log. Identify genuine strengths and weak areas using all the " +
          'signals given: volume, confidence, whether they needed hints, time against the benchmark, overdue ' +
          'revisions, goal gaps and untouched areas. Each line names the topic or pattern and the evidence. Finish ' +
          'with one paragraph of concrete, prioritised advice.',
        prompt: `${describeContext(ctx)}\n\n## Signals worth checking\n${weakSignals(ctx).join('\n') || 'None.'}`,
      });
    },

    async studyPlan({ ctx, minutesAvailable, practice }) {
      const out = await call({
        model: opts.fastModel,
        effort: 'low',
        schema: StudyPlanOutput,
        system:
          'You plan a single study session for a student practising LeetCode. Overdue revisions come first (most ' +
          'overdue and least confident first), then practice problems for weak areas from the list given, with a ' +
          'short break after about 50 minutes of work. Task minutes must add up to no more than the time available.',
        prompt:
          `Time available: ${minutesAvailable} minutes.\n\n` +
          `Overdue revisions:\n${orderedRevisions(ctx).map((r) => `#${r.leetcodeNumber} ${r.title} (${r.difficulty}, ${r.daysOverdue} days overdue) - about ${REVIEW_MINUTES[r.difficulty]} min`).join('\n') || 'None.'}\n\n` +
          `Practice problems for weak areas:\n${practice.map((p) => `#${p.problem.number} ${p.problem.title} (${p.area}, ${p.problem.difficulty})`).join('\n') || 'None.'}\n\n` +
          describeContext(ctx),
      });
      return fitPlan(out.tasks, minutesAvailable);
    },

    async status() {
      if (!hasKey) return { reachable: false, model: opts.model, detail: 'ANTHROPIC_API_KEY is not set' };
      try {
        // Cheap check that the key works and the model exists; no tokens used.
        await getClient().models.retrieve(opts.model, {}, { timeout: 5000, maxRetries: 0 });
        return { reachable: true, model: opts.model, detail: `fast model: ${opts.fastModel}` };
      } catch (err) {
        const status = err instanceof Anthropic.APIError ? err.status : undefined;
        return {
          reachable: false,
          model: opts.model,
          detail: status === 401 ? 'API key rejected' : status === 404 ? 'Model not found' : 'Anthropic API not reachable',
        };
      }
    },
  };
}
