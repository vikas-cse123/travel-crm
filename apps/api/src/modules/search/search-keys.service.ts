import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { decryptSensitiveValue, encryptSensitiveValue, hashToken } from '../../utils/crypto.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import type { SearchApiKeyRecord, SearchApiKeyStatus } from '@interscale/shared';

/**
 * Per-user SearchAPI.io keys for Live Search (multiple keys per user).
 *
 * Each key is encrypted at rest with the same AES-256-GCM scheme already used
 * for passport numbers / bank accounts (`encryptSensitiveValue` +
 * `DATA_ENCRYPTION_KEY`). A row carries a deterministic `keyDigest`
 * (HMAC-SHA256 with TOKEN_PEPPER) so an identical key cannot be saved twice,
 * and a `maskedSuffix` (last four characters) so the UI and dashboard can
 * identify a key without ever seeing its value.
 *
 * The API never returns plaintext keys. Keys are scoped to the owning user and
 * tenant via `companyId`/`userId` on every query.
 */

/** The last four characters of a key — the only stable identifier we expose. */
export function lastFour(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}

/** Masked display form, e.g. "••••8F3A". */
export function maskKey(value: string): string {
  return `••••${lastFour(value)}`;
}

/** Whether the server-level fallback key is configured. */
export function hasServerFallbackKey(): boolean {
  return Boolean(env.SEARCHAPI_API_KEY);
}

const keyVersion = () => env.DATA_ENCRYPTION_KEY_VERSION || 'v1';

function toRecord(row: {
  id: string;
  maskedSuffix: string;
  status: SearchApiKeyStatus;
  priority: number;
  createdAt: Date;
}): SearchApiKeyRecord {
  return {
    id: row.id,
    maskedKey: maskKey(row.maskedSuffix),
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
  };
}

async function decryptEnvelope(envelope: string): Promise<string | null> {
  try {
    const plaintext = decryptSensitiveValue(envelope, env.DATA_ENCRYPTION_KEY ?? '');
    return plaintext.trim() || null;
  } catch {
    // A corrupt/unreadable envelope must not break search. Never log the key.
    return null;
  }
}

/** A resolved, usable key ready to be passed to the SearchAPI provider. */
export interface ResolvedSearchApiKey {
  /** Saved-key id, or null for the legacy/user fallback and server fallback. */
  id: string | null;
  plaintext: string;
  maskedSuffix: string;
}

/**
 * Resolve the ordered list of keys to try for a user's Live Search request.
 *
 * Only ACTIVE saved keys are candidates, in `priority` order (ties break on
 * insertion). EXHAUSTED / INVALID / DISABLED keys are skipped so they never
 * burn a provider call. When the user has no usable saved key the legacy
 * single key (still on the User row) and finally the server-level
 * SEARCHAPI_API_KEY fallback are used, preserving pre-existing behaviour.
 */
export async function resolveSearchApiKeys(auth: AuthContext): Promise<ResolvedSearchApiKey[]> {
  const rows = await prisma.searchApiKey.findMany({
    where: { userId: auth.userId, companyId: auth.companyId, status: 'ACTIVE' },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  const resolved: ResolvedSearchApiKey[] = [];
  for (const row of rows) {
    const plaintext = await decryptEnvelope(row.encryptedKey);
    if (plaintext) resolved.push({ id: row.id, plaintext, maskedSuffix: row.maskedSuffix });
  }

  // Legacy single key on the User row (pre-multi-key migration). Surfaced as a
  // usable key until the backfill converts it, so existing configurations keep
  // working. Only consulted when nothing is saved in the new table yet.
  if (resolved.length === 0) {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { companyId: true, searchApiKeyEncrypted: true, searchApiKeyKeyVersion: true },
    });
    if (
      user &&
      user.companyId === auth.companyId &&
      user.searchApiKeyEncrypted &&
      user.searchApiKeyKeyVersion
    ) {
      const legacy = await decryptEnvelope(user.searchApiKeyEncrypted);
      if (legacy) resolved.push({ id: null, plaintext: legacy, maskedSuffix: lastFour(legacy) });
    }
  }

  // Server-level fallback, only when the user has no usable saved key.
  if (resolved.length === 0 && env.SEARCHAPI_API_KEY) {
    resolved.push({
      id: null,
      plaintext: env.SEARCHAPI_API_KEY,
      maskedSuffix: lastFour(env.SEARCHAPI_API_KEY),
    });
  }

  return resolved;
}

/** List the current user's saved keys (masked, ordered by priority). */
export async function listSearchApiKeys(auth: AuthContext): Promise<SearchApiKeyRecord[]> {
  const rows = await prisma.searchApiKey.findMany({
    where: { userId: auth.userId, companyId: auth.companyId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toRecord);
}

/**
 * Save a new SearchAPI key for the current user. Rejects an identical key
 * already saved for the same user (checked via the key digest, so the
 * ciphertext randomness of AES-GCM can never hide a duplicate).
 */
export async function addSearchApiKey(
  auth: AuthContext,
  plaintext: string,
): Promise<SearchApiKeyRecord> {
  const trimmed = plaintext.trim();
  if (!trimmed) throw new NotFoundError('A SearchAPI API key is required.');

  const digest = hashToken(trimmed);
  const existing = await prisma.searchApiKey.findUnique({
    where: { userId_keyDigest: { userId: auth.userId, keyDigest: digest } },
  });
  if (existing) {
    throw new ConflictError('That SearchAPI API key is already saved for this user.');
  }

  const aggregate = await prisma.searchApiKey.aggregate({
    where: { userId: auth.userId, companyId: auth.companyId },
    _max: { priority: true },
  });
  const nextPriority = (aggregate._max.priority ?? -1) + 1;

  const row = await prisma.searchApiKey.create({
    data: {
      companyId: auth.companyId,
      userId: auth.userId,
      encryptedKey: encryptSensitiveValue(trimmed, env.DATA_ENCRYPTION_KEY ?? '', keyVersion()),
      keyVersion: keyVersion(),
      keyDigest: digest,
      maskedSuffix: lastFour(trimmed),
      priority: nextPriority,
    },
  });
  return toRecord(row);
}

/** Remove one of the current user's keys. */
export async function removeSearchApiKey(auth: AuthContext, keyId: string): Promise<void> {
  const result = await prisma.searchApiKey.deleteMany({
    where: { id: keyId, userId: auth.userId, companyId: auth.companyId },
  });
  if (result.count === 0) throw new NotFoundError('SearchAPI key not found.');
}

/**
 * Update a key's status (ACTIVE/DISABLED) and/or priority. Setting status to
 * ACTIVE is how a user manually reactivates an EXHAUSTED/INVALID key.
 */
export async function updateSearchApiKey(
  auth: AuthContext,
  keyId: string,
  input: { status?: SearchApiKeyStatus; priority?: number },
): Promise<SearchApiKeyRecord> {
  const row = await prisma.searchApiKey.updateMany({
    where: { id: keyId, userId: auth.userId, companyId: auth.companyId },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  });
  if (row.count === 0) throw new NotFoundError('SearchAPI key not found.');

  const fresh = await prisma.searchApiKey.findFirst({
    where: { id: keyId, userId: auth.userId, companyId: auth.companyId },
  });
  if (!fresh) throw new NotFoundError('SearchAPI key not found.');
  return toRecord(fresh);
}

/**
 * Persist a provider-detected state change (e.g. EXHAUSTED after a 429, or
 * INVALID after a 401/403) so later searches skip the key without calling the
 * provider again. Only ever applied to a key the actor owns.
 */
export async function markSearchApiKeyStatus(
  auth: AuthContext,
  keyId: string,
  status: SearchApiKeyStatus,
): Promise<void> {
  await prisma.searchApiKey.updateMany({
    where: { id: keyId, userId: auth.userId, companyId: auth.companyId },
    data: { status },
  });
}
