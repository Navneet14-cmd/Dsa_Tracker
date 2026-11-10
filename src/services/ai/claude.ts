import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { config } from '../../lib/config';
import { HttpError } from '../../lib/errors';

const PLACEHOLDER_KEYS = new Set(['your_anthropic_api_key_here', 'sk-ant-...']);

const hasApiKey = () => !!config.ANTHROPIC_API_KEY && !PLACEHOLDER_KEYS.has(config.ANTHROPIC_API_KEY);

/** Mock mode: no API key outside production. */
export const isMockMode = () => !hasApiKey() && config.NODE_ENV !== 'production';

let client: Anthropic | null = null;
const getClient = () =>
  (client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: config.AI_TIMEOUT_MS, maxRetries: 1 }));

export interface ClaudeRequest<T extends z.ZodType> {
  system: string;
  prompt: string;
  /** Response schema: sent as structured-output JSON schema, then re-validated. */
  schema: T;
  webSearch?: boolean;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

// Server tools can return stop_reason "pause_turn"; resume a bounded number of times.
const MAX_CONTINUATIONS = 3;

/**
 * Calls Claude with a JSON-schema constrained response and returns the
 * zod-validated result. Errors surface as HttpError (502/503/504) so routes
 * respond with the standard error shape.
 */
export async function callClaude<T extends z.ZodType>(req: ClaudeRequest<T>): Promise<z.infer<T>> {
  if (!hasApiKey()) throw new HttpError(503, 'AI service is not configured', 'AI_NOT_CONFIGURED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: req.prompt }];
  const fallback = config.ANTHROPIC_FALLBACK_MODEL;

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const response = await getClient().beta.messages.create(
        {
          model: config.ANTHROPIC_MODEL,
          max_tokens: req.maxTokens ?? 16_000,
          system: req.system,
          messages,
          output_config: { effort: req.effort ?? 'medium', format: zodOutputFormat(req.schema) },
          ...(req.webSearch
            ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.AI_WEB_SEARCH_MAX_USES }] }
            : {}),
          // Re-run on another model if the primary one declines.
          ...(fallback ? { betas: ['server-side-fallback-2026-06-01'], fallbacks: [{ model: fallback }] } : {}),
        },
        { signal: controller.signal },
      );

      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      if (response.stop_reason === 'refusal') {
        throw new HttpError(502, 'The AI assistant declined this request', 'AI_REFUSED');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new HttpError(502, 'The AI response was cut off', 'AI_BAD_RESPONSE');
      }

      // With web search the reply has several text blocks (a preamble before
      // the searches, citations, ...). The structured JSON is the final one.
      const text = response.content.filter((b) => b.type === 'text').at(-1)?.text;
      if (!text) throw new HttpError(502, 'The AI assistant returned no answer', 'AI_BAD_RESPONSE');

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new HttpError(502, 'The AI assistant returned malformed JSON', 'AI_BAD_RESPONSE');
      }
      const parsed = req.schema.safeParse(json);
      if (!parsed.success) {
        throw new HttpError(502, 'The AI response did not match the expected format', 'AI_BAD_RESPONSE');
      }
      return parsed.data;
    }
    throw new HttpError(504, 'The AI assistant took too many steps', 'AI_TIMEOUT');
  } catch (err) {
    throw toHttpError(err, controller.signal.aborted);
  } finally {
    clearTimeout(timer);
  }
}

function toHttpError(err: unknown, aborted: boolean): HttpError {
  if (err instanceof HttpError) return err;
  if (aborted || err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return new HttpError(504, 'The AI assistant took too long to respond. Please try again.', 'AI_TIMEOUT');
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
    console.error('[AI] Upstream unavailable:', err.status, err.message);
    return new HttpError(503, 'AI service is busy. Please try again shortly.', 'AI_UNAVAILABLE');
  }
  if (err instanceof Anthropic.APIError) {
    // 4xx from Anthropic means our request or key is wrong - log it, don't leak it.
    console.error('[AI] Anthropic API error:', err.status, err.message);
    return new HttpError(502, 'AI service request failed', 'AI_UPSTREAM_ERROR');
  }
  console.error('[AI] Unexpected error:', err);
  return new HttpError(502, 'AI service request failed', 'AI_UPSTREAM_ERROR');
}
