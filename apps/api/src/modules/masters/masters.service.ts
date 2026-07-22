import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { Prisma, type DestinationType, type MasterStatus } from '@prisma/client';
import {
  COUNTRIES,
  PERMISSIONS,
  countryNameForCode,
  type CityInput,
  type CityUpdateInput,
  type DestinationImageUploadInput,
  type DestinationInput,
  type DestinationUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import {
  destinationImageObjectKey,
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

export type MastersRequestContext = { ipAddress: string | null; userAgent: string | null };
const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const cleanAirport = (value: string | null | undefined) => value?.trim().toUpperCase() || null;

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogUncheckedCreateInput['action'],
  entityType: 'City' | 'Destination',
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

export function sanitizeRichText(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const safe = sanitizeHtml(value, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h2',
      'h3',
      'a',
    ],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: 'a',
        attribs: { ...attrs, target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
  }).trim();
  return safe || null;
}

function countrySnapshot(code: string): string {
  const name = countryNameForCode(code);
  if (!name) throw new ValidationError('Select a valid country.');
  return name;
}

function duplicateError(error: unknown, label: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictError(`${label} already exists in that country.`);
  throw error;
}

function presentCity<T extends Record<string, unknown>>(row: T) {
  const { companyId, normalizedName, deletedAt, ...safe } = row;
  void companyId;
  void normalizedName;
  void deletedAt;
  return safe;
}

function presentDestination<T extends Record<string, unknown>>(row: T) {
  const {
    companyId,
    normalizedName,
    deletedAt,
    imageBucket,
    imageObjectKey,
    pendingImageObjectKey,
    pendingImageFileName,
    pendingImageMimeType,
    pendingImageFileSize,
    cities,
    ...safe
  } = row;
  void companyId;
  void normalizedName;
  void deletedAt;
  void imageBucket;
  void imageObjectKey;
  void pendingImageObjectKey;
  void pendingImageFileName;
  void pendingImageMimeType;
  void pendingImageFileSize;
  const safeCities = Array.isArray(cities)
    ? cities.map((link) => {
        const value = link as Record<string, unknown>;
        const city = value.city as Record<string, unknown>;
        const {
          companyId: _companyId,
          normalizedName: _normalizedName,
          deletedAt: _deletedAt,
          ...safeCity
        } = city;
        void _companyId;
        void _normalizedName;
        void _deletedAt;
        return { id: value.id, sequence: value.sequence, cityId: value.cityId, city: safeCity };
      })
    : [];
  return {
    ...safe,
    cities: safeCities,
    hasImage: Boolean(imageObjectKey && row.imageConfirmedAt),
  };
}

async function managerVisibility(auth: AuthContext, updatePermission: string) {
  return has(auth, updatePermission);
}

async function getCity(auth: AuthContext, cityId: string) {
  const canManage = await managerVisibility(auth, PERMISSIONS.MASTER_CITIES_UPDATE);
  const city = await prisma.city.findFirst({
    where: {
      id: cityId,
      companyId: auth.companyId,
      ...(canManage ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: { createdBy: { select: userSelect }, _count: { select: { destinationLinks: true } } },
  });
  if (!city) throw new NotFoundError('City not found.');
  return city;
}

const destinationInclude = {
  createdBy: { select: userSelect },
  cities: { orderBy: { sequence: 'asc' as const }, include: { city: true } },
  _count: { select: { cities: true } },
} as const;

async function getDestination(auth: AuthContext, destinationId: string) {
  const canManage = await managerVisibility(auth, PERMISSIONS.MASTER_DESTINATIONS_UPDATE);
  const destination = await prisma.destination.findFirst({
    where: {
      id: destinationId,
      companyId: auth.companyId,
      ...(canManage ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: destinationInclude,
  });
  if (!destination) throw new NotFoundError('Destination not found.');
  return destination;
}

async function validateCities(companyId: string, countryCode: string, cityIds: string[]) {
  if (new Set(cityIds).size !== cityIds.length)
    throw new ValidationError('A city can only be selected once.');
  const cities = await prisma.city.findMany({
    where: { id: { in: cityIds }, companyId, countryCode, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (cities.length !== cityIds.length)
    throw new ValidationError(
      'Every selected city must be active and belong to the chosen country.',
    );
}

function policyData(input: DestinationInput | DestinationUpdateInput) {
  return {
    ...('inclusions' in input ? { inclusions: sanitizeRichText(input.inclusions) } : {}),
    ...('exclusions' in input ? { exclusions: sanitizeRichText(input.exclusions) } : {}),
    ...('paymentPolicies' in input
      ? { paymentPolicies: sanitizeRichText(input.paymentPolicies) }
      : {}),
    ...('cancellationPolicies' in input
      ? { cancellationPolicies: sanitizeRichText(input.cancellationPolicies) }
      : {}),
    ...('bookingTerms' in input ? { bookingTerms: sanitizeRichText(input.bookingTerms) } : {}),
  };
}

export const citiesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManage = await managerVisibility(auth, PERMISSIONS.MASTER_CITIES_UPDATE);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.CityWhereInput = {
      companyId: auth.companyId,
      ...(canManage
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.country ? { countryCode: String(query.country) } : {}),
      ...(query.hasAirportCode !== undefined
        ? query.hasAirportCode
          ? { airportCode: { not: null } }
          : { airportCode: null }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: query.createdFrom as Date } : {}),
              ...(query.createdTo ? { lte: query.createdTo as Date } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { airportCode: { contains: search, mode: 'insensitive' } },
              { countryName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
    const orderBy: Prisma.CityOrderByWithRelationInput =
      sortBy === 'country'
        ? { countryName: order }
        : sortBy === 'airportCode'
          ? { airportCode: order }
          : sortBy === 'createdAt'
            ? { createdAt: order }
            : sortBy === 'updatedAt'
              ? { updatedAt: order }
              : { name: order };
    const [rows, total] = await Promise.all([
      prisma.city.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: {
          createdBy: { select: userSelect },
          _count: { select: { destinationLinks: true } },
        },
      }),
      prisma.city.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentCity(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const countryCode = typeof query.country === 'string' ? query.country : undefined;
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const cities = countryCode
      ? await prisma.city.findMany({
          where: {
            companyId: auth.companyId,
            countryCode,
            status: 'ACTIVE',
            deletedAt: null,
            ...(search
              ? {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { airportCode: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          orderBy: { name: 'asc' },
          take: 100,
          select: { id: true, name: true, airportCode: true, countryCode: true },
        })
      : [];
    return { countries: COUNTRIES, cities };
  },

  async details(auth: AuthContext, cityId: string) {
    return presentCity((await getCity(auth, cityId)) as unknown as Record<string, unknown>);
  },

  async create(auth: AuthContext, input: CityInput, context: MastersRequestContext) {
    const normalizedName = normalizeCustomerName(input.name);
    try {
      const city = await prisma.$transaction(async (tx) => {
        const created = await tx.city.create({
          data: {
            companyId: auth.companyId,
            countryCode: input.countryCode,
            countryName: countrySnapshot(input.countryCode),
            name: input.name.trim(),
            normalizedName,
            airportCode: cleanAirport(input.airportCode),
            status: input.status,
            createdById: auth.userId,
          },
          include: {
            createdBy: { select: userSelect },
            _count: { select: { destinationLinks: true } },
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'CITY_CREATED', 'City', created.id, context, {
            countryCode: created.countryCode,
            airportCode: created.airportCode,
          }),
        });
        return created;
      });
      return presentCity(city as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error, 'That city');
    }
  },

  async update(
    auth: AuthContext,
    cityId: string,
    input: CityUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getCity(auth, cityId);
    try {
      const city = await prisma.$transaction(async (tx) => {
        const updated = await tx.city.update({
          where: { id: current.id },
          data: {
            ...(input.countryCode
              ? { countryCode: input.countryCode, countryName: countrySnapshot(input.countryCode) }
              : {}),
            ...(input.name
              ? { name: input.name.trim(), normalizedName: normalizeCustomerName(input.name) }
              : {}),
            ...(input.airportCode !== undefined
              ? { airportCode: cleanAirport(input.airportCode) }
              : {}),
            ...(input.status
              ? {
                  status: input.status,
                  deletedAt: input.status === 'ARCHIVED' ? new Date() : null,
                }
              : {}),
          },
          include: {
            createdBy: { select: userSelect },
            _count: { select: { destinationLinks: true } },
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'CITY_UPDATED', 'City', updated.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return updated;
      });
      return presentCity(city as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error, 'That city');
    }
  },

  async status(
    auth: AuthContext,
    cityId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getCity(auth, cityId);
    try {
      const city = await prisma.$transaction(async (tx) => {
        const updated = await tx.city.update({
          where: { id: current.id },
          data: { status, deletedAt: status === 'ARCHIVED' ? new Date() : null },
          include: {
            createdBy: { select: userSelect },
            _count: { select: { destinationLinks: true } },
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'CITY_STATUS_CHANGED', 'City', updated.id, context, {
            previousStatus: current.status,
            status,
          }),
        });
        return updated;
      });
      return presentCity(city as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error, 'An active city with that name');
    }
  },

  async archive(auth: AuthContext, cityId: string, context: MastersRequestContext) {
    const current = await getCity(auth, cityId);
    const city = await prisma.$transaction(async (tx) => {
      const updated = await tx.city.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
        include: {
          createdBy: { select: userSelect },
          _count: { select: { destinationLinks: true } },
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'CITY_ARCHIVED', 'City', updated.id, context, {
          destinationCount: current._count.destinationLinks,
        }),
      });
      return updated;
    });
    return presentCity(city as unknown as Record<string, unknown>);
  },
};

export const destinationsService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const canManage = await managerVisibility(auth, PERMISSIONS.MASTER_DESTINATIONS_UPDATE);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.DestinationWhereInput = {
      companyId: auth.companyId,
      ...(canManage
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.country ? { countryCode: String(query.country) } : {}),
      ...(query.destinationType
        ? { destinationType: String(query.destinationType) as DestinationType }
        : {}),
      ...(query.cityId ? { cities: { some: { cityId: String(query.cityId) } } } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: query.createdFrom as Date } : {}),
              ...(query.createdTo ? { lte: query.createdTo as Date } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { countryName: { contains: search, mode: 'insensitive' } },
              { cities: { some: { city: { name: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const order = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const sortBy = String(query.sortBy ?? 'name');
    const orderBy: Prisma.DestinationOrderByWithRelationInput =
      sortBy === 'country'
        ? { countryName: order }
        : sortBy === 'destinationType'
          ? { destinationType: order }
          : sortBy === 'cityCount'
            ? { cities: { _count: order } }
            : sortBy === 'createdAt'
              ? { createdAt: order }
              : sortBy === 'updatedAt'
                ? { updatedAt: order }
                : { name: order };
    const [rows, total] = await Promise.all([
      prisma.destination.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: destinationInclude,
      }),
      prisma.destination.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentDestination(row as unknown as Record<string, unknown>)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    return citiesService.lookups(auth, query);
  },

  async details(auth: AuthContext, destinationId: string) {
    return presentDestination(
      (await getDestination(auth, destinationId)) as unknown as Record<string, unknown>,
    );
  },

  async create(auth: AuthContext, input: DestinationInput, context: MastersRequestContext) {
    await validateCities(auth.companyId, input.countryCode, input.cityIds);
    try {
      const destination = await prisma.$transaction(async (tx) => {
        const created = await tx.destination.create({
          data: {
            companyId: auth.companyId,
            countryCode: input.countryCode,
            countryName: countrySnapshot(input.countryCode),
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            destinationType: input.destinationType,
            status: input.status,
            createdById: auth.userId,
            ...policyData(input),
            cities: {
              create: input.cityIds.map((cityId, sequence) => ({
                companyId: auth.companyId,
                cityId,
                sequence,
              })),
            },
          },
          include: destinationInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'DESTINATION_CREATED', 'Destination', created.id, context, {
            countryCode: created.countryCode,
            destinationType: created.destinationType,
            cityCount: input.cityIds.length,
          }),
        });
        return created;
      });
      return presentDestination(destination as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error, 'That destination');
    }
  },

  async update(
    auth: AuthContext,
    destinationId: string,
    input: DestinationUpdateInput,
    context: MastersRequestContext,
  ) {
    const current = await getDestination(auth, destinationId);
    const countryCode = input.countryCode ?? current.countryCode;
    if (input.cityIds) await validateCities(auth.companyId, countryCode, input.cityIds);
    else if (input.countryCode) {
      const validExisting = current.cities.every((link) => link.city.countryCode === countryCode);
      if (!validExisting)
        throw new ValidationError(
          'Remove cities from the previous country before changing country.',
        );
    }
    try {
      const destination = await prisma.$transaction(async (tx) => {
        if (input.cityIds) {
          await tx.destinationCity.deleteMany({ where: { destinationId: current.id } });
          await tx.destinationCity.createMany({
            data: input.cityIds.map((cityId, sequence) => ({
              companyId: auth.companyId,
              destinationId: current.id,
              cityId,
              sequence,
            })),
          });
        }
        await tx.destination.update({
          where: { id: current.id },
          data: {
            ...(input.countryCode
              ? { countryCode: input.countryCode, countryName: countrySnapshot(input.countryCode) }
              : {}),
            ...(input.name
              ? { name: input.name.trim(), normalizedName: normalizeCustomerName(input.name) }
              : {}),
            ...(input.destinationType ? { destinationType: input.destinationType } : {}),
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
            ...policyData(input),
          },
        });
        await tx.activityLog.create({
          data: audit(auth, 'DESTINATION_UPDATED', 'Destination', current.id, context, {
            changedFields: Object.keys(input),
            cityCount: input.cityIds?.length,
          }),
        });
        return tx.destination.findUniqueOrThrow({
          where: { id: current.id },
          include: destinationInclude,
        });
      });
      return presentDestination(destination as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error, 'That destination');
    }
  },

  async status(
    auth: AuthContext,
    destinationId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const current = await getDestination(auth, destinationId);
    try {
      const destination = await prisma.$transaction(async (tx) => {
        await tx.destination.update({
          where: { id: current.id },
          data: { status, deletedAt: status === 'ARCHIVED' ? new Date() : null },
        });
        await tx.activityLog.create({
          data: audit(auth, 'DESTINATION_STATUS_CHANGED', 'Destination', current.id, context, {
            previousStatus: current.status,
            status,
          }),
        });
        return tx.destination.findUniqueOrThrow({
          where: { id: current.id },
          include: destinationInclude,
        });
      });
      return presentDestination(destination as unknown as Record<string, unknown>);
    } catch (error) {
      duplicateError(error, 'An active destination with that name');
    }
  },

  async archive(auth: AuthContext, destinationId: string, context: MastersRequestContext) {
    const current = await getDestination(auth, destinationId);
    const destination = await prisma.$transaction(async (tx) => {
      await tx.destination.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
      });
      await tx.activityLog.create({
        data: audit(auth, 'DESTINATION_ARCHIVED', 'Destination', current.id, context, {
          cityCount: current.cities.length,
        }),
      });
      return tx.destination.findUniqueOrThrow({
        where: { id: current.id },
        include: destinationInclude,
      });
    });
    return presentDestination(destination as unknown as Record<string, unknown>);
  },

  async cities(auth: AuthContext, destinationId: string) {
    return presentDestination(
      (await getDestination(auth, destinationId)) as unknown as Record<string, unknown>,
    );
  },

  async addCity(
    auth: AuthContext,
    destinationId: string,
    cityId: string,
    context: MastersRequestContext,
  ) {
    const destination = await getDestination(auth, destinationId);
    await validateCities(auth.companyId, destination.countryCode, [cityId]);
    if (destination.cities.some((row) => row.cityId === cityId))
      throw new ConflictError('That city is already linked to this destination.');
    await prisma.$transaction(async (tx) => {
      await tx.destinationCity.create({
        data: {
          companyId: auth.companyId,
          destinationId,
          cityId,
          sequence: destination.cities.length,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'DESTINATION_CITY_ADDED', 'Destination', destinationId, context, {
          cityId,
        }),
      });
    });
    return this.details(auth, destinationId);
  },

  async removeCity(
    auth: AuthContext,
    destinationId: string,
    cityId: string,
    context: MastersRequestContext,
  ) {
    const destination = await getDestination(auth, destinationId);
    if (destination.cities.length <= 1)
      throw new ValidationError('A destination must retain at least one city.');
    const link = destination.cities.find((row) => row.cityId === cityId);
    if (!link) throw new NotFoundError('Destination city not found.');
    const remaining = destination.cities.filter((row) => row.cityId !== cityId);
    await prisma.$transaction(async (tx) => {
      await tx.destinationCity.delete({ where: { id: link.id } });
      for (const [sequence, row] of remaining.entries())
        await tx.destinationCity.update({ where: { id: row.id }, data: { sequence } });
      await tx.activityLog.create({
        data: audit(auth, 'DESTINATION_CITY_REMOVED', 'Destination', destinationId, context, {
          cityId,
        }),
      });
    });
    return this.details(auth, destinationId);
  },

  async reorderCities(
    auth: AuthContext,
    destinationId: string,
    cityIds: string[],
    context: MastersRequestContext,
  ) {
    const destination = await getDestination(auth, destinationId);
    const existing = new Set(destination.cities.map((row) => row.cityId));
    if (cityIds.length !== existing.size || cityIds.some((id) => !existing.has(id)))
      throw new ValidationError('Reorder must include every linked city exactly once.');
    await prisma.$transaction(async (tx) => {
      await tx.destinationCity.deleteMany({ where: { destinationId } });
      await tx.destinationCity.createMany({
        data: cityIds.map((cityId, sequence) => ({
          companyId: auth.companyId,
          destinationId,
          cityId,
          sequence,
        })),
      });
      await tx.activityLog.create({
        data: audit(auth, 'DESTINATION_CITY_REORDERED', 'Destination', destinationId, context, {
          cityCount: cityIds.length,
        }),
      });
    });
    return this.details(auth, destinationId);
  },

  async createImageUpload(
    auth: AuthContext,
    destinationId: string,
    input: DestinationImageUploadInput,
  ) {
    const destination = await getDestination(auth, destinationId);
    const max = env.DESTINATION_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Destination images must be ${env.DESTINATION_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = destinationImageObjectKey({
      companyId: auth.companyId,
      destinationId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = destination.pendingImageObjectKey;
    await prisma.destination.update({
      where: { id: destination.id },
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
        env.DESTINATION_IMAGE_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.DESTINATION_IMAGE_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },

  async confirmImage(auth: AuthContext, destinationId: string, context: MastersRequestContext) {
    const destination = await getDestination(auth, destinationId);
    const key = destination.pendingImageObjectKey;
    if (
      !key ||
      !destination.pendingImageFileName ||
      !destination.pendingImageMimeType ||
      !destination.pendingImageFileSize
    )
      throw new ValidationError('No destination image upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded destination image could not be found.');
    if (
      metadata.size !== destination.pendingImageFileSize ||
      metadata.contentType !== destination.pendingImageMimeType
    )
      throw new ValidationError('Uploaded image metadata does not match the approved file.');
    const oldKey = destination.imageObjectKey;
    const action = oldKey ? 'DESTINATION_IMAGE_REPLACED' : 'DESTINATION_IMAGE_UPLOADED';
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.destination.update({
        where: { id: destination.id },
        data: {
          imageStorageProvider: storageService.provider,
          imageBucket: storageService.bucket,
          imageObjectKey: key,
          imageFileName: destination.pendingImageFileName,
          imageMimeType: destination.pendingImageMimeType,
          imageFileSize: destination.pendingImageFileSize,
          imageConfirmedAt: new Date(),
          pendingImageObjectKey: null,
          pendingImageFileName: null,
          pendingImageMimeType: null,
          pendingImageFileSize: null,
        },
        include: destinationInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, action, 'Destination', destination.id, context, {
          mimeType: row.imageMimeType,
          fileSize: row.imageFileSize,
        }),
      });
      return row;
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return presentDestination(updated as unknown as Record<string, unknown>);
  },

  async imageDownload(auth: AuthContext, destinationId: string) {
    const destination = await getDestination(auth, destinationId);
    if (!destination.imageObjectKey || !destination.imageFileName || !destination.imageConfirmedAt)
      throw new NotFoundError('Destination image not found.');
    return {
      url: await storageService.createDownloadUrl(
        destination.imageObjectKey,
        destination.imageFileName,
        env.DESTINATION_IMAGE_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.DESTINATION_IMAGE_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },

  async deleteImage(auth: AuthContext, destinationId: string, context: MastersRequestContext) {
    const destination = await getDestination(auth, destinationId);
    const keys = [destination.imageObjectKey, destination.pendingImageObjectKey].filter(
      (value): value is string => Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.destination.update({
        where: { id: destination.id },
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
        data: audit(auth, 'DESTINATION_IMAGE_DELETED', 'Destination', destination.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },
};
