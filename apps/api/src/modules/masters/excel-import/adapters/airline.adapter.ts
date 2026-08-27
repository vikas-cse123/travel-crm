import crypto from 'node:crypto';
import { airlineInputSchema, AIRLINE_LOGO_MIME_TYPES } from '@interscale/shared';
import { countryNameForCode } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { env } from '../../../../config/env.js';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { ValidationError } from '../../../../utils/errors.js';
import { airlineLogoObjectKey, storageService } from '../../../../services/storage/storage.service.js';
import { sniffImageMimeType } from '../../master-media.js';
import { PERMISSIONS } from '@interscale/shared';
import type { ImportColumnDefinition, ImportApplyImageArgs, UniquenessCheck } from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

/**
 * Airline Master Excel import.
 *
 * The template has EXACTLY ONE column: Airline Name. IATA/ICAO/country/website/
 * notes/status are not part of Excel import, and there is no logo column —
 * a logo (if any) is embedded as an actual image anchored to the airline's row
 * and stored through the normal Airline logo storage. Imported airlines use the
 * normal default status (ACTIVE).
 */
export const airlineColumns: ImportColumnDefinition[] = [
  {
    field: 'name',
    header: 'Airline Name',
    aliases: ['airline name', 'airline', 'name'],
    required: true,
    example: 'Emirates',
    description: 'Required. 2–200 characters. Optional logo: embed the actual image in this row.',
  },
];

const blankToNull = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s || null;
};

const maxLogoBytes = () => env.AIRLINE_LOGO_MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export const airlineAdapter = {
  masterType: 'AIRLINE' as const,
  permission: PERMISSIONS.MASTER_AIRLINES_CREATE,
  columns: airlineColumns,
  zodSchema: airlineInputSchema,
  image: {
    mimeTypes: AIRLINE_LOGO_MIME_TYPES,
    maxBytes: maxLogoBytes(),
  },
  duplicateKeys: (input: Record<string, unknown>): UniquenessCheck[] => {
    const checks: UniquenessCheck[] = [
      {
        key: `name:${normalizeCustomerName(String(input.name ?? ''))}`,
        field: 'name',
        header: 'Airline Name',
      },
    ];
    const iata = input.iataCode ? String(input.iataCode).toUpperCase().trim() : '';
    const icao = input.icaoCode ? String(input.icaoCode).toUpperCase().trim() : '';
    if (iata) checks.push({ key: `iata:${iata}`, field: 'iataCode', header: 'IATA Code' });
    if (icao) checks.push({ key: `icao:${icao}`, field: 'icaoCode', header: 'ICAO Code' });
    return checks;
  },
  existingKeys: async (companyId: string) => {
    const rows = await prisma.airline.findMany({
      where: { companyId, deletedAt: null },
      select: { normalizedName: true, iataCode: true, icaoCode: true },
    });
    const keys = new Set<string>();
    for (const r of rows) {
      keys.add(`name:${r.normalizedName}`);
      if (r.iataCode) keys.add(`iata:${r.iataCode}`);
      if (r.icaoCode) keys.add(`icao:${r.icaoCode}`);
    }
    return keys;
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const normalizedName = normalizeCustomerName(String(input.name));
    const countryCode = input.countryCode ? String(input.countryCode).toUpperCase().trim() || null : null;
    const created = await tx.airline.create({
      data: {
        companyId: auth.companyId,
        name: String(input.name).trim(),
        normalizedName,
        iataCode: input.iataCode ? String(input.iataCode).toUpperCase().trim() || null : null,
        icaoCode: input.icaoCode ? String(input.icaoCode).toUpperCase().trim() || null : null,
        countryCode,
        countryName: countryCode ? countryNameForCode(countryCode) ?? null : null,
        website: blankToNull(input.website),
        internalNotes: blankToNull(input.internalNotes),
        status: ((input.status as string) ?? 'ACTIVE') as never,
        createdById: auth.userId,
      },
    });
    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'AIRLINE_CREATED',
        entityType: 'Airline',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import' },
      },
    });
    return created.id;
  },
  applyImage: async ({ images, recordId, auth, context }: ImportApplyImageArgs) => {
    // Preview already enforces the single-logo rule, so only the first image
    // reaches the storage path. Stored exactly like a manual logo upload.
    const image = images[0]!;
    const mimeType = image.mimeType ?? sniffImageMimeType(image.buffer);
    const allowedLogoTypes = AIRLINE_LOGO_MIME_TYPES as readonly string[];
    if (!mimeType || !allowedLogoTypes.includes(mimeType)) {
      throw new ValidationError('The row image is not a valid airline logo (JPEG, PNG or WebP).');
    }
    if (image.size > maxLogoBytes()) {
      throw new ValidationError(`Airline logos must be ${env.AIRLINE_LOGO_MAX_UPLOAD_SIZE_MB} MB or smaller.`);
    }
    const key = airlineLogoObjectKey({
      companyId: auth.companyId,
      airlineId: recordId,
      imageId: crypto.randomUUID(),
      fileName: image.fileName,
    });
    await storageService.putObject({ key, body: image.buffer, contentType: mimeType });
    await prisma.airline.update({
      where: { id: recordId },
      data: {
        logoStorageProvider: storageService.provider,
        logoBucket: storageService.bucket,
        logoObjectKey: key,
        logoFileName: image.fileName,
        logoMimeType: mimeType,
        logoFileSize: image.size,
        logoConfirmedAt: new Date(),
        pendingLogoObjectKey: null,
        pendingLogoFileName: null,
        pendingLogoMimeType: null,
        pendingLogoFileSize: null,
      },
    });
    await prisma.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'AIRLINE_LOGO_IMPORTED',
        entityType: 'Airline',
        entityId: recordId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', mimeType, fileSize: image.size },
      },
    });
  },
};