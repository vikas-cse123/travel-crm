import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { assertIsTestDatabase, resolveTestDatabaseUrl } from './helpers/test-database.js';

const passwordMock = vi.hoisted(() => ({
  sequence: 0,
  passwords: new Map<string, string>(),
}));

vi.mock('argon2', () => ({
  default: {
    hash: vi.fn(async (password: string) => {
      const hash = `$argon2id$mock$${++passwordMock.sequence}`;
      passwordMock.passwords.set(hash, password);
      return hash;
    }),
    verify: vi.fn(async (hash: string, password: string) => {
      return passwordMock.passwords.get(hash) === password;
    }),
    argon2id: 2,
  },
}));

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
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

// Tests read OTPs and reset links from the in-memory provider, so nothing is
// ever exposed through the API. env.ts only accepts this provider under
// NODE_ENV=test, which is set above.
process.env.EMAIL_PROVIDER = 'memory';

// Same in-memory default for object storage, so upload tests never touch S3.
process.env.STORAGE_PROVIDER = 'memory';

// Live search is proxied to SearchApi. Tests stub `globalThis.fetch` per-file,
// so a key is provided here (never a real one) to keep the endpoints reachable.
// `||=` also replaces the empty-string value the root .env carries.
process.env.SEARCHAPI_API_KEY ||= 'test-searchapi-key';
process.env.SEARCHAPI_BASE_URL ||= 'https://www.searchapi.io/api/v1/search';

// System Global Masters bootstrap credentials. The System Admin logs in through
// the normal login endpoint with these test values.
process.env.SYSTEM_ADMIN_EMAIL ??= 'system.admin@interscale.test';
process.env.SYSTEM_ADMIN_PASSWORD ??= 'System@2026Bootstrap';
process.env.SYSTEM_ADMIN_RESET_PASSWORD ??= 'false';
