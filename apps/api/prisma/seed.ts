/**
 * Development seed.
 *
 * IDEMPOTENT: every write is an `upsert` keyed on a unique constraint, so
 * running it repeatedly converges on the same rows rather than duplicating
 * them. `npm run db:seed` twice is a supported operation and is asserted by
 * `tests/seed.test.ts`.
 *
 * Seeds the demo company, the permission catalogue, the five default roles
 * with their grants, the quick-setup templates, five users covering the
 * interesting statuses, and a handful of activity-log entries.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { ACTIVITY_ACTION, ENTITY_TYPE, PERMISSION_CATALOG, ROLE_NAME } from '@interscale/shared';
import { hashPassword } from '../src/utils/crypto.js';
import { normalizeEmail } from '../src/utils/normalize.js';
import {
  ensurePermissionCatalog,
  provisionCompanyDefaults,
} from '../src/modules/companies/company-provisioning.service.js';
import { DEMO_COMPANY, DEV_PASSWORD, SEED_ACTIVITY_LOG_IDS, SEED_USERS } from './seed-data.js';
import { reminderRulesService } from '../src/modules/reminders/reminder-rules.service.js';

const prisma = new PrismaClient();

/** Seeded rows carry known credentials, so this must never touch production. */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. The seed creates accounts with a public development password.',
    );
  }
}

async function seedCompany() {
  return prisma.company.upsert({
    where: { slug: DEMO_COMPANY.slug },
    update: { name: DEMO_COMPANY.name, email: DEMO_COMPANY.email, phone: DEMO_COMPANY.phone },
    create: {
      name: DEMO_COMPANY.name,
      slug: DEMO_COMPANY.slug,
      email: DEMO_COMPANY.email,
      phone: DEMO_COMPANY.phone,
      status: 'ACTIVE',
    },
  });
}

async function seedUsers(
  companyId: string,
  roleIds: Map<string, string>,
  passwordHash: string,
): Promise<Map<string, string>> {
  const emailToId = new Map<string, string>();

  for (const definition of SEED_USERS) {
    const roleId = roleIds.get(definition.roleName);
    if (!roleId) {
      throw new Error(`Seed user "${definition.username}" references unknown role.`);
    }

    const normalizedEmail = normalizeEmail(definition.email);
    const verifiedAt = definition.emailVerified ? new Date('2026-01-15T09:00:00.000Z') : null;

    const user = await prisma.user.upsert({
      where: { normalizedEmail },
      update: {
        fullName: definition.fullName,
        phone: definition.phone,
        roleId,
        status: definition.status,
        emailVerifiedAt: verifiedAt,
        // Restore the documented dev password on every run, so a seeded account
        // whose password was changed during testing returns to a known state.
        passwordHash,
        // Clear any lockout a test may have left behind.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        companyId,
        roleId,
        username: definition.username,
        fullName: definition.fullName,
        email: definition.email,
        normalizedEmail,
        phone: definition.phone,
        passwordHash,
        status: definition.status,
        emailVerifiedAt: verifiedAt,
      },
      select: { id: true, normalizedEmail: true },
    });

    emailToId.set(user.normalizedEmail, user.id);
  }

  return emailToId;
}

/** Attach templates in a second pass — templates need the owner's id first. */
async function assignTemplatesToUsers(
  userIds: Map<string, string>,
  templateIds: Map<string, string>,
): Promise<void> {
  for (const definition of SEED_USERS) {
    if (!definition.templateName) continue;

    const userId = userIds.get(normalizeEmail(definition.email));
    const templateId = templateIds.get(definition.templateName);
    if (!userId || !templateId) continue;

    await prisma.user.update({ where: { id: userId }, data: { permissionTemplateId: templateId } });
  }
}

async function seedActivityLogs(companyId: string, userIds: Map<string, string>): Promise<void> {
  const ownerId = userIds.get('owner@interscale.local') ?? null;
  const managerId = userIds.get('manager@interscale.local') ?? null;
  const dataEntryId = userIds.get('dataentry@interscale.local') ?? null;
  const viewerId = userIds.get('viewer@interscale.local') ?? null;

  // Fixed ids make re-running the seed an update rather than an append.
  // Metadata is illustrative only — never credentials, tokens or OTPs.
  const entries: Array<{
    id: string;
    actorUserId: string | null;
    targetUserId: string | null;
    action: Prisma.ActivityLogCreateInput['action'];
    entityType: string;
    entityId: string | null;
    metadata: Prisma.InputJsonValue;
    createdAt: Date;
  }> = [
    {
      id: SEED_ACTIVITY_LOG_IDS.COMPANY_REGISTERED,
      actorUserId: ownerId,
      targetUserId: null,
      action: ACTIVITY_ACTION.COMPANY_REGISTERED,
      entityType: ENTITY_TYPE.COMPANY,
      entityId: companyId,
      metadata: { companyName: DEMO_COMPANY.name, source: 'seed' },
      createdAt: new Date('2026-01-15T08:55:00.000Z'),
    },
    {
      id: SEED_ACTIVITY_LOG_IDS.OWNER_CREATED,
      actorUserId: ownerId,
      targetUserId: ownerId,
      action: ACTIVITY_ACTION.USER_CREATED,
      entityType: ENTITY_TYPE.USER,
      entityId: ownerId,
      metadata: { role: ROLE_NAME.OWNER, source: 'seed' },
      createdAt: new Date('2026-01-15T08:56:00.000Z'),
    },
    {
      id: SEED_ACTIVITY_LOG_IDS.EMAIL_VERIFIED,
      actorUserId: ownerId,
      targetUserId: ownerId,
      action: ACTIVITY_ACTION.EMAIL_VERIFIED,
      entityType: ENTITY_TYPE.USER,
      entityId: ownerId,
      metadata: { source: 'seed' },
      createdAt: new Date('2026-01-15T09:00:00.000Z'),
    },
    {
      id: SEED_ACTIVITY_LOG_IDS.MANAGER_CREATED,
      actorUserId: ownerId,
      targetUserId: managerId,
      action: ACTIVITY_ACTION.USER_CREATED,
      entityType: ENTITY_TYPE.USER,
      entityId: managerId,
      metadata: { role: ROLE_NAME.MANAGER, source: 'seed' },
      createdAt: new Date('2026-01-16T10:15:00.000Z'),
    },
    {
      id: SEED_ACTIVITY_LOG_IDS.LOGIN_SUCCESS,
      actorUserId: ownerId,
      targetUserId: null,
      action: ACTIVITY_ACTION.LOGIN_SUCCESS,
      entityType: ENTITY_TYPE.SESSION,
      entityId: null,
      metadata: { source: 'seed' },
      createdAt: new Date('2026-01-17T07:30:00.000Z'),
    },
    {
      id: SEED_ACTIVITY_LOG_IDS.DATAENTRY_DEACTIVATED,
      actorUserId: managerId,
      targetUserId: dataEntryId,
      action: ACTIVITY_ACTION.USER_DEACTIVATED,
      entityType: ENTITY_TYPE.USER,
      entityId: dataEntryId,
      metadata: { reason: 'On extended leave', source: 'seed' },
      createdAt: new Date('2026-01-18T11:45:00.000Z'),
    },
    {
      id: SEED_ACTIVITY_LOG_IDS.VIEWER_SUSPENDED,
      actorUserId: ownerId,
      targetUserId: viewerId,
      action: ACTIVITY_ACTION.USER_SUSPENDED,
      entityType: ENTITY_TYPE.USER,
      entityId: viewerId,
      metadata: { reason: 'Access under review', source: 'seed' },
      createdAt: new Date('2026-01-19T14:20:00.000Z'),
    },
  ];

  for (const entry of entries) {
    await prisma.activityLog.upsert({
      where: { id: entry.id },
      update: {},
      create: {
        id: entry.id,
        companyId,
        actorUserId: entry.actorUserId,
        targetUserId: entry.targetUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
        createdAt: entry.createdAt,
      },
    });
  }
}

export async function runSeed(): Promise<void> {
  assertNotProduction();

  // Roles, grants and templates come from the SAME provisioning service the
  // registration flow uses, so the demo tenant and a freshly registered tenant
  // are structurally identical.
  await ensurePermissionCatalog(prisma);
  const availableKeys = PERMISSION_CATALOG.filter((p) => p.isAvailable).map((p) => p.key);
  console.log(
    `  permissions: ${PERMISSION_CATALOG.length} (${availableKeys.length} available, ${PERMISSION_CATALOG.length - availableKeys.length} planned)`,
  );

  const company = await seedCompany();
  console.log(`  company:     ${company.name} (${company.slug})`);

  const { roleIds } = await provisionCompanyDefaults(prisma, company.id);
  console.log(`  roles:       ${roleIds.size}`);

  const passwordHash = await hashPassword(DEV_PASSWORD);
  const userIds = await seedUsers(company.id, roleIds, passwordHash);
  console.log(`  users:       ${userIds.size}`);

  const ownerId = userIds.get('owner@interscale.local') ?? null;
  const { templateIds } = await provisionCompanyDefaults(prisma, company.id, {
    createdById: ownerId,
  });

  // Templates are created before the owner exists on the first pass, so their
  // author starts null. Fill it in only where unset, which keeps this
  // idempotent without clobbering a real author on later runs.
  if (ownerId) {
    await prisma.permissionTemplate.updateMany({
      where: { companyId: company.id, createdById: null },
      data: { createdById: ownerId },
    });
    const reminderRules = await reminderRulesService.ensureDefaults(company.id, ownerId);
    console.log(`  reminder rules: ${reminderRules.length}`);
  }
  console.log(`  templates:   ${templateIds.size}`);

  await assignTemplatesToUsers(userIds, templateIds);
  await seedActivityLogs(company.id, userIds);
  console.log(`  activity:    ${Object.keys(SEED_ACTIVITY_LOG_IDS).length} sample entries`);
}

// Only run when executed directly, so tests can import `runSeed`.
const isDirectRun = process.argv[1] !== undefined && process.argv[1].includes('seed.ts');

if (isDirectRun) {
  console.log('Seeding Interscale Travel CRM development data...');
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
      console.log('\n✔ Seed complete.');
      console.log(`  Sign in with any seeded address, password: ${DEV_PASSWORD}`);
      console.log('  DEVELOPMENT ONLY — never use this password outside local development.');
    })
    .catch(async (error: unknown) => {
      console.error('✖ Seed failed:', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { prisma as seedPrismaClient };
