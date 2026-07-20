import { USER_STATUS, ROLE_NAME, type RoleName, type UserStatus } from '@interscale/shared';

/**
 * Development seed definitions.
 *
 * Kept separate from `seed.ts` so the tests can assert against the same source
 * of truth the seed writes from.
 */

/**
 * The one development password for every seeded account.
 *
 * DEVELOPMENT ONLY. It is committed on purpose so the demo tenant is usable
 * out of the box, which also means it must never exist in a deployed
 * environment. `seed.ts` refuses to run when NODE_ENV=production.
 */
export const DEV_PASSWORD = 'Interscale@2026';

export const DEMO_COMPANY = {
  name: 'Interscale Demo Travels',
  slug: 'interscale-demo-travels',
  email: 'demo@interscale.local',
  phone: '+911100000000',
} as const;

export interface SeedUserDefinition {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  roleName: RoleName;
  status: UserStatus;
  /** Seeded verified so Phase 3+ can log in without running the OTP flow. */
  emailVerified: boolean;
  templateName?: string;
}

export const SEED_USERS: readonly SeedUserDefinition[] = [
  {
    username: 'owner',
    fullName: 'Aditi Rao',
    email: 'owner@interscale.local',
    phone: '+911100000001',
    roleName: ROLE_NAME.OWNER,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  },
  {
    username: 'manager',
    fullName: 'Rohan Mehta',
    email: 'manager@interscale.local',
    phone: '+911100000002',
    roleName: ROLE_NAME.MANAGER,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
    templateName: 'Manager',
  },
  {
    username: 'sales',
    fullName: 'Priya Nair',
    email: 'sales@interscale.local',
    phone: '+911100000003',
    roleName: ROLE_NAME.SALES_EXECUTIVE,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
    templateName: 'Sales Executive',
  },
  {
    username: 'dataentry',
    fullName: 'Kabir Shah',
    email: 'dataentry@interscale.local',
    phone: '+911100000004',
    roleName: ROLE_NAME.DATA_ENTRY,
    // Inactive on purpose: exercises the "cannot log in" path in later phases.
    status: USER_STATUS.INACTIVE,
    emailVerified: true,
    templateName: 'Data Entry',
  },
  {
    username: 'viewer',
    fullName: 'Meera Krishnan',
    email: 'viewer@interscale.local',
    phone: '+911100000005',
    roleName: ROLE_NAME.VIEW_ONLY,
    // Suspended on purpose: exercises the suspension path in later phases.
    status: USER_STATUS.SUSPENDED,
    emailVerified: true,
    templateName: 'View Only',
  },
] as const;

/**
 * Fixed UUIDs for the sample activity-log rows.
 *
 * ActivityLog has no natural unique key, so deterministic ids are what make
 * re-running the seed an upsert rather than an append.
 */
export const SEED_ACTIVITY_LOG_IDS = {
  COMPANY_REGISTERED: '11111111-1111-4111-8111-000000000001',
  OWNER_CREATED: '11111111-1111-4111-8111-000000000002',
  EMAIL_VERIFIED: '11111111-1111-4111-8111-000000000003',
  MANAGER_CREATED: '11111111-1111-4111-8111-000000000004',
  LOGIN_SUCCESS: '11111111-1111-4111-8111-000000000005',
  DATAENTRY_DEACTIVATED: '11111111-1111-4111-8111-000000000006',
  VIEWER_SUSPENDED: '11111111-1111-4111-8111-000000000007',
} as const;
