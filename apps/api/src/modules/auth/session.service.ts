import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Prisma, Session } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { generateSecureToken, hashToken } from '../../utils/crypto.js';

/**
 * Opaque, server-backed sessions.
 *
 * Why not JWT: logout and "revoke every session after a password reset" are
 * hard requirements. A JWT cannot be revoked before it expires without a
 * server-side blocklist — which is this table with extra steps and worse
 * ergonomics. A random token looked up by hash gives instant revocation.
 *
 * The raw token exists only in the client's httpOnly cookie. The database
 * stores SHA-256 of it, so a database leak cannot be replayed as a session.
 */

/** Only refresh `lastUsedAt` when it is this stale, to avoid a write per request. */
const LAST_USED_REFRESH_MS = 5 * 60_000;

export interface IssuedSession {
  /** Returned to the caller so it can be put in a cookie. Never persisted. */
  rawToken: string;
  csrfToken: string;
  expiresAt: Date;
  sessionId: string;
  rememberMe: boolean;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  rememberMe: boolean;
}

function computeExpiry(rememberMe: boolean): Date {
  const ms = rememberMe
    ? env.REMEMBER_ME_EXPIRY_DAYS * 24 * 60 * 60_000
    : env.SESSION_EXPIRY_HOURS * 60 * 60_000;
  return new Date(Date.now() + ms);
}

/**
 * Derive the CSRF token for a session.
 *
 * HMAC over the session's stored hash means the token needs no extra storage,
 * changes whenever the session changes, and is useless against any other
 * session. An attacker who cannot read our cookies cannot produce it.
 */
export function deriveCsrfToken(sessionTokenHash: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(sessionTokenHash).digest('hex');
}

/** Constant-time comparison of a submitted CSRF token against the expected one. */
export function csrfTokenMatches(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const sessionService = {
  /**
   * Mint a new session.
   *
   * A session is "restricted" purely by virtue of its user still being
   * PENDING_VERIFICATION — there is no session-level flag, so there is only one
   * source of truth about verification state. `requireVerifiedEmail` reads the
   * user, and the session is rotated the moment verification succeeds.
   */
  async issue(
    userId: string,
    options: {
      rememberMe?: boolean;
      ipAddress?: string | null;
      userAgent?: string | null;
      client?: Prisma.TransactionClient;
    } = {},
  ): Promise<IssuedSession> {
    const rememberMe = options.rememberMe ?? false;
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = computeExpiry(rememberMe);
    const db = options.client ?? prisma;

    const session = await db.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: options.ipAddress ?? null,
        userAgent: options.userAgent?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });

    return {
      rawToken,
      csrfToken: deriveCsrfToken(tokenHash),
      expiresAt,
      sessionId: session.id,
      rememberMe,
    };
  },

  /**
   * Resolve a raw cookie token to a live session.
   *
   * Returns null for missing, unknown, revoked or expired sessions — the
   * caller cannot tell which, so a probe learns nothing.
   */
  async resolve(rawToken: string): Promise<(Session & { csrfToken: string }) | null> {
    if (!rawToken) return null;

    const tokenHash = hashToken(rawToken);

    const session = await prisma.session.findUnique({ where: { tokenHash } });
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    return { ...session, csrfToken: deriveCsrfToken(tokenHash) };
  },

  /**
   * Refresh `lastUsedAt`, but only when it is already stale.
   *
   * Writing on every request would turn each authenticated read into a write
   * and add contention for no benefit.
   */
  async touch(session: Session): Promise<void> {
    if (Date.now() - session.lastUsedAt.getTime() < LAST_USED_REFRESH_MS) return;

    await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastUsedAt: new Date() },
    });
  },

  /** Revoke one session. Idempotent. */
  async revoke(sessionId: string, client?: Prisma.TransactionClient): Promise<void> {
    const db = client ?? prisma;
    await db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Revoke a session by its raw token. Used on logout. */
  async revokeByRawToken(rawToken: string): Promise<string | null> {
    const tokenHash = hashToken(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!session || session.revokedAt !== null) return null;

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return session.userId;
  },

  /**
   * Revoke every session for a user.
   *
   * Called after a password reset: whoever knew the old password — including
   * an attacker with a live session — is signed out.
   */
  async revokeAllForUser(
    userId: string,
    options: { exceptSessionId?: string; client?: Prisma.TransactionClient } = {},
  ): Promise<number> {
    const db = options.client ?? prisma;
    const result = await db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  async countActiveForUser(userId: string): Promise<number> {
    return prisma.session.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  },
};
