import type { Prisma } from '@prisma/client';
import { ACTIVITY_ACTION, ENTITY_TYPE, type MasterType } from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import { createTenantContext } from '../../db/tenant.js';
import { activityLogsRepository } from '../activity-logs/activity-logs.repository.js';

/**
 * Tenant-scoped access to the generic hidden-global-master table.
 *
 * One row = one global record hidden for one tenant. Rows are soft-restored
 * (`restoredAt` set) rather than hard-deleted so the unique constraint still
 * stops re-hide/restore races, and the audit history is preserved.
 */
export interface HideMasterRow {
  id: string;
  tenantId: string;
  masterType: string;
  masterId: string;
  hiddenByUserId: string | null;
  hiddenAt: Date;
  restoredAt: Date | null;
}

export interface HideMasterContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Number of hidden rows a tenant may hold, to bound the hidden-list screen. */
const MAX_HIDDEN_ROWS_PER_TENANT = 500;

export const companyHiddenMastersRepository = {
  /** Idempotent hide: one (tenant, type, masterId) row, cleared of restore. */
  async hide(
    tenantId: string,
    actorUserId: string,
    masterType: MasterType,
    masterId: string,
    context: HideMasterContext,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<HideMasterRow> {
    const row = await client.companyHiddenMaster.upsert({
      where: {
        tenantId_masterType_masterId: { tenantId, masterType, masterId },
      },
      update: { restoredAt: null, hiddenByUserId: actorUserId, hiddenAt: new Date() },
      create: {
        tenantId,
        masterType,
        masterId,
        hiddenByUserId: actorUserId,
      },
    });

    await activityLogsRepository.record(
      createTenantContext(tenantId),
      {
        actorUserId,
        action: ACTIVITY_ACTION.MASTER_HIDDEN_FOR_TENANT,
        entityType: ENTITY_TYPE.MASTER,
        entityId: masterId,
        metadata: { masterType, masterId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  },

  /** Soft-restore the hide row for a tenant + type + master id. */
  async restore(
    tenantId: string,
    actorUserId: string,
    masterType: MasterType,
    masterId: string,
    context: HideMasterContext,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<boolean> {
    const result = await client.companyHiddenMaster.updateMany({
      where: { tenantId, masterType, masterId, restoredAt: null },
      data: { restoredAt: new Date() },
    });
    if (result.count === 0) return false;

    await activityLogsRepository.record(
      createTenantContext(tenantId),
      {
        actorUserId,
        action: ACTIVITY_ACTION.MASTER_RESTORED_FOR_TENANT,
        entityType: ENTITY_TYPE.MASTER,
        entityId: masterId,
        metadata: { masterType, masterId },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
    return true;
  },

  /** Active (unrestored) hide rows for a tenant, optionally one master type. */
  async listActive(
    tenantId: string,
    masterType?: MasterType | undefined,
  ): Promise<HideMasterRow[]> {
    return prisma.companyHiddenMaster.findMany({
      where: {
        tenantId,
        restoredAt: null,
        ...(masterType ? { masterType } : {}),
      },
      orderBy: { hiddenAt: 'desc' },
      take: MAX_HIDDEN_ROWS_PER_TENANT,
    });
  },

  /** One active hide row by its own id, tenant-scoped. */
  async findActiveById(tenantId: string, rowId: string): Promise<HideMasterRow | null> {
    return prisma.companyHiddenMaster.findFirst({
      where: { id: rowId, tenantId, restoredAt: null },
    });
  },

  /** Active hidden master ids for a tenant + type, for list filtering. */
  async activeIdsForType(tenantId: string, masterType: MasterType): Promise<string[]> {
    const rows = await prisma.companyHiddenMaster.findMany({
      where: { tenantId, masterType, restoredAt: null },
      select: { masterId: true },
    });
    return rows.map((row) => row.masterId);
  },
};

export type HideMasterRecordInput = Prisma.CompanyHiddenMasterUncheckedCreateInput;
