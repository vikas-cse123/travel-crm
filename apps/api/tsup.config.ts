import { defineConfig } from 'tsup';

export default defineConfig({
  // Named entries keep the output at `dist/server.js` and
  // `dist/process-reminders.js`, so the production container can run both with
  // plain `node`. The System Global Masters bootstrap is a one-off ECS task.
  entry: {
    server: 'src/server.ts',
    'process-reminders': 'src/scripts/process-reminders.ts',
    'bootstrap-system-masters': 'src/scripts/bootstrap-system-masters.ts',
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
