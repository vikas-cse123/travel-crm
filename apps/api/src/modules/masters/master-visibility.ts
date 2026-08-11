import { SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG, type MasterType } from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { ForbiddenError } from '../../utils/errors.js';

/**
 * System Global Masters visibility primitives.
 *
 * A record is "global" when it is owned by the hidden System Global Masters
 * company — nothing else (not its name, creator, role or badge).
 *
 * The System Company id is resolved from the deterministic slug, verified to
 * be `isSystem`, then cached briefly. The cache is only ever read; a tenant
 * being created/deleted cannot change which company is the system company,
 * and the bootstrap command invalidates it explicitly.
 */

/** TTL for the resolved system company id. */
const SYSTEM_COMPANY_ID_CACHE_MS = 5 * 60 * 1000;

let cachedSystemCompanyId: { id: string; expiresAt: number } | null = null;

/** Drop the cached system company id. Called by the bootstrap and tests. */
export function resetSystemCompanyIdCache(): void {
  cachedSystemCompanyId = null;
}

/**
 * Resolve the id of the System Global Masters company, or null before the
 * bootstrap has created it.
 *
 * Identification order: isSystem flag + fixed slug, then the isSystem flag
 * alone, then the configured fallback id. Never by display name.
 */
export async function getSystemCompanyId(): Promise<string | null> {
  if (cachedSystemCompanyId && cachedSystemCompanyId.expiresAt > Date.now()) {
    return cachedSystemCompanyId.id;
  }

  const bySlug = await prisma.company.findFirst({
    where: { slug: SYSTEM_GLOBAL_MASTERS_COMPANY_SLUG, isSystem: true },
    select: { id: true },
  });
  if (bySlug) {
    cachedSystemCompanyId = { id: bySlug.id, expiresAt: Date.now() + SYSTEM_COMPANY_ID_CACHE_MS };
    return bySlug.id;
  }

  const flagged = await prisma.company.findMany({
    where: { isSystem: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  if (flagged.length === 1) {
    cachedSystemCompanyId = {
      id: flagged[0]!.id,
      expiresAt: Date.now() + SYSTEM_COMPANY_ID_CACHE_MS,
    };
    return flagged[0]!.id;
  }
  if (flagged.length > 1) {
    throw new Error(
      'Multiple system companies detected in the database. Refusing to resolve the system company.',
    );
  }

  const fallback = env.SYSTEM_GLOBAL_MASTERS_COMPANY_ID;
  if (fallback) {
    cachedSystemCompanyId = { id: fallback, expiresAt: Date.now() + SYSTEM_COMPANY_ID_CACHE_MS };
    return fallback;
  }

  return null;
}

/** True when the authenticated user belongs to the System Global Masters company. */
export async function isSystemAdminContext(auth: AuthContext): Promise<boolean> {
  const systemCompanyId = await getSystemCompanyId();
  return systemCompanyId !== null && auth.companyId === systemCompanyId;
}

export interface MasterScope {
  /** The System Global Masters company id, or null before bootstrap. */
  systemCompanyId: string | null;
  /** The authenticated user's own company. */
  tenantCompanyId: string;
  /** True when the authenticated user belongs to the system company. */
  isSystemAdmin: boolean;
  /** Global master ids this tenant has hidden (empty for the system admin). */
  hiddenMasterIds: string[];
}

/**
 * Resolve the visibility scope for one master type in one request.
 *
 * For the system admin the scope collapses to its own company (it must never
 * see tenant-private records). For a normal tenant it is its own records plus
 * the system company's, minus the global records the tenant has hidden.
 */
export async function resolveMasterScope(
  auth: AuthContext,
  masterType: MasterType,
): Promise<MasterScope> {
  const systemCompanyId = await getSystemCompanyId();
  if (!systemCompanyId) {
    return {
      systemCompanyId: null,
      tenantCompanyId: auth.companyId,
      isSystemAdmin: false,
      hiddenMasterIds: [],
    };
  }
  if (auth.companyId === systemCompanyId) {
    return {
      systemCompanyId,
      tenantCompanyId: auth.companyId,
      isSystemAdmin: true,
      hiddenMasterIds: [],
    };
  }
  const hiddenRows = await prisma.companyHiddenMaster.findMany({
    where: { tenantId: auth.companyId, masterType, restoredAt: null },
    select: { masterId: true },
  });
  return {
    systemCompanyId,
    tenantCompanyId: auth.companyId,
    isSystemAdmin: false,
    hiddenMasterIds: hiddenRows.map((row) => row.masterId),
  };
}

/**
 * The `where` fragment every visible master list/detail/dropdown query must
 * include. Tenant: own company + system company, minus hidden global ids and
 * archived global records. System admin: the system company only (its own).
 */
export function buildVisibleWhere(scope: MasterScope) {
  const companyClauses = scope.systemCompanyId
    ? [{ companyId: scope.systemCompanyId }, { companyId: scope.tenantCompanyId }]
    : [{ companyId: scope.tenantCompanyId }];

  const conditions: Record<string, unknown>[] = [];

  if (scope.systemCompanyId && scope.hiddenMasterIds.length > 0) {
    conditions.push({
      AND: [{ companyId: scope.systemCompanyId }, { id: { in: scope.hiddenMasterIds } }],
    });
  }

  // A tenant must never see an archived global record — System Admin archiving
  // removes it from every tenant's future lists. Tenant-owned records keep
  // their existing per-status visibility.
  if (scope.systemCompanyId && !scope.isSystemAdmin) {
    conditions.push({
      AND: [
        { companyId: scope.systemCompanyId },
        { OR: [{ status: { not: 'ACTIVE' } }, { deletedAt: { not: null } }] },
      ],
    });
  }

  return {
    OR: companyClauses,
    ...(conditions.length > 0 ? { NOT: conditions } : {}),
  };
}

/** A record is global exactly when it is owned by the system company. */
export function isGlobalMaster(
  record: { companyId: string } | null | undefined,
  scope: Pick<MasterScope, 'systemCompanyId'>,
): boolean {
  return Boolean(scope.systemCompanyId && record && record.companyId === scope.systemCompanyId);
}

/**
 * Ownership gate for writes. A normal tenant may never modify a global
 * record — it may only hide it for its own company. The system admin may only
 * modify records it owns (which are, by construction, global ones).
 */
export function assertCanModifyMaster(
  record: { companyId: string } | null | undefined,
  scope: MasterScope,
): void {
  if (!record) return;
  const global = isGlobalMaster(record, scope);
  if (global && !scope.isSystemAdmin) {
    throw new ForbiddenError(
      'Global master records cannot be edited. You can hide this record for your company instead.',
    );
  }
  if (!global && scope.isSystemAdmin) {
    throw new ForbiddenError('System administrators cannot modify tenant-owned master records.');
  }
}

export type MasterSource = 'GLOBAL' | 'TENANT' | 'SYSTEM';

export interface MasterRecordMeta {
  isGlobal: boolean;
  isOwnedByCurrentTenant: boolean;
  canEdit: boolean;
  canHide: boolean;
  canRestore: boolean;
  source: MasterSource;
}

/**
 * Safe, server-computed metadata attached to master responses. The permission
 * booleans are derived from record ownership plus the caller's context, never
 * from anything the frontend sends.
 */
export function masterRecordMeta(
  record: { companyId: string },
  scope: MasterScope,
): MasterRecordMeta {
  const global = isGlobalMaster(record, scope);
  const ownedByCurrentTenant = record.companyId === scope.tenantCompanyId;
  return {
    isGlobal: global,
    isOwnedByCurrentTenant: ownedByCurrentTenant,
    canEdit: scope.isSystemAdmin ? global : ownedByCurrentTenant,
    canHide: !scope.isSystemAdmin && global,
    canRestore: false,
    source: global ? 'GLOBAL' : 'TENANT',
  };
}

/** Log-only helper: record the resolution once per request if it ever fails. */
export function logMasterScopeResolutionFailure(error: unknown, context: string): void {
  logger.error({ error, context }, 'System company resolution failed');
}
