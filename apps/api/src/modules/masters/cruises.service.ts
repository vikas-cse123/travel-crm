import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
  MASTER_TYPE,
  PERMISSIONS,
  type CruiseImageUploadInput,
  type CruiseInput,
  type CruiseRoomTypeInput,
  type CruiseUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { cruiseImageObjectKey, storageService } from '../../services/storage/storage.service.js';
import { normalizeCustomerName } from '../../utils/normalize.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../../utils/pagination.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  assertCanModifyMaster,
  buildVisibleWhere,
  masterRecordMeta,
  resolveMasterScope,
  type MasterScope,
} from './master-visibility.js';
import type { MastersRequestContext } from './airlines.service.js';
import {
  appendMasterImage,
  findMasterImage,
  masterImageWriteData,
  presentMasterImages,
  removeMasterImage,
  reorderMasterImages,
} from './master-images.js';

/**
 * Cruise Master.
 *
 * Scope follows the reference CRM: a catalogue record (name, description,
 * image) plus its sellable room types. Prices live on the room types, so the
 * costing permissions gate them exactly like hotel room/meal costs. Room-type
 * prices on global cruises stay private to the system company.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;
const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;

const cruiseInclude = {
  createdBy: { select: userSelect },
  updatedBy: { select: userSelect },
  roomTypes: { orderBy: { sortOrder: 'asc' as const } },
} as const;

const cruiseListInclude = {
  createdBy: { select: userSelect },
  _count: { select: { roomTypes: true } },
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
    entityType: 'Cruise',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** Strip the price when the caller may not see costing. */
function presentRoomType(row: Record<string, unknown>, canViewCosting: boolean) {
  const { companyId, ...safe } = row;
  void companyId;
  const base: Record<string, unknown> = {
    ...safe,
    price: num(safe.price as Prisma.Decimal | null),
  };
  if (canViewCosting) return base;
  // Commercial values are removed entirely rather than nulled, so a client
  // without costing rights cannot tell a zero price from a hidden one.
  const { price, currency, ...redacted } = base;
  void price;
  void currency;
  return redacted;
}

/**
 * Drop tenant internals and raw storage keys before anything leaves the API.
 * `hasImage` is the only signal the client needs about media. For global
 * cruises viewed by a tenant, costing is always redacted.
 */
function presentCruise<T extends Record<string, unknown>>(
  row: T,
  canViewCosting: boolean,
  scope: MasterScope,
) {
  const {
    companyId,
    normalizedName,
    deletedAt,
    imageBucket,
    imageObjectKey,
    imageStorageProvider,
    pendingImageObjectKey,
    pendingImageFileName,
    pendingImageMimeType,
    pendingImageFileSize,
    roomTypes,
    ...safe
  } = row;
  void companyId;
  void normalizedName;
  void deletedAt;
  void imageBucket;
  void imageStorageProvider;
  void pendingImageObjectKey;
  void pendingImageFileName;
  void pendingImageMimeType;
  void pendingImageFileSize;

  const global = Boolean(scope.systemCompanyId && String(companyId) === scope.systemCompanyId);
  const isTenantViewingGlobal = global && !scope.isSystemAdmin;
  const effectiveCanViewCosting = canViewCosting && !isTenantViewingGlobal;

  const list = Array.isArray(roomTypes) ? (roomTypes as Record<string, unknown>[]) : null;
  const prices = effectiveCanViewCosting
    ? (list ?? [])
        .map((entry) => num(entry.price as Prisma.Decimal | null))
        .filter((value): value is number => value !== null)
    : [];

  return {
    ...safe,
    ...masterRecordMeta({ companyId: String(companyId) }, scope),
    hasImage: Boolean(imageObjectKey && row.imageConfirmedAt),
    images: presentMasterImages(row as unknown as Parameters<typeof presentMasterImages>[0]),
    ...(list
      ? {
          roomTypes: list.map((entry) => presentRoomType(entry, effectiveCanViewCosting)),
          // Drives the reference's "Available" stat and Price Range strip.
          activeRoomTypeCount: list.filter((entry) => entry.status === 'ACTIVE').length,
          priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
        }
      : {}),
  };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A cruise with that name already exists.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_CRUISES_UPDATE);
}

/**
 * Load one cruise within the caller's visibility.
 *
 * A cross-tenant id simply matches nothing and surfaces as a 404, so the API
 * never confirms that another company's record exists.
 */
async function getCruise(
  auth: AuthContext,
  cruiseId: string,
  scope: MasterScope,
  forManage = false,
) {
  const canManageCruises = forManage ? true : await canManage(auth);
  const cruise = await prisma.cruise.findFirst({
    where: {
      id: cruiseId,
      ...buildVisibleWhere(scope),
      ...(canManageCruises ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: cruiseInclude,
  });
  if (!cruise) throw new NotFoundError('Cruise not found.');
  return cruise;
}

function writeData(input: CruiseInput | CruiseUpdateInput) {
  const key = <K extends keyof (CruiseInput & CruiseUpdateInput)>(k: K) => k in input;
  return {
    ...(key('name')
      ? { name: input.name!.trim(), normalizedName: normalizeCustomerName(input.name!) }
      : {}),
    ...(key('description') ? { description: blankToNull(input.description) } : {}),
  };
}

/** Room-type rows for a full replace, preserving the submitted order. */
function roomTypeRows(
  companyId: string,
  roomTypes: CruiseRoomTypeInput[],
  canManageCosting: boolean,
) {
  return roomTypes.map((roomType, index) => ({
    companyId,
    name: roomType.name.trim(),
    description: blankToNull(roomType.description),
    // Without costing rights the price is ignored rather than rejected, so a
    // data-entry user can still rename or reorder room types.
    ...(canManageCosting
      ? { price: roomType.price ?? null, currency: roomType.currency ?? 'INR' }
      : {}),
    status: roomType.status ?? 'ACTIVE',
    sortOrder: roomType.sortOrder ?? index,
  }));
}

export const cruisesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || 10,
    });
    const canManageCruises = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.CruiseWhereInput = {
      ...buildVisibleWhere(scope),
      ...(canManageCruises
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { roomTypes: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const order = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortBy = String(query.sortBy ?? 'createdAt');
    const orderBy: Prisma.CruiseOrderByWithRelationInput =
      sortBy === 'createdAt'
        ? { createdAt: order }
        : sortBy === 'updatedAt'
          ? { updatedAt: order }
          : { name: order };

    const canViewCosting = await has(auth, PERMISSIONS.MASTER_CRUISES_VIEW_COSTING);
    const [rows, total] = await Promise.all([
      prisma.cruise.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: { ...cruiseListInclude, roomTypes: { orderBy: { sortOrder: 'asc' as const } } },
      }),
      prisma.cruise.count({ where }),
    ]);

    return {
      data: rows.map((row) => {
        const record = row as unknown as Record<string, unknown> & {
          _count?: { roomTypes: number };
        };
        const { _count, ...rest } = record;
        return {
          ...presentCruise(rest, canViewCosting, scope),
          roomTypeCount: _count?.roomTypes ?? 0,
        };
      }),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  /** Lightweight selector feed: active cruises only, id/name plus room types. */
  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const cruises = await prisma.cruise.findMany({
      where: {
        ...buildVisibleWhere(scope),
        status: 'ACTIVE',
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        roomTypes: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
    return { cruises };
  },

  async details(auth: AuthContext, cruiseId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_CRUISES_VIEW_COSTING);
    return presentCruise(
      (await getCruise(auth, cruiseId, scope)) as unknown as Record<string, unknown>,
      canViewCosting,
      scope,
    );
  },

  async create(auth: AuthContext, input: CruiseInput, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_CRUISES_MANAGE_COSTING);
    try {
      const cruise = await prisma.$transaction(async (tx) => {
        const created = await tx.cruise.create({
          data: {
            companyId: auth.companyId,
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            status: input.status,
            createdById: auth.userId,
            ...writeData(input),
            ...(input.roomTypes?.length
              ? {
                  roomTypes: {
                    create: roomTypeRows(auth.companyId, input.roomTypes, canManageCosting),
                  },
                }
              : {}),
          },
          include: cruiseInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'CRUISE_CREATED', created.id, context, {
            roomTypeCount: created.roomTypes.length,
            sourceGlobal: scope.isSystemAdmin,
          }),
        });
        return created;
      });
      return presentCruise(cruise as unknown as Record<string, unknown>, true, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  async update(
    auth: AuthContext,
    cruiseId: string,
    input: CruiseUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const current = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(current, scope);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_CRUISES_MANAGE_COSTING);
    try {
      const cruise = await prisma.$transaction(async (tx) => {
        if (input.roomTypes) {
          await tx.cruiseRoomType.deleteMany({ where: { cruiseId: current.id } });
          if (input.roomTypes.length) {
            await tx.cruiseRoomType.createMany({
              data: roomTypeRows(auth.companyId, input.roomTypes, canManageCosting).map((row) => ({
                ...row,
                cruiseId: current.id,
              })),
            });
          }
        }
        const updated = await tx.cruise.update({
          where: { id: current.id },
          data: {
            ...writeData(input),
            updatedById: auth.userId,
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
          },
          include: cruiseInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'CRUISE_UPDATED', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return updated;
      });
      return presentCruise(cruise as unknown as Record<string, unknown>, true, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  async status(
    auth: AuthContext,
    cruiseId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const current = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(current, scope);
    const cruise = await prisma.$transaction(async (tx) => {
      const updated = await tx.cruise.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: cruiseInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'CRUISE_RESTORED'
          : 'CRUISE_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, {
          previousStatus: current.status,
          status,
        }),
      });
      return updated;
    });
    return presentCruise(cruise as unknown as Record<string, unknown>, true, scope);
  },

  async archive(auth: AuthContext, cruiseId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const current = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(current, scope);
    const cruise = await prisma.$transaction(async (tx) => {
      const updated = await tx.cruise.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: cruiseInclude,
      });
      await tx.activityLog.create({ data: audit(auth, 'CRUISE_ARCHIVED', current.id, context) });
      return updated;
    });
    return presentCruise(cruise as unknown as Record<string, unknown>, true, scope);
  },

  async createImageUpload(auth: AuthContext, cruiseId: string, input: CruiseImageUploadInput) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const cruise = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(cruise, scope);
    const max = env.CRUISE_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Cruise images must be ${env.CRUISE_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = cruiseImageObjectKey({
      companyId: auth.companyId,
      cruiseId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = cruise.pendingImageObjectKey;
    await prisma.cruise.update({
      where: { id: cruise.id },
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

  async confirmImage(auth: AuthContext, cruiseId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const cruise = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(cruise, scope);
    const key = cruise.pendingImageObjectKey;
    if (
      !key ||
      !cruise.pendingImageFileName ||
      !cruise.pendingImageMimeType ||
      !cruise.pendingImageFileSize
    )
      throw new ValidationError('No cruise image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded cruise image could not be found.');
    if (
      metadata.size !== cruise.pendingImageFileSize ||
      metadata.contentType !== cruise.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const confirmedAt = new Date();
    const images = appendMasterImage(
      cruise,
      {
        objectKey: key,
        fileName: cruise.pendingImageFileName,
        mimeType: cruise.pendingImageMimeType,
        fileSize: cruise.pendingImageFileSize,
      },
      confirmedAt,
    );
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.cruise.update({
        where: { id: cruise.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          ...masterImageWriteData(images),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
        include: cruiseInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'CRUISE_IMAGE_UPLOADED', cruise.id, context, {
          imageId: images.at(-1)!.id,
          mimeType: cruise.pendingImageMimeType,
          fileSize: cruise.pendingImageFileSize,
        }),
      });
      return row;
    });
    return presentCruise(updated as unknown as Record<string, unknown>, true, scope);
  },

  async imageDownload(auth: AuthContext, cruiseId: string, imageId?: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const cruise = await getCruise(auth, cruiseId, scope);
    const image = findMasterImage(cruise, imageId);
    if (!image) throw new NotFoundError('Cruise image not found.');
    return {
      url: await storageService.createDownloadUrl(image.objectKey, image.fileName, PRESIGN_TTL),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteImage(
    auth: AuthContext,
    cruiseId: string,
    context: MastersRequestContext,
    imageId?: string,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const cruise = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(cruise, scope);
    const removed = removeMasterImage(cruise, imageId);
    if (!removed) throw new NotFoundError('Cruise image not found.');
    await prisma.$transaction(async (tx) => {
      await tx.cruise.update({
        where: { id: cruise.id },
        data: {
          ...masterImageWriteData(removed.images),
          imageStorageProvider: removed.images.length ? cruise.imageStorageProvider : null,
          imageBucket: removed.images.length ? cruise.imageBucket : null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'CRUISE_IMAGE_DELETED', cruise.id, context, {
          imageId: removed.target.id,
          remainingImageCount: removed.images.length,
        }),
      });
    });
    return { deleted: true };
  },
  async reorderImages(
    auth: AuthContext,
    cruiseId: string,
    imageIds: string[],
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.CRUISE);
    const cruise = await getCruise(auth, cruiseId, scope, true);
    assertCanModifyMaster(cruise, scope);
    const images = reorderMasterImages(cruise, imageIds);
    if (!images) throw new ValidationError('Image order must contain every current image once.');
    await prisma.$transaction(async (tx) => {
      await tx.cruise.update({
        where: { id: cruise.id },
        data: masterImageWriteData(images),
      });
      await tx.activityLog.create({
        data: audit(auth, 'CRUISE_UPDATED', cruise.id, context, {
          change: 'IMAGE_ORDER',
          imageIds,
        }),
      });
    });
    return this.details(auth, cruiseId);
  },
};
