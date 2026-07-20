import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Creates and migrates the dedicated test database once per run.
    globalSetup: ['./tests/global-setup.ts'],
    // Redirects DATABASE_URL before the Prisma singleton is constructed.
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share one database; serialise them so truncation in
    // one file cannot race another file's fixtures.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
