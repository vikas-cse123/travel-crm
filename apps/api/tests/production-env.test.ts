import { describe, expect, it } from 'vitest';
import { evaluateEnv } from '../src/config/env.js';

/**
 * Exercises the pure environment validator against fabricated configurations.
 * `evaluateEnv` never exits the process, so production rules can be asserted
 * without tearing down the test runner.
 */

const KEY = Buffer.alloc(32, 3).toString('base64');

const validProduction: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db:5432/app',
  SESSION_SECRET: 'a'.repeat(40),
  TOKEN_PEPPER: 'b'.repeat(40),
  WEB_URL: 'https://app.example.com',
  API_URL: 'https://api.example.com',
  EMAIL_PROVIDER: 'smtp',
  EMAIL_FROM: 'Interscale CRM <no-reply@example.com>',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'smtp-pass',
  STORAGE_PROVIDER: 's3',
  AWS_REGION: 'ap-south-1',
  AWS_S3_BUCKET: 'interscale-prod',
  DATA_ENCRYPTION_KEY: KEY,
  DATA_ENCRYPTION_KEY_VERSION: 'v1',
};

const errorsFor = (overrides: NodeJS.ProcessEnv): string =>
  evaluateEnv({ ...validProduction, ...overrides }).errors.join('\n');

describe('production environment validation', () => {
  it('accepts a complete, secure production configuration', () => {
    const result = evaluateEnv(validProduction);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a complete static AWS credential pair', () => {
    const result = evaluateEnv({
      ...validProduction,
      AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'secretexample',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-smtp email provider in production', () => {
    expect(errorsFor({ EMAIL_PROVIDER: 'console' })).toMatch(/EMAIL_PROVIDER/);
  });

  it('rejects the in-memory email provider outside the test runner', () => {
    const result = evaluateEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@db:5432/app',
      SESSION_SECRET: 'a'.repeat(40),
      TOKEN_PEPPER: 'b'.repeat(40),
      EMAIL_PROVIDER: 'memory',
    });
    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toMatch(/EMAIL_PROVIDER=memory/);
  });

  it('requires memory storage to be replaced by s3 in production', () => {
    expect(errorsFor({ STORAGE_PROVIDER: 'memory' })).toMatch(/STORAGE_PROVIDER=s3/);
  });

  it('requires the full SMTP credential set in production', () => {
    expect(errorsFor({ SMTP_HOST: undefined })).toMatch(/SMTP_HOST/);
    expect(errorsFor({ SMTP_PORT: undefined })).toMatch(/SMTP_PORT/);
    expect(errorsFor({ SMTP_USER: undefined })).toMatch(/SMTP_USER/);
    expect(errorsFor({ SMTP_PASSWORD: undefined })).toMatch(/SMTP_PASSWORD/);
  });

  it('rejects a ".local" placeholder EMAIL_FROM', () => {
    expect(errorsFor({ EMAIL_FROM: 'CRM <no-reply@interscale.local>' })).toMatch(/EMAIL_FROM/);
  });

  it('requires https for WEB_URL and API_URL', () => {
    expect(errorsFor({ WEB_URL: 'http://app.example.com' })).toMatch(/WEB_URL/);
    expect(errorsFor({ API_URL: 'http://api.example.com' })).toMatch(/API_URL/);
  });

  it('rejects a half-configured static AWS credential pair', () => {
    expect(errorsFor({ AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE' })).toMatch(/AWS_ACCESS_KEY_ID/);
    expect(errorsFor({ AWS_SECRET_ACCESS_KEY: 'secretexample' })).toMatch(/AWS_SECRET_ACCESS_KEY/);
  });

  it('requires a data encryption key and a valid 32-byte value', () => {
    expect(errorsFor({ DATA_ENCRYPTION_KEY: undefined })).toMatch(/DATA_ENCRYPTION_KEY/);
    expect(errorsFor({ DATA_ENCRYPTION_KEY: 'not-a-32-byte-key' })).toMatch(
      /DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key/,
    );
  });

  it('refuses production placeholders left in the secrets', () => {
    expect(errorsFor({ SESSION_SECRET: 'change_me_change_me_change_me_change_me' })).toMatch(
      /placeholder/,
    );
  });
});
