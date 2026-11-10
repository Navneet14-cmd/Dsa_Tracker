import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createProblem, getTaxonomy, registerUser } from './helpers';

describe('goals', () => {
  let tx: Awaited<ReturnType<typeof getTaxonomy>>;
  beforeAll(async () => {
    tx = await getTaxonomy();
  });

  it('upserts, lists with progress and deletes goals', async () => {
    const user = await registerUser();
    const other = await registerUser();
    const topicId = tx.topics['Graphs'];

    const created = await request(app).post('/goals').set(user.auth).send({ topicId, targetCount: 4 });
    expect(created.status).toBe(200);
    expect(created.body.goal).toMatchObject({ topicId, targetCount: 4, topic: { name: 'Graphs' } });

    const updated = await request(app).post('/goals').set(user.auth).send({ topicId, targetCount: 2 });
    expect(updated.body.goal.id).toBe(created.body.goal.id);

    await createProblem(user, { topicIds: [topicId] });

    const list = await request(app).get('/goals').set(user.auth);
    expect(list.body.goals).toHaveLength(1);
    expect(list.body.goals[0]).toMatchObject({ targetCount: 2, solvedCount: 1, progressPct: 50 });

    expect((await request(app).get('/goals').set(other.auth)).body.goals).toHaveLength(0);
    expect((await request(app).delete(`/goals/${created.body.goal.id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).delete(`/goals/${created.body.goal.id}`).set(user.auth)).status).toBe(200);
    expect((await request(app).get('/goals').set(user.auth)).body.goals).toHaveLength(0);
  });

  it('validates input', async () => {
    const user = await registerUser();
    const missing = await request(app).post('/goals').set(user.auth).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.errors.map((e: { message: string }) => e.message)).toEqual([
      'topicId is required',
      'Target count is required',
    ]);
    expect((await request(app).post('/goals').set(user.auth).send({ topicId: tx.topics['DP'], targetCount: 0 })).status).toBe(400);
    expect((await request(app).post('/goals').set(user.auth).send({ topicId: tx.topics['DP'], targetCount: 2.5 })).status).toBe(400);
    const badTopic = await request(app).post('/goals').set(user.auth).send({ topicId: 'nosuchtopic', targetCount: 3 });
    expect(badTopic.status).toBe(400);
    expect(badTopic.body.code).toBe('INVALID_REFERENCE');
  });
});
