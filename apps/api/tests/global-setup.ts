import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import {
  assertIsTestDatabase,
  ensureTestDatabaseExists,
  migrateTestDatabase,
  resolveTestDatabaseUrl,
} from './helpers/test-database.js';

/**
 * Runs once before the suite: creates the dedicated test database if needed and
 * brings it up to the current migration state. The development database is
 * never touched.
 *
 * This executes before `tests/setup.ts`, so it must load the root `.env`
 * itself rather than relying on the per-file setup having done so.
 */
export default async function globalSetup(): Promise<void> {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  config({ path: path.join(repoRoot, '.env') });

  const databaseUrl = resolveTestDatabaseUrl();

  assertIsTestDatabase(databaseUrl);
  await ensureTestDatabaseExists(databaseUrl);
  migrateTestDatabase(databaseUrl);

  // Hand the resolved URL to the worker processes.
  process.env.TEST_DATABASE_URL = databaseUrl;
}
