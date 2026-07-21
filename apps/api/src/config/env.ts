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
const booleanWithDefault = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(fallback ? 'true' : 'false');

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

  /** Consecutive failures before an account is temporarily locked. */
  LOGIN_MAX_FAILED_ATTEMPTS: intWithDefault(5),
  LOGIN_LOCKOUT_MINUTES: intWithDefault(15),

  /** Name of the JS-readable cookie carrying the double-submit CSRF token. */
  CSRF_COOKIE_NAME: z.string().min(1).default('interscale_csrf'),
  /** Header the frontend echoes the CSRF token back in. */
  CSRF_HEADER_NAME: z.string().min(1).default('x-csrf-token'),

  /**
   * `memory` collects mail in-process for tests and is rejected outside them.
   * `console` prints to the log (development only).
   */
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'memory']).default('console'),
  EMAIL_FROM: z.string().min(1).default('Interscale Travel CRM <no-reply@interscale.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['s3', 'memory']).default('memory'),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().default('interscale-travel-crm-dev'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().url().optional().or(z.literal('')),
  AWS_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  AWS_S3_SERVER_SIDE_ENCRYPTION: z.enum(['AES256', 'aws:kms']).default('AES256'),
  AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS: intWithDefault(300),
  MAX_UPLOAD_SIZE_MB: intWithDefault(10),
  BOOKING_DOCUMENT_MAX_UPLOAD_SIZE_MB: intWithDefault(15),
  BOOKING_PRESIGNED_URL_EXPIRY_SECONDS: intWithDefault(300),
  PASSPORT_EXPIRY_WARNING_MONTHS: intWithDefault(6),
  CUSTOMER_DOCUMENT_MAX_UPLOAD_SIZE_MB: intWithDefault(10),
  CUSTOMER_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS: intWithDefault(300),
  VENDOR_DOCUMENT_MAX_UPLOAD_SIZE_MB: intWithDefault(15),
  VENDOR_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS: intWithDefault(300),
  VENDOR_CONTRACT_EXPIRY_WARNING_DAYS: intWithDefault(30),
  REMINDER_WORKER_BATCH_SIZE: intWithDefault(100),
  REMINDER_WORKER_TIMEZONE_FALLBACK: z.string().min(1).default('Asia/Kolkata'),
  REMINDER_ESCALATION_MANAGER_ROLE: z.string().min(1).default('Manager'),
  REMINDER_EMAIL_ENABLED: booleanWithDefault(true),
  REMINDER_DEFAULT_DUE_TIME: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('10:00'),
  REMINDER_PROCESSING_LOOKAHEAD_DAYS: intWithDefault(60),
  NOTIFICATION_RETENTION_DAYS: intWithDefault(180),
  DEFAULT_VENDOR_COUNTRY: z.string().trim().length(2).default('IN'),
  DEFAULT_PHONE_COUNTRY: z.string().trim().length(2).default('IN'),
  CUSTOMER_DUPLICATE_NAME_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.88),
  /** Base64-encoded 32-byte AES-256 key. Never exposed to the browser. */
  DATA_ENCRYPTION_KEY: z.string().optional(),
  DATA_ENCRYPTION_KEY_VERSION: z.string().min(1).max(30).default('v1'),

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
    if (value.EMAIL_PROVIDER !== 'smtp') {
      // `console` prints OTPs to the log; `memory` silently discards mail.
      // Either one in production is a security or delivery incident.
      console.error(
        `✖ EMAIL_PROVIDER="${value.EMAIL_PROVIDER}" is not permitted in production. Use "smtp".`,
      );
      process.exit(1);
    }
    if (value.SMTP_HOST === undefined || value.SMTP_HOST === '') {
      console.error('✖ SMTP_HOST is required when EMAIL_PROVIDER=smtp in production.');
      process.exit(1);
    }
    if (value.STORAGE_PROVIDER !== 's3' || !value.AWS_S3_BUCKET) {
      console.error('✖ Production requires STORAGE_PROVIDER=s3 and AWS_S3_BUCKET.');
      process.exit(1);
    }
    if (!value.DATA_ENCRYPTION_KEY) {
      console.error('✖ DATA_ENCRYPTION_KEY is required in production for passport protection.');
      process.exit(1);
    }
  }

  // The in-memory provider must never be reachable outside the test runner.
  if (value.EMAIL_PROVIDER === 'memory' && value.NODE_ENV !== 'test') {
    console.error('✖ EMAIL_PROVIDER=memory is only valid when NODE_ENV=test.');
    process.exit(1);
  }

  if (value.STORAGE_PROVIDER === 'memory' && value.NODE_ENV === 'production') {
    console.error('✖ STORAGE_PROVIDER=memory is not permitted in production.');
    process.exit(1);
  }

  if (value.DATA_ENCRYPTION_KEY) {
    const bytes = Buffer.from(value.DATA_ENCRYPTION_KEY, 'base64');
    if (bytes.length !== 32) {
      console.error('✖ DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
      process.exit(1);
    }
  }

  return value;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
