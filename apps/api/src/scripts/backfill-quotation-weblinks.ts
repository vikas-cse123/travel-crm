import { PrismaClient } from '@prisma/client';
import { generateSecureToken, hashToken } from '../utils/crypto.js';

/**
 * Idempotent backfill: give every quotation a usable public weblink.
 *
 * Quotations created before automatic link provisioning may be missing a raw
 * `publicToken` (the previous model stored only the hash, so the URL was not
 * reconstructable). This function creates one secure token for those quotations
 * and stores both the raw token (for URL reconstruction) and its hash (for
 * secure lookup). Existing tokens and analytics are never touched.
 *
 * Safe to run repeatedly:
 *  - quotations that already have a raw `publicToken` are skipped;
 *  - each run generates a token for genuinely missing quotations only;
 *  - view analytics are keyed by quotationId, so counts are preserved.
 */
const BATCH_SIZE = 200;

export async function backfillQuotationWeblinks(prisma: PrismaClient): Promise<{
  created: number;
  scanned: number;
}> {
  let scanned = 0;
  let created = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.quotation.findMany({
      where: { publicToken: null, deletedAt: null, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        validUntil: true,
        currentVersionId: true,
        acceptedVersionId: true,
        versions: {
          orderBy: { versionNumber: 'desc' as const },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id;
      const publicVersionId =
        row.acceptedVersionId ??
        (row.versions[0]?.status !== 'DRAFT' ? row.versions[0]?.id : null) ??
        row.currentVersionId;
      const token = generateSecureToken(32);
      await prisma.quotation.update({
        where: { id: row.id },
        data: {
          publicToken: token,
          publicTokenHash: hashToken(token),
          publicTokenExpiresAt: row.validUntil ?? null,
          publicVersionId,
        },
      });
      created += 1;
    }
    scanned += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  return { created, scanned };
}

async function run() {
  const prisma = new PrismaClient();
  try {
    const { created, scanned } = await backfillQuotationWeblinks(prisma);
    console.log(`Weblink backfill complete: ${created} link(s) created across ${scanned} scanned.`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('Weblink backfill failed:', error);
  process.exitCode = 1;
});
