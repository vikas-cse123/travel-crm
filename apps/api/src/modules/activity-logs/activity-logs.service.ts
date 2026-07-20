import type { ActivityAction, Prisma } from '@prisma/client';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { resolvePagination } from '../../utils/pagination.js';
import { ACTIVITY_LOG_SELECT } from './activity-logs.repository.js';

function redact(value: Prisma.JsonValue | undefined): Prisma.JsonValue {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/(password|hash|otp|token|cookie|authorization|smtp|secret|requestbody)/i.test(k),
        )
        .map(([k, v]) => [k, redact(v)]),
    );
  return value;
}
export const activityLogsService = {
  async list(
    auth: AuthContext,
    q: {
      page?: number;
      pageSize?: number;
      search?: string;
      actorUserId?: string;
      targetUserId?: string;
      action?: ActivityAction;
      entityType?: string;
      entityId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const p = resolvePagination(q);
    const where: Prisma.ActivityLogWhereInput = {
      companyId: auth.companyId,
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.targetUserId ? { targetUserId: q.targetUserId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.dateFrom || q.dateTo
        ? {
            createdAt: {
              ...(q.dateFrom ? { gte: q.dateFrom } : {}),
              ...(q.dateTo ? { lte: q.dateTo } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { entityType: { contains: q.search, mode: 'insensitive' } },
              { actorUser: { fullName: { contains: q.search, mode: 'insensitive' } } },
              { targetUser: { fullName: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.activityLog.findMany({
        where,
        select: ACTIVITY_LOG_SELECT,
        orderBy: { createdAt: q.sortOrder ?? 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      prisma.activityLog.count({ where }),
    ]);
    return {
      data: data.map((e) => ({
        ...e,
        metadata: redact(e.metadata),
        userAgent: e.userAgent?.slice(0, 120) ?? null,
      })),
      pagination: { ...p, total, totalPages: total ? Math.ceil(total / p.pageSize) : 0 },
    };
  },
};
