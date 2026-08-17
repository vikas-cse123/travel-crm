import { prisma } from '../../config/prisma.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { ROLE_NAME } from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import type {
  SearchApiUsageStatus,
  SearchApiUsageSummary,
  SearchApiUsageType,
  SearchApiUsageUserDetail,
  SearchUsageRange,
} from '@interscale/shared';
import { maskKey } from './search-keys.service.js';

/**
 * SearchAPI.io usage accounting.
 *
 * A `SearchApiUsage` row is written ONLY when the backend actually sends a
 * request to SearchAPI.io — never for frontend actions, bookmarks or cached
 * views. One logical search can legitimately produce several rows when keys
 * rotate (e.g. Key 1 exhausted → Key 2 success = two rows), which is exactly
 * what the Owner dashboard counts.
 *
 * The dashboard is Owner-only and always scoped to `auth.companyId`, so a
 * tenant never sees another company's usage and a non-Owner is rejected by the
 * backend regardless of what the UI hides.
 */

export interface UsageRecordInput {
  type: SearchApiUsageType;
  engine: string;
  status: SearchApiUsageStatus;
  isFallbackAttempt: boolean;
  /** Id of the saved key used, or null for the server/legacy fallback. */
  searchApiKeyId: string | null;
  /** Last four characters of the key used. Never the full key. */
  maskedKeySuffix: string | null;
}

/** Record one actual outbound provider request. */
export async function recordSearchApiUsage(
  auth: AuthContext,
  input: UsageRecordInput,
): Promise<void> {
  await prisma.searchApiUsage.create({
    data: {
      companyId: auth.companyId,
      userId: auth.userId,
      searchApiKeyId: input.searchApiKeyId,
      type: input.type,
      engine: input.engine,
      status: input.status,
      isFallbackAttempt: input.isFallbackAttempt,
      maskedKeySuffix: input.maskedKeySuffix,
    },
  });
}

/** Only the company Owner may read SearchAPI usage. */
export async function assertSearchOwner(auth: AuthContext): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { companyId: true, role: { select: { name: true } } },
  });
  if (!user || user.companyId !== auth.companyId || user.role.name !== ROLE_NAME.OWNER) {
    throw new ForbiddenError('Only the company Owner can view SearchAPI usage.');
  }
}

const startOfDay = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const endOfDay = (date: string): Date => new Date(`${date}T23:59:59.999Z`);
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Normalise an inclusive YYYY-MM-DD range. Defaults to the current calendar
 * month when no range is supplied (matching the dashboard's default filter).
 */
export function parseUsageRange(range: SearchUsageRange): { from: Date; to: Date } {
  const today = new Date();
  const todayIso = isoDay(today);
  const fromIso =
    range.from ??
    (range.to ? range.to : isoDay(new Date(today.getFullYear(), today.getMonth(), 1)));
  const toIso = range.to ?? todayIso;
  return { from: startOfDay(fromIso), to: endOfDay(toIso) };
}

interface TypeCounts {
  flights: number;
  hotels: number;
  autocomplete: number;
  total: number;
}

function addGroupedTypeCounts(target: TypeCounts, type: string, count: number): void {
  target.total += count;
  if (type === 'FLIGHT') target.flights += count;
  else if (type === 'HOTEL') target.hotels += count;
  else if (type === 'AUTOCOMPLETE') target.autocomplete += count;
}

/** Aggregated company-wide usage for the Owner dashboard. */
export async function searchUsageSummary(
  auth: AuthContext,
  range: SearchUsageRange,
): Promise<SearchApiUsageSummary> {
  await assertSearchOwner(auth);
  const { from, to } = parseUsageRange(range);
  const where = { companyId: auth.companyId, createdAt: { gte: from, lte: to } };

  const grouped = await prisma.searchApiUsage.groupBy({
    by: ['type', 'status'],
    where,
    _count: { _all: true },
  });

  let total = 0;
  let flights = 0;
  let hotels = 0;
  let autocomplete = 0;
  let successful = 0;
  let failed = 0;
  for (const row of grouped) {
    const count = row._count._all;
    total += count;
    if (row.type === 'FLIGHT') flights += count;
    else if (row.type === 'HOTEL') hotels += count;
    else if (row.type === 'AUTOCOMPLETE') autocomplete += count;
    if (row.status === 'SUCCESS') successful += count;
    else failed += count;
  }

  // Per-user totals.
  const byUserGrouped = await prisma.searchApiUsage.groupBy({
    by: ['userId', 'type'],
    where,
    _count: { _all: true },
  });
  const userIds = [...new Set(byUserGrouped.map((row) => row.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, companyId: auth.companyId },
        select: { id: true, fullName: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));
  const userCounts = new Map<string, TypeCounts>();
  for (const row of byUserGrouped) {
    const entry = userCounts.get(row.userId) ?? {
      flights: 0,
      hotels: 0,
      autocomplete: 0,
      total: 0,
    };
    addGroupedTypeCounts(entry, row.type, row._count._all);
    userCounts.set(row.userId, entry);
  }
  const byUser = [...userCounts.entries()]
    .map(([userId, counts]) => {
      const user = userMap.get(userId);
      return {
        userId,
        name: user?.fullName ?? 'Unknown user',
        email: user?.email ?? '',
        flights: counts.flights,
        hotels: counts.hotels,
        autocomplete: counts.autocomplete,
        total: counts.total,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Daily totals (bucketed in UTC).
  const dailyRows = await prisma.$queryRaw<Array<{ day: Date; type: string; count: number }>>`
    SELECT date_trunc('day', "createdAt") AS day, "type", COUNT(*)::int AS count
    FROM "search_api_usage"
    WHERE "companyId" = ${auth.companyId}::uuid AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY date_trunc('day', "createdAt"), "type"
    ORDER BY day ASC`;
  const dailyMap = new Map<string, TypeCounts>();
  for (const row of dailyRows) {
    const key = isoDay(new Date(row.day));
    const entry = dailyMap.get(key) ?? { flights: 0, hotels: 0, autocomplete: 0, total: 0 };
    addGroupedTypeCounts(entry, row.type, row.count);
    dailyMap.set(key, entry);
  }
  const daily = [...dailyMap.entries()].map(([date, counts]) => ({ date, ...counts }));

  // Per-key totals (masked only).
  const byKeyGrouped = await prisma.searchApiUsage.groupBy({
    by: ['searchApiKeyId', 'maskedKeySuffix'],
    where,
    _count: { _all: true },
  });
  const keyIds = [
    ...new Set(
      byKeyGrouped.map((row) => row.searchApiKeyId).filter((id): id is string => id !== null),
    ),
  ];
  const keys = keyIds.length
    ? await prisma.searchApiKey.findMany({
        where: { id: { in: keyIds }, companyId: auth.companyId },
        select: { id: true, maskedSuffix: true, status: true },
      })
    : [];
  const keyMap = new Map(keys.map((key) => [key.id, key]));
  const byKey = byKeyGrouped
    .map((row) => {
      const key = row.searchApiKeyId ? keyMap.get(row.searchApiKeyId) : undefined;
      const suffix = key?.maskedSuffix ?? row.maskedKeySuffix ?? 'fallback';
      return {
        maskedKey: maskKey(suffix),
        requests: row._count._all,
        status: key?.status ?? 'ACTIVE',
      };
    })
    .sort((a, b) => b.requests - a.requests);

  return {
    range: { from: isoDay(from), to: isoDay(to) },
    totals: { total, flights, hotels, autocomplete, successful, failed },
    byService: [
      { label: 'Flights', value: flights },
      { label: 'Hotels', value: hotels },
      { label: 'Autocomplete', value: autocomplete },
    ],
    byUser,
    daily,
    byKey,
  };
}

/** Per-user usage detail: totals plus the most recent provider requests. */
export async function searchUsageUserDetail(
  auth: AuthContext,
  userId: string,
  range: SearchUsageRange,
  limit = 20,
): Promise<SearchApiUsageUserDetail> {
  await assertSearchOwner(auth);

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: auth.companyId },
    select: { id: true, fullName: true, email: true },
  });
  if (!user) throw new NotFoundError('User not found in this company.');

  const { from, to } = parseUsageRange(range);
  const where = { companyId: auth.companyId, userId, createdAt: { gte: from, lte: to } };

  const grouped = await prisma.searchApiUsage.groupBy({
    by: ['type', 'status'],
    where,
    _count: { _all: true },
  });
  const counts: TypeCounts = { flights: 0, hotels: 0, autocomplete: 0, total: 0 };
  let successful = 0;
  let failed = 0;
  for (const row of grouped) {
    addGroupedTypeCounts(counts, row.type, row._count._all);
    if (row.status === 'SUCCESS') successful += row._count._all;
    else failed += row._count._all;
  }

  const recentRows = await prisma.searchApiUsage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      type: true,
      status: true,
      isFallbackAttempt: true,
      maskedKeySuffix: true,
      createdAt: true,
    },
  });
  const hasMore = recentRows.length > limit;
  const recent = recentRows.slice(0, limit).map((row) => ({
    id: row.id,
    type: row.type as SearchApiUsageType,
    status: row.status as SearchApiUsageStatus,
    isFallbackAttempt: row.isFallbackAttempt,
    maskedKeySuffix: row.maskedKeySuffix,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    userId: user.id,
    name: user.fullName,
    email: user.email,
    totals: { ...counts, successful, failed },
    recent,
    hasMore,
  };
}
