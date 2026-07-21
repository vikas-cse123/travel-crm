/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export default defineConfig(({ mode }) => {
  // Env lives at the repo root, shared with the API and Docker Compose.
  const rootEnv = loadEnv(mode, repoRoot, ['VITE_']);
  const apiUrl = rootEnv.VITE_API_URL ?? 'http://localhost:4000';

  return {
    plugins: [react()],
    envDir: repoRoot,
    resolve: {
      alias: { '@': path.resolve(here, './src') },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Same-origin in dev keeps the session cookie first-party.
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
        // Public quotation links intentionally do not require a session, but
        // still need to reach the API instead of Vite's SPA fallback.
        '/public': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: { port: 5173 },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
