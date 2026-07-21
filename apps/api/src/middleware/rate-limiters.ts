import rateLimit, { type Options } from 'express-rate-limit';
import { ERROR_CODES } from '@interscale/shared';
import { env, isProduction, isTest } from '../config/env.js';
import { getRequestId } from './request-id.js';

/**
 * Rate limiters emit the same failure envelope as everything else, so the
 * client can handle a 429 without a special case.
 */
function buildLimiter(options: Pick<Partial<Options>, 'windowMs' | 'limit' | 'message'>) {
  return rateLimit({
    windowMs: options.windowMs ?? env.RATE_LIMIT_WINDOW_MINUTES * 60_000,
    limit: options.limit ?? env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Counting during tests makes suites order-dependent and flaky.
    skip: () => isTest,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many requests. Please try again shortly.',
          requestId: getRequestId(req),
        },
      });
    },
  });
}

/** Baseline limiter applied to the whole API surface. */
export const globalLimiter = buildLimiter({});

/** General-purpose limiter for credential endpoints. */
export const authLimiter = buildLimiter({ windowMs: 15 * 60_000, limit: 20 });

/**
 * Per-endpoint limiters.
 *
 * Each auth endpoint gets its own budget so exhausting one cannot lock a user
 * out of the others — hammering login must not also block password reset.
 * Development gets roomier limits so an afternoon of manual testing does not
 * trip them; production values are the tight ones.
 *
 * All of these are disabled when NODE_ENV=test (see `skip` above), because
 * shared limiter state makes suites order-dependent and flaky.
 */
const devMultiplier = isProduction ? 1 : 10;

/** Registration: expensive (Argon2 + a large transaction) and rarely repeated. */
export const registerLimiter = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 5 * devMultiplier,
});

/** Login: the primary credential-stuffing target. Account lockout backs this up. */
export const loginLimiter = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 10 * devMultiplier,
});

/** OTP verification: bounds guessing from one network location. */
export const otpVerifyLimiter = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 10 * devMultiplier,
});

/** OTP resend: the per-user cooldown is the main control; this bounds the IP. */
export const otpResendLimiter = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 10 * devMultiplier,
});

/** Forgot password: limits using the endpoint as a mail cannon. */
export const forgotPasswordLimiter = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 5 * devMultiplier,
});

/** Reset password: bounds brute-forcing a reset token. */
export const resetPasswordLimiter = buildLimiter({
  windowMs: 60 * 60_000,
  limit: 10 * devMultiplier,
});

/** Public quotation tokens carry customer data and state-changing actions. */
export const publicQuotationLimiter = buildLimiter({
  windowMs: 15 * 60_000,
  limit: 60 * devMultiplier,
});
