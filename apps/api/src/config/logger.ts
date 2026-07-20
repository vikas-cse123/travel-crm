import pino from 'pino';
import { env, isDevelopment, isTest } from './env.js';

/**
 * Paths scrubbed from every log record. Secrets must never reach a log sink,
 * including when an error object carries the originating request.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'confirmPassword',
  'passwordHash',
  'otp',
  'otpHash',
  'token',
  'tokenHash',
  '*.password',
  '*.passwordHash',
  '*.otp',
  '*.token',
];

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: { service: 'interscale-api' },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
