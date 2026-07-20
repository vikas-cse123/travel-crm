import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Locate the monorepo `.env`, which is shared by the API, the web app and
 * Docker Compose.
 *
 * The depth from this module to the repo root differs between `src/` (run by
 * tsx) and the bundled `dist/`, so we walk upward from both the module
 * directory and the working directory rather than hard-coding a depth.
 */
function findEnvFile(): string | undefined {
  const startDirs = [path.dirname(fileURLToPath(import.meta.url)), process.cwd()];

  for (const start of startDirs) {
    let dir = start;
    // Stop at the filesystem root, where dirname becomes a fixed point.
    while (true) {
      const candidate = path.join(dir, '.env');
      if (existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

// Real environment variables always win; dotenv never overrides what is set.
const envFile = findEnvFile();
if (envFile) {
  dotenv.config({ path: envFile });
}

/** Coerce a decimal string to a positive integer, with a default. */
const intWithDefault = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_PORT: intWithDefault(4000),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  SESSION_COOKIE_NAME: z.string().min(1).default('interscale_sid'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  TOKEN_PEPPER: z.string().min(32, 'TOKEN_PEPPER must be at least 32 characters'),
  SESSION_EXPIRY_HOURS: intWithDefault(12),
  REMEMBER_ME_EXPIRY_DAYS: intWithDefault(30),

  OTP_EXPIRY_MINUTES: intWithDefault(10),
  OTP_RESEND_COOLDOWN_SECONDS: intWithDefault(60),
  OTP_MAX_ATTEMPTS: intWithDefault(5),

  PASSWORD_RESET_EXPIRY_MINUTES: intWithDefault(30),

  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().min(1).default('Interscale Travel CRM <no-reply@interscale.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  RATE_LIMIT_WINDOW_MINUTES: intWithDefault(15),
  RATE_LIMIT_MAX_REQUESTS: intWithDefault(300),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate process.env. On failure, print every problem at once and
 * exit — a half-configured server is worse than one that refuses to start.
 */
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    console.error(
      [
        '',
        '✖ Invalid environment configuration. The API cannot start.',
        '',
        issues,
        '',
        '  Fix: copy .env.example to .env at the repository root and fill in the values.',
        '    cp .env.example .env',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const value = parsed.data;

  // Production-only hardening: refuse to boot with the shipped placeholders.
  if (value.NODE_ENV === 'production') {
    if (value.SESSION_SECRET.includes('change_me') || value.TOKEN_PEPPER.includes('change_me')) {
      console.error(
        '✖ SESSION_SECRET / TOKEN_PEPPER still contain the example placeholder. Refusing to start in production.',
      );
      process.exit(1);
    }
    if (value.EMAIL_PROVIDER === 'console') {
      console.error('✖ EMAIL_PROVIDER=console is not permitted in production.');
      process.exit(1);
    }
  }

  return value;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
