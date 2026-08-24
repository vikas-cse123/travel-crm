import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
  MASTER_TYPE,
  PERMISSIONS,
  type HotelInput,
  type HotelImageUploadInput,
  type HotelMealPlanInput,
  type HotelMealPlanMonthPriceInput,
  type HotelMealPlanMonthPriceUpdateInput,
  type HotelMealPlanSeasonInput,
  type HotelMealPlanSeasonUpdateInput,
  type HotelMealPlanUpdateInput,
  type HotelMonthPriceInput,
  type HotelMonthPriceUpdateInput,
  type HotelRoomTypeInput,
  type HotelRoomTypeMonthPriceInput,
  type HotelRoomTypeMonthPriceUpdateInput,
  type HotelRoomTypeSeasonInput,
  type HotelRoomTypeSeasonUpdateInput,
  type HotelRoomTypeUpdateInput,
  type HotelSeasonInput,
  type HotelSeasonUpdateInput,
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
import {
  assertCanModifyMaster,
  buildVisibleWhere,
  masterRecordMeta,
  resolveMasterScope,
  type MasterScope,
} from './master-visibility.js';
import {
  appendMasterImage,
  findMasterImage,
  masterImageWriteData,
  presentMasterImages,
  removeMasterImage,
  reorderMasterImages,
} from './master-images.js';

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
  roomTypes: {
    orderBy: { sortOrder: 'asc' as const },
    include: { seasons: { orderBy: { startDate: 'asc' as const } }, monthPrices: { orderBy: { month: 'asc' as const } } },
  },
  mealPlans: {
    orderBy: { sortOrder: 'asc' as const },
    include: { seasons: { orderBy: { startDate: 'asc' as const } }, monthPrices: { orderBy: { month: 'asc' as const } } },
  },
  seasons: { orderBy: { startDate: 'asc' as const } },
  monthPrices: { orderBy: { month: 'asc' as const } },
} as const;

const hotelListInclude = {
  createdBy: { select: userSelect },
  destination: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  _count: { select: { roomTypes: true, mealPlans: true } },
  seasons: {
    orderBy: { startDate: 'asc' as const },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      price: true,
      currency: true,
    },
  },
  monthPrices: {
    orderBy: { month: 'asc' as const },
    select: {
      id: true,
      month: true,
      price: true,
      currency: true,
    },
  },
} as const;

function presentSeason(row: Record<string, unknown>) {
  return {
    ...row,
    startDate: dateOnly(row.startDate as Date),
    endDate: dateOnly(row.endDate as Date),
    price: num(row.price as Prisma.Decimal | null),
  };
}

function presentMonthPrice(row: Record<string, unknown>) {
  return {
    ...row,
    price: num(row.price as Prisma.Decimal | null),
  };
}

function presentRoomType(row: Record<string, unknown>, canViewCosting: boolean) {
  const { companyId, seasons, monthPrices, ...safe } = row;
  void companyId;
  const base = {
    ...safe,
    baseCost: num(safe.baseCost as Prisma.Decimal | null),
    sellingPrice: num(safe.sellingPrice as Prisma.Decimal | null),
    taxPercentage: num(safe.taxPercentage as Prisma.Decimal | null),
    ...(Array.isArray(seasons)
      ? { seasons: seasons.map((s) => presentSeason(s as Record<string, unknown>)) }
      : {}),
    ...(Array.isArray(monthPrices)
      ? { monthPrices: monthPrices.map((m) => presentMonthPrice(m as Record<string, unknown>)) }
      : {}),
  };
  if (canViewCosting) return base;
  const { baseCost, sellingPrice, taxPercentage, ...redacted } = base;
  void baseCost;
  void sellingPrice;
  void taxPercentage;
  return redacted;
}

function presentMealPlan(row: Record<string, unknown>, canViewCosting: boolean) {
  const { companyId, seasons, monthPrices, ...safe } = row;
  void companyId;
  const base = {
    ...safe,
    baseCost: num(safe.baseCost as Prisma.Decimal | null),
    sellingPrice: num(safe.sellingPrice as Prisma.Decimal | null),
    ...(Array.isArray(seasons)
      ? { seasons: seasons.map((s) => presentSeason(s as Record<string, unknown>)) }
      : {}),
    ...(Array.isArray(monthPrices)
      ? { monthPrices: monthPrices.map((m) => presentMonthPrice(m as Record<string, unknown>)) }
      : {}),
  };
  if (canViewCosting) return base;
  const { baseCost, sellingPrice, ...redacted } = base;
  void baseCost;
  void sellingPrice;
  return redacted;
}

/**
 * Hotels owned by the System Global Masters company are public catalogue data,
 * but their commercial fields (costing on room types / meal plans and internal
 * notes) are private to the system company. A tenant never sees them, even when
 * its role carries the view_costing permission.
 */
function presentHotel(row: Record<string, unknown>, canViewCosting: boolean, scope: MasterScope) {
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
    seasons,
    monthPrices,
    internalNotes,
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

  return {
    ...safe,
    ...masterRecordMeta({ companyId: String(companyId) }, scope),
    // Internal notes stay private to the owning company.
    ...(isTenantViewingGlobal ? {} : internalNotes !== undefined ? { internalNotes } : {}),
    starRating: num(safe.starRating as Prisma.Decimal | null),
    latitude: num(safe.latitude as Prisma.Decimal | null),
    longitude: num(safe.longitude as Prisma.Decimal | null),
    price: num(safe.price as Prisma.Decimal | null),
    hasImage: Boolean(imageObjectKey && row.imageConfirmedAt),
    images: presentMasterImages(row as unknown as Parameters<typeof presentMasterImages>[0]),
    ...(Array.isArray(roomTypes)
      ? {
          roomTypes: roomTypes.map((r) =>
            presentRoomType(r as Record<string, unknown>, effectiveCanViewCosting),
          ),
        }
      : {}),
    ...(Array.isArray(mealPlans)
      ? {
          mealPlans: mealPlans.map((m) =>
            presentMealPlan(m as Record<string, unknown>, effectiveCanViewCosting),
          ),
        }
      : {}),
    ...(Array.isArray(seasons)
      ? {
          seasons: seasons.map((s) => {
            const season = s as Record<string, unknown>;
            return {
              ...season,
              startDate: dateOnly(season.startDate as Date),
              endDate: dateOnly(season.endDate as Date),
              price: num(season.price as Prisma.Decimal | null),
            };
          }),
        }
      : {}),
    ...(Array.isArray(monthPrices)
      ? { monthPrices: monthPrices.map((m) => presentMonthPrice(m as Record<string, unknown>)) }
      : {}),
  };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A hotel with that name already exists in this city.');
  throw error;
}

/** A duplicate calendar-month price on the same pricing entity (unique index). */
function monthPriceDuplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError('A price for this month already exists for this master.');
  throw error;
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_HOTELS_UPDATE);
}

async function getHotel(auth: AuthContext, hotelId: string, scope: MasterScope, forManage = false) {
  const canManageHotels = forManage ? true : await canManage(auth);
  const hotel = await prisma.hotel.findFirst({
    where: {
      id: hotelId,
      ...buildVisibleWhere(scope),
      ...(canManageHotels ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: hotelDetailInclude,
  });
  if (!hotel) throw new NotFoundError('Hotel not found.');
  return hotel;
}

/** Confirm the city is linked to the destination, both visible to this company. */
async function validateDestinationCity(scope: MasterScope, destinationId: string, cityId: string) {
  const link = await prisma.destinationCity.findFirst({
    where: {
      destinationId,
      cityId,
      destination: {
        ...buildVisibleWhere(scope),
        status: 'ACTIVE',
        deletedAt: null,
      },
      city: {
        ...buildVisibleWhere(scope),
        status: 'ACTIVE',
        deletedAt: null,
      },
    },
    select: { id: true },
  });
  if (!link)
    throw new ValidationError('The selected city must be linked to the selected destination.');
}

function hotelWriteData(input: HotelInput | HotelUpdateInput, canManageCosting: boolean) {
  void canManageCosting;
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
    ...(key('price') ? { price: input.price ?? null } : {}),
    ...(key('currency') ? { currency: input.currency ?? 'INR' } : {}),
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || 10,
    });
    const canManageHotels = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.HotelWhereInput = {
      ...buildVisibleWhere(scope),
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
    const order = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortBy = String(query.sortBy ?? 'createdAt');
    const orderBy: Prisma.HotelOrderByWithRelationInput =
      sortBy === 'starCategory'
        ? { starCategory: order }
        : sortBy === 'createdAt'
          ? { createdAt: order }
          : sortBy === 'updatedAt'
            ? { updatedAt: order }
            : { name: order };
    const [rows, total, rating, destinationRows, cityRows, roomTypes, mealPlans] =
      await Promise.all([
        prisma.hotel.findMany({
          where,
          ...toPrismaPagination(pagination),
          orderBy,
          include: hotelListInclude,
        }),
        prisma.hotel.count({ where }),
        prisma.hotel.aggregate({ where, _avg: { starRating: true } }),
        prisma.hotel.findMany({
          where,
          distinct: ['destinationId'],
          select: { destinationId: true },
        }),
        prisma.hotel.findMany({ where, distinct: ['cityId'], select: { cityId: true } }),
        prisma.hotelRoomType.count({ where: { hotel: where, status: 'ACTIVE' } }),
        prisma.hotelMealPlan.count({ where: { hotel: where, status: 'ACTIVE' } }),
      ]);
    return {
      data: rows.map((row) =>
        presentHotel(row as unknown as Record<string, unknown>, false, scope),
      ),
      pagination: buildPaginationMeta(pagination, total),
      statistics: {
        totalHotels: total,
        destinations: destinationRows.length,
        totalCities: cityRows.length,
        averageRating: num(rating._avg.starRating),
        roomTypes,
        mealPlans,
      },
    };
  },

  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const cityId = typeof query.cityId === 'string' ? query.cityId : undefined;
    const destinationId = typeof query.destinationId === 'string' ? query.destinationId : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const hotels = await prisma.hotel.findMany({
      where: {
        ...buildVisibleWhere(scope),
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
        status: true,
        isDefaultForCity: true,
        price: true,
        currency: true,
        destination: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
      },
    });
    return { hotels };
  },

  async details(auth: AuthContext, hotelId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    return presentHotel(
      (await getHotel(auth, hotelId, scope)) as unknown as Record<string, unknown>,
      canViewCosting,
      scope,
    );
  },

  async create(auth: AuthContext, input: HotelInput, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    await validateDestinationCity(scope, input.destinationId, input.cityId);
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
            sourceGlobal: scope.isSystemAdmin,
          }),
        });
        return tx.hotel.findUniqueOrThrow({
          where: { id: created.id },
          include: hotelDetailInclude,
        });
      });
      return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting, scope);
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const current = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(current, scope);
    const destinationId = input.destinationId ?? current.destinationId;
    const cityId = input.cityId ?? current.cityId;
    if (input.destinationId || input.cityId)
      await validateDestinationCity(scope, destinationId, cityId);
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
      return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting, scope);
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const current = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(current, scope);
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
    return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting, scope);
  },

  async archive(auth: AuthContext, hotelId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const current = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(current, scope);
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
    return presentHotel(hotel as unknown as Record<string, unknown>, canViewCosting, scope);
  },

  // --- Room types ----------------------------------------------------------

  async createRoomType(
    auth: AuthContext,
    hotelId: string,
    input: HotelRoomTypeInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const existing = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const existing = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
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

  // --- Room-type seasons (date-range rates) --------------------------------

  async createRoomTypeSeason(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    input: HotelRoomTypeSeasonInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const roomType = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!roomType) throw new NotFoundError('Room type not found.');
    await prisma.$transaction(async (tx) => {
      await assertNoRoomTypeSeasonOverlap(
        tx,
        auth.companyId,
        roomType.id,
        input.startDate,
        input.endDate,
      );
      const created = await tx.hotelRoomTypeSeason.create({
        data: {
          companyId: auth.companyId,
          hotelId: hotel.id,
          hotelRoomTypeId: roomType.id,
          name: input.name.trim(),
          startDate: input.startDate,
          endDate: input.endDate,
          price: input.price ?? null,
          currency: input.currency ?? 'INR',
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_ROOM_TYPE_UPDATED', 'HotelRoomType', roomType.id, context, {
          change: 'SEASON_CREATED',
          seasonId: created.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async updateRoomTypeSeason(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    seasonId: string,
    input: HotelRoomTypeSeasonUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const roomType = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!roomType) throw new NotFoundError('Room type not found.');
    const existing = await prisma.hotelRoomTypeSeason.findFirst({
      where: { id: seasonId, hotelRoomTypeId: roomType.id, companyId: auth.companyId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundError('Season not found.');
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    await prisma.$transaction(async (tx) => {
      await assertNoRoomTypeSeasonOverlap(
        tx,
        auth.companyId,
        roomType.id,
        startDate,
        endDate,
        seasonId,
      );
      await tx.hotelRoomTypeSeason.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.startDate !== undefined ? { startDate } : {}),
          ...(input.endDate !== undefined ? { endDate } : {}),
          ...(input.price !== undefined ? { price: input.price ?? null } : {}),
          ...(input.currency !== undefined ? { currency: input.currency ?? 'INR' } : {}),
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_ROOM_TYPE_UPDATED', 'HotelRoomType', roomType.id, context, {
          change: 'SEASON_UPDATED',
          seasonId: existing.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async deleteRoomTypeSeason(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    seasonId: string,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const roomType = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!roomType) throw new NotFoundError('Room type not found.');
    const existing = await prisma.hotelRoomTypeSeason.findFirst({
      where: { id: seasonId, hotelRoomTypeId: roomType.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Season not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotelRoomTypeSeason.delete({ where: { id: existing.id } });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_ROOM_TYPE_UPDATED', 'HotelRoomType', roomType.id, context, {
          change: 'SEASON_DELETED',
          seasonId: existing.id,
        }),
      });
    });
    return { deleted: true };
  },

  // --- Room-type month prices (calendar-month rates) -----------------------

  async createRoomTypeMonthPrice(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    input: HotelRoomTypeMonthPriceInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const roomType = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!roomType) throw new NotFoundError('Room type not found.');
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.hotelRoomTypeMonthPrice.create({
          data: {
            companyId: auth.companyId,
            hotelId: hotel.id,
            hotelRoomTypeId: roomType.id,
            month: input.month,
            price: input.price ?? null,
            currency: input.currency ?? 'INR',
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_ROOM_TYPE_UPDATED', 'HotelRoomType', roomType.id, context, {
            change: 'MONTH_PRICE_CREATED',
            monthPriceId: created.id,
          }),
        });
      });
    } catch (error) {
      monthPriceDuplicateError(error);
    }
    return this.details(auth, hotelId);
  },

  async updateRoomTypeMonthPrice(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    monthPriceId: string,
    input: HotelRoomTypeMonthPriceUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const roomType = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!roomType) throw new NotFoundError('Room type not found.');
    const existing = await prisma.hotelRoomTypeMonthPrice.findFirst({
      where: { id: monthPriceId, hotelRoomTypeId: roomType.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Month price not found.');
    try {
      await prisma.$transaction(async (tx) => {
        await tx.hotelRoomTypeMonthPrice.update({
          where: { id: existing.id },
          data: {
            ...(input.month !== undefined ? { month: input.month } : {}),
            ...(input.price !== undefined ? { price: input.price ?? null } : {}),
            ...(input.currency !== undefined ? { currency: input.currency ?? 'INR' } : {}),
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_ROOM_TYPE_UPDATED', 'HotelRoomType', roomType.id, context, {
            change: 'MONTH_PRICE_UPDATED',
            monthPriceId: existing.id,
          }),
        });
      });
    } catch (error) {
      monthPriceDuplicateError(error);
    }
    return this.details(auth, hotelId);
  },

  async deleteRoomTypeMonthPrice(
    auth: AuthContext,
    hotelId: string,
    roomTypeId: string,
    monthPriceId: string,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const roomType = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!roomType) throw new NotFoundError('Room type not found.');
    const existing = await prisma.hotelRoomTypeMonthPrice.findFirst({
      where: { id: monthPriceId, hotelRoomTypeId: roomType.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Month price not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotelRoomTypeMonthPrice.delete({ where: { id: existing.id } });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_ROOM_TYPE_UPDATED', 'HotelRoomType', roomType.id, context, {
          change: 'MONTH_PRICE_DELETED',
          monthPriceId: existing.id,
        }),
      });
    });
    return { deleted: true };
  },

  // --- Meal-plan seasons (date-range rates) --------------------------------

  async createMealPlanSeason(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    input: HotelMealPlanSeasonInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const mealPlan = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!mealPlan) throw new NotFoundError('Meal plan not found.');
    await prisma.$transaction(async (tx) => {
      await assertNoMealPlanSeasonOverlap(
        tx,
        auth.companyId,
        mealPlan.id,
        input.startDate,
        input.endDate,
      );
      const created = await tx.hotelMealPlanSeason.create({
        data: {
          companyId: auth.companyId,
          hotelId: hotel.id,
          hotelMealPlanId: mealPlan.id,
          name: input.name.trim(),
          startDate: input.startDate,
          endDate: input.endDate,
          price: input.price ?? null,
          currency: input.currency ?? 'INR',
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_MEAL_PLAN_UPDATED', 'HotelMealPlan', mealPlan.id, context, {
          change: 'SEASON_CREATED',
          seasonId: created.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async updateMealPlanSeason(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    seasonId: string,
    input: HotelMealPlanSeasonUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const mealPlan = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!mealPlan) throw new NotFoundError('Meal plan not found.');
    const existing = await prisma.hotelMealPlanSeason.findFirst({
      where: { id: seasonId, hotelMealPlanId: mealPlan.id, companyId: auth.companyId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundError('Season not found.');
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    await prisma.$transaction(async (tx) => {
      await assertNoMealPlanSeasonOverlap(
        tx,
        auth.companyId,
        mealPlan.id,
        startDate,
        endDate,
        seasonId,
      );
      await tx.hotelMealPlanSeason.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.startDate !== undefined ? { startDate } : {}),
          ...(input.endDate !== undefined ? { endDate } : {}),
          ...(input.price !== undefined ? { price: input.price ?? null } : {}),
          ...(input.currency !== undefined ? { currency: input.currency ?? 'INR' } : {}),
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_MEAL_PLAN_UPDATED', 'HotelMealPlan', mealPlan.id, context, {
          change: 'SEASON_UPDATED',
          seasonId: existing.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async deleteMealPlanSeason(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    seasonId: string,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const mealPlan = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!mealPlan) throw new NotFoundError('Meal plan not found.');
    const existing = await prisma.hotelMealPlanSeason.findFirst({
      where: { id: seasonId, hotelMealPlanId: mealPlan.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Season not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotelMealPlanSeason.delete({ where: { id: existing.id } });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_MEAL_PLAN_UPDATED', 'HotelMealPlan', mealPlan.id, context, {
          change: 'SEASON_DELETED',
          seasonId: existing.id,
        }),
      });
    });
    return { deleted: true };
  },

  // --- Meal-plan month prices (calendar-month rates) -----------------------

  async createMealPlanMonthPrice(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    input: HotelMealPlanMonthPriceInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const mealPlan = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!mealPlan) throw new NotFoundError('Meal plan not found.');
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.hotelMealPlanMonthPrice.create({
          data: {
            companyId: auth.companyId,
            hotelId: hotel.id,
            hotelMealPlanId: mealPlan.id,
            month: input.month,
            price: input.price ?? null,
            currency: input.currency ?? 'INR',
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_MEAL_PLAN_UPDATED', 'HotelMealPlan', mealPlan.id, context, {
            change: 'MONTH_PRICE_CREATED',
            monthPriceId: created.id,
          }),
        });
      });
    } catch (error) {
      monthPriceDuplicateError(error);
    }
    return this.details(auth, hotelId);
  },

  async updateMealPlanMonthPrice(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    monthPriceId: string,
    input: HotelMealPlanMonthPriceUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const mealPlan = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!mealPlan) throw new NotFoundError('Meal plan not found.');
    const existing = await prisma.hotelMealPlanMonthPrice.findFirst({
      where: { id: monthPriceId, hotelMealPlanId: mealPlan.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Month price not found.');
    try {
      await prisma.$transaction(async (tx) => {
        await tx.hotelMealPlanMonthPrice.update({
          where: { id: existing.id },
          data: {
            ...(input.month !== undefined ? { month: input.month } : {}),
            ...(input.price !== undefined ? { price: input.price ?? null } : {}),
            ...(input.currency !== undefined ? { currency: input.currency ?? 'INR' } : {}),
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_MEAL_PLAN_UPDATED', 'HotelMealPlan', mealPlan.id, context, {
            change: 'MONTH_PRICE_UPDATED',
            monthPriceId: existing.id,
          }),
        });
      });
    } catch (error) {
      monthPriceDuplicateError(error);
    }
    return this.details(auth, hotelId);
  },

  async deleteMealPlanMonthPrice(
    auth: AuthContext,
    hotelId: string,
    mealPlanId: string,
    monthPriceId: string,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const mealPlan = await prisma.hotelMealPlan.findFirst({
      where: { id: mealPlanId, hotelId: hotel.id },
      select: { id: true },
    });
    if (!mealPlan) throw new NotFoundError('Meal plan not found.');
    const existing = await prisma.hotelMealPlanMonthPrice.findFirst({
      where: { id: monthPriceId, hotelMealPlanId: mealPlan.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Month price not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotelMealPlanMonthPrice.delete({ where: { id: existing.id } });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_MEAL_PLAN_UPDATED', 'HotelMealPlan', mealPlan.id, context, {
          change: 'MONTH_PRICE_DELETED',
          monthPriceId: existing.id,
        }),
      });
    });
    return { deleted: true };
  },

  // --- Seasons (date-range rates) ------------------------------------------

  async createSeason(
    auth: AuthContext,
    hotelId: string,
    input: HotelSeasonInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    await prisma.$transaction(async (tx) => {
      await assertNoSeasonOverlap(tx, auth.companyId, hotel.id, input.startDate, input.endDate);
      const created = await tx.hotelSeason.create({
        data: {
          companyId: auth.companyId,
          hotelId: hotel.id,
          name: input.name.trim(),
          startDate: input.startDate,
          endDate: input.endDate,
          price: input.price ?? null,
          currency: input.currency ?? 'INR',
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
          change: 'SEASON_CREATED',
          seasonId: created.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async updateSeason(
    auth: AuthContext,
    hotelId: string,
    seasonId: string,
    input: HotelSeasonUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const existing = await prisma.hotelSeason.findFirst({
      where: { id: seasonId, hotelId: hotel.id, companyId: auth.companyId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!existing) throw new NotFoundError('Season not found.');
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    await prisma.$transaction(async (tx) => {
      await assertNoSeasonOverlap(tx, auth.companyId, hotel.id, startDate, endDate, seasonId);
      await tx.hotelSeason.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.startDate !== undefined ? { startDate } : {}),
          ...(input.endDate !== undefined ? { endDate } : {}),
          ...(input.price !== undefined ? { price: input.price ?? null } : {}),
          ...(input.currency !== undefined ? { currency: input.currency ?? 'INR' } : {}),
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
          change: 'SEASON_UPDATED',
          seasonId: existing.id,
        }),
      });
    });
    return this.details(auth, hotelId);
  },

  async deleteSeason(
    auth: AuthContext,
    hotelId: string,
    seasonId: string,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const existing = await prisma.hotelSeason.findFirst({
      where: { id: seasonId, hotelId: hotel.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Season not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotelSeason.delete({ where: { id: existing.id } });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
          change: 'SEASON_DELETED',
          seasonId: existing.id,
        }),
      });
    });
    return { deleted: true };
  },

  // --- Hotel month prices (calendar-month rates) ---------------------------

  async createMonthPrice(
    auth: AuthContext,
    hotelId: string,
    input: HotelMonthPriceInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.hotelMonthPrice.create({
          data: {
            companyId: auth.companyId,
            hotelId: hotel.id,
            month: input.month,
            price: input.price ?? null,
            currency: input.currency ?? 'INR',
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
            change: 'MONTH_PRICE_CREATED',
            monthPriceId: created.id,
          }),
        });
      });
    } catch (error) {
      monthPriceDuplicateError(error);
    }
    return this.details(auth, hotelId);
  },

  async updateMonthPrice(
    auth: AuthContext,
    hotelId: string,
    monthPriceId: string,
    input: HotelMonthPriceUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const existing = await prisma.hotelMonthPrice.findFirst({
      where: { id: monthPriceId, hotelId: hotel.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Month price not found.');
    try {
      await prisma.$transaction(async (tx) => {
        await tx.hotelMonthPrice.update({
          where: { id: existing.id },
          data: {
            ...(input.month !== undefined ? { month: input.month } : {}),
            ...(input.price !== undefined ? { price: input.price ?? null } : {}),
            ...(input.currency !== undefined ? { currency: input.currency ?? 'INR' } : {}),
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
            change: 'MONTH_PRICE_UPDATED',
            monthPriceId: existing.id,
          }),
        });
      });
    } catch (error) {
      monthPriceDuplicateError(error);
    }
    return this.details(auth, hotelId);
  },

  async deleteMonthPrice(
    auth: AuthContext,
    hotelId: string,
    monthPriceId: string,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const existing = await prisma.hotelMonthPrice.findFirst({
      where: { id: monthPriceId, hotelId: hotel.id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Month price not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotelMonthPrice.delete({ where: { id: existing.id } });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
          change: 'MONTH_PRICE_DELETED',
          monthPriceId: existing.id,
        }),
      });
    });
    return { deleted: true };
  },

  // --- Image ---------------------------------------------------------------

  async createImageUpload(auth: AuthContext, hotelId: string, input: HotelImageUploadInput) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
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
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
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
    const confirmedAt = new Date();
    const images = appendMasterImage(
      hotel,
      {
        objectKey: key,
        fileName: hotel.pendingImageFileName,
        mimeType: hotel.pendingImageMimeType,
        fileSize: hotel.pendingImageFileSize,
      },
      confirmedAt,
    );
    const canViewCosting = await has(auth, PERMISSIONS.MASTER_HOTELS_VIEW_COSTING);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: hotel.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          ...masterImageWriteData(images),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_IMAGE_UPLOADED', 'Hotel', hotel.id, context, {
          imageId: images.at(-1)!.id,
          mimeType: hotel.pendingImageMimeType,
          fileSize: hotel.pendingImageFileSize,
        }),
      });
      return tx.hotel.findUniqueOrThrow({ where: { id: hotel.id }, include: hotelDetailInclude });
    });
    return presentHotel(updated as unknown as Record<string, unknown>, canViewCosting, scope);
  },

  async imageDownload(auth: AuthContext, hotelId: string, imageId?: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope);
    const image = findMasterImage(hotel, imageId);
    if (!image) throw new NotFoundError('Hotel image not found.');
    return {
      url: await storageService.createDownloadUrl(image.objectKey, image.fileName, PRESIGN_TTL),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteImage(
    auth: AuthContext,
    hotelId: string,
    context: MastersRequestContext,
    imageId?: string,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const removed = removeMasterImage(hotel, imageId);
    if (!removed) throw new NotFoundError('Hotel image not found.');
    await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: hotel.id },
        data: {
          ...masterImageWriteData(removed.images),
          imageStorageProvider: removed.images.length ? hotel.imageStorageProvider : null,
          imageBucket: removed.images.length ? hotel.imageBucket : null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_IMAGE_DELETED', 'Hotel', hotel.id, context, {
          imageId: removed.target.id,
          remainingImageCount: removed.images.length,
        }),
      });
    });
    return { deleted: true };
  },

  async reorderImages(
    auth: AuthContext,
    hotelId: string,
    imageIds: string[],
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
    const hotel = await getHotel(auth, hotelId, scope, true);
    assertCanModifyMaster(hotel, scope);
    const images = reorderMasterImages(hotel, imageIds);
    if (!images) throw new ValidationError('Image order must contain every current image once.');
    await prisma.$transaction(async (tx) => {
      await tx.hotel.update({
        where: { id: hotel.id },
        data: masterImageWriteData(images),
      });
      await tx.activityLog.create({
        data: audit(auth, 'HOTEL_UPDATED', 'Hotel', hotel.id, context, {
          change: 'IMAGE_ORDER',
          imageIds,
        }),
      });
    });
    return this.details(auth, hotelId);
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

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * Reject a season whose date range overlaps any existing season of the same
 * hotel. Overlaps are never resolved silently — the caller must fix the dates.
 */
async function assertNoSeasonOverlap(
  tx: Prisma.TransactionClient,
  companyId: string,
  hotelId: string,
  startDate: Date,
  endDate: Date,
  excludeSeasonId?: string,
) {
  const overlapping = await tx.hotelSeason.findFirst({
    where: {
      companyId,
      hotelId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeSeasonId ? { id: { not: excludeSeasonId } } : {}),
    },
    select: { name: true, startDate: true, endDate: true },
  });
  if (overlapping)
    throw new ValidationError(
      `Season "${overlapping.name}" (${dateOnly(overlapping.startDate)} to ${dateOnly(overlapping.endDate)}) overlaps this date range.`,
    );
}

/**
 * Reject a season whose date range overlaps any existing season of the SAME
 * room type. Room-type seasons may overlap hotel-level and meal-plan seasons.
 */
async function assertNoRoomTypeSeasonOverlap(
  tx: Prisma.TransactionClient,
  companyId: string,
  roomTypeId: string,
  startDate: Date,
  endDate: Date,
  excludeSeasonId?: string,
) {
  const overlapping = await tx.hotelRoomTypeSeason.findFirst({
    where: {
      companyId,
      hotelRoomTypeId: roomTypeId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeSeasonId ? { id: { not: excludeSeasonId } } : {}),
    },
    select: { name: true, startDate: true, endDate: true },
  });
  if (overlapping)
    throw new ValidationError(
      `Room type season "${overlapping.name}" (${dateOnly(overlapping.startDate)} to ${dateOnly(overlapping.endDate)}) overlaps this date range.`,
    );
}

/**
 * Reject a season whose date range overlaps any existing season of the SAME
 * meal plan. Meal-plan seasons may overlap hotel-level and room-type seasons.
 */
async function assertNoMealPlanSeasonOverlap(
  tx: Prisma.TransactionClient,
  companyId: string,
  mealPlanId: string,
  startDate: Date,
  endDate: Date,
  excludeSeasonId?: string,
) {
  const overlapping = await tx.hotelMealPlanSeason.findFirst({
    where: {
      companyId,
      hotelMealPlanId: mealPlanId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeSeasonId ? { id: { not: excludeSeasonId } } : {}),
    },
    select: { name: true, startDate: true, endDate: true },
  });
  if (overlapping)
    throw new ValidationError(
      `Meal plan season "${overlapping.name}" (${dateOnly(overlapping.startDate)} to ${dateOnly(overlapping.endDate)}) overlaps this date range.`,
    );
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
