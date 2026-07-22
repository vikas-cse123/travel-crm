import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
  PERMISSIONS,
  type VehicleImageUploadInput,
  type VehicleInput,
  type VehicleUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { storageService, vehicleImageObjectKey } from '../../services/storage/storage.service.js';
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
 * Vehicle Master.
 *
 * A catalogue of vehicle categories used for transfers and sightseeing — name,
 * free-text type, seating capacity and an image. Deliberately NOT fleet
 * management: no drivers, registrations, maintenance, GPS or scheduling.
 * The module exposes no commercial fields, so it has no costing permissions.
 */

const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;
const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;

const vehicleInclude = {
  createdBy: { select: userSelect },
  updatedBy: { select: userSelect },
} as const;

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
    entityType: 'Vehicle',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** Drop tenant internals and raw storage keys before the row leaves the API. */
function presentVehicle<T extends Record<string, unknown>>(row: T) {
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
  return { ...safe, hasImage: Boolean(imageObjectKey && row.imageConfirmedAt) };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A vehicle with that name already exists.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_VEHICLES_UPDATE);
}

/**
 * Load one vehicle inside the tenant. A cross-tenant id matches nothing and
 * surfaces as a 404, so record existence never leaks across companies.
 */
async function getVehicle(auth: AuthContext, vehicleId: string, forManage = false) {
  const canManageVehicles = forManage ? true : await canManage(auth);
  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: vehicleId,
      companyId: auth.companyId,
      ...(canManageVehicles ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: vehicleInclude,
  });
  if (!vehicle) throw new NotFoundError('Vehicle not found.');
  return vehicle;
}

function writeData(input: VehicleInput | VehicleUpdateInput) {
  const key = <K extends keyof (VehicleInput & VehicleUpdateInput)>(k: K) => k in input;
  return {
    ...(key('name')
      ? { name: input.name!.trim(), normalizedName: normalizeCustomerName(input.name!) }
      : {}),
    ...(key('vehicleType') ? { vehicleType: input.vehicleType!.trim() } : {}),
    ...(key('capacity') ? { capacity: input.capacity ?? null } : {}),
    ...(key('description') ? { description: blankToNull(input.description) } : {}),
  };
}

export const vehiclesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageVehicles = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const vehicleType = typeof query.vehicleType === 'string' ? query.vehicleType.trim() : '';
    const where: Prisma.VehicleWhereInput = {
      companyId: auth.companyId,
      ...(canManageVehicles
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(vehicleType ? { vehicleType: { equals: vehicleType, mode: 'insensitive' } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { vehicleType: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
    const orderBy: Prisma.VehicleOrderByWithRelationInput =
      sortBy === 'createdAt'
        ? { createdAt: order }
        : sortBy === 'updatedAt'
          ? { updatedAt: order }
          : sortBy === 'capacity'
            ? { capacity: order }
            : { name: order };

    const [rows, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: vehicleInclude,
      }),
      prisma.vehicle.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentVehicle(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  /**
   * Distinct vehicle types this tenant actually uses.
   *
   * The reference list filter is a dropdown even though the field is free
   * text, so the options have to come from stored data rather than an enum.
   */
  async types(auth: AuthContext) {
    const rows = await prisma.vehicle.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      distinct: ['vehicleType'],
      orderBy: { vehicleType: 'asc' },
      select: { vehicleType: true },
    });
    return { vehicleTypes: rows.map((row) => row.vehicleType) };
  },

  /** Lightweight selector feed: active vehicles only. */
  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const vehicles = await prisma.vehicle.findMany({
      where: {
        companyId: auth.companyId,
        status: 'ACTIVE',
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { vehicleType: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, vehicleType: true, capacity: true },
    });
    return { vehicles };
  },

  async details(auth: AuthContext, vehicleId: string) {
    return presentVehicle(
      (await getVehicle(auth, vehicleId)) as unknown as Record<string, unknown>,
    );
  },

  async create(auth: AuthContext, input: VehicleInput, context: MastersRequestContext) {
    try {
      const vehicle = await prisma.$transaction(async (tx) => {
        const created = await tx.vehicle.create({
          data: {
            companyId: auth.companyId,
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            vehicleType: input.vehicleType.trim(),
            status: input.status,
            createdById: auth.userId,
            ...writeData(input),
          },
          include: vehicleInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'VEHICLE_CREATED', created.id, context, {
            vehicleType: created.vehicleType,
            capacity: created.capacity,
          }),
        });
        return created;
      });
      return presentVehicle(vehicle as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error);
    }
  },

  async update(
    auth: AuthContext,
    vehicleId: string,
    input: VehicleUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getVehicle(auth, vehicleId, true);
    try {
      const vehicle = await prisma.$transaction(async (tx) => {
        const updated = await tx.vehicle.update({
          where: { id: current.id },
          data: {
            ...writeData(input),
            updatedById: auth.userId,
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
          },
          include: vehicleInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'VEHICLE_UPDATED', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return updated;
      });
      return presentVehicle(vehicle as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error);
    }
  },

  async status(
    auth: AuthContext,
    vehicleId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getVehicle(auth, vehicleId, true);
    const vehicle = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: current.id },
        data: {
          status,
          updatedById: auth.userId,
          deletedAt: status === 'ARCHIVED' ? new Date() : null,
        },
        include: vehicleInclude,
      });
      const action =
        current.status === 'ARCHIVED' && status !== 'ARCHIVED'
          ? 'VEHICLE_RESTORED'
          : 'VEHICLE_STATUS_CHANGED';
      await tx.activityLog.create({
        data: audit(auth, action, current.id, context, {
          previousStatus: current.status,
          status,
        }),
      });
      return updated;
    });
    return presentVehicle(vehicle as unknown as Record<string, unknown>);
  },

  async archive(auth: AuthContext, vehicleId: string, context: MastersRequestContext) {
    const current = await getVehicle(auth, vehicleId, true);
    const vehicle = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date(), updatedById: auth.userId },
        include: vehicleInclude,
      });
      await tx.activityLog.create({ data: audit(auth, 'VEHICLE_ARCHIVED', current.id, context) });
      return updated;
    });
    return presentVehicle(vehicle as unknown as Record<string, unknown>);
  },

  async createImageUpload(auth: AuthContext, vehicleId: string, input: VehicleImageUploadInput) {
    const vehicle = await getVehicle(auth, vehicleId, true);
    const max = env.VEHICLE_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Vehicle images must be ${env.VEHICLE_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = vehicleImageObjectKey({
      companyId: auth.companyId,
      vehicleId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = vehicle.pendingImageObjectKey;
    await prisma.vehicle.update({
      where: { id: vehicle.id },
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

  async confirmImage(auth: AuthContext, vehicleId: string, context: MastersRequestContext) {
    const vehicle = await getVehicle(auth, vehicleId, true);
    const key = vehicle.pendingImageObjectKey;
    if (
      !key ||
      !vehicle.pendingImageFileName ||
      !vehicle.pendingImageMimeType ||
      !vehicle.pendingImageFileSize
    )
      throw new ValidationError('No vehicle image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded vehicle image could not be found.');
    if (
      metadata.size !== vehicle.pendingImageFileSize ||
      metadata.contentType !== vehicle.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const oldKey = vehicle.imageObjectKey;
    const action = oldKey ? 'VEHICLE_IMAGE_REPLACED' : 'VEHICLE_IMAGE_UPLOADED';
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          imageObjectKey: key,
          imageFileName: vehicle.pendingImageFileName,
          imageMimeType: vehicle.pendingImageMimeType,
          imageFileSize: vehicle.pendingImageFileSize,
          imageConfirmedAt: new Date(),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
        include: vehicleInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, action, vehicle.id, context, {
          mimeType: row.imageMimeType,
          fileSize: row.imageFileSize,
        }),
      });
      return row;
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return presentVehicle(updated as unknown as Record<string, unknown>);
  },

  async imageDownload(auth: AuthContext, vehicleId: string) {
    const vehicle = await getVehicle(auth, vehicleId);
    if (!vehicle.imageObjectKey || !vehicle.imageFileName || !vehicle.imageConfirmedAt)
      throw new NotFoundError('Vehicle image not found.');
    return {
      url: await storageService.createDownloadUrl(
        vehicle.imageObjectKey,
        vehicle.imageFileName,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteImage(auth: AuthContext, vehicleId: string, context: MastersRequestContext) {
    const vehicle = await getVehicle(auth, vehicleId, true);
    const keys = [vehicle.imageObjectKey, vehicle.pendingImageObjectKey].filter(
      (value): value is string => Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicle.id },
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
        data: audit(auth, 'VEHICLE_IMAGE_DELETED', vehicle.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },
};
