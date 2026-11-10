import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createProblem, getTaxonomy, prisma, problemPayload, registerUser, TestUser, uniqueNumber } from './helpers';

let alice: TestUser;
let bob: TestUser;
let tx: Awaited<ReturnType<typeof getTaxonomy>>;

beforeAll(async () => {
  [alice, bob] = await Promise.all([registerUser(), registerUser()]);
  tx = await getTaxonomy();
});

describe('taxonomy', () => {
  it('lists seeded topics and patterns', async () => {
    const topics = await request(app).get('/topics').set(alice.auth);
    expect(topics.status).toBe(200);
    expect(topics.body.topics.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['Array', 'Hash Table', 'Heap', 'Graphs', 'Intervals', 'Bit Manipulation']),
    );
    const patterns = await request(app).get('/patterns').set(alice.auth);
    const bfs = patterns.body.patterns.find((p: { name: string }) => p.name === 'BFS');
    expect(bfs.topicIds).toContain(tx.topics['Graphs']);
  });
});

describe('problem CRUD', () => {
  it('creates a problem with topics and patterns', async () => {
    const res = await request(app)
      .post('/problems')
      .set(alice.auth)
      .send(problemPayload({ title: '  Two Sum  ', topicIds: [tx.topics['Array'], tx.topics['Array']], patternIds: [tx.patterns['Hash Map']] }));
    expect(res.status).toBe(201);
    expect(res.body.problem.title).toBe('Two Sum');
    expect(res.body.problem.topics).toEqual([{ topic: { id: tx.topics['Array'], name: 'Array' } }]); // de-duplicated
    expect(res.body.problem.patterns[0].pattern.name).toBe('Hash Map');
    expect(res.body.problem.revisions).toEqual([]);
  });

  it('validates the body', async () => {
    const res = await request(app).post('/problems').set(alice.auth).send({ title: '' });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['leetcodeNumber', 'title', 'difficulty', 'confidence']));

    const future = await request(app)
      .post('/problems')
      .set(alice.auth)
      .send(problemPayload({ dateSolved: new Date(Date.now() + 5 * 86_400_000).toISOString() }));
    expect(future.status).toBe(400);

    const badConf = await request(app).post('/problems').set(alice.auth).send(problemPayload({ confidence: 6 }));
    expect(badConf.body.message).toBe('Confidence must be between 1 and 5');
  });

  it('rejects unknown topic/pattern ids with 400 before inserting', async () => {
    const n = uniqueNumber();
    const res = await request(app)
      .post('/problems')
      .set(alice.auth)
      .send(problemPayload({ leetcodeNumber: n, topicIds: ['doesnotexist'], patternIds: [tx.patterns['BFS']] }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REFERENCE');
    expect(await prisma.problem.count({ where: { userId: alice.id, leetcodeNumber: n } })).toBe(0);
  });

  it('returns 409 with the existing id when the same LeetCode number is logged twice', async () => {
    const first = await createProblem(alice, { leetcodeNumber: 42 });
    const dup = await request(app).post('/problems').set(alice.auth).send(problemPayload({ leetcodeNumber: 42 }));
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_PROBLEM', existingProblemId: first.id });
    // Another user may log the same problem.
    expect((await request(app).post('/problems').set(bob.auth).send(problemPayload({ leetcodeNumber: 42 }))).status).toBe(201);
  });

  it('serializes concurrent duplicate logs', async () => {
    const payload = problemPayload();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/problems').set(alice.auth).send(payload)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('lists with pagination, filters and search', async () => {
    const user = await registerUser();
    await createProblem(user, { leetcodeNumber: 1, title: 'Two Sum', difficulty: 'EASY', topicIds: [tx.topics['Array']] });
    await createProblem(user, { leetcodeNumber: 15, title: '3Sum', difficulty: 'MEDIUM' });
    await createProblem(user, { leetcodeNumber: 42, title: 'Trapping Rain Water', difficulty: 'HARD' });

    const all = await request(app).get('/problems').query({ limit: 2 }).set(user.auth);
    expect(all.body.problems).toHaveLength(2);
    expect(all.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const hard = await request(app).get('/problems').query({ difficulty: 'HARD' }).set(user.auth);
    expect(hard.body.problems.map((p: { leetcodeNumber: number }) => p.leetcodeNumber)).toEqual([42]);

    const byTopic = await request(app).get('/problems').query({ topicId: tx.topics['Array'] }).set(user.auth);
    expect(byTopic.body.problems.map((p: { title: string }) => p.title)).toEqual(['Two Sum']);

    const byNumber = await request(app).get('/problems').query({ search: '15' }).set(user.auth);
    expect(byNumber.body.problems.map((p: { title: string }) => p.title)).toEqual(['3Sum']);

    const byTitle = await request(app).get('/problems').query({ search: 'rain' }).set(user.auth);
    expect(byTitle.body.problems).toHaveLength(1);

    expect((await request(app).get('/problems').query({ limit: 1000 }).set(user.auth)).status).toBe(400);
  });

  it('gets, updates and deletes', async () => {
    const p = await createProblem(alice, { topicIds: [tx.topics['Array']] });

    const got = await request(app).get(`/problems/${p.id}`).set(alice.auth);
    expect(got.status).toBe(200);

    const upd = await request(app)
      .patch(`/problems/${p.id}`)
      .set(alice.auth)
      .send({ title: 'Renamed', topicIds: [tx.topics['String'], tx.topics['Stack']], confidence: 5 });
    expect(upd.status).toBe(200);
    expect(upd.body.problem.title).toBe('Renamed');
    expect(upd.body.problem.confidence).toBe(5);
    expect(upd.body.problem.topics.map((t: { topic: { name: string } }) => t.topic.name).sort()).toEqual(['Stack', 'String']);
    expect(upd.body.problem.patterns).toEqual([]); // untouched

    expect((await request(app).patch(`/problems/${p.id}`).set(alice.auth).send({})).status).toBe(400);
    expect((await request(app).patch(`/problems/${p.id}`).set(alice.auth).send({ patternIds: ['nope'] })).status).toBe(400);

    const del = await request(app).delete(`/problems/${p.id}`).set(alice.auth);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/problems/${p.id}`).set(alice.auth)).status).toBe(404);
  });

  it('rejects changing the number to one already logged', async () => {
    await createProblem(alice, { leetcodeNumber: 7001 });
    const other = await createProblem(alice, { leetcodeNumber: 7002 });
    const res = await request(app).patch(`/problems/${other.id}`).set(alice.auth).send({ leetcodeNumber: 7001 });
    expect(res.status).toBe(409);
    // Keeping its own number is fine.
    expect((await request(app).patch(`/problems/${other.id}`).set(alice.auth).send({ leetcodeNumber: 7002 })).status).toBe(200);
  });

  it('validates :id params', async () => {
    const res = await request(app).get('/problems/not%20a%20valid%20id!').set(alice.auth);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('params.id');
  });
});

describe('ownership isolation', () => {
  it("never exposes or modifies another user's problems", async () => {
    const mine = await createProblem(alice, { needsRevision: true });

    expect((await request(app).get(`/problems/${mine.id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).patch(`/problems/${mine.id}`).set(bob.auth).send({ title: 'hacked' })).status).toBe(404);
    expect((await request(app).delete(`/problems/${mine.id}`).set(bob.auth)).status).toBe(404);
    expect((await request(app).get(`/problems/${mine.id}/revisions`).set(bob.auth)).status).toBe(404);
    expect((await request(app).post(`/problems/${mine.id}/revision`).set(bob.auth)).status).toBe(404);
    expect((await request(app).delete(`/problems/${mine.id}/revision`).set(bob.auth)).status).toBe(404);

    const revisionId = mine.revisions[0].id;
    expect((await request(app).post(`/revisions/${revisionId}/complete`).set(bob.auth)).status).toBe(404);
    expect((await request(app).post('/ai/recommend').set(bob.auth).send({ problemId: mine.id })).status).toBe(404);

    const bobsList = await request(app).get('/problems').query({ limit: 100 }).set(bob.auth);
    expect(bobsList.body.problems.some((p: { id: string }) => p.id === mine.id)).toBe(false);

    const still = await prisma.problem.findUniqueOrThrow({ where: { id: mine.id }, include: { revisions: true } });
    expect(still.title).toBe(mine.title);
    expect(still.revisions[0].completed).toBe(false);
  });
});
