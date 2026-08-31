import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://interscale:interscale_dev_password@localhost:5433/interscale_crm?schema=public' },
  },
});

const q = await db.quotation.findFirst({ orderBy: { createdAt: 'desc' } });
if (q) {
  console.log(
    JSON.stringify(
      {
        id: q.id,
        number: q.quotationNumber,
        status: q.status,
        hasToken: Boolean(q.publicToken),
        token: q.publicToken,
        slug: q.publicSlug,
        expires: q.publicTokenExpiresAt,
        currentVersionId: q.currentVersionId,
        publicVersionId: q.publicVersionId,
        deletedAt: q.deletedAt,
      },
      null,
      1,
    ),
  );
  const docs = await db.quotationDocument.findMany({
    where: { quotationId: q.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, objectKey: true, fileName: true, createdAt: true },
    take: 3,
  });
  console.log('documents:', JSON.stringify(docs, null, 1));
} else {
  console.log('no quotations');
}
await db.$disconnect();
