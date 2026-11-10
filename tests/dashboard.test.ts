import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createProblem, daysFromNow, getTaxonomy, prisma, registerUser, TestUser } from './helpers';
import { dayKey } from '../src/lib/dates';

let user: TestUser;
let tx: Awaited<ReturnType<typeof getTaxonomy>>;

beforeAll(async () => {
  user = await registerUser();
  tx = await getTaxonomy();
  const A = tx.topics['Array'];
  const G = tx.topics['Graphs'];
  const TP = tx.patterns['Two Pointer'];
  const BFS = tx.patterns['BFS'];

  // Streak: today, yesterday, 2 days ago (3), plus an isolated day 10 days ago.
  await createProblem(user, { dateSolved: daysFromNow(0), difficulty: 'EASY', timeTakenMins: 10, confidence: 5, solvedAlone: true, topicIds: [A], patternIds: [TP] });
  await createProblem(user, { dateSolved: daysFromNow(-1), difficulty: 'EASY', timeTakenMins: 20, confidence: 3, solvedAlone: true, topicIds: [A], patternIds: [TP] });
  await createProblem(user, { dateSolved: daysFromNow(-2), difficulty: 'MEDIUM', timeTakenMins: 30, confidence: 4, solvedAlone: false, topicIds: [A, G], patternIds: [BFS] });
  await createProblem(user, { dateSolved: daysFromNow(-10), difficulty: 'MEDIUM', timeTakenMins: 40, confidence: 2, solvedAlone: true, topicIds: [], needsRevision: true });

  await request(app).post('/goals').set(user.auth).send({ topicId: A, targetCount: 2 });
  await request(app).post('/goals').set(user.auth).send({ topicId: G, targetCount: 4 });

  // One overdue revision
  const r = await prisma.revision.findFirstOrThrow({ where: { problem: { userId: user.id } } });
  await prisma.revision.update({ where: { id: r.id }, data: { scheduledFor: daysFromNow(-1) } });
});

describe('GET /dashboard/progress', () => {
  it('keeps the original fields', async () => {
    const res = await request(app).get('/dashboard/progress').set(user.auth);
    expect(res.status).toBe(200);
    const { topics, difficultyStats } = res.body.data;
    expect(difficultyStats).toEqual({ easy: 2, medium: 2, hard: 0, total: 4 });
    const array = topics.find((t: { topicName: string }) => t.topicName === 'Array');
    expect(array).toMatchObject({ topicId: tx.topics['Array'], solvedCount: 3, targetCount: 2 });
    const heap = topics.find((t: { topicName: string }) => t.topicName === 'Heap');
    expect(heap).toMatchObject({ solvedCount: 0, targetCount: null, avgConfidence: null, goalProgressPct: null });
  });

  it('adds streak, heatmap, time, solved-alone, confidence and goal stats', async () => {
    const res = await request(app).get('/dashboard/progress').query({ tz: 'UTC' }).set(user.auth);
    const d = res.body.data;

    expect(d.streak).toEqual({ current: 3, longest: 3, lastSolvedDate: dayKey(new Date(), 'UTC') });

    expect(d.heatmap).toHaveLength(365);
    expect(d.heatmap.at(-1)).toEqual({ date: dayKey(new Date(), 'UTC'), count: 1 });
    expect(d.heatmap.reduce((s: number, x: { count: number }) => s + x.count, 0)).toBe(4);

    expect(d.avgTimeByDifficulty).toEqual({ easy: 15, medium: 35, hard: null, overall: 25 });
    expect(d.solvedAlonePct).toBe(75);
    expect(d.avgConfidence).toBe(3.5);

    const topic = (name: string) => d.topics.find((t: { topicName: string }) => t.topicName === name);
    expect(topic('Array')).toMatchObject({ avgConfidence: 4, goalProgressPct: 100 }); // (5+3+4)/3, capped
    expect(topic('Graphs')).toMatchObject({ avgConfidence: 4, goalProgressPct: 25 });

    // (min(3,2) + min(1,4)) / (2 + 4)
    expect(d.goalProgress).toEqual({ goalsSet: 2, goalsMet: 1, overallPct: 50 });
    expect(d.revisionsDue).toBe(1);
  });

  it('returns empty stats for a new user', async () => {
    const fresh = await registerUser();
    const d = (await request(app).get('/dashboard/progress').set(fresh.auth)).body.data;
    expect(d.streak).toEqual({ current: 0, longest: 0, lastSolvedDate: null });
    expect(d.solvedAlonePct).toBeNull();
    expect(d.goalProgress).toEqual({ goalsSet: 0, goalsMet: 0, overallPct: null });
    expect(d.heatmap.every((x: { count: number }) => x.count === 0)).toBe(true);
  });
});

describe('GET /dashboard/patterns', () => {
  it('keeps the original shape and adds per-pattern confidence', async () => {
    const res = await request(app).get('/dashboard/patterns').set(user.auth);
    const tp = res.body.data.patterns.find((p: { patternName: string }) => p.patternName === 'Two Pointer');
    expect(tp).toMatchObject({ patternId: tx.patterns['Two Pointer'], solvedCount: 2, avgConfidence: 4, solvedAlonePct: 100 });
    expect(tp.topics).toEqual(expect.arrayContaining([{ topicId: tx.topics['Array'], topicName: 'Array' }]));
    const bfs = res.body.data.patterns.find((p: { patternName: string }) => p.patternName === 'BFS');
    expect(bfs).toMatchObject({ solvedCount: 1, avgConfidence: 4, solvedAlonePct: 0 });
  });
});
