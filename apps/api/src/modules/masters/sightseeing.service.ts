import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
  ERROR_CODES,
  MASTER_TYPE,
  PERMISSIONS,
  type SightseeingImageUploadInput,
  type SightseeingInput,
  type SightseeingUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import {
  sightseeingImageObjectKey,
  storageService,
} from '../../services/storage/storage.service.js';
import { normalizeCustomerName } from '../../utils/normalize.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../../utils/pagination.js';
import {
  ConflictDetailsError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  assertCanModifyMaster,
  buildVisibleWhere,
  masterRecordMeta,
  resolveMasterScope,
  type MasterScope,
} from './master-visibility.js';
import type { MastersRequestContext } from './airlines.service.js';

/**
 * Sightseeing Master.
 *
 * Reusable itinerary content (attractions, tours, transfers, activities)
 * grouped by Destination and City. It carries NO pricing — the reference form
 * has no price field — so there are no costing permissions here.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;
const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;

const sightseeingInclude = {
  createdBy: { select: userSelect },
  updatedBy: { select: userSelect },
  destination: { select: { id: true, name: true, countryCode: true, countryName: true } },
  city: { select: { id: true, name: true, airportCode: true } },
} as const;

const num = (value: Prisma.Decimal | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogUncheckedCreateInput['action'],
  entityId: string,
  context: MastersRequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'Sightseeing',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** Strip tenant internals and raw storage keys before anything leaves the API. */
function present<T extends Record<string, unknown>>(row: T, scope: MasterScope) {
  const {
    companyId,
    normalizedTitle,
    deletedAt,
    imageBucket,
    imageObjectKey,
    imageStorageProvider,
    pendingImageObjectKey,
    pendingImageFileName,
    pendingImageMimeType,
    pendingImageFileSize,
    ...safe
  } = row;
  void companyId;
  void normalizedTitle;
  void deletedAt;
  void imageBucket;
  void imageStorageProvider;
  void pendingImageObjectKey;
  void pendingImageFileName;
  void pendingImageMimeType;
  void pendingImageFileSize;
  return {
    ...safe,
    ...masterRecordMeta({ companyId: String(companyId) }, scope),
    estimatedHours: num(safe.estimatedHours as Prisma.Decimal | null),
    hasImage: Boolean(imageObjectKey && row.imageConfirmedAt),
  };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A sightseeing with that title already exists in this city.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_SIGHTSEEING_UPDATE);
}

/**
 * Confirm the city is linked to the destination, both visible to this company.
 */
async function validateDestinationCity(scope: MasterScope, destinationId: string, cityId: string) {
  const link = await prisma.destinationCity.findFirst({
    where: {
      destinationId,
      cityId,
      destination: { ...buildVisibleWhere(scope), status: 'ACTIVE', deletedAt: null },
      city: { ...buildVisibleWhere(scope), status: 'ACTIVE', deletedAt: null },
    },
    select: { id: true },
  });
  if (!link)
    throw new ValidationError('The selected city must be linked to the selected destination.');
}

async function getSightseeing(
  auth: AuthContext,
  sightseeingId: string,
  scope: MasterScope,
  forManage = false,
) {
  const canManageRows = forManage ? true : await canManage(auth);
  const row = await prisma.sightseeing.findFirst({
    where: {
      id: sightseeingId,
      ...buildVisibleWhere(scope),
      ...(canManageRows ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: sightseeingInclude,
  });
  if (!row) throw new NotFoundError('Sightseeing not found.');
  return row;
}

function writeData(input: SightseeingInput | SightseeingUpdateInput) {
  const key = <K extends keyof (SightseeingInput & SightseeingUpdateInput)>(k: K) => k in input;
  return {
    ...(key('title')
      ? { title: input.title!.trim(), normalizedTitle: normalizeCustomerName(input.title!) }
      : {}),
    ...(key('sequence') ? { sequence: input.sequence ?? 1 } : {}),
    ...(key('estimatedHours') ? { estimatedHours: input.estimatedHours ?? null } : {}),
    ...(key('suggestedStartTime')
      ? { suggestedStartTime: blankToNull(input.suggestedStartTime) }
      : {}),
    ...(key('description') ? { description: blankToNull(input.description) } : {}),
    ...(key('remarks') ? { remarks: blankToNull(input.remarks) } : {}),
  };
}

export const sightseeingService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || 10,
    });
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;

    const where: Prisma.SightseeingWhereInput = {
      ...buildVisibleWhere(scope),
      ...(canManageRows
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.destinationId ? { destinationId: String(query.destinationId) } : {}),
      ...(query.cityId ? { cityId: String(query.cityId) } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { city: { name: { contains: search, mode: 'insensitive' } } },
              { destination: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.sightseeing.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy: [
          { destination: { name: 'asc' } },
          { city: { name: 'asc' } },
          { sequence: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        include: sightseeingInclude,
      }),
      prisma.sightseeing.count({ where }),
    ]);

    return {
      data: rows.map((row) => present(row as unknown as Record<string, unknown>, scope)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  /**
   * Counts backing the reference's "Summary Statistics" strip.
   * Scoped to the company's visible rows.
   */
  async summary(auth: AuthContext, query: Record<string, unknown> = {}) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.SightseeingWhereInput = {
      ...buildVisibleWhere(scope),
      ...(canManageRows
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.destinationId ? { destinationId: String(query.destinationId) } : {}),
      ...(query.cityId ? { cityId: String(query.cityId) } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { city: { name: { contains: search, mode: 'insensitive' } } },
              { destination: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [totalAttractions, destinations, cities, withImages] = await Promise.all([
      prisma.sightseeing.count({ where }),
      prisma.sightseeing.findMany({ where, distinct: ['destinationId'], select: { id: true } }),
      prisma.sightseeing.findMany({ where, distinct: ['cityId'], select: { id: true } }),
      prisma.sightseeing.count({ where: { ...where, imageConfirmedAt: { not: null } } }),
    ]);
    return {
      totalAttractions,
      destinations: destinations.length,
      citiesCovered: cities.length,
      withImages,
    };
  },

  /** Lightweight selector feed: active rows only. */
  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const sightseeings = await prisma.sightseeing.findMany({
      where: {
        ...buildVisibleWhere(scope),
        status: 'ACTIVE',
        deletedAt: null,
        ...(query.destinationId ? { destinationId: String(query.destinationId) } : {}),
        ...(query.cityId ? { cityId: String(query.cityId) } : {}),
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ city: { name: 'asc' } }, { sequence: 'asc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        sequence: true,
        estimatedHours: true,
        suggestedStartTime: true,
        destination: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
      },
    });
    return {
      sightseeings: sightseeings.map((row) => ({
        ...row,
        estimatedHours: num(row.estimatedHours),
      })),
    };
  },

  async details(auth: AuthContext, sightseeingId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    return present(
      (await getSightseeing(auth, sightseeingId, scope)) as unknown as Record<string, unknown>,
      scope,
    );
  },

  async create(auth: AuthContext, input: SightseeingInput, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    await validateDestinationCity(scope, input.destinationId, input.cityId);
    // If an archived record with the same unique identity exists, surface a
    // structured error so the create form can offer a restore flow instead of
    // the generic "already exists" message.
    const normalizedTitle = normalizeCustomerName(input.title);
    const archivedDuplicate = await prisma.sightseeing.findFirst({
      where: {
        companyId: auth.companyId,
        cityId: input.cityId,
        normalizedTitle,
        status: 'ARCHIVED',
      },
      select: {
        id: true,
        title: true,
        destinationId: true,
        cityId: true,
        status: true,
        destination: { select: { name: true } },
        city: { select: { name: true } },
      },
    });
    if (archivedDuplicate) {
      throw new ConflictDetailsError(
        ERROR_CODES.SIGHTSEEING_ARCHIVED_DUPLICATE,
        'A sightseeing with that title already exists in this city but is archived. Restore the existing sightseeing instead of creating a duplicate.',
        {
          sightseeingId: archivedDuplicate.id,
          title: archivedDuplicate.title,
          destinationId: archivedDuplicate.destinationId,
          cityId: archivedDuplicate.cityId,
          destinationName: archivedDuplicate.destination.name,
          cityName: archivedDuplicate.city.name,
          status: archivedDuplicate.status,
          canRestore: true,
        },
      );
    }
    try {
      const row = await prisma.$transaction(async (tx) => {
        let sequence = input.sequence ?? 1;
        if (sequence === 1) {
          const max = await tx.sightseeing.aggregate({
            where: {
              companyId: auth.companyId,
              cityId: input.cityId,
              deletedAt: null,
              status: { not: 'ARCHIVED' },
            },
            _max: { sequence: true },
          });
          sequence = (max._max.sequence ?? 0) + 1;
        }
        const created = await tx.sightseeing.create({
          data: {
            companyId: auth.companyId,
            destinationId: input.destinationId,
            cityId: input.cityId,
            title: input.title.trim(),
            normalizedTitle,
            status: input.status,
            deletedAt: input.status === 'ARCHIVED' ? new Date() : null,
            createdById: auth.userId,
            sequence,
            ...writeData({ ...input, sequence }),
          },
          include: sightseeingInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'SIGHTSEEING_CREATED', created.id, context, {
            destinationId: created.destinationId,
            cityId: created.cityId,
            sequence: created.sequence,
            sourceGlobal: scope.isSystemAdmin,
          }),
        });
        return created;
      });
      return present(row as unknown as Record<string, unknown>, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  async update(
    auth: AuthContext,
    sightseeingId: string,
    input: SightseeingUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const current = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(current, scope);
    if (input.destinationId !== undefined || input.cityId !== undefined) {
      await validateDestinationCity(
        scope,
        input.destinationId ?? current.destinationId,
        input.cityId ?? current.cityId,
      );
    }
    try {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.sightseeing.update({
          where: { id: current.id },
          data: {
            ...writeData(input),
            ...(input.destinationId ? { destinationId: input.destinationId } : {}),
            ...(input.cityId ? { cityId: input.cityId } : {}),
            updatedById: auth.userId,
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
          },
          include: sightseeingInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'SIGHTSEEING_UPDATED', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return updated;
      });
      return present(row as unknown as Record<string, unknown>, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  /**
   * Move a row up or down within its city group.
   *
   * Swaps sequence values with the nearest neighbour in the same city so the
   * reference's ↑/↓ buttons work without renumbering the whole group.
   */
  async reorder(
    auth: AuthContext,
    sightseeingId: string,
    direction: 'UP' | 'DOWN',
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const current = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(current, scope);
    const neighbour = await prisma.sightseeing.findFirst({
      where: {
        companyId: auth.companyId,
        cityId: current.cityId,
        deletedAt: null,
        sequence: direction === 'UP' ? { lt: current.sequence } : { gt: current.sequence },
      },
      orderBy: { sequence: direction === 'UP' ? 'desc' : 'asc' },
    });
    // Already at the boundary — a no-op rather than an error, which is what
    // clicking ↑ on the first row should do.
    if (!neighbour) return present(current as unknown as Record<string, unknown>, scope);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.sightseeing.update({
        where: { id: neighbour.id },
        data: { sequence: current.sequence },
      });
      const row = await tx.sightseeing.update({
        where: { id: current.id },
        data: { sequence: neighbour.sequence, updatedById: auth.userId },
        include: sightseeingInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'SIGHTSEEING_REORDERED', current.id, context, {
          direction,
          from: current.sequence,
          to: neighbour.sequence,
        }),
      });
      return row;
    });
    return present(updated as unknown as Record<string, unknown>, scope);
  },

  async status(
    auth: AuthContext,
    sightseeingId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const current = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(current, scope);
    if (current.status === 'ARCHIVED' && status !== 'ARCHIVED') {
      const conflict = await prisma.sightseeing.findFirst({
        where: {
          companyId: auth.companyId,
          cityId: current.cityId,
          normalizedTitle: current.normalizedTitle,
          status: { in: ['ACTIVE', 'INACTIVE'] },
          deletedAt: null,
          id: { not: current.id },
        },
        select: { id: true },
      });
      if (conflict)
        throw new ConflictError(
          'Another sightseeing with this title already exists in this city. The archived record cannot be restored.',
        );
    }
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.sightseeing.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: sightseeingInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'SIGHTSEEING_RESTORED'
          : 'SIGHTSEEING_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, {
          previousStatus: current.status,
          status,
        }),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>, scope);
  },

  async archive(auth: AuthContext, sightseeingId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const current = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(current, scope);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.sightseeing.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: sightseeingInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'SIGHTSEEING_ARCHIVED', current.id, context),
      });
      return updated;
    });
    return present(row as unknown as Record<string, unknown>, scope);
  },

  async createImageUpload(
    auth: AuthContext,
    sightseeingId: string,
    input: SightseeingImageUploadInput,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const row = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(row, scope);
    const max = env.SIGHTSEEING_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Sightseeing images must be ${env.SIGHTSEEING_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = sightseeingImageObjectKey({
      companyId: auth.companyId,
      sightseeingId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = row.pendingImageObjectKey;
    await prisma.sightseeing.update({
      where: { id: row.id },
      data: {
        pendingImageObjectKey: key,
        pendingImageFileName: input.fileName,
        pendingImageMimeType: input.mimeType,
        pendingImageFileSize: input.fileSize,
      },
    });
    if (oldPending && oldPending !== key) await storageService.deleteObject(oldPending);
    return {
      uploadUrl: await storageService.createUploadUrl(
        key,
        input.mimeType,
        input.fileSize,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async confirmImage(auth: AuthContext, sightseeingId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const row = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(row, scope);
    const key = row.pendingImageObjectKey;
    if (!key || !row.pendingImageFileName || !row.pendingImageMimeType || !row.pendingImageFileSize)
      throw new ValidationError('No sightseeing image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded sightseeing image could not be found.');
    if (
      metadata.size !== row.pendingImageFileSize ||
      metadata.contentType !== row.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const oldKey = row.imageObjectKey;
    const action = oldKey ? 'SIGHTSEEING_IMAGE_REPLACED' : 'SIGHTSEEING_IMAGE_UPLOADED';
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.sightseeing.update({
        where: { id: row.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          imageObjectKey: key,
          imageFileName: row.pendingImageFileName,
          imageMimeType: row.pendingImageMimeType,
          imageFileSize: row.pendingImageFileSize,
          imageConfirmedAt: new Date(),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
        include: sightseeingInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, action, row.id, context, {
          mimeType: saved.imageMimeType,
          fileSize: saved.imageFileSize,
        }),
      });
      return saved;
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return present(updated as unknown as Record<string, unknown>, scope);
  },

  async imageDownload(auth: AuthContext, sightseeingId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const row = await getSightseeing(auth, sightseeingId, scope);
    if (!row.imageObjectKey || !row.imageFileName || !row.imageConfirmedAt)
      throw new NotFoundError('Sightseeing image not found.');
    return {
      url: await storageService.createDownloadUrl(
        row.imageObjectKey,
        row.imageFileName,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  /**
   * Batch short-lived display URLs for many sightseeing masters (deduped).
   * Used by the quotation builder so it can render every selected activity's
   * image with a single request instead of N per-activity calls. The returned
   * URLs are transient presigned links and are never persisted.
   */
  async presentations(auth: AuthContext, ids: string[]) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const uniqueIds = [...new Set(ids)].filter(
      (id) => typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id),
    );
    if (!uniqueIds.length) return {};
    const rows = await prisma.sightseeing.findMany({
      where: { id: { in: uniqueIds }, ...buildVisibleWhere(scope), deletedAt: null },
      select: { id: true, imageObjectKey: true, imageFileName: true, imageConfirmedAt: true },
    });
    return Object.fromEntries(
      await Promise.all(
        rows.map(async (row) => {
          let imageUrl: string | null = null;
          if (row.imageObjectKey && row.imageConfirmedAt) {
            try {
              imageUrl = await storageService.createDownloadUrl(
                row.imageObjectKey,
                row.imageFileName ?? 'sightseeing',
                PRESIGN_TTL,
              );
            } catch {
              imageUrl = null;
            }
          }
          return [row.id, { imageUrl }] as const;
        }),
      ),
    );
  },

  async deleteImage(auth: AuthContext, sightseeingId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const row = await getSightseeing(auth, sightseeingId, scope, true);
    assertCanModifyMaster(row, scope);
    const keys = [row.imageObjectKey, row.pendingImageObjectKey].filter((value): value is string =>
      Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.sightseeing.update({
        where: { id: row.id },
        data: {
          imageStorageProvider: null,
          imageBucket: null,
          imageObjectKey: null,
          imageFileName: null,
          imageMimeType: null,
          imageFileSize: null,
          imageConfirmedAt: null,
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'SIGHTSEEING_IMAGE_DELETED', row.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },

  /**
   * Quotation builder dropdown feed — resolves destination/city by name (exact
   * normalised match) and returns active sightseeing records visible to this
   * company, optionally filtered by city. Falls back to all destination
   * records when the city has no match. No pagination; expects fewer than 100
   * rows per destination.
   */
  async activities(
    auth: AuthContext,
    destinationName: string | undefined,
    cityName: string | undefined,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
    const normName = (value: string | undefined) =>
      value
        ?.trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ') || '';

    const destName = normName(destinationName);
    // Destination/city are optional narrowers. When the builder supplies no
    // destination it browses every tenant-visible active sightseeing record so
    // users can search and pick activities from any destination/city. Tenant
    // isolation and active/archive rules are always enforced via
    // buildVisibleWhere/status below.
    const destination = destName
      ? await prisma.destination.findFirst({
          where: {
            ...buildVisibleWhere(scope),
            normalizedName: destName,
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: { id: true, name: true },
        })
      : null;
    if (destName && !destination) return { activities: [], destination: null, city: null };

    const cityNameNorm = normName(cityName);
    let cityId: string | null = null;
    let cityNameResolved: string | null = null;
    if (cityNameNorm && destination) {
      const city = await prisma.city.findFirst({
        where: {
          ...buildVisibleWhere(scope),
          name: { equals: cityNameNorm, mode: 'insensitive' },
          destinationLinks: { some: { destinationId: destination.id } },
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true, name: true },
      });
      if (city) {
        cityId = city.id;
        cityNameResolved = city.name;
      }
    }

    const where: Prisma.SightseeingWhereInput = {
      ...buildVisibleWhere(scope),
      status: 'ACTIVE',
      deletedAt: null,
      ...(destination ? { destinationId: destination.id } : {}),
      ...(cityId ? { cityId } : {}),
    };

    const rows = await prisma.sightseeing.findMany({
      where,
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        sequence: true,
        estimatedHours: true,
        suggestedStartTime: true,
        description: true,
        destination: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
      },
    });

    return {
      destination: destination ? { id: destination.id, name: destination.name } : null,
      city: cityId ? { id: cityId, name: cityNameResolved } : null,
      activities: rows.map((row) => ({
        ...row,
        estimatedHours: num(row.estimatedHours),
      })),
    };
  },
};
