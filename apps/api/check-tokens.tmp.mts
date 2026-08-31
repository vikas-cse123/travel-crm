import { PrismaClient } from '@prisma/client';
import { createHmac } from 'node:crypto';

const PEPPER = 'change_me_dev_token_pepper_at_least_32_chars_long';
const hash = (raw: string) => createHmac('sha256', PEPPER).update(raw).digest('hex');

const db = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://interscale:interscale_dev_password@localhost:5433/interscale_crm?schema=public' },
  },
});

const rows = await db.quotation.findMany({
  select: { quotationNumber: true, publicToken: true, publicTokenHash: true, publicSlug: true, createdAt: true, deletedAt: true },
  orderBy: { createdAt: 'desc' },
  take: 8,
});
for (const q of rows) {
  console.log(JSON.stringify({
    n: q.quotationNumber,
    at: q.createdAt,
    hasToken: Boolean(q.publicToken),
    ok: q.publicToken ? hash(q.publicToken) === q.publicTokenHash : null,
    slug: q.publicSlug,
    del: q.deletedAt,
  }));
}
await db.$disconnect();
