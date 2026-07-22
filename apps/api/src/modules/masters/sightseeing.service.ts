import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
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
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
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
function present<T extends Record<string, unknown>>(row: T) {
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
 * Confirm the city is linked to the destination for this tenant, both active.
 *
 * The frontend filters the city dropdown, but that is only a convenience —
 * this is the check that actually holds, and it is scoped by companyId so a
 * cross-tenant destination or city id cannot be smuggled in.
 */
async function validateDestinationCity(companyId: string, destinationId: string, cityId: string) {
  const link = await prisma.destinationCity.findFirst({
    where: {
      companyId,
      destinationId,
      cityId,
      destination: { status: 'ACTIVE', deletedAt: null },
      city: { status: 'ACTIVE', deletedAt: null },
    },
    select: { id: true },
  });
  if (!link)
    throw new ValidationError('The selected city must be linked to the selected destination.');
}

async function getSightseeing(auth: AuthContext, sightseeingId: string, forManage = false) {
  const canManageRows = forManage ? true : await canManage(auth);
  const row = await prisma.sightseeing.findFirst({
    where: {
      id: sightseeingId,
      companyId: auth.companyId,
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
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageRows = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;

    const where: Prisma.SightseeingWhereInput = {
      companyId: auth.companyId,
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

    // Default order mirrors the reference's grouped view: destination, then
    // city, then the manual sequence within that city.
    const [rows, total] = await Promise.all([
      prisma.sightseeing.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy: [
          { destination: { name: 'asc' } },
          { city: { name: 'asc' } },
          { sequence: 'asc' },
          { title: 'asc' },
        ],
        include: sightseeingInclude,
      }),
      prisma.sightseeing.count({ where }),
    ]);

    return {
      data: rows.map((row) => present(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  /**
   * Counts backing the reference's "Summary Statistics" strip.
   * Scoped to the tenant's live rows.
   */
  async summary(auth: AuthContext) {
    const where: Prisma.SightseeingWhereInput = {
      companyId: auth.companyId,
      deletedAt: null,
      status: 'ACTIVE',
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
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const sightseeings = await prisma.sightseeing.findMany({
      where: {
        companyId: auth.companyId,
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
    return present(
      (await getSightseeing(auth, sightseeingId)) as unknown as Record<string, unknown>,
    );
  },

  async create(auth: AuthContext, input: SightseeingInput, context: MastersRequestContext) {
    await validateDestinationCity(auth.companyId, input.destinationId, input.cityId);
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.sightseeing.create({
          data: {
            companyId: auth.companyId,
            destinationId: input.destinationId,
            cityId: input.cityId,
            title: input.title.trim(),
            normalizedTitle: normalizeCustomerName(input.title),
            status: input.status,
            createdById: auth.userId,
            ...writeData(input),
          },
          include: sightseeingInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'SIGHTSEEING_CREATED', created.id, context, {
            destinationId: created.destinationId,
            cityId: created.cityId,
            sequence: created.sequence,
          }),
        });
        return created;
      });
      return present(row as unknown as Record<string, unknown>);
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
    const current = await getSightseeing(auth, sightseeingId, true);
    // Re-validate whenever either side of the pair is touched, using the
    // incoming value where present and the stored one otherwise.
    if (input.destinationId !== undefined || input.cityId !== undefined) {
      await validateDestinationCity(
        auth.companyId,
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
      return present(row as unknown as Record<string, unknown>);
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
    const current = await getSightseeing(auth, sightseeingId, true);
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
    if (!neighbour) return present(current as unknown as Record<string, unknown>);

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
    return present(updated as unknown as Record<string, unknown>);
  },

  async status(
    auth: AuthContext,
    sightseeingId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getSightseeing(auth, sightseeingId, true);
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
    return present(row as unknown as Record<string, unknown>);
  },

  async archive(auth: AuthContext, sightseeingId: string, context: MastersRequestContext) {
    const current = await getSightseeing(auth, sightseeingId, true);
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
    return present(row as unknown as Record<string, unknown>);
  },

  async createImageUpload(
    auth: AuthContext,
    sightseeingId: string,
    input: SightseeingImageUploadInput,
  ) {
    const row = await getSightseeing(auth, sightseeingId, true);
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
    const row = await getSightseeing(auth, sightseeingId, true);
    const key = row.pendingImageObjectKey;
    if (!key || !row.pendingImageFileName || !row.pendingImageMimeType || !row.pendingImageFileSize)
      throw new ValidationError('No sightseeing image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded sightseeing image could not be found.');
    // A presigned URL cannot stop a client uploading something other than what
    // it declared, so re-check what actually landed.
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
    return present(updated as unknown as Record<string, unknown>);
  },

  async imageDownload(auth: AuthContext, sightseeingId: string) {
    const row = await getSightseeing(auth, sightseeingId);
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

  async deleteImage(auth: AuthContext, sightseeingId: string, context: MastersRequestContext) {
    const row = await getSightseeing(auth, sightseeingId, true);
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
};
