import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskSensitiveIdentifier,
} from '../../utils/crypto.js';
import { NotFoundError } from '../../utils/errors.js';
import type { AuthContext } from '../../middleware/authenticate.js';

/**
 * Per-user SearchAPI.io keys for Live Search.
 *
 * The key is encrypted at rest with the same AES-256-GCM scheme already used
 * for passport numbers / bank accounts (`encryptSensitiveValue` +
 * `DATA_ENCRYPTION_KEY`), and stored on the User row so it is naturally scoped
 * to that user's tenant (companyId). The API never returns the plaintext key:
 * callers only ever see a masked preview and an "has key" boolean.
 */

/** Whether the server-level fallback key is configured. */
export function hasServerFallbackKey(): boolean {
  return Boolean(env.SEARCHAPI_API_KEY);
}

/**
 * Resolve the API key to use for a user's Live Search request:
 * their own saved key first, then the server-level fallback.
 */
export async function resolveSearchApiKey(auth: AuthContext): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, companyId: true, searchApiKeyEncrypted: true, searchApiKeyKeyVersion: true },
  });
  if (!user || user.companyId !== auth.companyId) return null;

  const envelope = user.searchApiKeyEncrypted;
  const version = user.searchApiKeyKeyVersion;
  if (envelope && version) {
    try {
      const key = decryptSensitiveValue(envelope, env.DATA_ENCRYPTION_KEY ?? '');
      if (key.trim()) return key.trim();
    } catch {
      // A corrupt/unreadable envelope should not break search; fall through to
      // the server key rather than throwing. Never log the key.
    }
  }

  return env.SEARCHAPI_API_KEY || null;
}

/** Masked preview of the user's saved key, e.g. "••••••••••••••abcd". */
export async function searchApiKeyPreview(auth: AuthContext): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, companyId: true, searchApiKeyEncrypted: true, searchApiKeyKeyVersion: true },
  });
  if (!user || user.companyId !== auth.companyId) return null;

  const envelope = user.searchApiKeyEncrypted;
  const version = user.searchApiKeyKeyVersion;
  if (!envelope || !version) return null;
  try {
    const key = decryptSensitiveValue(envelope, env.DATA_ENCRYPTION_KEY ?? '');
    return maskSensitiveIdentifier(key);
  } catch {
    return null;
  }
}

/** Save (or replace) the authenticated user's SearchAPI key. Returns a mask. */
export async function saveSearchApiKey(auth: AuthContext, plaintext: string): Promise<string> {
  const trimmed = plaintext.trim();
  const keyVersion = env.DATA_ENCRYPTION_KEY_VERSION || 'v1';
  const envelope = encryptSensitiveValue(trimmed, env.DATA_ENCRYPTION_KEY ?? '', keyVersion);

  await prisma.user.update({
    where: { id: auth.userId, companyId: auth.companyId },
    data: {
      searchApiKeyEncrypted: envelope,
      searchApiKeyKeyVersion: keyVersion,
    },
  });

  return maskSensitiveIdentifier(trimmed);
}

/** Remove the authenticated user's SearchAPI key. */
export async function removeSearchApiKey(auth: AuthContext): Promise<void> {
  const result = await prisma.user.updateMany({
    where: { id: auth.userId, companyId: auth.companyId },
    data: {
      searchApiKeyEncrypted: null,
      searchApiKeyKeyVersion: null,
    },
  });
  if (result.count === 0) throw new NotFoundError('User not found.');
}
