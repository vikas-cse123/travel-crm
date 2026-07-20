import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Bundle the workspace package so `node dist/server.js` runs without
  // relying on workspace symlink resolution at runtime.
  noExternal: ['@interscale/shared'],
});
