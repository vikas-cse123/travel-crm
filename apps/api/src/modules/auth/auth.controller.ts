import type { Request, Response } from 'express';
import type {
  LoginResponse,
  MeResponse,
  RegisterResponse,
  ResendOtpResponse,
  ResetTokenValidationResponse,
  VerifyEmailResponse,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { clearAuthCookies, setCsrfCookie, setSessionCookie } from '../../utils/cookies.js';
import { authService, type RequestContext } from './auth.service.js';
import type { IssuedSession } from './session.service.js';

/**
 * HTTP layer for authentication.
 *
 * Controllers only translate between HTTP and the service; all decisions live
 * in `auth.service.ts`. Session tokens are written to cookies here and never
 * placed in a response body.
 */

/** Client details recorded on sessions and activity rows. */
function requestContext(req: Request): RequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

/**
 * Apply an issued session to the response.
 *
 * The raw token goes into an httpOnly cookie the client cannot read; the CSRF
 * token goes into a readable cookie the client must echo back in a header.
 */
function applySession(res: Response, session: IssuedSession): void {
  setSessionCookie(res, session.rawToken, session.expiresAt);
  setCsrfCookie(res, session.csrfToken, session.expiresAt);
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(req.body, requestContext(req));

    applySession(res, result.session);

    const payload: RegisterResponse = {
      user: result.user,
      requiresEmailVerification: true,
      maskedEmail: result.maskedEmail,
    };

    sendSuccess(
      res,
      payload,
      'Your company account has been created. Check your email for a verification code.',
      201,
    );
  },

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const auth = req.auth;
    if (!auth) throw new UnauthorizedError('You must be signed in to do that.');

    // The user comes from the session, never from the request body.
    const result = await authService.verifyEmail(
      auth.userId,
      auth.sessionId,
      req.body.otp,
      requestContext(req),
    );

    applySession(res, result.session);

    const payload: VerifyEmailResponse = {
      user: result.user,
      session: {
        expiresAt: result.session.expiresAt.toISOString(),
        rememberMe: result.session.rememberMe,
      },
    };

    sendSuccess(res, payload, 'Your email address has been verified.');
  },

  async resendVerificationOtp(req: Request, res: Response): Promise<void> {
    const auth = req.auth;
    if (!auth) throw new UnauthorizedError('You must be signed in to do that.');

    const result = await authService.resendVerificationOtp(auth.userId, requestContext(req));

    const payload: ResendOtpResponse = {
      cooldownSeconds: result.cooldownSeconds,
      maskedEmail: result.maskedEmail,
    };

    sendSuccess(res, payload, 'A new verification code has been sent.');
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body, requestContext(req));

    applySession(res, result.session);

    const payload: LoginResponse = {
      user: result.user,
      session: {
        expiresAt: result.session.expiresAt.toISOString(),
        rememberMe: result.session.rememberMe,
      },
      requiresEmailVerification: result.requiresEmailVerification,
      ...(result.maskedEmail ? { maskedEmail: result.maskedEmail } : {}),
    };

    sendSuccess(
      res,
      payload,
      result.requiresEmailVerification
        ? 'Verify your email address to continue.'
        : 'Signed in successfully.',
    );
  },

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;

    await authService.logout(rawToken, requestContext(req));

    // Always clear, so a stale or already-invalid cookie does not linger.
    clearAuthCookies(res);

    // Succeeds regardless: signing out must never fail.
    sendSuccess(res, { signedOut: true }, 'You have been signed out.');
  },

  async me(req: Request, res: Response): Promise<void> {
    const auth = req.auth;
    if (!auth) throw new UnauthorizedError('You must be signed in to do that.');

    const user = await authService.getCurrentUser(auth.userId);

    const payload: MeResponse = {
      user,
      session: {
        expiresAt: auth.session.expiresAt.toISOString(),
        rememberMe: false,
      },
    };

    sendSuccess(res, payload);
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    await authService.forgotPassword(req.body.email, requestContext(req));

    // Identical response whether or not the account exists.
    sendSuccess(
      res,
      { requested: true },
      'If an account exists for this email, we have sent password-reset instructions.',
    );
  },

  async validateResetToken(req: Request, res: Response): Promise<void> {
    const token = req.params.token ?? '';
    const valid = await authService.validateResetToken(token);

    const payload: ResetTokenValidationResponse = { valid };
    sendSuccess(res, payload);
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword(req.body.token, req.body.password, requestContext(req));

    // Every session was revoked, so drop this client's cookies too.
    clearAuthCookies(res);

    sendSuccess(
      res,
      { reset: true },
      'Your password has been changed. Sign in with your new password.',
    );
  },

  /**
   * Proves the auth middleware chain works end to end.
   *
   * Not a CRM feature — it is the smallest possible endpoint that requires
   * both a session and a verified email, so the tests can assert the guards
   * without waiting for Phase 4.
   */
  protectedPing(req: Request, res: Response): void {
    const auth = req.auth;
    if (!auth) throw new UnauthorizedError('You must be signed in to do that.');

    sendSuccess(res, {
      pong: true,
      userId: auth.userId,
      // Echoed to prove it is derived from the session, not from request input.
      companyId: auth.companyId,
    });
  },
};
