import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { dayKey } from '../src/lib/dates';
import { app, createProblem, DAY, daysFromNow, prisma, problemPayload, registerUser, TestUser } from './helpers';

let user: TestUser;
let other: TestUser;

beforeAll(async () => {
  [user, other] = await Promise.all([registerUser(), registerUser()]);
});

const attempt = (overrides: Record<string, unknown> = {}) => ({
  timeTakenMins: 18,
  solvedAlone: true,
  confidence: 5,
  notes: 'Faster this time',
  ...overrides,
});

describe('re-attempts (POST /problems/:id/attempts)', () => {
  it('a duplicate log returns 409 with the existing id the client can re-attempt', async () => {
    const payload = problemPayload({ title: 'Dup' });
    const first = await request(app).post('/problems').set(user.auth).send(payload);
    const dup = await request(app).post('/problems').set(user.auth).send(payload);
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_PROBLEM', existingProblemId: first.body.problem.id });

    const res = await request(app).post(`/problems/${dup.body.existingProblemId}/attempts`).set(user.auth).send(attempt());
    expect(res.status).toBe(201);
  });

  it('records the attempt and updates the latest confidence (no due review)', async () => {
    const p = await createProblem(user, { confidence: 2 });
    const res = await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt({ confidence: 4 }));
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ problemId: p.id, timeTakenMins: 18, solvedAlone: true, confidence: 4, notes: 'Faster this time' });
    expect(res.body.problem).toMatchObject({ id: p.id, confidence: 4 });
    expect(res.body.completedRevision).toBeNull();
    expect(res.body.nextRevision).toBeNull();
  });

  it('completes a due review, rating it from the attempt confidence', async () => {
    const p = await createProblem(user, { needsRevision: true, confidence: 3 });
    await prisma.revision.updateMany({ where: { problemId: p.id }, data: { scheduledFor: daysFromNow(-1) } });

    // confidence 5 => EASY: skips a rung (1 -> 7)
    const res = await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt({ confidence: 5 }));
    expect(res.status).toBe(201);
    expect(res.body.completedRevision).toMatchObject({ problemId: p.id, completed: true });
    expect(res.body.nextRevision).toMatchObject({ intervalDays: 7, completed: false });
    expect(res.body.problem.confidence).toBe(5);

    const pending = await prisma.revision.findMany({ where: { problemId: p.id, completed: false } });
    expect(pending).toHaveLength(1);

    // The new review isn't due yet: another attempt leaves it alone.
    const again = await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt({ confidence: 1 }));
    expect(again.body.completedRevision).toBeNull();
    expect(again.body.problem.confidence).toBe(1);
    expect(await prisma.revision.count({ where: { problemId: p.id, completed: false } })).toBe(1);
  });

  it('lists attempts and includes them in the problem history', async () => {
    const p = await createProblem(user);
    const older = new Date(Date.now() - 3 * DAY).toISOString();
    await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt({ attemptedAt: older, confidence: 2 }));
    await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt({ confidence: 4 }));

    const list = await request(app).get(`/problems/${p.id}/attempts`).set(user.auth);
    expect(list.status).toBe(200);
    expect(list.body.attempts.map((a: { confidence: number }) => a.confidence)).toEqual([4, 2]); // newest first

    const history = await request(app).get(`/problems/${p.id}/revisions`).set(user.auth);
    expect(history.body.attempts).toHaveLength(2);
    expect(history.body.stats.attemptCount).toBe(2);

    const del = await request(app).delete(`/problems/${p.id}/attempts/${list.body.attempts[0].id}`).set(user.auth);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/problems/${p.id}/attempts`).set(user.auth)).body.attempts).toHaveLength(1);
  });

  it('validates input and enforces ownership', async () => {
    const p = await createProblem(user);
    expect((await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt({ confidence: 6 }))).status).toBe(400);
    expect((await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send({ confidence: 3 })).status).toBe(400);
    expect((await request(app).post(`/problems/${p.id}/attempts`).set(other.auth).send(attempt())).status).toBe(404);
    expect((await request(app).get(`/problems/${p.id}/attempts`).set(other.auth)).status).toBe(404);
    const a = await request(app).post(`/problems/${p.id}/attempts`).set(user.auth).send(attempt());
    expect((await request(app).delete(`/problems/${p.id}/attempts/${a.body.attempt.id}`).set(other.auth)).status).toBe(404);
  });

  it('attempts count toward the streak and heatmap', async () => {
    const u = await registerUser();
    const p = await createProblem(u, { dateSolved: daysFromNow(-2).toISOString() });
    await request(app).post(`/problems/${p.id}/attempts`).set(u.auth).send(attempt({ attemptedAt: daysFromNow(-1).toISOString() }));
    await request(app).post(`/problems/${p.id}/attempts`).set(u.auth).send(attempt());

    const d = (await request(app).get('/dashboard/progress').query({ tz: 'UTC' }).set(u.auth)).body.data;
    expect(d.streak).toMatchObject({ current: 3, longest: 3, lastSolvedDate: dayKey(new Date(), 'UTC') });
    expect(d.heatmap.slice(-3).map((x: { count: number }) => x.count)).toEqual([1, 1, 1]);
    expect(d.totalAttempts).toBe(2);
  });
});

describe('rating previews (GET /revisions/due)', () => {
  it('shows the interval each rating would schedule', async () => {
    const u = await registerUser();
    const p = await createProblem(u, { needsRevision: true });
    await prisma.revision.updateMany({ where: { problemId: p.id }, data: { scheduledFor: daysFromNow(-1), intervalDays: 3 } });
    const due = (await request(app).get('/revisions/due').set(u.auth)).body.revisions;
    expect(due[0].nextIntervals).toEqual({ again: 1, hard: 3, good: 7, easy: 14 });

    await prisma.revision.updateMany({ where: { problemId: p.id }, data: { intervalDays: 30 } });
    const top = (await request(app).get('/revisions/due').set(u.auth)).body.revisions;
    expect(top[0].nextIntervals).toEqual({ again: 1, hard: 30, good: null, easy: null });
  });
});
