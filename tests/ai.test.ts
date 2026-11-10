import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { isMockMode } from '../src/services/ai';
import { app, createProblem, daysFromNow, getTaxonomy, prisma, registerUser, TestUser } from './helpers';

let user: TestUser;
let tx: Awaited<ReturnType<typeof getTaxonomy>>;

beforeAll(async () => {
  user = await registerUser();
  tx = await getTaxonomy();
});

describe('AI endpoints (mock mode)', () => {
  it('runs in mock mode without an API key', () => {
    expect(isMockMode()).toBe(true);
  });

  it('recommends unsolved problems for the pattern just used', async () => {
    // Already solved: 15 (3Sum) should never be recommended.
    await createProblem(user, { leetcodeNumber: 15, title: '3Sum', patternIds: [tx.patterns['Two Pointer']] });
    const p = await createProblem(user, { leetcodeNumber: 1, title: 'Two Sum', difficulty: 'EASY', patternIds: [tx.patterns['Two Pointer']] });

    const res = await request(app).post('/ai/recommend').set(user.auth).send({ problemId: p.id });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('mock');
    expect(typeof res.body.overallReason).toBe('string');
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    for (const r of res.body.recommendations) {
      expect(r).toEqual({ number: expect.any(Number), title: expect.any(String), difficulty: expect.any(String), reason: expect.any(String) });
      expect([1, 15]).not.toContain(r.number);
    }
    expect(res.body.filteredOut).toBeGreaterThan(0);
  });

  it('validates AI request bodies', async () => {
    expect((await request(app).post('/ai/recommend').set(user.auth).send({})).status).toBe(400);
    expect((await request(app).post('/ai/recommend').set(user.auth).send({ problemId: 'unknownproblem' })).status).toBe(404);
    expect((await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 0 })).status).toBe(400);
    expect((await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 1000 })).status).toBe(400);
    expect((await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: '60' })).status).toBe(400);
  });

  it('analyses strengths and weak areas from the user data', async () => {
    const goalTopic = tx.topics['Heap'];
    await request(app).post('/goals').set(user.auth).send({ topicId: goalTopic, targetCount: 5 });
    const res = await request(app).post('/ai/weakness-analysis').set(user.auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.strengths)).toBe(true);
    expect(res.body.weakAreas.some((w: string) => w.startsWith('Heap: 0/5'))).toBe(true);
    expect(typeof res.body.recommendation).toBe('string');
  });

  it('builds a study plan that fits the time and puts overdue revisions first', async () => {
    const p = await createProblem(user, { needsRevision: true, title: 'Overdue One', difficulty: 'MEDIUM' });
    await prisma.revision.updateMany({ where: { problemId: p.id }, data: { scheduledFor: daysFromNow(-3) } });

    const res = await request(app).post('/ai/study-plan').set(user.auth).send({ minutesAvailable: 45 });
    expect(res.status).toBe(200);
    expect(res.body.tasks[0]).toMatchObject({ type: 'REVISION', estMinutes: 20 });
    expect(res.body.tasks[0].description).toContain('Overdue One');
    const sum = res.body.tasks.reduce((s: number, t: { estMinutes: number }) => s + t.estMinutes, 0);
    expect(res.body.totalMinutes).toBe(sum);
    expect(sum).toBeLessThanOrEqual(45);
    expect(res.body.tasks.at(-1).type).not.toBe('BREAK');
  });

  it('rate limits per user', async () => {
    const limited = createApp({ aiRateLimitMax: 2 });
    const [a, b] = await Promise.all([registerUser(), registerUser()]);
    const call = (u: TestUser) => request(limited).post('/ai/weakness-analysis').set(u.auth);
    expect((await call(a)).status).toBe(200);
    expect((await call(a)).status).toBe(200);
    const blocked = await call(a);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect((await call(b)).status).toBe(200); // separate bucket
  });

  it('requires auth', async () => {
    expect((await request(app).post('/ai/weakness-analysis')).status).toBe(401);
  });
});
