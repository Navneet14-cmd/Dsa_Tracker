/**
 * Optional smoke test against a real local Ollama. Skipped (not failed)
 * when Ollama isn't running. Uses OLLAMA_MODEL if installed, otherwise the
 * first installed model.
 */
import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../../src/services/ai/analysis';
import { createOllamaProvider } from '../../src/services/ai/providers/ollama';
import { justSolvedTwoPointer, seededContext } from './fixtures';

const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

async function installedModel(): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const names = ((await res.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? [];
    const wanted = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    return names.find((n) => n === wanted || n === `${wanted}:latest`) ?? names[0] ?? null;
  } catch {
    return null;
  }
}

const model = await installedModel();

describe.skipIf(!model)(`ollama live smoke test (${model ?? 'not running'})`, () => {
  it('returns valid recommendations from the shortlist', { timeout: 300_000 }, async () => {
    const ctx = seededContext();
    const candidates = rankCandidates(justSolvedTwoPointer, ctx);
    const provider = createOllamaProvider({ baseUrl, model: model!, timeoutMs: 280_000 });
    const out = await provider.recommend({ justSolved: justSolvedTwoPointer, ctx, candidates });
    const allowed = new Set(candidates.slice(0, 12).map((c) => c.problem.number));
    expect(out.recommendations.length).toBeGreaterThan(0);
    for (const r of out.recommendations) expect(allowed.has(r.number)).toBe(true);
    console.log(`[ollama live] ${model}:`, out.recommendations.map((r) => `#${r.number} ${r.title}`).join(', '));
  });
});
