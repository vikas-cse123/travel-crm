import { Router } from 'express';
import { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@interscale/shared';
import { asyncHandler } from '../../utils/async-handler.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { optionalAuth, requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import {
  forgotPasswordLimiter,
  loginLimiter,
  otpResendLimiter,
  otpVerifyLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from '../../middleware/rate-limiters.js';
import { authController } from './auth.controller.js';

const router = Router();

/**
 * Authentication routes.
 *
 * Middleware order is significant: rate limit → validate → authenticate →
 * verified-email. CSRF runs earlier, app-wide, in `app.ts`.
 *
 * The four endpoints reachable by a PENDING_VERIFICATION user are exactly:
 * GET /me, POST /verify-email, POST /resend-verification-otp, POST /logout.
 * Everything else in the application sits behind `requireVerifiedEmail`.
 */

// --- Public ----------------------------------------------------------------

router.post(
  '/register',
  registerLimiter,
  validateRequest({ body: registerSchema }),
  asyncHandler(authController.register),
);

router.post(
  '/login',
  loginLimiter,
  validateRequest({ body: loginSchema }),
  asyncHandler(authController.login),
);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);

router.get(
  '/reset-password/:token/validate',
  resetPasswordLimiter,
  validateRequest({ params: z.object({ token: z.string().min(1) }) }),
  asyncHandler(authController.validateResetToken),
);

router.post(
  '/reset-password',
  resetPasswordLimiter,
  validateRequest({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);

// --- Authenticated, verification not yet required --------------------------

router.get('/me', requireAuth, asyncHandler(authController.me));

router.post(
  '/verify-email',
  otpVerifyLimiter,
  requireAuth,
  validateRequest({ body: verifyEmailSchema }),
  asyncHandler(authController.verifyEmail),
);

router.post(
  '/resend-verification-otp',
  otpResendLimiter,
  requireAuth,
  asyncHandler(authController.resendVerificationOtp),
);

// Logout uses optionalAuth so it succeeds even with an expired or revoked
// session — signing out must never fail.
router.post('/logout', optionalAuth, asyncHandler(authController.logout));

// --- Authenticated AND verified -------------------------------------------

/** Smallest endpoint that exercises the full guard chain. Not a CRM feature. */
router.get(
  '/protected-ping',
  requireAuth,
  requireVerifiedEmail,
  asyncHandler(async (req, res) => {
    authController.protectedPing(req, res);
  }),
);

export { router as authRoutes };
