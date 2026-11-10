import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createProblem, DAY, daysFromNow, prisma, registerUser, TestUser } from './helpers';

let user: TestUser;
beforeEach(async () => {
  user = await registerUser();
});

/** Moves a revision into the past so it is due. */
const makeDue = (id: string) => prisma.revision.update({ where: { id }, data: { scheduledFor: daysFromNow(-1) } });

const complete = (id: string, body?: object) => {
  const r = request(app).post(`/revisions/${id}/complete`).set(user.auth);
  return body ? r.send(body) : r;
};

describe('first review scheduling', () => {
  it('schedules the first review a day after solving', async () => {
    const before = Date.now();
    const p = await createProblem(user, { needsRevision: true });
    expect(p.revisions).toHaveLength(1);
    const scheduled = new Date(p.revisions[0].scheduledFor).getTime();
    expect(scheduled).toBeGreaterThanOrEqual(before + DAY - 1000);
    expect(p.revisions[0].intervalDays).toBe(1);
  });

  it('does not create an already-overdue review for a back-dated log', async () => {
    const p = await createProblem(user, { needsRevision: true, dateSolved: '2024-01-15T10:00:00Z' });
    expect(new Date(p.revisions[0].scheduledFor).getTime()).toBeGreaterThan(Date.now());
    const due = await request(app).get('/revisions/due').set(user.auth);
    expect(due.body.revisions).toHaveLength(0);
  });

  it('PATCH needsRevision toggles the pending review without touching it on unrelated edits', async () => {
    const p = await createProblem(user, { needsRevision: true });
    // Regression: an unrelated PATCH used to inject needsRevision=false.
    const renamed = await request(app).patch(`/problems/${p.id}`).set(user.auth).send({ title: 'New title' });
    expect(renamed.body.problem.needsRevision).toBe(true);
    expect(renamed.body.problem.revisions).toHaveLength(1);

    const off = await request(app).patch(`/problems/${p.id}`).set(user.auth).send({ needsRevision: false });
    expect(off.body.problem.revisions).toHaveLength(0);

    const on = await request(app)
      .patch(`/problems/${p.id}`)
      .set(user.auth)
      .send({ needsRevision: true, dateSolved: '2024-01-01T00:00:00Z' });
    expect(on.body.problem.revisions).toHaveLength(1);
    expect(new Date(on.body.problem.revisions[0].scheduledFor).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('completing revisions', () => {
  it('defaults to GOOD and follows the 1 -> 3 -> 7 -> 14 -> 30 ladder, then graduates', async () => {
    const p = await createProblem(user, { needsRevision: true });
    let revisionId: string = p.revisions[0].id;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      await makeDue(revisionId);
      const res = await complete(revisionId);
      expect(res.status).toBe(200);
      expect(res.body.revision.rating).toBe('GOOD');
      expect(res.body.revision.completed).toBe(true);
      if (res.body.nextRevision) {
        intervals.push(res.body.nextRevision.intervalDays);
        revisionId = res.body.nextRevision.id;
      } else {
        expect(res.body.graduated).toBe(true);
        expect(res.body.problem.needsRevision).toBe(false);
      }
    }
    expect(intervals).toEqual([3, 7, 14, 30]);
  });

  it('schedules the next review interval days from now', async () => {
    const p = await createProblem(user, { needsRevision: true });
    const before = Date.now();
    const res = await complete(p.revisions[0].id, { rating: 'good' });
    const next = new Date(res.body.nextRevision.scheduledFor).getTime();
    expect(next - before).toBeGreaterThanOrEqual(3 * DAY - 1000);
    expect(next - before).toBeLessThan(3 * DAY + 60_000);
  });

  it('AGAIN resets the interval and lowers confidence; EASY skips a step and raises it', async () => {
    const p = await createProblem(user, { needsRevision: true, confidence: 3 });
    const r1 = await complete(p.revisions[0].id, { rating: 'easy' });
    expect(r1.body.nextRevision.intervalDays).toBe(7);
    expect(r1.body.problem.confidence).toBe(4);

    const r2 = await complete(r1.body.nextRevision.id, { rating: 'AGAIN' });
    expect(r2.body.nextRevision.intervalDays).toBe(1);
    expect(r2.body.problem.confidence).toBe(3);

    const r3 = await complete(r2.body.nextRevision.id, { rating: 'hard' });
    expect(r3.body.nextRevision.intervalDays).toBe(1);
  });

  it('accepts a 1-5 confidence and stores it on the problem', async () => {
    const p = await createProblem(user, { needsRevision: true, confidence: 2 });
    const res = await complete(p.revisions[0].id, { confidence: 5 });
    expect(res.body.revision.rating).toBe('EASY');
    expect(res.body.nextRevision.intervalDays).toBe(7);
    expect(res.body.problem.confidence).toBe(5);
    const stored = await prisma.problem.findUniqueOrThrow({ where: { id: p.id } });
    expect(stored.confidence).toBe(5);
  });

  it('validates the rating', async () => {
    const p = await createProblem(user, { needsRevision: true });
    const res = await complete(p.revisions[0].id, { rating: 'meh' });
    expect(res.status).toBe(400);
    expect((await complete(p.revisions[0].id, { confidence: 9 })).status).toBe(400);
  });

  it('returns 409 when completing twice and is safe under concurrent completion', async () => {
    const p = await createProblem(user, { needsRevision: true });
    const id = p.revisions[0].id;
    const results = await Promise.all(Array.from({ length: 5 }, () => complete(id)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('ALREADY_COMPLETED');

    const all = await prisma.revision.findMany({ where: { problemId: p.id } });
    expect(all).toHaveLength(2);
    expect(all.filter((r) => !r.completed)).toHaveLength(1);
  });

  it('404s for unknown revisions', async () => {
    expect((await complete('unknownrevision')).status).toBe(404);
  });
});

describe('due and upcoming', () => {
  it('lists due revisions and groups upcoming ones by real date', async () => {
    const make = async (offsetMs: number) => {
      const p = await createProblem(user, { needsRevision: true });
      await prisma.revision.update({ where: { id: p.revisions[0].id }, data: { scheduledFor: new Date(Date.now() + offsetMs), intervalDays: 7 } });
      return p.revisions[0].id as string;
    };
    const due = await make(-2 * DAY);
    const tomorrow = await make(DAY);
    const week = await make(4 * DAY);
    const later = await make(20 * DAY);

    const dueRes = await request(app).get('/revisions/due').set(user.auth);
    expect(dueRes.body.revisions.map((r: { id: string }) => r.id)).toEqual([due]);
    expect(dueRes.body.revisions[0].problem).toMatchObject({ title: 'Test Problem', difficulty: 'MEDIUM' });

    const up = await request(app).get('/revisions/upcoming').query({ tz: 'UTC' }).set(user.auth);
    expect(up.status).toBe(200);
    const ids = (k: string) => up.body.data[k].map((r: { id: string }) => r.id);
    // All four have intervalDays = 7, so the old interval-based grouping would lump them together.
    expect(ids('tomorrow')).toEqual([tomorrow]);
    expect(ids('thisWeek')).toEqual([week]);
    expect(ids('later')).toEqual([later]);
    expect(Object.keys(up.body.data).sort()).toEqual(['later', 'thisWeek', 'today', 'tomorrow']);
  });

  it('puts a review later today into the "today" bucket for the caller\'s time zone', async () => {
    const p = await createProblem(user, { needsRevision: true });
    // 1 minute from now is "today" in UTC unless it crosses midnight; pick a zone where it's mid-day.
    const zones = ['Pacific/Kiritimati', 'UTC', 'Pacific/Pago_Pago'];
    const inOneMinute = new Date(Date.now() + 60_000);
    const fmt = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short' });
    const tz = zones.find((z) => fmt(z).format(new Date()) === fmt(z).format(inOneMinute))!;
    await prisma.revision.update({ where: { id: p.revisions[0].id }, data: { scheduledFor: inOneMinute } });
    const up = await request(app).get('/revisions/upcoming').query({ tz }).set(user.auth);
    expect(up.body.data.today.map((r: { id: string }) => r.id)).toEqual([p.revisions[0].id]);
  });

  it('rejects an invalid time zone', async () => {
    expect((await request(app).get('/revisions/upcoming').query({ tz: 'Not/AZone' }).set(user.auth)).status).toBe(400);
  });
});

describe('manual add/remove and history', () => {
  it('adds a problem to revision idempotently and removes it', async () => {
    const p = await createProblem(user, { needsRevision: false });

    const add = await request(app).post(`/problems/${p.id}/revision`).set(user.auth).send({ dueInDays: 0 });
    expect(add.status).toBe(201);
    expect(add.body.created).toBe(true);
    expect(new Date(add.body.revision.scheduledFor).getTime()).toBeLessThanOrEqual(Date.now());

    const again = await request(app).post(`/problems/${p.id}/revision`).set(user.auth);
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.revision.id).toBe(add.body.revision.id);

    const concurrent = await Promise.all(Array.from({ length: 4 }, () => request(app).post(`/problems/${p.id}/revision`).set(user.auth)));
    expect(concurrent.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.revision.count({ where: { problemId: p.id, completed: false } })).toBe(1);

    const problem = await prisma.problem.findUniqueOrThrow({ where: { id: p.id } });
    expect(problem.needsRevision).toBe(true);

    const rm = await request(app).delete(`/problems/${p.id}/revision`).set(user.auth);
    expect(rm.body.removedPendingRevisions).toBe(1);
    expect((await prisma.problem.findUniqueOrThrow({ where: { id: p.id } })).needsRevision).toBe(false);
    expect((await request(app).post(`/problems/${p.id}/revision`).set(user.auth).send({ dueInDays: 999 })).status).toBe(400);
  });

  it('returns the revision history with ratings', async () => {
    const p = await createProblem(user, { needsRevision: true });
    const r1 = await complete(p.revisions[0].id, { rating: 'hard' });
    await complete(r1.body.nextRevision.id, { rating: 'good' });

    const hist = await request(app).get(`/problems/${p.id}/revisions`).set(user.auth);
    expect(hist.status).toBe(200);
    expect(hist.body.revisions).toHaveLength(3);
    expect(hist.body.revisions.map((r: { rating: string | null }) => r.rating)).toEqual(['HARD', 'GOOD', null]);
    expect(hist.body.stats).toMatchObject({
      completedCount: 2,
      lastRating: 'GOOD',
      ratings: { again: 0, hard: 1, good: 1, easy: 0 },
    });
    expect(hist.body.stats.pending.intervalDays).toBe(3);
  });
});
