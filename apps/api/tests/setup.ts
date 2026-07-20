import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIsTestDatabase, resolveTestDatabaseUrl } from './helpers/test-database.js';

/**
 * Per-file setup, executed BEFORE the test module and therefore before
 * `src/config/prisma.ts` is imported and creates its client.
 *
 * That ordering is the whole point: repositories import the shared singleton,
 * so redirecting DATABASE_URL here is what makes them run against the test
 * database. `dotenv` never overrides an already-set variable, so the
 * assignment below wins over the root `.env`.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: path.join(repoRoot, '.env') });

process.env.NODE_ENV = 'test';

const testDatabaseUrl = resolveTestDatabaseUrl();
assertIsTestDatabase(testDatabaseUrl);
process.env.DATABASE_URL = testDatabaseUrl;

// Env validation requires these; provide test values if the root .env is thin.
process.env.SESSION_SECRET ??= 'test_session_secret_value_at_least_32_chars';
process.env.TOKEN_PEPPER ??= 'test_token_pepper_value_at_least_32_chars_x';
