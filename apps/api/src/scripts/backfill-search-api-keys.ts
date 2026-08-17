import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { decryptSensitiveValue, encryptSensitiveValue, hashToken } from '../utils/crypto.js';

/**
 * One-time backfill that moves the legacy single SearchAPI key stored on the
 * User row (`searchApiKeyEncrypted` / `searchApiKeyKeyVersion`) into the new
 * multi-key `SearchApiKey` table as the user's first key (priority 0).
 *
 * Safe to re-run: keys that already have a row with the same digest are left
 * untouched, and rows created here are never duplicated. Idempotent like the
 * customer backfill.
 */
const prisma = new PrismaClient();

async function run() {
  const totals = { migrated: 0, skipped: 0, corrupt: 0 };
  const users = await prisma.user.findMany({
    where: { searchApiKeyEncrypted: { not: null } },
    select: {
      id: true,
      companyId: true,
      searchApiKeyEncrypted: true,
      searchApiKeyKeyVersion: true,
    },
  });

  for (const user of users) {
    if (!user.searchApiKeyEncrypted || !user.searchApiKeyKeyVersion) continue;
    let plaintext: string;
    try {
      plaintext = decryptSensitiveValue(user.searchApiKeyEncrypted, env.DATA_ENCRYPTION_KEY ?? '');
    } catch {
      // A corrupt envelope cannot be migrated; keep the legacy row untouched.
      totals.corrupt += 1;
      continue;
    }
    const trimmed = plaintext.trim();
    if (!trimmed) {
      totals.corrupt += 1;
      continue;
    }

    const digest = hashToken(trimmed);
    const existing = await prisma.searchApiKey.findUnique({
      where: { userId_keyDigest: { userId: user.id, keyDigest: digest } },
    });
    if (existing) {
      totals.skipped += 1;
      continue;
    }

    const keyVersion = env.DATA_ENCRYPTION_KEY_VERSION || 'v1';
    await prisma.searchApiKey.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        encryptedKey: encryptSensitiveValue(trimmed, env.DATA_ENCRYPTION_KEY ?? '', keyVersion),
        keyVersion,
        keyDigest: digest,
        maskedSuffix: trimmed.length <= 4 ? trimmed : trimmed.slice(-4),
        priority: 0,
      },
    });
    totals.migrated += 1;
  }

  console.log(
    `SearchAPI key backfill complete — migrated: ${totals.migrated}, already present: ${totals.skipped}, corrupt/unreadable: ${totals.corrupt}`,
  );
}

run()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('SearchAPI key backfill failed.', error);
    return prisma.$disconnect().then(() => process.exit(1));
  });
