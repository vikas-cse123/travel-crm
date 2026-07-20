import type { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { tenantWhere, type TenantContext } from '../../db/tenant.js';
import {
  buildPaginationMeta,
  toPrismaPagination,
  type PaginationParams,
} from '../../utils/pagination.js';

/**
 * Tenant-scoped access to the audit trail.
 *
 * The table is append-only by convention: there is no update or delete here,
 * because an audit log an operator can edit is not an audit log.
 */

export const ACTIVITY_LOG_SELECT = {
  id: true,
  companyId: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
  actorUser: { select: { id: true, fullName: true, username: true } },
  targetUser: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.ActivityLogSelect;

export type ActivityLogEntry = Prisma.ActivityLogGetPayload<{
  select: typeof ACTIVITY_LOG_SELECT;
}>;

export interface ActivityLogFilters {
  actorUserId?: string | undefined;
  action?: ActivityAction | undefined;
  entityType?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

/** Fields recorded for an event. Callers pass only non-sensitive metadata. */
export interface RecordActivityInput {
  actorUserId?: string | null | undefined;
  targetUserId?: string | null | undefined;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
}

export const activityLogsRepository = {
  /**
   * Append an event.
   *
   * `client` accepts a transaction handle so an audit row can be written in
   * the same transaction as the change it describes — either both land or
   * neither does.
   */
  async record(
    tenant: TenantContext,
    input: RecordActivityInput,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<void> {
    await client.activityLog.create({
      data: {
        companyId: tenant.companyId,
        actorUserId: input.actorUserId ?? null,
        targetUserId: input.targetUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  },

  /** Page through the company's audit trail, newest first. */
  async list(tenant: TenantContext, filters: ActivityLogFilters, pagination: PaginationParams) {
    const where: Prisma.ActivityLogWhereInput = tenantWhere(tenant);

    if (filters.actorUserId) where.actorUserId = filters.actorUserId;
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const { skip, take } = toPrismaPagination(pagination);

    const [data, total] = await prisma.$transaction([
      prisma.activityLog.findMany({
        where,
        select: ACTIVITY_LOG_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return { data, pagination: buildPaginationMeta(pagination, total) };
  },

  /** Most recent events, for the dashboard panel. */
  async listRecent(tenant: TenantContext, limit = 10): Promise<ActivityLogEntry[]> {
    return prisma.activityLog.findMany({
      where: tenantWhere(tenant),
      select: ACTIVITY_LOG_SELECT,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 50),
    });
  },

  async count(tenant: TenantContext): Promise<number> {
    return prisma.activityLog.count({ where: tenantWhere(tenant) });
  },
};
