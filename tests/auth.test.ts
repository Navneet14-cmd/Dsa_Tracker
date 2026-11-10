import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { app, registerUser } from './helpers';

describe('auth', () => {
  it('registers, normalizes the email and never returns the password hash', async () => {
    const email = `MiXeD-${Date.now()}@Example.com`;
    const res = await request(app).post('/auth/register').send({ email, password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email.toLowerCase());
    expect(res.body.user.name).toBeNull();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.token).toBe('string');
  });

  it('validates email, password length and name', async () => {
    const bad = await request(app).post('/auth/register').send({ email: 'not-an-email', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ status: 'error', code: 'VALIDATION_ERROR' });
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['email', 'password']);

    const badName = await request(app)
      .post('/auth/register')
      .send({ email: `n-${Date.now()}@example.com`, password: 'password123', name: 42 });
    expect(badName.status).toBe(400);
    expect(badName.body.errors[0].field).toBe('name');

    const missing = await request(app).post('/auth/register').send({});
    expect(missing.body.message).toBe('Email is required');
  });

  it('rejects duplicate emails with 409', async () => {
    const user = await registerUser();
    const res = await request(app).post('/auth/register').send({ email: user.email.toUpperCase(), password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('logs in with the right password only', async () => {
    const user = await registerUser({ password: 'correct-horse' });
    const ok = await request(app).post('/auth/login').send({ email: user.email, password: 'correct-horse' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.passwordHash).toBeUndefined();

    const wrong = await request(app).post('/auth/login').send({ email: user.email, password: 'wrong-horse' });
    expect(wrong.status).toBe(401);
    const unknown = await request(app).post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('signs tokens with the configured expiry', async () => {
    const user = await registerUser();
    const decoded = jwt.decode(user.token) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(3600); // JWT_EXPIRES_IN=1h in tests
  });

  it('GET/PATCH /auth/me', async () => {
    const user = await registerUser({ name: 'Before' });
    expect((await request(app).get('/auth/me')).status).toBe(401);
    expect((await request(app).get('/auth/me').set({ Authorization: 'Bearer nope' })).status).toBe(401);

    const me = await request(app).get('/auth/me').set(user.auth);
    expect(me.body.user).toMatchObject({ id: user.id, name: 'Before' });

    const patched = await request(app).patch('/auth/me').set(user.auth).send({ name: '  After  ' });
    expect(patched.status).toBe(200);
    expect(patched.body.user.name).toBe('After');

    const cleared = await request(app).patch('/auth/me').set(user.auth).send({ name: null });
    expect(cleared.body.user.name).toBeNull();

    expect((await request(app).patch('/auth/me').set(user.auth).send({})).status).toBe(400);
  });

  it('changes the password', async () => {
    const user = await registerUser({ password: 'old-password' });
    const wrong = await request(app)
      .post('/auth/change-password')
      .set(user.auth)
      .send({ currentPassword: 'not-it-at-all', newPassword: 'new-password' });
    expect(wrong.status).toBe(400);

    const same = await request(app)
      .post('/auth/change-password')
      .set(user.auth)
      .send({ currentPassword: 'old-password', newPassword: 'old-password' });
    expect(same.status).toBe(400);

    const ok = await request(app)
      .post('/auth/change-password')
      .set(user.auth)
      .send({ currentPassword: 'old-password', newPassword: 'new-password' });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');

    expect((await request(app).post('/auth/login').send({ email: user.email, password: 'old-password' })).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ email: user.email, password: 'new-password' })).status).toBe(200);
  });

  it('rate limits credential endpoints', async () => {
    const limited = createApp({ authRateLimitMax: 3 });
    const attempt = () => request(limited).post('/auth/login').send({ email: 'rl@example.com', password: 'whatever1' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ status: 'error', code: 'RATE_LIMITED' });
  });
});

describe('app routing & security', () => {
  it('returns a JSON 404 for unknown routes, with or without auth', async () => {
    const res = await request(app).get('/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 'error', code: 'ROUTE_NOT_FOUND' });
    const user = await registerUser();
    expect((await request(app).get('/nope').set(user.auth)).status).toBe(404);
  });

  it('still requires auth on protected routes', async () => {
    for (const path of ['/topics', '/patterns', '/problems', '/goals', '/revisions/due', '/dashboard/progress']) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
  });

  it('serves /health and sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects malformed JSON with 400 and no stack trace', async () => {
    const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
    expect(res.body.stack).toBeUndefined();
  });
});
