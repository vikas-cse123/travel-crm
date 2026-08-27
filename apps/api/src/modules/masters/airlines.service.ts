import crypto from 'node:crypto';
import { Prisma, type MasterStatus } from '@prisma/client';
import {
  MASTER_TYPE,
  PERMISSIONS,
  countryNameForCode,
  type AirlineInput,
  type AirlineLogoImportInput,
  type AirlineLogoUploadInput,
  type AirlineUpdateInput,
} from '@interscale/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { sniffImageMimeType } from './master-media.js';
import { airlineLogoObjectKey, storageService } from '../../services/storage/storage.service.js';
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

export type MastersRequestContext = { ipAddress: string | null; userAgent: string | null };
const userSelect = { id: true, fullName: true } as const;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);
const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;
const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;
const airlineInclude = { createdBy: { select: userSelect } } as const;
/** Hard ceiling when fetching a remote logo; oversized bodies are rejected. */
const LOGO_IMPORT_TIMEOUT_MS = 10_000;
const LOGO_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

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
    entityType: 'Airline',
    entityId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function presentAirline<T extends Record<string, unknown>>(row: T, scope: MasterScope) {
  const {
    companyId,
    normalizedName,
    deletedAt,
    logoBucket,
    logoObjectKey,
    logoStorageProvider,
    pendingLogoObjectKey,
    pendingLogoFileName,
    pendingLogoMimeType,
    pendingLogoFileSize,
    internalNotes,
    ...safe
  } = row;
  void companyId;
  void normalizedName;
  void deletedAt;
  void logoBucket;
  void logoStorageProvider;
  void pendingLogoObjectKey;
  void pendingLogoFileName;
  void pendingLogoMimeType;
  void pendingLogoFileSize;

  const global = Boolean(scope.systemCompanyId && String(companyId) === scope.systemCompanyId);
  const isTenantViewingGlobal = global && !scope.isSystemAdmin;

  return {
    ...safe,
    ...masterRecordMeta({ companyId: String(companyId) }, scope),
    ...(isTenantViewingGlobal ? {} : internalNotes !== undefined ? { internalNotes } : {}),
    hasLogo: Boolean(logoObjectKey && row.logoConfirmedAt),
  };
}

function duplicateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = String((error.meta?.target as string) ?? '');
    if (target.includes('iata')) throw new ConflictError('That IATA code is already in use.');
    if (target.includes('icao')) throw new ConflictError('That ICAO code is already in use.');
    throw new ConflictError('An airline with that name already exists.');
  }
  throw error;
}

function countrySnapshot(code: string | null | undefined): {
  countryCode: string | null;
  countryName: string | null;
} {
  if (!code) return { countryCode: null, countryName: null };
  const name = countryNameForCode(code);
  if (!name) throw new ValidationError('Select a valid country.');
  return { countryCode: code, countryName: name };
}

async function canManage(auth: AuthContext) {
  return has(auth, PERMISSIONS.MASTER_AIRLINES_UPDATE);
}

async function getAirline(
  auth: AuthContext,
  airlineId: string,
  scope: MasterScope,
  forManage = false,
) {
  const canManageAirlines = forManage ? true : await canManage(auth);
  const airline = await prisma.airline.findFirst({
    where: {
      id: airlineId,
      ...buildVisibleWhere(scope),
      ...(canManageAirlines ? {} : { status: 'ACTIVE', deletedAt: null }),
    },
    include: airlineInclude,
  });
  if (!airline) throw new NotFoundError('Airline not found.');
  return airline;
}

function writeData(input: AirlineInput | AirlineUpdateInput) {
  const key = <K extends keyof (AirlineInput & AirlineUpdateInput)>(k: K) => k in input;
  return {
    ...(key('name')
      ? { name: input.name!.trim(), normalizedName: normalizeCustomerName(input.name!) }
      : {}),
    ...(key('iataCode') ? { iataCode: blankToNull(input.iataCode) } : {}),
    ...(key('icaoCode') ? { icaoCode: blankToNull(input.icaoCode) } : {}),
    ...(key('countryCode') ? countrySnapshot(input.countryCode) : {}),
    ...(key('website') ? { website: blankToNull(input.website) } : {}),
    ...(key('internalNotes') ? { internalNotes: blankToNull(input.internalNotes) } : {}),
  };
}

export const airlinesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || 10,
    });
    const canManageAirlines = await canManage(auth);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = query.status ? (String(query.status) as MasterStatus) : undefined;
    const where: Prisma.AirlineWhereInput = {
      ...buildVisibleWhere(scope),
      ...(canManageAirlines
        ? status === 'ARCHIVED'
          ? { status: 'ARCHIVED' }
          : { deletedAt: null, ...(status ? { status } : {}) }
        : { status: 'ACTIVE', deletedAt: null }),
      ...(query.country ? { countryCode: String(query.country) } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { iataCode: { contains: search, mode: 'insensitive' } },
              { icaoCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const order = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortBy = String(query.sortBy ?? 'createdAt');
    const orderBy: Prisma.AirlineOrderByWithRelationInput =
      sortBy === 'createdAt'
        ? { createdAt: order }
        : sortBy === 'updatedAt'
          ? { updatedAt: order }
          : { name: order };
    const [rows, total] = await Promise.all([
      prisma.airline.findMany({
        where,
        ...toPrismaPagination(pagination),
        orderBy,
        include: airlineInclude,
      }),
      prisma.airline.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentAirline(row as unknown as Record<string, unknown>, scope)),
      pagination: buildPaginationMeta(pagination, total),
    };
  },

  async lookups(auth: AuthContext, query: Record<string, unknown>) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const airlines = await prisma.airline.findMany({
      where: {
        ...buildVisibleWhere(scope),
        status: 'ACTIVE',
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { iataCode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, iataCode: true, icaoCode: true },
    });
    return { airlines };
  },

  async details(auth: AuthContext, airlineId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    return presentAirline(
      (await getAirline(auth, airlineId, scope)) as unknown as Record<string, unknown>,
      scope,
    );
  },

  async create(auth: AuthContext, input: AirlineInput, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    try {
      const airline = await prisma.$transaction(async (tx) => {
        const created = await tx.airline.create({
          data: {
            companyId: auth.companyId,
            name: input.name.trim(),
            normalizedName: normalizeCustomerName(input.name),
            status: input.status,
            createdById: auth.userId,
            ...writeData(input),
          },
          include: airlineInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'AIRLINE_CREATED', created.id, context, {
            iataCode: created.iataCode,
            icaoCode: created.icaoCode,
            sourceGlobal: scope.isSystemAdmin,
          }),
        });
        return created;
      });
      return presentAirline(airline as unknown as Record<string, unknown>, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  async update(
    auth: AuthContext,
    airlineId: string,
    input: AirlineUpdateInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const current = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(current, scope);
    try {
      const airline = await prisma.$transaction(async (tx) => {
        const updated = await tx.airline.update({
          where: { id: current.id },
          data: {
            ...writeData(input),
            ...(input.status
              ? { status: input.status, deletedAt: input.status === 'ARCHIVED' ? new Date() : null }
              : {}),
          },
          include: airlineInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'AIRLINE_UPDATED', current.id, context, {
            changedFields: Object.keys(input),
          }),
        });
        return updated;
      });
      return presentAirline(airline as unknown as Record<string, unknown>, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  async status(
    auth: AuthContext,
    airlineId: string,
    status: MasterStatus,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const current = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(current, scope);
    try {
      const airline = await prisma.$transaction(async (tx) => {
        const updated = await tx.airline.update({
          where: { id: current.id },
          data: { status, deletedAt: status === 'ARCHIVED' ? new Date() : null },
          include: airlineInclude,
        });
        await tx.activityLog.create({
          data: audit(auth, 'AIRLINE_STATUS_CHANGED', current.id, context, {
            previousStatus: current.status,
            status,
          }),
        });
        return updated;
      });
      return presentAirline(airline as unknown as Record<string, unknown>, scope);
    } catch (error) {
      duplicateError(error);
    }
  },

  async archive(auth: AuthContext, airlineId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const current = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(current, scope);
    const airline = await prisma.$transaction(async (tx) => {
      const updated = await tx.airline.update({
        where: { id: current.id },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
        include: airlineInclude,
      });
      await tx.activityLog.create({ data: audit(auth, 'AIRLINE_ARCHIVED', current.id, context) });
      return updated;
    });
    return presentAirline(airline as unknown as Record<string, unknown>, scope);
  },

  async createLogoUpload(auth: AuthContext, airlineId: string, input: AirlineLogoUploadInput) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const airline = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(airline, scope);
    const max = env.AIRLINE_LOGO_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `Airline logos must be ${env.AIRLINE_LOGO_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const key = airlineLogoObjectKey({
      companyId: auth.companyId,
      airlineId,
      imageId: crypto.randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = airline.pendingLogoObjectKey;
    await prisma.airline.update({
      where: { id: airline.id },
      data: {
        pendingLogoObjectKey: key,
        pendingLogoFileName: input.fileName,
        pendingLogoMimeType: input.mimeType,
        pendingLogoFileSize: input.fileSize,
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

  async confirmLogo(auth: AuthContext, airlineId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const airline = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(airline, scope);
    const key = airline.pendingLogoObjectKey;
    if (
      !key ||
      !airline.pendingLogoFileName ||
      !airline.pendingLogoMimeType ||
      !airline.pendingLogoFileSize
    )
      throw new ValidationError('No airline logo upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded airline logo could not be found.');
    if (
      metadata.size !== airline.pendingLogoFileSize ||
      metadata.contentType !== airline.pendingLogoMimeType
    )
      throw new ValidationError('Uploaded logo metadata does not match the approved file.');
    const oldKey = airline.logoObjectKey;
    const action = oldKey ? 'AIRLINE_LOGO_REPLACED' : 'AIRLINE_LOGO_UPLOADED';
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.airline.update({
        where: { id: airline.id },
        data: {
          logoStorageProvider: storageService.provider,
          logoBucket: storageService.bucket,
          logoObjectKey: key,
          logoFileName: airline.pendingLogoFileName,
          logoMimeType: airline.pendingLogoMimeType,
          logoFileSize: airline.pendingLogoFileSize,
          logoConfirmedAt: new Date(),
          pendingLogoObjectKey: null,
          pendingLogoFileName: null,
          pendingLogoMimeType: null,
          pendingLogoFileSize: null,
        },
        include: airlineInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, action, airline.id, context, {
          mimeType: row.logoMimeType,
          fileSize: row.logoFileSize,
        }),
      });
      return row;
    });
    if (oldKey && oldKey !== key) await storageService.deleteObject(oldKey);
    return presentAirline(updated as unknown as Record<string, unknown>, scope);
  },

  /**
   * Import a remote airline logo (e.g. a provider/Google URL) server-side and
   * store it through the existing Airline Master storage flow. Idempotent:
   * an airline that already has a confirmed logo is returned untouched.
   * Download/validation failures leave the airline without a logo rather than
   * failing the caller's overall flow.
   */
  async importLogoFromUrl(
    auth: AuthContext,
    airlineId: string,
    input: AirlineLogoImportInput,
    context: MastersRequestContext,
  ) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const airline = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(airline, scope);
    if (airline.logoObjectKey && airline.logoConfirmedAt) {
      return presentAirline(airline as unknown as Record<string, unknown>, scope);
    }

    const response = await fetch(input.url, {
      headers: { Accept: 'image/jpeg,image/png,image/webp,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(LOGO_IMPORT_TIMEOUT_MS),
    });
    if (!response.ok) throw new ValidationError('The remote airline logo could not be downloaded.');
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) throw new ValidationError('The remote airline logo is empty.');
    const max = LOGO_IMPORT_MAX_BYTES;
    if (body.length > max)
      throw new ValidationError(
        `Airline logos must be ${Math.floor(max / (1024 * 1024))} MB or smaller.`,
      );
    const mimeType = sniffImageMimeType(body);
    if (!mimeType) throw new ValidationError('The remote file is not a valid airline logo image.');

    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const key = airlineLogoObjectKey({
      companyId: auth.companyId,
      airlineId: airline.id,
      imageId: crypto.randomUUID(),
      fileName: `airline-logo.${extension}`,
    });
    await storageService.putObject({ key, body, contentType: mimeType });

    const oldPending = airline.pendingLogoObjectKey;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.airline.update({
        where: { id: airline.id },
        data: {
          logoStorageProvider: storageService.provider,
          logoBucket: storageService.bucket,
          logoObjectKey: key,
          logoFileName: `airline-logo.${extension}`,
          logoMimeType: mimeType,
          logoFileSize: body.length,
          logoConfirmedAt: new Date(),
          pendingLogoObjectKey: null,
          pendingLogoFileName: null,
          pendingLogoMimeType: null,
          pendingLogoFileSize: null,
        },
        include: airlineInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'AIRLINE_LOGO_IMPORTED', airline.id, context, {
          mimeType,
          fileSize: body.length,
        }),
      });
      return row;
    });
    if (oldPending && oldPending !== key) await storageService.deleteObject(oldPending);
    return presentAirline(updated as unknown as Record<string, unknown>, scope);
  },

  async logoDownload(auth: AuthContext, airlineId: string) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const airline = await getAirline(auth, airlineId, scope);
    if (!airline.logoObjectKey || !airline.logoFileName || !airline.logoConfirmedAt)
      throw new NotFoundError('Airline logo not found.');
    return {
      url: await storageService.createDownloadUrl(
        airline.logoObjectKey,
        airline.logoFileName,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async deleteLogo(auth: AuthContext, airlineId: string, context: MastersRequestContext) {
    const scope = await resolveMasterScope(auth, MASTER_TYPE.AIRLINE);
    const airline = await getAirline(auth, airlineId, scope, true);
    assertCanModifyMaster(airline, scope);
    const keys = [airline.logoObjectKey, airline.pendingLogoObjectKey].filter(
      (value): value is string => Boolean(value),
    );
    await prisma.$transaction(async (tx) => {
      await tx.airline.update({
        where: { id: airline.id },
        data: {
          logoStorageProvider: null,
          logoBucket: null,
          logoObjectKey: null,
          logoFileName: null,
          logoMimeType: null,
          logoFileSize: null,
          logoConfirmedAt: null,
          pendingLogoObjectKey: null,
          pendingLogoFileName: null,
          pendingLogoMimeType: null,
          pendingLogoFileSize: null,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'AIRLINE_LOGO_DELETED', airline.id, context),
      });
    });
    await Promise.all(keys.map((key) => storageService.deleteObject(key)));
    return { deleted: true };
  },
};
