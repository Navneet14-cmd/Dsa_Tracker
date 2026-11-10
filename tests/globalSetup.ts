import { execSync } from 'node:child_process';

/**
 * Resets the test database (drop, migrate, seed) once per `npm test` run.
 * Refuses to touch a database whose name doesn't contain "test".
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');

  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to reset database "${dbName}": its name must contain "test".`);
  }

  execSync('npx prisma migrate reset --force --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
