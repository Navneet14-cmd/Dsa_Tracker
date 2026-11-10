import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { practicePicks, rankCandidates } from '../../src/services/ai/analysis';
import { createOllamaProvider } from '../../src/services/ai/providers/ollama';
import { HttpError } from '../../src/lib/errors';
import { justSolvedTwoPointer, seededContext } from './fixtures';

// A fake Ollama server: records requests, replies with whatever `reply` returns.
let server: http.Server;
let baseUrl: string;
let requests: { url: string; body: any }[] = [];
let reply: (body: any) => { status?: number; json?: unknown; raw?: string; delayMs?: number };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const body = data ? JSON.parse(data) : null;
      requests.push({ url: req.url!, body });
      const r = reply(body);
      setTimeout(() => {
        res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json' });
        res.end(r.raw ?? JSON.stringify(r.json));
      }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));
beforeEach(() => {
  requests = [];
});

const chatReply = (content: unknown) => ({ json: { model: 'qwen2.5:7b', message: { role: 'assistant', content: JSON.stringify(content) }, done: true } });
const provider = (timeoutMs = 5000) => createOllamaProvider({ baseUrl: `${baseUrl}/`, model: 'qwen2.5:7b', timeoutMs });

describe('ollama provider', () => {
  it('sends a JSON-schema chat request restricted to the shortlist and drops hallucinated numbers', async () => {
    const ctx = seededContext();
    const candidates = rankCandidates(justSolvedTwoPointer, ctx);
    const [a, b] = candidates;
    reply = () =>
      chatReply({
        picks: [
          { number: a.problem.number, reason: 'Next step.' },
          { number: 99999, reason: 'Made up.' },
          { number: 1, reason: 'Already solved.' },
          { number: a.problem.number, reason: 'Duplicate.' },
          { number: b.problem.number, reason: 'Also good.' },
        ],
        overallReason: 'Keep going.',
      });

    const out = await provider().recommend({ justSolved: justSolvedTwoPointer, ctx, candidates });

    expect(requests).toHaveLength(1);
    const { url, body } = requests[0];
    expect(url).toBe('/api/chat');
    expect(body).toMatchObject({ model: 'qwen2.5:7b', stream: false, options: { temperature: 0 } });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
    const allowed = body.format.properties.picks.items.properties.number.enum;
    expect(allowed).toEqual(candidates.slice(0, 12).map((c) => c.problem.number));
    expect(allowed).not.toContain(1);

    // Titles/difficulties come from the catalog, not the model.
    expect(out.recommendations).toEqual([
      { number: a.problem.number, title: a.problem.title, difficulty: a.problem.difficulty, reason: 'Next step.' },
      { number: b.problem.number, title: b.problem.title, difficulty: b.problem.difficulty, reason: 'Also good.' },
    ]);
    expect(out.overallReason).toBe('Keep going.');
  });

  it('errors when the model picks nothing valid', async () => {
    const ctx = seededContext();
    reply = () => chatReply({ picks: [{ number: 424242, reason: 'x' }], overallReason: 'x' });
    await expect(
      provider().recommend({ justSolved: justSolvedTwoPointer, ctx, candidates: rankCandidates(justSolvedTwoPointer, ctx) }),
    ).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  });

  it('validates weakness analysis output and rejects malformed JSON or wrong shapes', async () => {
    reply = () => chatReply({ strengths: ['Arrays'], weakAreas: ['Sliding Window'], recommendation: 'Do windows.' });
    expect(await provider().analyzeWeakness(seededContext())).toEqual({
      strengths: ['Arrays'],
      weakAreas: ['Sliding Window'],
      recommendation: 'Do windows.',
    });
    expect(requests[0].body.format).toMatchObject({ type: 'object', required: expect.arrayContaining(['strengths', 'weakAreas', 'recommendation']) });

    reply = () => ({ json: { message: { content: '{not json' } } });
    await expect(provider().analyzeWeakness(seededContext())).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });

    reply = () => chatReply({ strengths: 'nope' });
    await expect(provider().analyzeWeakness(seededContext())).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });

    reply = () => ({ status: 404, json: { error: 'model "qwen2.5:7b" not found, try pulling it first' } });
    const err = await provider().analyzeWeakness(seededContext()).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.code).toBe('AI_UPSTREAM_ERROR');
  });

  it('fits the study plan to the time available', async () => {
    reply = () =>
      chatReply({
        tasks: [
          { type: 'REVISION', description: 'Review #1', estMinutes: 10 },
          { type: 'PRACTICE', description: 'Practice A', estMinutes: 30 },
          { type: 'BREAK', description: 'Break', estMinutes: 5 },
          { type: 'PRACTICE', description: 'Practice B', estMinutes: 30 },
        ],
        totalMinutes: 999,
      });
    const ctx = seededContext();
    const out = await provider().studyPlan({ ctx, minutesAvailable: 45, practice: practicePicks(ctx) });
    expect(out).toEqual({
      tasks: [
        { type: 'REVISION', description: 'Review #1', estMinutes: 10 },
        { type: 'PRACTICE', description: 'Practice A', estMinutes: 30 },
      ],
      totalMinutes: 40,
    });
  });

  it('times out slow responses', async () => {
    reply = () => ({ ...chatReply({ strengths: [], weakAreas: [], recommendation: '' }), delayMs: 500 });
    await expect(provider(100).analyzeWeakness(seededContext())).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });

  it('reports status from /api/tags', async () => {
    reply = () => ({ json: { models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:3b' }] } });
    expect(await provider().status()).toMatchObject({ reachable: true, model: 'qwen2.5:7b' });
    expect(requests[0].url).toBe('/api/tags');

    reply = () => ({ json: { models: [{ name: 'llama3.2:3b' }] } });
    expect(await provider().status()).toMatchObject({ reachable: false, detail: 'Model not installed; run: ollama pull qwen2.5:7b' });

    const down = createOllamaProvider({ baseUrl: 'http://127.0.0.1:9', model: 'qwen2.5:7b', timeoutMs: 1000 });
    expect(await down.status()).toMatchObject({ reachable: false });
    await expect(down.analyzeWeakness(seededContext())).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});
