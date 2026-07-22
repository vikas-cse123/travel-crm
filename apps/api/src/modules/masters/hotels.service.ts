import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
  PERMISSIONS,
  type HotelInput,
  type HotelImageUploadInput,
  type HotelMealPlanInput,
  type HotelMealPlanUpdateInput,
  type HotelRoomTypeInput,
  type HotelRoomTypeUpdateInput,
  type HotelUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { hotelImageObjectKey, storageService } from '../../services/storage/storage.service.js';
import { normalizeCustomerName } from '../../utils/normalize.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../../utils/pagination.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { permissionsService } from '../auth/permissions.service.js';
import { sanitizeRichText } from './masters.service.js';

export type MastersRequestContext = { ipAddress: string | null; userAgent: string | null };

type HotelEntity = 'Hotel' | 'HotelRoomType' | 'HotelMealPlan';
const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogUncheckedCreateInput['action'],
  entityType: HotelEntity,
  entityId: string,
  context: MastersRequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType,
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

const num = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;
const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;

const hotelDetailInclude = {
  createdBy: { select: userSelect },
  destination: { select: { id: true, name: true, countryCode: true, countryName: true } },
  city: { select: { id: true, name: true, airportCode: true } },
  roomTypes: { orderBy: { sortOrder: 'asc' as const } },
  mealPlans: { orderBy: { sortOrder: 'asc' as const } },
} as const;

const hotelListInclude = {
  createdBy: { select: userSelect },
  destination: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  _count: { select: { roomTypes: true, mealPlans: true } },
} as const;

function presentRoomType(row: Record<string, unknown>, canViewCosting: boolean) {
  const { companyId, ...safe } = row;
  void companyId;
  const base = {
    ...safe,
    baseCost: num(safe.baseCost as Prisma.Decimal | null),
    sellingPrice: num(safe.sellingPrice as Prisma.Decimal | null),
    taxPercentage: num(safe.taxPercentage as Prisma.Decimal | null),
  };
  if (canViewCosting) return base;
  const { baseCost, sellingPrice, taxPercentage, ...redacted } = base;
  void baseCost;
  void sellingPrice;
  void taxPercentage;
  return redacted;
}

function presentMealPlan(row: Record<string, unknown>, canViewCosting: boolean) {
  const { companyId, ...safe } = row;
  void companyId;
  const base = {
    ...safe,
    baseCost: num(safe.baseCost as Prisma.Decimal | null),
    sellingPrice: num(safe.sellingPrice as Prisma.Decimal | null),
  };
  if (canViewCosting) return base;
  const { baseCost, sellingPrice, ...redacted } = base;
  void baseCost;
  void sellingPrice;
  return redacted;
}

function presentHotel(row: Record<string, unknown>, canViewCosting: boolean) {
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
    mealPlans,
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
  return {
    ...safe,
    starRating: num(safe.starRating as Prisma.Decimal | null),
    latitude: num(safe.latitude as Prisma.Decimal | null),
    longitude: num(safe.longitude as Prisma.Decimal | null),
    hasImage: Boolean(imageObjectKey && row.imageConfirmedAt),
    ...(Array.isArray(roomTypes)
      ? {
          roomTypes: roomTypes.map((r) =>
            presentRoomType(r as Record<string, unknown>, canViewCosting),
          ),
        }
      : {}),
    ...(Array.isArray(mealPlans)
      ? {
          mealPlans: mealPlans.map((m) =>
            presentMealPlan(m as Record<string, unknown>, canViewCosting),
          ),
        }
      : {}),
  };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A hotel with that name already exists in this city.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_HOTELS_UPDATE);
}

async function getHotel(auth: AuthContext, hotelId: string, forManage = false) {
  const canManageHotels = forManage ? true : await canManage(auth);
  const hotel = await prisma.hotel.findFirst({
    where: {
      id: hotelId,
      companyId: auth.companyId,
      ...(canManageHotels ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: hotelDetailInclude,
  });
  if (!hotel) throw new NotFoundError('Hotel not found.');
  return hotel;
}

/** Confirm the city is linked to the destination for this tenant, both active. */
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

function hotelWriteData(input: HotelInput | HotelUpdateInput, canManageCosting: boolean) {
  void canManageCosting; // hotels carry no direct cost fields; costing lives on room types / meal plans
  const key = <K extends keyof (HotelInput & HotelUpdateInput)>(k: K) => k in input;
  return {
    ...(key('name')
      ? { name: input.name!.trim(), normalizedName: normalizeCustomerName(input.name!) }
      : {}),
    ...(key('starCategory') ? { starCategory: input.starCategory ?? null } : {}),
    ...(key('starRating') ? { starRating: input.starRating ?? null } : {}),
    ...(key('propertyType') ? { propertyType: blankToNull(input.propertyType) } : {}),
    ...(key('address') ? { address: blankToNull(input.address) } : {}),
    ...(key('landmark') ? { landmark: blankToNull(input.landmark) } : {}),
    ...(key('postalCode') ? { postalCode: blankToNull(input.postalCode) } : {}),
    ...(key('latitude') ? { latitude: input.latitude ?? null } : {}),
    ...(key('longitude') ? { longitude: input.longitude ?? null } : {}),
    ...(key('contactName') ? { contactName: blankToNull(input.contactName) } : {}),
    ...(key('phone') ? { phone: blankToNull(input.phone) } : {}),
    ...(key('email') ? { email: blankToNull(input.email) } : {}),
    ...(key('website') ? { website: blankToNull(input.website) } : {}),
    ...(key('reviewLink') ? { reviewLink: blankToNull(input.reviewLink) } : {}),
    ...(key('checkInTime') ? { checkInTime: blankToNull(input.checkInTime) } : {}),
    ...(key('checkOutTime') ? { checkOutTime: blankToNull(input.checkOutTime) } : {}),
    ...(key('description') ? { description: sanitizeRichText(input.description) } : {}),
    ...(key('amenities') ? { amenities: sanitizeRichText(input.amenities) } : {}),
    ...(key('internalNotes') ? { internalNotes: blankToNull(input.internalNotes) } : {}),
    ...(key('externalCode') ? { externalCode: blankToNull(input.externalCode) } : {}),
    ...(key('isFeatured') ? { isFeatured: Boolean(input.isFeatured) } : {}),
    ...(key('sortOrder') ? { sortOrder: input.sortOrder ?? 0 } : {}),
  };
}

/** Within a transaction, make one hotel the sole active default for its city. */
async function applyDefault(
  tx: Prisma.TransactionClient,
  companyId: string,
  cityId: string,
  hotelId: string,
) {
  await tx.hotel.updateMany({
    where: { companyId, cityId, isDefaultForCity: true, id: { not: hotelId } },
    data: { isDefaultForCity: false },
  });
  await tx.hotel.update({ where: { id: hotelId }, data: { isDefaultForCity: true } });
}

export const hotelsService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManageHotels = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.HotelWhereInput = {
      companyId: auth.companyId,
      ...(canManageHotels
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.destinationId ? { destinationId: String(query.destinationId) } : {}),
      ...(query.cityId ? { cityId: String(query.cityId) } : {}),
      ...(query.starCategory ? { starCategory: Number(query.starCategory) } : {}),
      ...(query.isDefaultForCity !== undefined
        ? { isDefaultForCity: Boolean(query.isDefaultForCity) }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { city: { name: { contains: search, mode: 'insensitive' } } },
              { destination: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
    const orderBy: Prisma.HotelOrderByWithRelationInput =
      sortBy === 'starCategory'
        ? { starCategory: order }
        : sortBy === 'createdAt'
          ? { createdAt: order }
          : sortBy === 'updatedAt'
            ? { updatedAt: order }
            : { name: order };
    const [rows, total] = await Promise.all([
      prisma.hotel.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: hotelListInclude,
      }),
      prisma.hotel.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentHotel(row as unknown as Record<string, unknown>, false)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const cityId = typeof query.cityId === 'string' ? query.cityId : undefined;
    const destinationId = typeof query.destinationId === 'string' ? query.destinationId : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const hotels = await prisma.hotel.findMany({
      where: {
        companyId: auth.companyId,
        status: 'ACTIVE',
        deletedAt: null,
        ...(cityId ? { cityId } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        starCategory: true,
        isDefaultForCity: true,
        destination: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
      },
    });
    return { hotels };
  },

  async details(auth: AuthContext, hotelId: string) {
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    return presentHotel(
      (await getHotel(auth, hotelId)) as unknown as Record<string, unknown>,
      canViewCosting,
    );
  },

  async create(auth: AuthContext, input: HotelInput, context: MastersRequestContext) {
    await validateDestinationCity(auth.companyId, input.destinationId, input.cityId);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    const makeDefault = Boolean(input.isDefaultForCity) && input.status !== 'ARCHIVED';
    try {
      const hotel = await prisma.$transaction(async (tx) => {
        const created = await tx.hotel.create({
          data: {
            companyId: auth.companyId,
            destinationId: input.destinationId,
            cityId: input.cityId,
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            status: input.status,
            createdById: auth.userId,
            ...hotelWriteData(input, canManageCosting),
            isDefaultForCity: false,
          },
        });
        if (makeDefault) await applyDefault(tx, auth.companyId, created.cityId, created.id);
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_CREATED', 'Hotel', created.id, context, {
            cityId: created.cityId,
            destinationId: created.destinationId,
            isDefaultForCity: makeDefault,
          }),
        });
        return tx.hotel.findUniqueOrThrow({
          where: { id: created.id },
          include: hotelDetailInclude,
        });
      });
      return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting);
    } catch (error) {
      duplicateError(error);
    }
  },

  async update(
    auth: AuthContext,
    hotelId: string,
    input: HotelUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getHotel(auth, hotelId, true);
    const destinationId = input.destinationId ?? current.destinationId;
    const cityId = input.cityId ?? current.cityId;
    if (input.destinationId || input.cityId)
      await validateDestinationCity(auth.companyId, destinationId, cityId);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    const nextStatus = input.status ?? current.status;
    const archived = nextStatus === 'ARCHIVED';
    const wantsDefault =
      input.isDefaultForCity ?? (cityId === current.cityId ? current.isDefaultForCity : false);
    const defaultActive = wantsDefault && !archived;
    try {
      const hotel = await prisma.$transaction(async (tx) => {
        await tx.hotel.update({
          where: { id: current.id },
          data: {
            ...(input.destinationId ? { destinationId } : {}),
            ...(input.cityId ? { cityId } : {}),
            ...hotelWriteData(input, canManageCosting),
            ...(input.status
              ? { status: input.status, deletedAt: archived ? new Date() : null }
              : {}),
            ...(defaultActive ? {} : { isDefaultForCity: false }),
          },
        });
        if (defaultActive) await applyDefault(tx, auth.companyId, cityId, current.id);
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_UPDATED', 'Hotel', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        if (
          input.isDefaultForCity !== undefined &&
          input.isDefaultForCity !== current.isDefaultForCity
        )
          await tx.activityLog.create({
            data: audit(auth, 'HOTEL_DEFAULT_CHANGED', 'Hotel', current.id, context, {
              cityId,
              isDefaultForCity: defaultActive,
            }),
          });
        return tx.hotel.findUniqueOrThrow({
          where: { id: current.id },
          include: hotelDetailInclude,
        });
      });
      return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting);
    } catch (error) {
      duplicateError(error);
    }
  },

  async status(
    auth: AuthContext,
    hotelId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getHotel(auth, hotelId, true);
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    const archived = status === 'ARCHIVED';
    const hotel = await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: current.id },
        data: {
          status,
          deletedAt: archived ? new Date() : null,
          // An archived or inactive hotel can never remain the active default.
          ...(status === 'ACTIVE' ? {} : { isDefaultForCity: false }),
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_STATUS_CHANGED', 'Hotel', current.id, context, {
          previousStatus: current.status,
          status,
        }),
      });
      return tx.hotel.findUniqueOrThrow({ where: { id: current.id }, include: hotelDetailInclude });
    });
    return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting);
  },

  async archive(auth: AuthContext, hotelId: string, context: MastersRequestContext) {
    const current = await getHotel(auth, hotelId, true);
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    const hotel = await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: current.id },
        // Archiving transactionally strips default status for the city.
        data: { status: 'ARCHIVED', deletedAt: new Date(), isDefaultForCity: false },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_ARCHIVED', 'Hotel', current.id, context, {
          wasDefault: current.isDefaultForCity,
        }),
      });
      return tx.hotel.findUniqueOrThrow({ where: { id: current.id }, include: hotelDetailInclude });
    });
    return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting);
  },

  // --- Room types ----------------------------------------------------------

  async createRoomType(
    auth: AuthContext,
    hotelId: string,
    input: HotelRoomTypeInput,
    context: MastersRequestContext,
  ) {
    const hotel = await getHotel(auth, hotelId, true);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
    await prisma.$transaction(async (tx) => {
      const created = await tx.hotelRoomType.create({
        data: {
          companyId: auth.companyId,
          hotelId: hotel.id,
          name: input.name.trim(),
          ...roomTypeWriteData(input, canManageCosting),
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_ROOM_TYPE_CREATED', 'HotelRoomType', created.id, context, {
          hotelId: hotel.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async updateRoomType(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    input: HotelRoomTypeUpdateInput,
    context: MastersRequestContext,
  ) {
    const hotel = await getHotel(auth, hotelId, true);
    const existing = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Room type not found.');
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
    await prisma.$transaction(async (tx) => {
      await tx.hotelRoomType.update({
        where: { id: existing.id },
        data: roomTypeWriteData(input, canManageCosting),
      });
      const action =
        input.status === 'ARCHIVED' ? 'HOTEL_ROOM_TYPE_ARCHIVED' : 'HOTEL_ROOM_TYPE_UPDATED';
      await tx.activityLog.create({
        data: audit(auth, action, 'HotelRoomType', existing.id, context, {
          changedFields: Object.keys(input),
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  // --- Meal plans ----------------------------------------------------------

  async createMealPlan(
    auth: AuthContext,
    hotelId: string,
    input: HotelMealPlanInput,
    context: MastersRequestContext,
  ) {
    const hotel = await getHotel(auth, hotelId, true);
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
    await prisma.$transaction(async (tx) => {
      const created = await tx.hotelMealPlan.create({
        data: {
          companyId: auth.companyId,
          hotelId: hotel.id,
          name: input.name.trim(),
          ...mealPlanWriteData(input, canManageCosting),
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_MEAL_PLAN_CREATED', 'HotelMealPlan', created.id, context, {
          hotelId: hotel.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async updateMealPlan(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    input: HotelMealPlanUpdateInput,
    context: MastersRequestContext,
  ) {
    const hotel = await getHotel(auth, hotelId, true);
    const existing = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Meal plan not found.');
    const canManageCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_MANAGE_COSTING);
    await prisma.$transaction(async (tx) => {
      await tx.hotelMealPlan.update({
        where: { id: existing.id },
        data: mealPlanWriteData(input, canManageCosting),
      });
      const action =
        input.status === 'ARCHIVED' ? 'HOTEL_MEAL_PLAN_ARCHIVED' : 'HOTEL_MEAL_PLAN_UPDATED';
      await tx.activityLog.create({
        data: audit(auth, action, 'HotelMealPlan', existing.id, context, {
          changedFields: Object.keys(input),
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  // --- Image ---------------------------------------------------------------

  async createImageUpload(auth: AuthContext, hotelId: string, input: HotelImageUploadInput) {
    const hotel = await getHotel(auth, hotelId, true);
    const max = env.HOTEL_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Hotel images must be ${env.HOTEL_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = hotelImageObjectKey({
      companyId: auth.companyId,
      hotelId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = hotel.pendingImageObjectKey;
    await prisma.hotel.update({
      where: { id: hotel.id },
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

  async confirmImage(auth: AuthContext, hotelId: string, context: MastersRequestContext) {
    const hotel = await getHotel(auth, hotelId, true);
    const key = hotel.pendingImageObjectKey;
    if (
      !key ||
      !hotel.pendingImageFileName ||
      !hotel.pendingImageMimeType ||
      !hotel.pendingImageFileSize
    )
      throw new ValidationError('No hotel image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded hotel image could not be found.');
    if (
      metadata.size !== hotel.pendingImageFileSize ||
      metadata.contentType !== hotel.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const oldKey = hotel.imageObjectKey;
    const action = oldKey ? 'HOTEL_IMAGE_REPLACED' : 'HOTEL_IMAGE_UPLOADED';
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: hotel.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          imageObjectKey: key,
          imageFileName: hotel.pendingImageFileName,
          imageMimeType: hotel.pendingImageMimeType,
          imageFileSize: hotel.pendingImageFileSize,
          imageConfirmedAt: new Date(),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, action, 'Hotel', hotel.id, context, {
          mimeType: hotel.pendingImageMimeType,
          fileSize: hotel.pendingImageFileSize,
        }),
      });
      return tx.hotel.findUniqueOrThrow({ where: { id: hotel.id }, include: hotelDetailInclude });
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return presentHotel(updated as unknown as Record<string, unknown>, canViewCosting);
  },

  async imageDownload(auth: AuthContext, hotelId: string) {
    const hotel = await getHotel(auth, hotelId);
    if (!hotel.imageObjectKey || !hotel.imageFileName || !hotel.imageConfirmedAt)
      throw new NotFoundError('Hotel image not found.');
    return {
      url: await storageService.createDownloadUrl(
        hotel.imageObjectKey,
        hotel.imageFileName,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteImage(auth: AuthContext, hotelId: string, context: MastersRequestContext) {
    const hotel = await getHotel(auth, hotelId, true);
    const keys = [hotel.imageObjectKey, hotel.pendingImageObjectKey].filter(
      (value): value is string => Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: hotel.id },
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
        data: audit(auth, 'HOTEL_IMAGE_DELETED', 'Hotel', hotel.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },
};

function roomTypeWriteData(
  input: HotelRoomTypeInput | HotelRoomTypeUpdateInput,
  canManageCosting: boolean,
) {
  const key = <K extends keyof (HotelRoomTypeInput & HotelRoomTypeUpdateInput)>(k: K) => k in input;
  const cost = canManageCosting
    ? {
        ...(key('baseCost') ? { baseCost: input.baseCost ?? null } : {}),
        ...(key('sellingPrice') ? { sellingPrice: input.sellingPrice ?? null } : {}),
        ...(key('taxPercentage') ? { taxPercentage: input.taxPercentage ?? null } : {}),
        ...(key('currency') ? { currency: input.currency ?? 'INR' } : {}),
      }
    : {};
  return {
    ...(key('name') ? { name: input.name!.trim() } : {}),
    ...(key('code') ? { code: blankToNull(input.code) } : {}),
    ...(key('description') ? { description: blankToNull(input.description) } : {}),
    ...(key('maxAdults') ? { maxAdults: input.maxAdults ?? null } : {}),
    ...(key('maxChildren') ? { maxChildren: input.maxChildren ?? null } : {}),
    ...(key('maxOccupancy') ? { maxOccupancy: input.maxOccupancy ?? null } : {}),
    ...(key('bedType') ? { bedType: blankToNull(input.bedType) } : {}),
    ...(key('numberOfBeds') ? { numberOfBeds: input.numberOfBeds ?? null } : {}),
    ...(key('roomSize') ? { roomSize: blankToNull(input.roomSize) } : {}),
    ...(key('viewType') ? { viewType: blankToNull(input.viewType) } : {}),
    ...(key('internalNotes') ? { internalNotes: blankToNull(input.internalNotes) } : {}),
    ...(key('status') ? { status: input.status! } : {}),
    ...(key('sortOrder') ? { sortOrder: input.sortOrder ?? 0 } : {}),
    ...cost,
  };
}

function mealPlanWriteData(
  input: HotelMealPlanInput | HotelMealPlanUpdateInput,
  canManageCosting: boolean,
) {
  const key = <K extends keyof (HotelMealPlanInput & HotelMealPlanUpdateInput)>(k: K) => k in input;
  const cost = canManageCosting
    ? {
        ...(key('baseCost') ? { baseCost: input.baseCost ?? null } : {}),
        ...(key('sellingPrice') ? { sellingPrice: input.sellingPrice ?? null } : {}),
        ...(key('currency') ? { currency: input.currency ?? 'INR' } : {}),
      }
    : {};
  return {
    ...(key('name') ? { name: input.name!.trim() } : {}),
    ...(key('code') ? { code: blankToNull(input.code) } : {}),
    ...(key('type') ? { type: input.type! } : {}),
    ...(key('description') ? { description: blankToNull(input.description) } : {}),
    ...(key('internalNotes') ? { internalNotes: blankToNull(input.internalNotes) } : {}),
    ...(key('status') ? { status: input.status! } : {}),
    ...(key('sortOrder') ? { sortOrder: input.sortOrder ?? 0 } : {}),
    ...cost,
  };
}
