import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { createProblem, getTaxonomy, prisma, registerUser } from './helpers';
import request from 'supertest';
import { app } from './helpers';

describe('seed', () => {
  it('is idempotent and keeps users\' topic links and goals', async () => {
    const tx = await getTaxonomy();
    const user = await registerUser();
    const p = await createProblem(user, { topicIds: [tx.topics['Array']], patternIds: [tx.patterns['Two Pointer']] });
    await request(app).post('/goals').set(user.auth).send({ topicId: tx.topics['Array'], targetCount: 10 });

    const counts = async () => ({
      topics: await prisma.topic.count(),
      patterns: await prisma.pattern.count(),
      links: await prisma.patternTopic.count(),
    });
    const before = await counts();

    execSync('npx prisma db seed', { stdio: 'pipe', env: process.env });

    expect(await counts()).toEqual(before);
    expect(before.topics).toBeGreaterThanOrEqual(19);
    expect(before.patterns).toBeGreaterThanOrEqual(26);
    expect(await prisma.problemTopic.count({ where: { problemId: p.id } })).toBe(1);
    expect(await prisma.problemPattern.count({ where: { problemId: p.id } })).toBe(1);
    expect(await prisma.goal.count({ where: { userId: user.id } })).toBe(1);
  });
});
