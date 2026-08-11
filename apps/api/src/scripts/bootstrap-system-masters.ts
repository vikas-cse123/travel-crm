/**
 * System Global Masters bootstrap command.
 *
 * Idempotent. Creates/verifies the hidden System Global Masters company and
 * its System Admin user. The password is read from SYSTEM_ADMIN_PASSWORD and is
 * never printed, hashed into the DB, or reset unless SYSTEM_ADMIN_RESET_PASSWORD
 * is explicitly true.
 *
 * Run: npm run bootstrap:system-masters
 */
import { runSystemMastersBootstrap } from '../modules/system-masters/system-masters-bootstrap.service.js';
import { prisma } from '../config/prisma.js';

async function main() {
  const result = await runSystemMastersBootstrap();
  console.log('System Global Masters bootstrap completed.');
  console.log(`System company: ${result.systemCompany}`);
  console.log(`System admin: ${result.systemAdmin}`);
  console.log(
    `Password updated: ${result.passwordUpdated ? 'yes (reset requested)' : 'no (unchanged)'}`,
  );
  console.log('Permissions: synchronized');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Safe message only — never environment values or secrets.
    console.error(`System Masters bootstrap failed: ${message}`);
    await prisma.$disconnect();
    process.exit(1);
  });
