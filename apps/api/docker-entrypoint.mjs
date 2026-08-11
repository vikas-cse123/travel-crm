/* global console, process */

/**
 * Production entrypoint for the Interscale Travel CRM API container.
 *
 * RDS credentials are injected by ECS as individual secret fields
 * (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT). This wrapper constructs a
 * URL-encoded DATABASE_URL before spawning the actual command, so neither the
 * password nor the full connection string ever appears in the image, task
 * definition, or process list. The URL is only set on process.env for the
 * child process.
 */
import { spawn } from 'node:child_process';

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Database bootstrap: missing required environment variables: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const credentials =
  `${encodeURIComponent(process.env.DB_USER)}:` + `${encodeURIComponent(process.env.DB_PASSWORD)}`;
process.env.DATABASE_URL =
  `postgresql://${credentials}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` +
  '?connect_timeout=10';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Database bootstrap: no command supplied.');
  process.exit(1);
}

const child = spawn(command, args, { stdio: 'inherit', env: process.env });

let forwardedSignal = false;
const forward = (signal) => {
  if (!forwardedSignal) {
    forwardedSignal = true;
    child.kill(signal);
  }
};
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
child.on('error', (error) => {
  console.error('Database bootstrap: failed to start command:', error.message);
  process.exit(1);
});
