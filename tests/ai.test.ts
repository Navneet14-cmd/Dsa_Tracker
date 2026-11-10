import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createAiService } from '../src/services/ai';
import { createOllamaProvider } from '../src/services/ai/providers/ollama';
import type { AiProvider } from '../src/services/ai/types';
import { app, createProblem, daysFromNow, getTaxonomy, prisma, registerUser, TestUser } from './helpers';

let user: TestUser;
let tx: Awaited<ReturnType<typeof getTaxonomy>>;

beforeAll(async () => {
  user = await registerUser();
  tx = await getTaxonomy();
});

describe('AI endpoints (rules provider)', () => {
  it('reports the active provider', async () => {
    const res = await request(app).get('/ai/status').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'rules', reachable: true, fallback: 'rules' });
  });

  it('recommends unsolved catalog problems for the pattern just used, one step up', async () => {
    // Already solved: 15 (3Sum) and 167 must never be recommended.
    await createProblem(user, { leetcodeNumber: 15, title: '3Sum', patternIds: [tx.patterns['Two Pointer']] });
    await createProblem(user, { leetcodeNumber: 167, title: 'Two Sum II', patternIds: [tx.patterns['Two Pointer']] });
    const p = await createProblem(user, {
      leetcodeNumber: 125,
      title: 'Valid Palindrome',
      difficulty: 'EASY',
      confidence: 4,
      patternIds: [tx.patterns['Two Pointer']],
    });

    const res = await request(app).post('/ai/recommend').set(user.auth).send({ problemId: p.id });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules');
    expect(res.body.fallbackFrom).toBeUndefined();
    expect(res.body.recommendations).toHaveLength(5);
    for (const r of res.body.recommendations) {
      expect(r).toEqual({ number: expect.any(Number), title: expect.any(String), difficulty: expect.any(String), reason: expect.any(String) });
      expect([15, 125, 167]).not.toContain(r.number);
    }
    // EASY + confident => MEDIUM Two Pointer problems first.
    expect(res.body.recommendations[0]).toMatchObject({ difficulty: 'MEDIUM' });
    expect(res.body.recommendations[0].reason).toContain('Two Pointer');

    // Deterministic: same input, same output.
    const again = await request(app).post('/ai/recommend').set(user.auth).send({ problemId: p.id });
    expect(again.body.recommendations).toEqual(res.body.recommendations);
  });

  it('validates AI request bodies', async () => {
    expect((await request(app).post('/ai/recommend').set(user.auth).send({})).status).toBe(400);
    expect((await request(app).post('/ai/recommend').set(user.auth).send({ problemId: 'unknownproblem' })).status).toBe(404);
    expect((await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 0 })).status).toBe(400);
    expect((await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 1000 })).status).toBe(400);
    expect((await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: '60' })).status).toBe(400);
  });

  it('analyses strengths and weak areas from the user data', async () => {
    await request(app).post('/goals').set(user.auth).send({ topicId: tx.topics['Heap'], targetCount: 5 });
    const res = await request(app).post('/ai/weakness-analysis').set(user.auth);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules');
    expect(Array.isArray(res.body.strengths)).toBe(true);
    expect(res.body.weakAreas[0]).toBe('Heap: 0/5 toward your goal (5 to go)');
    expect(res.body.recommendation).toMatch(/You have logged \d+ problems/);
  });

  it('builds a study plan: overdue revisions first, then real practice problems, within the time', async () => {
    const p = await createProblem(user, { needsRevision: true, title: 'Overdue One', difficulty: 'MEDIUM' });
    await prisma.revision.updateMany({ where: { problemId: p.id }, data: { scheduledFor: daysFromNow(-3) } });

    const res = await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 90 });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules');
    expect(res.body.tasks[0]).toMatchObject({ type: 'REVISION', estMinutes: 20 });
    expect(res.body.tasks[0].description).toContain('Overdue One');
    const practice = res.body.tasks.filter((t: { type: string }) => t.type === 'PRACTICE');
    expect(practice.length).toBeGreaterThan(0);
    for (const t of practice) expect(t.description).toMatch(/^Practice #\d+ /);
    const sum = res.body.tasks.reduce((s: number, t: { estMinutes: number }) => s + t.estMinutes, 0);
    expect(res.body.totalMinutes).toBe(sum);
    expect(sum).toBeLessThanOrEqual(90);
    expect(res.body.tasks.at(-1).type).not.toBe('BREAK');
  });

  it('rate limits per user, but not /ai/status', async () => {
    const limited = createApp({ aiRateLimitMax: 2 });
    const [a, b] = await Promise.all([registerUser(), registerUser()]);
    const call = (u: TestUser) => request(limited).post('/ai/weakness-analysis').set(u.auth);
    expect((await call(a)).status).toBe(200);
    expect((await call(a)).status).toBe(200);
    const blocked = await call(a);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect((await call(b)).status).toBe(200); // separate bucket
    expect((await request(limited).get('/ai/status').set(a.auth)).status).toBe(200);
  });

  it('requires auth', async () => {
    expect((await request(app).post('/ai/weakness-analysis')).status).toBe(401);
    expect((await request(app).get('/ai/status')).status).toBe(401);
  });
});

describe('provider fallback', () => {
  // Nothing listens on port 9 (discard); connections are refused immediately.
  const unreachable = createOllamaProvider({ baseUrl: 'http://127.0.0.1:9', model: 'qwen2.5:7b', timeoutMs: 5000 });
  const fallbackApp = createApp({ aiRateLimitMax: 10_000, ai: createAiService(unreachable) });

  it('uses rules with source=rules when Ollama is unreachable', async () => {
    const p = await createProblem(user, { difficulty: 'EASY', patternIds: [tx.patterns['Sliding Window']] });
    const rec = await request(fallbackApp).post('/ai/recommend').set(user.auth).send({ problemId: p.id });
    expect(rec.status).toBe(200);
    expect(rec.body).toMatchObject({ source: 'rules', fallbackFrom: 'ollama', fallbackReason: 'AI_UNAVAILABLE' });
    expect(rec.body.recommendations.length).toBeGreaterThan(0);

    const weak = await request(fallbackApp).post('/ai/weakness-analysis').set(user.auth);
    expect(weak.body).toMatchObject({ source: 'rules', fallbackFrom: 'ollama' });
    const plan = await request(fallbackApp).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 60 });
    expect(plan.body).toMatchObject({ source: 'rules', fallbackFrom: 'ollama' });
  });

  it('reports the unreachable provider in /ai/status', async () => {
    const res = await request(fallbackApp).get('/ai/status').set(user.auth);
    expect(res.body).toMatchObject({ provider: 'ollama', model: 'qwen2.5:7b', reachable: false, fallback: 'rules' });
    expect(res.body.detail).toContain('not reachable');
  });

  it('falls back when a provider recommends only problems the user already solved', async () => {
    const solved = await createProblem(user, { leetcodeNumber: 1, title: 'Two Sum', patternIds: [tx.patterns['Hash Map']] });
    const sneaky: AiProvider = {
      name: 'anthropic',
      recommend: async () => ({
        recommendations: [{ number: 1, title: 'Two Sum', difficulty: 'EASY', reason: 'again' }],
        overallReason: 'x',
      }),
      analyzeWeakness: async () => ({ strengths: [], weakAreas: [], recommendation: 'model' }),
      studyPlan: async () => ({ tasks: [], totalMinutes: 0 }),
      status: async () => ({ reachable: true }),
    };
    const sneakyApp = createApp({ aiRateLimitMax: 10_000, ai: createAiService(sneaky) });
    const rec = await request(sneakyApp).post('/ai/recommend').set(user.auth).send({ problemId: solved.id });
    expect(rec.body).toMatchObject({ source: 'rules', fallbackFrom: 'anthropic', fallbackReason: 'AI_BAD_RESPONSE' });
    expect(rec.body.recommendations.map((r: { number: number }) => r.number)).not.toContain(1);

    // A working provider's own answer is passed through with its source.
    const weak = await request(sneakyApp).post('/ai/weakness-analysis').set(user.auth);
    expect(weak.body).toMatchObject({ source: 'anthropic', recommendation: 'model' });
    expect(weak.body.fallbackFrom).toBeUndefined();
  });
});
