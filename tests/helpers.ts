import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

// Rate limits are exercised explicitly in their own tests.
export const app = createApp({ authRateLimitMax: 10_000, aiRateLimitMax: 10_000 });
export { prisma };

export interface TestUser {
  id: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

export async function registerUser(overrides: { email?: string; password?: string; name?: string } = {}): Promise<TestUser> {
  const email = overrides.email ?? `user-${randomUUID()}@example.com`;
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: overrides.password ?? 'password123', name: overrides.name ?? 'Test User' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id, email, token: res.body.token, auth: { Authorization: `Bearer ${res.body.token}` } };
}

let taxonomy: { topics: Record<string, string>; patterns: Record<string, string> } | null = null;

/** name -> id maps for seeded topics/patterns. */
export async function getTaxonomy() {
  if (!taxonomy) {
    const [topics, patterns] = await Promise.all([prisma.topic.findMany(), prisma.pattern.findMany()]);
    taxonomy = {
      topics: Object.fromEntries(topics.map((t) => [t.name, t.id])),
      patterns: Object.fromEntries(patterns.map((p) => [p.name, p.id])),
    };
  }
  return taxonomy;
}

let nextNumber = 1000;
export const uniqueNumber = () => nextNumber++;

export function problemPayload(overrides: Record<string, unknown> = {}) {
  return {
    leetcodeNumber: uniqueNumber(),
    title: 'Test Problem',
    difficulty: 'MEDIUM',
    topicIds: [],
    patternIds: [],
    timeTakenMins: 25,
    dateSolved: new Date().toISOString(),
    solvedAlone: true,
    notes: null,
    needsRevision: false,
    confidence: 3,
    ...overrides,
  };
}

export async function createProblem(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/problems').set(user.auth).send(problemPayload(overrides));
  if (res.status !== 201) throw new Error(`create problem failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.problem;
}

export const DAY = 24 * 60 * 60 * 1000;
export const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);
