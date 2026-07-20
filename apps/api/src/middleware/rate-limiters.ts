import rateLimit, { type Options } from 'express-rate-limit';
import { ERROR_CODES } from '@interscale/shared';
import { env, isTest } from '../config/env.js';
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

/**
 * Tight limiter reserved for credential and OTP endpoints in Phase 3.
 * Defined now so auth routes cannot ship without one.
 */
export const authLimiter = buildLimiter({ windowMs: 15 * 60_000, limit: 20 });
