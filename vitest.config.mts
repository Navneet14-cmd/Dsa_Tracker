import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Read TEST_DATABASE_URL from .env if it isn't already in the environment.
dotenv.config({ quiet: true });

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://dsa:dsa@localhost:5432/dsatracker_test?schema=public';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      JWT_EXPIRES_IN: '1h',
      BCRYPT_ROUNDS: '4',
      // Empty key => AI mock mode.
      ANTHROPIC_API_KEY: '',
    },
  },
});
