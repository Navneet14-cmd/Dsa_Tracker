import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the repo-root .env. Variables that are
// already set (e.g. by the test runner or the shell) are never overridden.
dotenv.config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
// Fallback used when the primary model declines a request (server-side
// fallback). Only applied by default when the default model is in use.
const DEFAULT_ANTHROPIC_FALLBACK_MODEL = 'claude-opus-4-8';

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Environment variable ${envVar} is missing. Please check your .env file.`);
  }
}

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer (got "${raw}")`);
  }
  return parsed;
};

const list = (name: string): string[] =>
  (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const anthropicModel = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
const fallbackEnv = process.env.ANTHROPIC_FALLBACK_MODEL;

export const config = {
  PORT: int('PORT', 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL!,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || '7d',
  BCRYPT_ROUNDS: int('BCRYPT_ROUNDS', 10),

  // HTTP
  // Comma-separated list of allowed browser origins. "*" allows any origin.
  // Empty: any origin outside production, none in production. Native mobile
  // apps don't send an Origin header, so CORS never blocks them.
  CORS_ORIGINS: list('CORS_ORIGINS'),
  // Value for Express "trust proxy" (number of hops). 0 = don't trust.
  TRUST_PROXY: int('TRUST_PROXY', 0),

  // Rate limits
  AUTH_RATE_LIMIT_WINDOW_MS: int('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: int('AUTH_RATE_LIMIT_MAX', 20), // login/register/change-password per IP per window
  AI_RATE_LIMIT_WINDOW_MS: int('AI_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
  AI_RATE_LIMIT_MAX: int('AI_RATE_LIMIT_MAX', 30), // AI calls per user per window

  // Anthropic
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
  ANTHROPIC_MODEL: anthropicModel,
  ANTHROPIC_FALLBACK_MODEL:
    fallbackEnv !== undefined
      ? fallbackEnv.trim() || undefined // explicitly empty disables the fallback
      : anthropicModel === DEFAULT_ANTHROPIC_MODEL
        ? DEFAULT_ANTHROPIC_FALLBACK_MODEL
        : undefined,
  AI_TIMEOUT_MS: int('AI_TIMEOUT_MS', 60_000),
  AI_WEB_SEARCH_MAX_USES: int('AI_WEB_SEARCH_MAX_USES', 3),
};

export type Config = typeof config;
