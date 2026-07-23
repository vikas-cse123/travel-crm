import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { normalizeEmail } from '../../utils/normalize.js';

/**
 * Data access for the authentication flows.
 *
 * These lookups are deliberately NOT tenant-scoped: at login, registration and
 * password reset there is no session yet, so there is no tenant to scope by.
 * `normalizedEmail` is globally unique, so each resolves to at most one
 * account, and the tenant is derived from the result.
 */

/** Everything the auth flows need, including fields never sent to a client. */
const AUTH_USER_SELECT = {
  id: true,
  companyId: true,
  roleId: true,
  username: true,
  fullName: true,
  email: true,
  normalizedEmail: true,
  phone: true,
  passwordHash: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  deletedAt: true,
  company: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      primaryColor: true,
      timezone: true,
      defaultCurrency: true,
      logoConfirmedAt: true,
    },
  },
  role: { select: { id: true, name: true, hierarchyLevel: true } },
} satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{ select: typeof AUTH_USER_SELECT }>;

export const authRepository = {
  /** Find an account by login address, including soft-deleted rows. */
  async findByEmail(email: string): Promise<AuthUser | null> {
    return prisma.user.findUnique({
      where: { normalizedEmail: normalizeEmail(email) },
      select: AUTH_USER_SELECT,
    });
  },

  async findById(userId: string): Promise<AuthUser | null> {
    return prisma.user.findUnique({ where: { id: userId }, select: AUTH_USER_SELECT });
  },

  /** True if any account already uses this address, in any company. */
  async emailExists(email: string): Promise<boolean> {
    const found = await prisma.user.findUnique({
      where: { normalizedEmail: normalizeEmail(email) },
      select: { id: true },
    });
    return found !== null;
  },

  /** Record a failed sign-in and lock the account once the threshold is hit. */
  async registerFailedLogin(
    userId: string,
    maxAttempts: number,
    lockoutMinutes: number,
  ): Promise<{ attempts: number; lockedUntil: Date | null }> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    if (user.failedLoginAttempts < maxAttempts) {
      return { attempts: user.failedLoginAttempts, lockedUntil: null };
    }

    // Threshold reached: lock, and reset the counter so the next lockout needs
    // another full run of failures rather than triggering on every attempt.
    const lockedUntil = new Date(Date.now() + lockoutMinutes * 60_000);
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil, failedLoginAttempts: 0 },
    });

    return { attempts: user.failedLoginAttempts, lockedUntil };
  },

  /** Clear brute-force state and stamp the successful sign-in. */
  async registerSuccessfulLogin(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  },

  // -------------------------------------------------------------------------
  // Email verification OTPs
  // -------------------------------------------------------------------------

  /**
   * Replace any pending OTP with a fresh one.
   *
   * Superseded unused OTPs are DELETED rather than flagged, so a row is only
   * ever pending or consumed — there is no third state to reason about, and an
   * old code can never be accepted. The audit trail lives in ActivityLog.
   */
  async replacePendingOtp(
    userId: string,
    otpHash: string,
    expiresAt: Date,
    maxAttempts: number,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = client ?? prisma;
    await db.emailVerificationOtp.deleteMany({ where: { userId, usedAt: null } });
    await db.emailVerificationOtp.create({
      data: { userId, otpHash, expiresAt, maxAttempts, lastSentAt: new Date() },
    });
  },

  /** The pending OTP for a user, if any. */
  async findPendingOtp(userId: string) {
    return prisma.emailVerificationOtp.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  async incrementOtpAttempts(otpId: string): Promise<number> {
    const otp = await prisma.emailVerificationOtp.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return otp.attempts;
  },

  async consumeOtp(otpId: string, client?: Prisma.TransactionClient): Promise<void> {
    const db = client ?? prisma;
    await db.emailVerificationOtp.update({ where: { id: otpId }, data: { usedAt: new Date() } });
  },

  /** Discard a pending OTP that has run out of attempts. */
  async deleteOtp(otpId: string): Promise<void> {
    await prisma.emailVerificationOtp.deleteMany({ where: { id: otpId } });
  },

  // -------------------------------------------------------------------------
  // Password reset tokens
  // -------------------------------------------------------------------------

  /** Invalidate outstanding reset tokens and issue one new token. */
  async replaceResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Requesting a new link must invalidate any earlier one.
      await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    });
  },

  /** Look up a reset token by its hash. The raw token is never stored. */
  async findResetTokenByHash(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            companyId: true,
            fullName: true,
            email: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
  },
};
