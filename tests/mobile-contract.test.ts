/**
 * Replays every API call the mobile app makes (mobile/src/screens/*) with
 * the same paths, params and bodies, and checks the fields the screens read.
 * If this fails, the app is broken even if the other tests pass.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, prisma, daysFromNow } from './helpers';

describe('mobile app contract', () => {
  it('covers the full app flow', async () => {
    const email = `mobile-${randomUUID()}@example.com`;

    // RegisterScreen: { email, password, name } -> { token, user }
    const reg = await request(app).post('/auth/register').send({ email, password: 'password123', name: 'Ann' });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ token: expect.any(String), user: { id: expect.any(String), email, name: 'Ann' } });

    // LoginScreen: { email, password } -> { token, user }; then topics/patterns
    const login = await request(app).post('/auth/login').send({ email, password: 'password123' });
    const { token, user } = login.body;
    expect(user).toMatchObject({ id: expect.any(String), email, name: 'Ann', createdAt: expect.any(String) });
    const headers = { Authorization: `Bearer ${token}` };
    const topics = (await request(app).get('/topics').set(headers)).body.topics;
    const patterns = (await request(app).get('/patterns').set(headers)).body.patterns;
    expect(topics[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    expect(patterns[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });

    // LogFormScreen create payload (dateSolved: toISOString, notes may be null)
    const payload = {
      leetcodeNumber: 1,
      title: 'Two Sum',
      difficulty: 'EASY',
      topicIds: [topics[0].id],
      patternIds: [patterns[0].id],
      timeTakenMins: 12,
      dateSolved: new Date().toISOString(),
      solvedAlone: true,
      notes: null,
      needsRevision: true,
      confidence: 3,
    };
    const created = await request(app).post('/problems').set(headers).send(payload);
    expect(created.status).toBe(201);
    const problemId = created.body.problem.id;

    // Duplicate log: the form shows error.response.data.message
    const dup = await request(app).post('/problems').set(headers).send(payload);
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already logged/);

    // ...then POST /ai/recommend { problemId } -> { recommendations[{number,title,reason}], overallReason }
    const rec = await request(app).post('/ai/recommend').set(headers).send({ problemId });
    expect(rec.body.overallReason).toEqual(expect.any(String));
    for (const r of rec.body.recommendations) expect(r).toMatchObject({ number: expect.any(Number), title: expect.any(String), reason: expect.any(String) });

    // LogFormScreen edit: PATCH with the full payload
    const patched = await request(app).patch(`/problems/${problemId}`).set(headers).send({ ...payload, title: 'Two Sum!' });
    expect(patched.status).toBe(200);

    // LogListScreen: GET /problems?page&limit&topicId&patternId&difficulty&search -> problems[] with topics[].topic / patterns[].pattern
    const list = await request(app)
      .get('/problems')
      .query({ page: 1, limit: 10, topicId: topics[0].id, patternId: patterns[0].id, difficulty: 'EASY', search: 'Two' })
      .set(headers);
    const item = list.body.problems[0];
    expect(item).toMatchObject({ id: problemId, leetcodeNumber: 1, title: 'Two Sum!', difficulty: 'EASY', confidence: 3, dateSolved: expect.any(String) });
    expect(item.topics[0].topic).toMatchObject({ id: topics[0].id, name: topics[0].name });
    expect(item.patterns[0].pattern).toMatchObject({ id: patterns[0].id });
    // Edit mode pre-fill reads these
    expect(item).toMatchObject({ timeTakenMins: 12, solvedAlone: true, needsRevision: true, notes: null });

    // RevisionScreen: due + upcoming (with tz) + complete with rating
    await prisma.revision.updateMany({ where: { problemId }, data: { scheduledFor: daysFromNow(-1) } });
    const due = await request(app).get('/revisions/due').set(headers);
    const rev = due.body.revisions[0];
    expect(rev).toMatchObject({ id: expect.any(String), scheduledFor: expect.any(String), intervalDays: 1 });
    expect(rev.problem).toMatchObject({ leetcodeNumber: 1, title: 'Two Sum!', difficulty: 'EASY' });
    const done = await request(app).post(`/revisions/${rev.id}/complete`).set(headers).send({ rating: 'good' });
    expect(done.status).toBe(200);
    const upcoming = await request(app).get('/revisions/upcoming').query({ tz: 'Asia/Kolkata' }).set(headers);
    expect(Object.keys(upcoming.body.data).sort()).toEqual(['later', 'thisWeek', 'today', 'tomorrow']);
    const all = [...upcoming.body.data.today, ...upcoming.body.data.tomorrow, ...upcoming.body.data.thisWeek, ...upcoming.body.data.later];
    expect(all[0]).toMatchObject({ id: expect.any(String), scheduledFor: expect.any(String), intervalDays: 3, problem: { leetcodeNumber: 1 } });

    // ProgressScreen: GET /dashboard/progress?tz -> data.{topics, difficultyStats}; POST /goals
    const goal = await request(app).post('/goals').set(headers).send({ topicId: topics[0].id, targetCount: 4 });
    expect(goal.status).toBe(200);
    const progress = (await request(app).get('/dashboard/progress').query({ tz: 'Asia/Kolkata' }).set(headers)).body.data;
    expect(progress.difficultyStats).toEqual({ easy: 1, medium: 0, hard: 0, total: 1 });
    expect(progress.topics.find((t: { topicId: string }) => t.topicId === topics[0].id)).toMatchObject({
      topicName: topics[0].name,
      solvedCount: 1,
      targetCount: 4,
      goalProgressPct: 25,
    });

    // PatternsScreen: data.patterns[{patternId, patternName, solvedCount, topics[{topicName}]}]
    const pats = (await request(app).get('/dashboard/patterns').set(headers)).body.data.patterns;
    expect(pats[0]).toMatchObject({ patternId: expect.any(String), patternName: expect.any(String), solvedCount: expect.any(Number) });
    expect(pats.find((p: { topics: unknown[] }) => p.topics.length > 0).topics[0]).toMatchObject({ topicName: expect.any(String) });

    // AIScreen: weakness-analysis (axios sends {}), study-plan { minutesAvailable: hours*60 }
    const weak = (await request(app).post('/ai/weakness-analysis').set(headers).send({})).body;
    expect(weak).toMatchObject({ strengths: expect.any(Array), weakAreas: expect.any(Array), recommendation: expect.any(String) });
    const plan = (await request(app).post('/ai/study-plan').set(headers).send({ minutesAvailable: Math.round(1.5 * 60) })).body;
    expect(plan).toMatchObject({ tasks: expect.any(Array), totalMinutes: expect.any(Number) });
    for (const t of plan.tasks) expect(t).toMatchObject({ type: expect.stringMatching(/REVISION|PRACTICE|BREAK/), description: expect.any(String), estMinutes: expect.any(Number) });

    // Delete from the edit form
    expect((await request(app).delete(`/problems/${problemId}`).set(headers)).status).toBe(200);

    // api.ts interceptor: an expired/invalid token gives 401 (=> app logs out)
    expect((await request(app).get('/problems').set({ Authorization: 'Bearer expired' })).status).toBe(401);
  });
});
