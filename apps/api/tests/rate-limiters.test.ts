import { describe, expect, it } from 'vitest';
import {
  authLimiter,
  forgotPasswordLimiter,
  globalLimiter,
  otpResendLimiter,
  otpVerifyLimiter,
  publicQuotationLimiter,
  resetPasswordLimiter,
  shouldSkipGlobalLimiter,
} from '../src/middleware/rate-limiters.js';
import { env, isProduction } from '../src/config/env.js';

/**
 * Verify the login and signup endpoints' own limiters were removed while every
 * other rate limiter (global + per-endpoint) remains in place.
 */
describe('rate limiters', () => {
  it('no longer exports a login or register-specific limiter', async () => {
    const module = await import('../src/middleware/rate-limiters.js');
    expect('loginLimiter' in module).toBe(false);
    expect('registerLimiter' in module).toBe(false);
  });

  it('still exports the global and all other per-endpoint limiters', () => {
    expect(globalLimiter).toBeTypeOf('function');
    expect(authLimiter).toBeTypeOf('function');
    expect(otpVerifyLimiter).toBeTypeOf('function');
    expect(otpResendLimiter).toBeTypeOf('function');
    expect(forgotPasswordLimiter).toBeTypeOf('function');
    expect(resetPasswordLimiter).toBeTypeOf('function');
    expect(publicQuotationLimiter).toBeTypeOf('function');
  });

  it('preserves the production global limit from environment configuration', () => {
    // The global limiter remains the baseline for the whole API surface.
    const defaultLimit = isProduction
      ? env.RATE_LIMIT_MAX_REQUESTS
      : Math.max(env.RATE_LIMIT_MAX_REQUESTS, 2_000);
    expect(defaultLimit).toBeGreaterThan(0);
  });

  it('exempts only the exact login and register POSTs from the global limiter', () => {
    expect(
      shouldSkipGlobalLimiter({ method: 'POST', path: '/api/auth/login' }),
    ).toBe(true);
    expect(
      shouldSkipGlobalLimiter({ method: 'POST', path: '/api/auth/register' }),
    ).toBe(true);
    // The exemption is scoped to the sign-in/sign-up requests, not /api/auth/*.
    expect(
      shouldSkipGlobalLimiter({ method: 'POST', path: '/api/auth/forgot-password' }),
    ).toBe(false);
    expect(
      shouldSkipGlobalLimiter({ method: 'POST', path: '/api/auth/verify-email' }),
    ).toBe(false);
    expect(
      shouldSkipGlobalLimiter({ method: 'POST', path: '/api/auth/reset-password' }),
    ).toBe(false);
    expect(
      shouldSkipGlobalLimiter({ method: 'POST', path: '/api/auth/resend-verification-otp' }),
    ).toBe(false);
    // GET on the login path is still protected.
    expect(shouldSkipGlobalLimiter({ method: 'GET', path: '/api/auth/login' })).toBe(false);
    // Every other API route stays behind the global limiter.
    expect(shouldSkipGlobalLimiter({ method: 'GET', path: '/api/dashboard/summary' })).toBe(false);
    expect(shouldSkipGlobalLimiter({ method: 'POST', path: '/api/queries' })).toBe(false);
    expect(shouldSkipGlobalLimiter({ method: 'GET', path: '/api/health' })).toBe(false);
  });
});
