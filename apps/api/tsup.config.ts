import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entry points: the HTTP server and the scheduled reminder worker. Named
  // keys keep the output at `dist/server.js` and `dist/process-reminders.js`, so
  // the production container can run both with plain `node` — no tsx or source
  // tree required in the runtime image.
  entry: {
    server: 'src/server.ts',
    'process-reminders': 'src/scripts/process-reminders.ts',
  },
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
