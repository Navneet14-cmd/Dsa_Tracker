# DSA Tracker — Spaced Repetition LeetCode Planner

A React Native (Expo) app backed by an Express + TypeScript + Prisma (Postgres) API. Log the LeetCode problems you solve, review them on a spaced-repetition schedule, track goals and streaks, and get AI suggestions from Claude.

- **Mobile** (`mobile/`): React Native, Expo, TypeScript, Zustand, SecureStore, Axios.
- **Backend** (`src/`): Node 20+, Express 4, Prisma 5, PostgreSQL, zod 4.
- **AI**: Anthropic Claude (default `claude-opus-5-5`), with an offline mock mode.

---

## Quick start

```bash
# 1. Start Postgres (creates the dsatracker and dsatracker_test databases)
docker compose up -d db            # or: npm run db:up

# 2. Configure the backend
cp .env.example .env               # defaults match docker-compose; set JWT_SECRET

# 3. Install, migrate, seed
npm install
npx prisma migrate deploy          # or `npm run prisma:migrate` while developing the schema
npx prisma db seed                 # idempotent; safe to re-run at any time

# 4. Run the API (http://localhost:3000)
npm run dev

# 5. Run the app (separate terminal)
cd mobile
cp .env.example .env               # set EXPO_PUBLIC_API_URL for a physical device
npm install
npx expo start                     # i = iOS simulator, a = Android emulator
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Integration + unit tests (Vitest + supertest) against `TEST_DATABASE_URL` |
| `npm run typecheck` | `tsc --noEmit` over server, seed and tests (strict) |
| `npm run build` / `npm start` | Compile `src/` to `dist/` / run the build |
| `npm run db:down` | Stop the docker Postgres |

**Tests** reset the test database (drop, migrate, seed) at the start of every run. The setup refuses to touch a database whose name doesn't contain `test`. With docker-compose the default `TEST_DATABASE_URL` already points at `dsatracker_test`.

> If your Postgres volume was created before `docker/postgres-init` existed, create the test DB once: `docker compose exec db createdb -U dsa dsatracker_test`.

---

## Environment variables

Backend (`.env`, see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — (required) | Postgres connection string |
| `TEST_DATABASE_URL` | `postgresql://dsa:dsa@localhost:5432/dsatracker_test` | Used by `npm test`; name must contain `test` |
| `PORT` | `3000` | |
| `NODE_ENV` | `development` | `production` hides internal error details and disables AI mock mode |
| `JWT_SECRET` | — (required) | Long random string |
| `JWT_EXPIRES_IN` | `7d` | `ms` format (`12h`, `30d`) or seconds |
| `BCRYPT_ROUNDS` | `10` | |
| `CORS_ORIGINS` | empty | Comma-separated browser origins, or `*`. Empty = any origin in dev, none in production. Native apps send no `Origin` and are never blocked |
| `TRUST_PROXY` | `0` | Reverse-proxy hops to trust (affects client IP for rate limiting) |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` | `20` / `900000` | Per IP, for register / login / change-password |
| `ANTHROPIC_API_KEY` | empty | Empty (outside production) = **mock mode** |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | |
| `ANTHROPIC_FALLBACK_MODEL` | `claude-opus-4-8` with the default model | Retried server-side if the primary model declines; set empty to disable |
| `AI_TIMEOUT_MS` | `60000` | Overall deadline per AI request, including web searches |
| `AI_WEB_SEARCH_MAX_USES` | `3` | Web searches per recommendation |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS` | `30` / `3600000` | Per user, across `/ai/*` |

Mobile (`mobile/.env`): `EXPO_PUBLIC_API_URL`. If blank, the iOS simulator uses `http://localhost:3000` and the Android emulator `http://10.0.2.2:3000`. On a physical device use your computer's LAN IP, e.g. `http://192.168.1.45:3000`.

---

## API

All endpoints except `/health`, `/auth/register` and `/auth/login` need `Authorization: Bearer <token>`.

### Conventions

Success responses have `"status": "success"`. **Every** error has the same shape:

```json
{
  "status": "error",
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Password must be at least 8 characters long",
  "errors": [{ "field": "password", "message": "Password must be at least 8 characters long" }]
}
```

`message` is always safe to show to users (for validation errors it's the first issue). Codes you may see:

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_REFERENCE` (unknown topic/pattern id), `INVALID_JSON`, `INVALID_CREDENTIALS` (wrong current password) |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | `CONFLICT` (e.g. email taken), `DUPLICATE_PROBLEM`, `ALREADY_COMPLETED` |
| 429 | `RATE_LIMITED` |
| 5xx | `INTERNAL_ERROR`, `AI_NOT_CONFIGURED`, `AI_UNAVAILABLE`, `AI_UPSTREAM_ERROR`, `AI_BAD_RESPONSE`, `AI_REFUSED`, `AI_TIMEOUT` |

Ids are validated (`[A-Za-z0-9_-]{1,64}`). Endpoints that count by calendar day take an optional `tz` query param (IANA zone such as `Asia/Kolkata`; default `UTC`).

### Health

`GET /health` → `{ "status": "ok", "timestamp": "...", "database": "connected", "uptime": 12.3 }`

### Auth

| Method & path | Body | Response |
|---|---|---|
| `POST /auth/register` | `{ email, password (8–72 chars), name? }` | `201 { token, user }` · `409` if the email is taken |
| `POST /auth/login` | `{ email, password }` | `200 { token, user }` · `401` |
| `GET /auth/me` | — | `{ user }` |
| `PATCH /auth/me` | `{ name: string \| null }` | `{ user }` |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | `{ message, token }` (fresh token) · `400` if `currentPassword` is wrong |

`user` is `{ id, email, name, createdAt }`. Emails are trimmed and lower-cased.

```bash
curl -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"ann@example.com","password":"password123","name":"Ann"}'
```

### Taxonomy

- `GET /topics` → `{ topics: [{ id, name }] }`
- `GET /patterns` → `{ patterns: [{ id, name, topicIds: [...] }] }`

### Problems

**`POST /problems`**

```json
{
  "leetcodeNumber": 1,
  "title": "Two Sum",
  "difficulty": "EASY",
  "topicIds": ["<topicId>"],
  "patternIds": ["<patternId>"],
  "timeTakenMins": 12,
  "dateSolved": "2026-11-10T09:30:00.000Z",
  "solvedAlone": true,
  "notes": null,
  "needsRevision": true,
  "confidence": 4
}
```

→ `201 { problem }`, where `problem` has all the fields plus `topics: [{ topic: { id, name } }]`, `patterns: [{ pattern: { id, name } }]` and `revisions: [...]`.

- Unknown `topicIds`/`patternIds` → `400 INVALID_REFERENCE`, and nothing is inserted.
- **One entry per LeetCode number per user.** Logging the same number again → `409 DUPLICATE_PROBLEM` with `existingProblemId`. Update that entry instead (re-solves are tracked through revisions).
- `dateSolved` can't be in the future. With `needsRevision: true` the first review is due 1 day after `max(dateSolved, now)`, so back-dated logs are never created already overdue.

**`GET /problems`**: query `page` (1), `limit` (10, max 100), `topicId`, `patternId`, `difficulty`, `startDate`, `endDate`, `search` (a number matches `leetcodeNumber`; otherwise case-insensitive title match).
→ `{ problems: [...], pagination: { page, limit, total, totalPages } }`

- `GET /problems/:id` → `{ problem }`
- `PATCH /problems/:id`: any subset of the create fields → `{ problem }`. `topicIds`/`patternIds` replace the tags when present. `needsRevision: true` schedules a review if none is pending; `false` removes pending reviews; omitting it leaves revisions alone.
- `DELETE /problems/:id` → `{ message }`

Other users' problems always return `404`.

### Revisions (spaced repetition)

The default ladder is **1 → 3 → 7 → 14 → 30 days**, then the problem graduates (`needsRevision` becomes `false`).

| Method & path | Body / query | Response |
|---|---|---|
| `GET /revisions/due` | — | `{ revisions: [{ id, scheduledFor, intervalDays, problem: { id, leetcodeNumber, title, difficulty, confidence } }] }` |
| `GET /revisions/upcoming` | `?tz=` | `{ timeZone, data: { today, tomorrow, thisWeek, later } }`, grouped by the real scheduled day in `tz` (`today` = later today, `thisWeek` = 2–7 days) |
| `POST /revisions/:id/complete` | `{ rating?: "again" \| "hard" \| "good" \| "easy", confidence?: 1-5 }` | `{ revision, nextRevision \| null, problem: { id, confidence, needsRevision }, graduated }` |
| `POST /problems/:id/revision` | `{ dueInDays?: 0-365 }` (default 1) | `201 { created: true, revision }`, or `200 { created: false, revision }` if one is already pending |
| `DELETE /problems/:id/revision` | — | `{ removedPendingRevisions }` (also sets `needsRevision: false`) |
| `GET /problems/:id/revisions` | — | `{ problem, revisions: [...], stats: { completedCount, pending, lastCompletedAt, lastRating, ratings: { again, hard, good, easy } } }` |

How the rating picks the next interval:

| Rating | Next interval | Problem confidence |
|---|---|---|
| `again` | back to 1 day | −1 |
| `hard` | repeat the current step | unchanged |
| `good` (default when no body) | next step on the ladder | unchanged |
| `easy` | skip one step (graduates from 14 days) | +1 |

`confidence` 1–5 can be sent instead of `rating` (1 = again, 2 = hard, 3–4 = good, 5 = easy) and is then stored as the problem's confidence. Completion is a conditional update inside a transaction, so completing the same revision twice (e.g. a double tap) returns `409 ALREADY_COMPLETED` and never creates two follow-ups.

```bash
curl -X POST localhost:3000/revisions/<id>/complete -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"rating":"hard"}'
```

### Goals

- `POST /goals` `{ topicId, targetCount }` → `{ goal }` (creates or updates the goal for that topic)
- `GET /goals` → `{ goals: [{ id, topicId, targetCount, topic: { id, name }, solvedCount, progressPct }] }`
- `DELETE /goals/:id` → `{ message }`

### Dashboard

**`GET /dashboard/progress?tz=Asia/Kolkata`**

```json
{
  "status": "success",
  "data": {
    "topics": [
      { "topicId": "...", "topicName": "Array", "solvedCount": 12, "targetCount": 20,
        "avgConfidence": 3.8, "goalProgressPct": 60 }
    ],
    "difficultyStats": { "easy": 8, "medium": 10, "hard": 2, "total": 20 },
    "timeZone": "Asia/Kolkata",
    "streak": { "current": 4, "longest": 9, "lastSolvedDate": "2026-11-10" },
    "heatmap": [{ "date": "2025-11-11", "count": 0 }, "... 365 days, oldest first ..."],
    "avgTimeByDifficulty": { "easy": 14.5, "medium": 31, "hard": 52, "overall": 27.2 },
    "solvedAlonePct": 70,
    "avgConfidence": 3.6,
    "goalProgress": { "goalsSet": 3, "goalsMet": 1, "overallPct": 64.3 },
    "revisionsDue": 2
  }
}
```

The current streak stays alive until the end of today (a streak through yesterday still counts). `goalProgress.overallPct` caps each goal at 100%.

**`GET /dashboard/patterns`** → `{ data: { patterns: [{ patternId, patternName, solvedCount, topics: [{ topicId, topicName }], avgConfidence, solvedAlonePct }] } }`

Both endpoints keep their original fields; everything else was added on top.

### AI

Rate-limited per user (`AI_RATE_LIMIT_MAX`). Every response includes `source: "claude" | "mock"`.

| Method & path | Body | Response |
|---|---|---|
| `POST /ai/recommend` | `{ problemId }` | `{ recommendations: [{ number, title, difficulty, reason }], overallReason, filteredOut }` |
| `POST /ai/weakness-analysis` | — | `{ strengths: [string], weakAreas: [string], recommendation }` |
| `POST /ai/study-plan` | `{ minutesAvailable: 5-720 }` | `{ tasks: [{ type: "REVISION" \| "PRACTICE" \| "BREAK", description, estMinutes }], totalMinutes }` |

- Claude gets the full picture: per-topic and per-pattern volume, average confidence, % solved without hints, time taken against a difficulty benchmark (15/30/45 min), overdue revisions and goal gaps.
- Responses are constrained to a JSON schema (structured outputs) and validated with zod. Recommendations use the web search tool to check problem numbers.
- Problems you've already logged are filtered out on the server (`filteredOut` counts how many). Study plans are trimmed so they never exceed `minutesAvailable`.
- **Mock mode** (no `ANTHROPIC_API_KEY`, outside production) returns realistic results built from your data and a built-in catalogue of real problems. In production with no key, these endpoints return `503 AI_NOT_CONFIGURED`.

---

## Data model notes

- Topics and patterns are seeded by `prisma/seed.ts`, which only upserts and never deletes, so it can't wipe users' tags or goals. Renaming an entry there adds a new row; rename existing rows with a migration.
- Migrations live in `prisma/migrations`. `20261110…_revision_rating_and_indexes` adds `Revision.rating`, `Revision.createdAt` and lookup indexes. It's additive, so it's safe on existing data.
