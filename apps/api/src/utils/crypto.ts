import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { OTP_LENGTH } from '@interscale/shared';

/**
 * Password hashing and token digests.
 *
 * Two different primitives, deliberately:
 *  - Passwords use Argon2id, which is *slow* on purpose so an offline attacker
 *    cannot brute-force a stolen digest.
 *  - Session, OTP and reset tokens use SHA-256, which is fast. That is safe
 *    only because those values are high-entropy random strings we generated,
 *    so there is no dictionary to search. Never hash a password this way.
 */

/** OWASP-recommended baseline for Argon2id. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verify a password. Returns false rather than throwing on a malformed digest,
 * so a corrupt row cannot be distinguished from a wrong password.
 */
export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/** Hash a high-entropy token for storage. Only the digest is persisted. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** A URL-safe, cryptographically random token for sessions and reset links. */
export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/** A zero-padded numeric OTP from a cryptographically secure source. */
export function generateNumericOtp(length: number = OTP_LENGTH): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

/** Constant-time comparison, for digests that must not leak via timing. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
