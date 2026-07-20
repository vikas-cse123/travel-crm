import {
  ACTIVITY_ACTION,
  ENTITY_TYPE,
  ROLE_NAME,
  maskEmail,
  type AuthenticatedUser,
  type LoginInput,
  type RegisterInput,
} from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/errors.js';
import {
  generateNumericOtp,
  generateSecureToken,
  hashPassword,
  hashToken,
  safeCompare,
  verifyPassword,
} from '../../utils/crypto.js';
import { normalizeEmail, generateUniqueSlug } from '../../utils/normalize.js';
import { createTenantContext } from '../../db/tenant.js';
import { activityLogsRepository } from '../activity-logs/activity-logs.repository.js';
import {
  ensurePermissionCatalog,
  provisionCompanyDefaults,
} from '../companies/company-provisioning.service.js';
import { emailService, sendEmailSafely } from '../../services/email/email.service.js';
import { authRepository, type AuthUser } from './auth.repository.js';
import { permissionsService } from './permissions.service.js';
import { sessionService, type IssuedSession } from './session.service.js';

/**
 * The authentication flows.
 *
 * Two rules run through everything here:
 *  1. Responses never distinguish "no such account" from "wrong password" or
 *     "not eligible". Anything that would let an attacker enumerate accounts
 *     is collapsed into one generic outcome.
 *  2. Secrets are hashed before they touch the database, and the raw values
 *     never appear in a response, an activity log or a production log line.
 */

/** Client context recorded on sessions and activity rows. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

/** Shape the safe user object returned by every auth endpoint. */
async function toAuthenticatedUser(user: AuthUser): Promise<AuthenticatedUser> {
  const permissions = await permissionsService.resolveForUser(user.id);

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    mustChangePassword: user.mustChangePassword,
    company: { id: user.company.id, name: user.company.name, slug: user.company.slug },
    role: { id: user.role.id, name: user.role.name, hierarchyLevel: user.role.hierarchyLevel },
    permissions,
  };
}

/** Issue a fresh OTP and deliver it. Returns nothing — the code never escapes. */
async function issueAndSendOtp(
  user: { id: string; fullName: string; email: string; companyId: string },
  companyName: string,
  context: RequestContext,
): Promise<void> {
  const otp = generateNumericOtp();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);

  await authRepository.replacePendingOtp(user.id, hashToken(otp), expiresAt, env.OTP_MAX_ATTEMPTS);

  await activityLogsRepository.record(createTenantContext(user.companyId), {
    actorUserId: user.id,
    targetUserId: user.id,
    action: ACTIVITY_ACTION.EMAIL_OTP_SENT,
    entityType: ENTITY_TYPE.USER,
    entityId: user.id,
    // Never the code itself.
    metadata: { expiresAt: expiresAt.toISOString() },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  // Delivery failure must not fail the caller: the user can resend.
  await sendEmailSafely(
    () =>
      emailService.sendVerificationOtp({
        to: user.email,
        fullName: user.fullName,
        companyName,
        otp,
        expiryMinutes: env.OTP_EXPIRY_MINUTES,
      }),
    { action: 'verification-otp', to: user.email },
  );
}

export const authService = {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a company and its Owner.
   *
   * Ordering is deliberate:
   *  - Argon2 hashing and catalogue setup happen BEFORE the transaction, so
   *    slow work does not hold database locks.
   *  - Company, roles, grants, templates, owner, OTP and activity rows commit
   *    atomically — a half-provisioned company is never observable.
   *  - The email is sent AFTER commit, because an unreachable SMTP host must
   *    not roll back a successful registration.
   */
  async register(input: RegisterInput, context: RequestContext) {
    const normalizedEmail = normalizeEmail(input.email);

    // Advisory pre-check for a friendly field error. The unique constraint is
    // the real guarantee, and the catch below handles the race.
    if (await authRepository.emailExists(normalizedEmail)) {
      throw new ConflictError('An account with this email already exists.');
    }

    const passwordHash = await hashPassword(input.password);
    await ensurePermissionCatalog();

    const slug = await generateUniqueSlug(input.companyName, async (candidate) => {
      const existing = await prisma.company.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return existing !== null;
    });

    let ownerUserId: string;
    let companyId: string;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const company = await tx.company.create({
            data: {
              name: input.companyName,
              slug,
              email: normalizedEmail,
              phone: input.phone,
              status: 'ACTIVE',
            },
          });

          // Same provisioning the seed uses, so a registered tenant and the
          // demo tenant have identical role and permission structures.
          const { ownerRoleId } = await provisionCompanyDefaults(tx, company.id);

          const owner = await tx.user.create({
            data: {
              companyId: company.id,
              roleId: ownerRoleId,
              // Local part of the address, which is unique within a brand-new
              // company by construction.
              username: normalizedEmail.split('@')[0]?.slice(0, 40) ?? 'owner',
              fullName: input.fullName,
              email: input.email,
              normalizedEmail,
              phone: input.phone,
              passwordHash,
              // Explicit: no CRM access until the OTP is verified.
              status: 'PENDING_VERIFICATION',
              emailVerifiedAt: null,
            },
          });

          await tx.activityLog.create({
            data: {
              companyId: company.id,
              actorUserId: owner.id,
              action: ACTIVITY_ACTION.COMPANY_REGISTERED,
              entityType: ENTITY_TYPE.COMPANY,
              entityId: company.id,
              metadata: { companyName: company.name, slug: company.slug },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return { companyId: company.id, ownerId: owner.id };
        },
        // Provisioning writes ~90 rows; the 5s default is too tight.
        { timeout: 20_000, maxWait: 10_000 },
      );

      companyId = result.companyId;
      ownerUserId = result.ownerId;
    } catch (error) {
      // The unique index is the authority; a concurrent registration lands here.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictError('An account with this email already exists.');
      }
      throw error;
    }

    const owner = await authRepository.findById(ownerUserId);
    if (!owner) throw new Error('Registration completed but the owner could not be loaded.');

    // Outside the transaction: OTP issuance plus delivery.
    await issueAndSendOtp(
      { id: owner.id, fullName: owner.fullName, email: owner.email, companyId },
      owner.company.name,
      context,
    );

    const session = await sessionService.issue(owner.id, {
      rememberMe: false,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      user: await toAuthenticatedUser(owner),
      session,
      maskedEmail: maskEmail(owner.email),
    };
  },

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  /**
   * Verify the OTP for the user identified by the CURRENT SESSION.
   *
   * The user is taken from the session, never from the request body — an
   * attacker cannot submit someone else's email and verify their account.
   */
  async verifyEmail(userId: string, sessionId: string, otp: string, context: RequestContext) {
    const user = await authRepository.findById(userId);
    if (!user) throw new UnauthorizedError('You must be signed in to do that.');

    if (user.emailVerifiedAt !== null) {
      throw new ValidationError('This email address is already verified.');
    }

    const pending = await authRepository.findPendingOtp(userId);
    if (!pending) {
      throw new ValidationError('That code is no longer valid. Request a new one.');
    }

    if (pending.expiresAt.getTime() <= Date.now()) {
      await authRepository.deleteOtp(pending.id);
      throw new ValidationError('That code has expired. Request a new one.');
    }

    if (pending.attempts >= pending.maxAttempts) {
      await authRepository.deleteOtp(pending.id);
      throw new ValidationError('Too many incorrect attempts. Request a new code.');
    }

    // Constant-time compare of the digests, so response timing does not leak
    // how much of the code was correct.
    if (!safeCompare(hashToken(otp), pending.otpHash)) {
      const attempts = await authRepository.incrementOtpAttempts(pending.id);
      const remaining = Math.max(0, pending.maxAttempts - attempts);

      if (remaining === 0) {
        await authRepository.deleteOtp(pending.id);
        throw new ValidationError('Too many incorrect attempts. Request a new code.');
      }

      throw new ValidationError(
        `That code is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    const verifiedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await authRepository.consumeOtp(pending.id, tx);

      await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: verifiedAt, status: 'ACTIVE' },
      });

      // Rotate rather than upgrade: the pre-verification session is revoked and
      // a fresh one issued, which also defeats session fixation.
      await sessionService.revoke(sessionId, tx);

      await tx.activityLog.create({
        data: {
          companyId: user.companyId,
          actorUserId: userId,
          targetUserId: userId,
          action: ACTIVITY_ACTION.EMAIL_VERIFIED,
          entityType: ENTITY_TYPE.USER,
          entityId: userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    const session = await sessionService.issue(userId, {
      rememberMe: false,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const refreshed = await authRepository.findById(userId);
    if (!refreshed) throw new Error('User vanished during verification.');

    return { user: await toAuthenticatedUser(refreshed), session };
  },

  /** Issue a replacement OTP, subject to the per-user cooldown. */
  async resendVerificationOtp(userId: string, context: RequestContext) {
    const user = await authRepository.findById(userId);
    if (!user) throw new UnauthorizedError('You must be signed in to do that.');

    if (user.emailVerifiedAt !== null) {
      throw new ValidationError('This email address is already verified.');
    }

    const pending = await authRepository.findPendingOtp(userId);
    if (pending) {
      const elapsedSeconds = (Date.now() - pending.lastSentAt.getTime()) / 1000;
      const remaining = Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      if (remaining > 0) {
        throw new ValidationError(
          `Please wait ${remaining} second${remaining === 1 ? '' : 's'} before requesting another code.`,
        );
      }
    }

    await issueAndSendOtp(
      { id: user.id, fullName: user.fullName, email: user.email, companyId: user.companyId },
      user.company.name,
      context,
    );

    return {
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      maskedEmail: maskEmail(user.email),
    };
  },

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  /**
   * Authenticate a user.
   *
   * Every failure path returns the same message and status, so the response
   * cannot be used to discover which addresses are registered.
   */
  async login(input: LoginInput, context: RequestContext) {
    const user = await authRepository.findByEmail(input.email);

    if (!user) {
      // Spend comparable time to a real verification so the absence of an
      // account is not detectable by response timing.
      await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
        input.password,
      );
      throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
    }

    const recordFailure = async (reason: string): Promise<void> => {
      await activityLogsRepository.record(createTenantContext(user.companyId), {
        actorUserId: user.id,
        targetUserId: user.id,
        action: ACTIVITY_ACTION.LOGIN_FAILED,
        entityType: ENTITY_TYPE.SESSION,
        // A coarse reason only. No password, no submitted value.
        metadata: { reason },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    };

    if (user.deletedAt !== null || user.status === 'ARCHIVED') {
      await recordFailure('account_archived');
      throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await recordFailure('account_locked');
      throw new UnauthorizedError(
        'This account is temporarily locked after too many failed attempts. Try again later.',
      );
    }

    const passwordValid = await verifyPassword(user.passwordHash, input.password);

    if (!passwordValid) {
      const { lockedUntil } = await authRepository.registerFailedLogin(
        user.id,
        env.LOGIN_MAX_FAILED_ATTEMPTS,
        env.LOGIN_LOCKOUT_MINUTES,
      );
      await recordFailure(lockedUntil ? 'invalid_password_locked' : 'invalid_password');

      if (lockedUntil) {
        throw new UnauthorizedError(
          'This account is temporarily locked after too many failed attempts. Try again later.',
        );
      }
      throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
    }

    // Password is correct from here on, so specific messages no longer leak
    // anything an attacker did not already know.
    if (user.company.status !== 'ACTIVE') {
      await recordFailure('company_inactive');
      throw new ForbiddenError('This company account is not currently active.');
    }

    if (user.status === 'SUSPENDED') {
      await recordFailure('account_suspended');
      throw new ForbiddenError('This account has been suspended. Contact your administrator.');
    }

    if (user.status === 'INACTIVE') {
      await recordFailure('account_inactive');
      throw new ForbiddenError('This account is inactive. Contact your administrator.');
    }

    await authRepository.registerSuccessfulLogin(user.id);

    const session = await sessionService.issue(user.id, {
      rememberMe: input.rememberMe ?? false,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    // A pending-verification user gets a session, but it is restricted: every
    // CRM route sits behind requireVerifiedEmail.
    const requiresEmailVerification = user.status === 'PENDING_VERIFICATION';

    if (requiresEmailVerification) {
      // Re-issue a code so the verification screen is immediately usable,
      // unless one was sent within the cooldown window.
      const pending = await authRepository.findPendingOtp(user.id);
      const withinCooldown =
        pending !== null &&
        (Date.now() - pending.lastSentAt.getTime()) / 1000 < env.OTP_RESEND_COOLDOWN_SECONDS;

      if (!withinCooldown) {
        await issueAndSendOtp(
          { id: user.id, fullName: user.fullName, email: user.email, companyId: user.companyId },
          user.company.name,
          context,
        );
      }
    } else {
      await activityLogsRepository.record(createTenantContext(user.companyId), {
        actorUserId: user.id,
        action: ACTIVITY_ACTION.LOGIN_SUCCESS,
        entityType: ENTITY_TYPE.SESSION,
        metadata: { rememberMe: input.rememberMe ?? false },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    const refreshed = await authRepository.findById(user.id);
    if (!refreshed) throw new Error('User vanished during login.');

    return {
      user: await toAuthenticatedUser(refreshed),
      session,
      requiresEmailVerification,
      ...(requiresEmailVerification ? { maskedEmail: maskEmail(user.email) } : {}),
    };
  },

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  /** Revoke the current session. Succeeds even if it was already invalid. */
  async logout(rawToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawToken) return;

    const userId = await sessionService.revokeByRawToken(rawToken);
    if (!userId) return;

    const user = await authRepository.findById(userId);
    if (!user) return;

    await activityLogsRepository.record(createTenantContext(user.companyId), {
      actorUserId: user.id,
      action: ACTIVITY_ACTION.LOGOUT,
      entityType: ENTITY_TYPE.SESSION,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  },

  // -------------------------------------------------------------------------
  // Current user
  // -------------------------------------------------------------------------

  async getCurrentUser(userId: string): Promise<AuthenticatedUser> {
    const user = await authRepository.findById(userId);
    if (!user) throw new UnauthorizedError('You must be signed in to do that.');
    return toAuthenticatedUser(user);
  },

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  /**
   * Begin a password reset.
   *
   * Returns void in every case. The caller always responds with the same
   * message, so the endpoint cannot be used to test whether an address exists.
   *
   * POLICY for non-active accounts: archived, suspended and inactive users are
   * silently skipped — no email, no token — because a reset would not let them
   * sign in anyway. The requester is told nothing either way.
   */
  async forgotPassword(email: string, context: RequestContext): Promise<void> {
    const user = await authRepository.findByEmail(email);

    if (!user || user.deletedAt !== null || user.status !== 'ACTIVE') {
      logger.debug({ eligible: false }, 'Password reset requested for an ineligible account');
      return;
    }

    const rawToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRY_MINUTES * 60_000);

    await authRepository.replaceResetToken(user.id, hashToken(rawToken), expiresAt);

    await activityLogsRepository.record(createTenantContext(user.companyId), {
      actorUserId: user.id,
      targetUserId: user.id,
      action: ACTIVITY_ACTION.PASSWORD_RESET_REQUESTED,
      entityType: ENTITY_TYPE.USER,
      entityId: user.id,
      // Never the token.
      metadata: { expiresAt: expiresAt.toISOString() },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const resetUrl = `${env.WEB_URL}/reset-password/${rawToken}`;

    await sendEmailSafely(
      () =>
        emailService.sendPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl,
          expiryMinutes: env.PASSWORD_RESET_EXPIRY_MINUTES,
        }),
      { action: 'password-reset', to: user.email },
    );
  },

  /** Whether a reset token is currently usable, for the frontend's link check. */
  async validateResetToken(rawToken: string): Promise<boolean> {
    const record = await authRepository.findResetTokenByHash(hashToken(rawToken));
    if (!record) return false;
    if (record.usedAt !== null) return false;
    if (record.expiresAt.getTime() <= Date.now()) return false;
    if (record.user.deletedAt !== null || record.user.status !== 'ACTIVE') return false;
    return true;
  },

  /**
   * Complete a password reset.
   *
   * The password change, token consumption, sibling-token invalidation,
   * session revocation and lockout reset all commit together — a partial
   * apply here would be a security hole (e.g. new password saved but old
   * sessions still live).
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    const record = await authRepository.findResetTokenByHash(hashToken(rawToken));

    const invalid = new NotFoundError('This password reset link is invalid or has expired.');

    if (!record) throw invalid;
    if (record.usedAt !== null) throw invalid;
    if (record.expiresAt.getTime() <= Date.now()) throw invalid;
    if (record.user.deletedAt !== null || record.user.status !== 'ACTIVE') throw invalid;

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.user.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          // Clear brute-force state: the legitimate owner just proved control
          // of the mailbox, so a prior lockout should not persist.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } });

      // Any other outstanding link is now void.
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.user.id, usedAt: null, id: { not: record.id } },
      });

      // Everyone holding a session — including an attacker — is signed out.
      await sessionService.revokeAllForUser(record.user.id, { client: tx });

      await tx.activityLog.create({
        data: {
          companyId: record.user.companyId,
          actorUserId: record.user.id,
          targetUserId: record.user.id,
          action: ACTIVITY_ACTION.PASSWORD_RESET_COMPLETED,
          entityType: ENTITY_TYPE.USER,
          entityId: record.user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    // Courtesy notification, outside the transaction.
    await sendEmailSafely(
      () =>
        emailService.sendPasswordChangedNotification({
          to: record.user.email,
          fullName: record.user.fullName,
        }),
      { action: 'password-changed', to: record.user.email },
    );
  },
};

/** Re-exported for the controller's response shaping. */
export { toAuthenticatedUser, ROLE_NAME };
export type { IssuedSession };
