import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomInt,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import argon2 from 'argon2';
import { OTP_LENGTH } from '@interscale/shared';
import { env } from '../config/env.js';

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

/**
 * Keyed digest of a high-entropy application token for storage.
 *
 * Uses HMAC-SHA256 with `TOKEN_PEPPER` rather than a bare SHA-256 so a leaked
 * token-hash table cannot be matched offline without also holding the pepper —
 * relevant for the lower-entropy numeric OTP in particular. Every write and
 * read of a token hash flows through this one function, so the peppering is
 * symmetric: session, OTP, password-reset, email-verification and public
 * quotation tokens all stay consistent.
 *
 * Only high-entropy random tokens (and the OTP) belong here. Passwords must use
 * `hashPassword` (Argon2id). Rotating `TOKEN_PEPPER` invalidates every existing
 * hash, so all active sessions, pending OTPs and reset/public links stop
 * verifying — treat a rotation as a full token reset.
 */
export function hashToken(rawToken: string): string {
  return createHmac('sha256', env.TOKEN_PEPPER).update(rawToken).digest('hex');
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

/** AES-256-GCM envelope for sensitive operational strings such as passport numbers. */
export function encryptSensitiveValue(
  plaintext: string,
  base64Key: string,
  version: string,
): string {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('The data-encryption key must contain 32 bytes.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    version,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSensitiveValue(envelope: string, base64Key: string): string {
  const [, ivValue, tagValue, encryptedValue] = envelope.split(':');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Malformed encrypted value.');
  const key = Buffer.from(base64Key, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSensitiveIdentifier(value: string): string {
  const compact = value.replace(/\s+/g, '');
  return compact.length <= 4
    ? `••••${compact}`
    : `${'•'.repeat(Math.min(8, compact.length - 4))}${compact.slice(-4)}`;
}
