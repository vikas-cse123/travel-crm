/**
 * Production system-data bootstrap.
 *
 * Idempotent and tenant-neutral. Only provisions the global permission
 * catalogue that the registration flow depends on; it creates NO companies,
 * users or business records. The first real company and Owner are created
 * through the application's signup flow after deployment.
 */
import { ensurePermissionCatalog } from '../modules/companies/company-provisioning.service.js';
import { prisma } from '../config/prisma.js';

async function main() {
  const started = Date.now();
  await ensurePermissionCatalog();
  const permissions = await prisma.permission.count();
  console.log(
    `production bootstrap: permission catalogue ready (${permissions} permissions) in ${Date.now() - started}ms`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('production bootstrap failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
