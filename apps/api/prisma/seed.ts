/**
 * Database seed.
 *
 * PHASE 1: seeds only the infrastructure table, confirming that the generated
 * Prisma client can write to PostgreSQL.
 *
 * PHASE 2 will seed: the "Interscale Demo Travels" company, default roles, the
 * permission catalogue, role-permission mappings, quick permission templates,
 * the demo users (owner/manager/sales/dataentry/viewer) and sample activity logs.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const record = await prisma.healthCheck.create({
    data: { label: 'phase-1-seed' },
  });

  const total = await prisma.healthCheck.count();

  console.log(`✔ Seed complete. Inserted health check ${record.id} (${total} total).`);
  console.log('  Phase 2 will seed companies, users, roles, permissions and templates.');
}

main()
  .catch((error: unknown) => {
    console.error('✖ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
