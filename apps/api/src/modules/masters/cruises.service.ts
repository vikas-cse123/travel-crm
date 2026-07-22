import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
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
import type { MastersRequestContext } from './airlines.service.js';

/**
 * Cruise Master.
 *
 * Scope follows the reference CRM: a catalogue record (name, description,
 * image) plus its sellable room types. Prices live on the room types, so the
 * costing permissions gate them exactly like hotel room/meal costs.
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
 * `hasImage` is the only signal the client needs about media.
 */
function presentCruise<T extends Record<string, unknown>>(row: T, canViewCosting: boolean) {
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

  const list = Array.isArray(roomTypes) ? (roomTypes as Record<string, unknown>[]) : null;
  const prices = canViewCosting
    ? (list ?? [])
        .map((entry) => num(entry.price as Prisma.Decimal | null))
        .filter((value): value is number => value !== null)
    : [];

  return {
    ...safe,
    hasImage: Boolean(imageObjectKey && row.imageConfirmedAt),
    ...(list
      ? {
          roomTypes: list.map((entry) => presentRoomType(entry, canViewCosting)),
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
 * Load one cruise inside the tenant.
 *
 * A cross-tenant id simply matches nothing and surfaces as a 404, so the API
 * never confirms that another company's record exists.
 */
async function getCruise(auth: AuthContext, cruiseId: string, forManage = false) {
  const canManageCruises = forManage ? true : await canManage(auth);
  const cruise = await prisma.cruise.findFirst({
    where: {
      id: cruiseId,
      companyId: auth.companyId,
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
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageCruises = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.CruiseWhereInput = {
      companyId: auth.companyId,
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
    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
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
        include: canViewCosting
          ? { ...cruiseListInclude, roomTypes: { select: { price: true, status: true } } }
          : cruiseListInclude,
      }),
      prisma.cruise.count({ where }),
    ]);

    return {
      data: rows.map((row) => {
        const record = row as unknown as Record<string, unknown> & {
          _count?: { roomTypes: number };
          roomTypes?: { price: Prisma.Decimal | null; status: MasterStatus }[];
        };
        const prices = (record.roomTypes ?? [])
          .map((entry) => num(entry.price))
          .filter((value): value is number => value !== null);
        const { roomTypes, _count, ...rest } = record;
        void roomTypes;
        return {
          ...presentCruise(rest, canViewCosting),
          roomTypeCount: _count?.roomTypes ?? 0,
          priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
        };
      }),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  /** Lightweight selector feed: active cruises only, id/name plus room types. */
  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const cruises = await prisma.cruise.findMany({
      where: {
        companyId: auth.companyId,
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
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_CRUISES_VIEW_COSTING);
    return presentCruise(
      (await getCruise(auth, cruiseId)) as unknown as Record<string, unknown>,
      canViewCosting,
    );
  },

  async create(auth: AuthContext, input: CruiseInput, context: MastersRequestContext) {
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
          }),
        });
        return created;
      });
      return presentCruise(cruise as unknown as Record<string, unknown>, true);
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
    const current = await getCruise(auth, cruiseId, true);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_CRUISES_MANAGE_COSTING);
    try {
      const cruise = await prisma.$transaction(async (tx) => {
        // The inline editor submits the whole set, so a replace keeps the saved
        // state identical to what the user sees. Omitting the key leaves the
        // existing room types untouched.
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
      return presentCruise(cruise as unknown as Record<string, unknown>, true);
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
    const current = await getCruise(auth, cruiseId, true);
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
      // Restoring from ARCHIVED is its own event so the audit trail shows it.
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
    return presentCruise(cruise as unknown as Record<string, unknown>, true);
  },

  async archive(auth: AuthContext, cruiseId: string, context: MastersRequestContext) {
    const current = await getCruise(auth, cruiseId, true);
    const cruise = await prisma.$transaction(async (tx) => {
      const updated = await tx.cruise.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: cruiseInclude,
      });
      await tx.activityLog.create({ data: audit(auth, 'CRUISE_ARCHIVED', current.id, context) });
      return updated;
    });
    return presentCruise(cruise as unknown as Record<string, unknown>, true);
  },

  async createImageUpload(auth: AuthContext, cruiseId: string, input: CruiseImageUploadInput) {
    const cruise = await getCruise(auth, cruiseId, true);
    const max = env.CRUISE_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Cruise images must be ${env.CRUISE_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    // The key is tenant-scoped, so one company's object path can never collide
    // with or be guessed from another's.
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
    const cruise = await getCruise(auth, cruiseId, true);
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
    // Re-check what actually landed: a presigned URL cannot stop a client
    // uploading something other than the file it declared.
    if (
      metadata.size !== cruise.pendingImageFileSize ||
      metadata.contentType !== cruise.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const oldKey = cruise.imageObjectKey;
    const action = oldKey ? 'CRUISE_IMAGE_REPLACED' : 'CRUISE_IMAGE_UPLOADED';
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.cruise.update({
        where: { id: cruise.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          imageObjectKey: key,
          imageFileName: cruise.pendingImageFileName,
          imageMimeType: cruise.pendingImageMimeType,
          imageFileSize: cruise.pendingImageFileSize,
          imageConfirmedAt: new Date(),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
        include: cruiseInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, action, cruise.id, context, {
          mimeType: row.imageMimeType,
          fileSize: row.imageFileSize,
        }),
      });
      return row;
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return presentCruise(updated as unknown as Record<string, unknown>, true);
  },

  async imageDownload(auth: AuthContext, cruiseId: string) {
    const cruise = await getCruise(auth, cruiseId);
    if (!cruise.imageObjectKey || !cruise.imageFileName || !cruise.imageConfirmedAt)
      throw new NotFoundError('Cruise image not found.');
    return {
      url: await storageService.createDownloadUrl(
        cruise.imageObjectKey,
        cruise.imageFileName,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteImage(auth: AuthContext, cruiseId: string, context: MastersRequestContext) {
    const cruise = await getCruise(auth, cruiseId, true);
    const keys = [cruise.imageObjectKey, cruise.pendingImageObjectKey].filter(
      (value): value is string => Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.cruise.update({
        where: { id: cruise.id },
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
        data: audit(auth, 'CRUISE_IMAGE_DELETED', cruise.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },
};
