import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Test-database plumbing.
 *
 * Tests run against a SEPARATE database (`interscale_crm_test` by default), so
 * a truncating test can never wipe the development data a developer is using.
 * The guard in `assertIsTestDatabase` makes that structural rather than a
 * convention someone can forget.
 */

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Derive the test URL from DATABASE_URL by suffixing the database name. */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'Neither TEST_DATABASE_URL nor DATABASE_URL is set. Copy .env.example to .env at the repository root.',
    );
  }

  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`.replace(/^/, '/');
  return url.toString();
}

/**
 * Refuse to operate on anything that is not clearly a test database.
 *
 * This is the last line of defence before destructive test setup runs.
 */
export function assertIsTestDatabase(databaseUrl: string): void {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${name}": the test database name must end with "_test". ` +
        'Set TEST_DATABASE_URL to a dedicated database.',
    );
  }
}

/** Create the test database if it does not exist yet. */
export async function ensureTestDatabaseExists(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');

  // Connect to the maintenance database; CREATE DATABASE cannot run from
  // inside the database being created.
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });

  try {
    const existing = await admin.$queryRaw<Array<{ datname: string }>>`
      SELECT datname FROM pg_database WHERE datname = ${databaseName}
    `;

    if (existing.length === 0) {
      // Identifier cannot be parameterised; it is validated by the _test guard
      // and comes from our own env, never from user input.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    }
  } catch (error) {
    throw new Error(
      `Could not reach PostgreSQL to prepare the test database. Is it running? Try: npm run db:up\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await admin.$disconnect();
  }
}

/** Apply the migration history to the test database. */
export function migrateTestDatabase(databaseUrl: string): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

/** A client bound to the test database. */
export function createTestPrismaClient(databaseUrl = resolveTestDatabaseUrl()): PrismaClient {
  assertIsTestDatabase(databaseUrl);
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

/**
 * Empty every domain table.
 *
 * TRUNCATE ... CASCADE resets the whole graph in one statement, so tests do
 * not have to delete in dependency order.
 */
export async function truncateAll(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      activity_logs,
      password_reset_tokens,
      email_verification_otps,
      sessions,
      permission_template_permissions,
      permission_templates,
      role_permissions,
      permissions,
      users,
      roles,
      companies
    RESTART IDENTITY CASCADE
  `);
}
