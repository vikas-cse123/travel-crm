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
import {
  ACTIVITY_ACTION,
  DEFAULT_PERMISSION_TEMPLATES,
  DEFAULT_ROLES,
  ENTITY_TYPE,
  PERMISSION_CATALOG,
  ROLE_NAME,
} from '@interscale/shared';
import { hashPassword } from '../src/utils/crypto.js';
import { normalizeEmail } from '../src/utils/normalize.js';
import { DEMO_COMPANY, DEV_PASSWORD, SEED_ACTIVITY_LOG_IDS, SEED_USERS } from './seed-data.js';

const prisma = new PrismaClient();

/** Seeded rows carry known credentials, so this must never touch production. */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. The seed creates accounts with a public development password.',
    );
  }
}

async function seedPermissions(): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();

  for (const definition of PERMISSION_CATALOG) {
    const permission = await prisma.permission.upsert({
      where: { key: definition.key },
      // Descriptions and availability are re-applied so the catalogue in code
      // stays authoritative as modules ship.
      update: {
        module: definition.module,
        action: definition.action,
        description: definition.description,
        isAvailable: definition.isAvailable,
      },
      create: {
        key: definition.key,
        module: definition.module,
        action: definition.action,
        description: definition.description,
        isAvailable: definition.isAvailable,
      },
      select: { id: true, key: true },
    });
    keyToId.set(permission.key, permission.id);
  }

  return keyToId;
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

async function seedRoles(
  companyId: string,
  permissionIds: Map<string, string>,
  availableKeys: string[],
): Promise<Map<string, string>> {
  const roleNameToId = new Map<string, string>();

  for (const definition of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId, name: definition.name } },
      update: {
        description: definition.description,
        hierarchyLevel: definition.hierarchyLevel,
        isSystem: definition.isSystem,
      },
      create: {
        companyId,
        name: definition.name,
        description: definition.description,
        hierarchyLevel: definition.hierarchyLevel,
        isSystem: definition.isSystem,
      },
    });
    roleNameToId.set(definition.name, role.id);

    // `null` means "everything currently available" — so Owner picks up new
    // permissions automatically as modules ship.
    const keys = definition.permissionKeys === null ? availableKeys : definition.permissionKeys;

    for (const key of keys) {
      const permissionId = permissionIds.get(key);
      if (!permissionId) {
        throw new Error(`Role "${definition.name}" references unknown permission "${key}".`);
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  return roleNameToId;
}

async function seedTemplates(
  companyId: string,
  permissionIds: Map<string, string>,
  createdById: string | null,
): Promise<Map<string, string>> {
  const templateNameToId = new Map<string, string>();

  for (const definition of DEFAULT_PERMISSION_TEMPLATES) {
    const template = await prisma.permissionTemplate.upsert({
      where: { companyId_name: { companyId, name: definition.name } },
      update: { description: definition.description, status: 'ACTIVE' },
      create: {
        companyId,
        name: definition.name,
        description: definition.description,
        status: 'ACTIVE',
        createdById,
      },
    });
    templateNameToId.set(definition.name, template.id);

    for (const key of definition.permissionKeys) {
      const permissionId = permissionIds.get(key);
      if (!permissionId) {
        throw new Error(`Template "${definition.name}" references unknown permission "${key}".`);
      }
      await prisma.permissionTemplatePermission.upsert({
        where: { templateId_permissionId: { templateId: template.id, permissionId } },
        update: {},
        create: { templateId: template.id, permissionId },
      });
    }
  }

  return templateNameToId;
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

  const permissionIds = await seedPermissions();
  const availableKeys = PERMISSION_CATALOG.filter((p) => p.isAvailable).map((p) => p.key);
  console.log(
    `  permissions: ${permissionIds.size} (${availableKeys.length} available, ${permissionIds.size - availableKeys.length} planned)`,
  );

  const company = await seedCompany();
  console.log(`  company:     ${company.name} (${company.slug})`);

  const roleIds = await seedRoles(company.id, permissionIds, availableKeys);
  console.log(`  roles:       ${roleIds.size}`);

  const passwordHash = await hashPassword(DEV_PASSWORD);
  const userIds = await seedUsers(company.id, roleIds, passwordHash);
  console.log(`  users:       ${userIds.size}`);

  // Templates record their author, so they are created after the owner exists.
  const ownerId = userIds.get('owner@interscale.local') ?? null;
  const templateIds = await seedTemplates(company.id, permissionIds, ownerId);
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
