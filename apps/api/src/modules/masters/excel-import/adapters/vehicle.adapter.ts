import crypto from 'node:crypto';
import { vehicleInputSchema, VEHICLE_IMAGE_MIME_TYPES } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { env } from '../../../../config/env.js';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { ValidationError } from '../../../../utils/errors.js';
import { storageService, vehicleImageObjectKey } from '../../../../services/storage/storage.service.js';
import { sniffImageMimeType } from '../../master-media.js';
import { masterImageWriteData } from '../../master-images.js';
import { PERMISSIONS } from '@interscale/shared';
import type { ImportColumnDefinition, ImportApplyImageArgs, UniquenessCheck } from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

export const vehicleColumns: ImportColumnDefinition[] = [
  {
    field: 'name',
    header: 'Vehicle Name',
    aliases: ['vehicle name', 'vehicle', 'name'],
    required: true,
    example: 'Luxury Coach',
    description: 'Required. 2–200 characters.',
  },
  {
    field: 'vehicleType',
    header: 'Vehicle Type',
    aliases: ['vehicle type', 'type', 'category'],
    required: true,
    example: 'AC Coach',
    description: 'Required. 1–120 characters.',
  },
  {
    field: 'capacity',
    header: 'Capacity',
    aliases: ['capacity', 'seats', 'passengers'],
    required: false,
    example: '45',
    description: 'Optional. Integer 1–1000.',
  },
  {
    field: 'description',
    header: 'Description',
    aliases: ['description', 'desc'],
    required: false,
    example: 'Spacious coach with AC',
    description: 'Optional. Free text (max 50k).',
  },
  {
    field: 'price',
    header: 'Price',
    aliases: ['price', 'cost', 'amount'],
    required: false,
    example: '12000',
    description: 'Optional. Non-negative number.',
  },
  {
    field: 'currency',
    header: 'Currency',
    aliases: ['currency', 'curr'],
    required: false,
    example: 'INR',
    description: 'Optional. Three-letter code (default INR).',
  },
];

const maxImageBytes = () => env.VEHICLE_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export const vehicleAdapter = {
  masterType: 'VEHICLE' as const,
  permission: PERMISSIONS.MASTER_VEHICLES_CREATE,
  columns: vehicleColumns,
  zodSchema: vehicleInputSchema,
  image: {
    mimeTypes: VEHICLE_IMAGE_MIME_TYPES,
    maxBytes: maxImageBytes(),
  },
  duplicateKeys: (input: Record<string, unknown>): UniquenessCheck[] => [
    { key: normalizeCustomerName(String(input.name ?? '')), field: 'name', header: 'Vehicle Name' },
  ],
  existingKeys: async (companyId: string) => {
    // Vehicle names are uniquely constrained per company across soft-deleted
    // records (archiving keeps the row), so archived names still block imports.
    const rows = await prisma.vehicle.findMany({
      where: { companyId },
      select: { normalizedName: true },
    });
    return new Set(rows.map((r) => r.normalizedName));
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const normalizedName = normalizeCustomerName(String(input.name));
    const created = await tx.vehicle.create({
      data: {
        companyId: auth.companyId,
        name: String(input.name).trim(),
        normalizedName,
        vehicleType: String(input.vehicleType).trim(),
        capacity: input.capacity != null && input.capacity !== '' ? Number(input.capacity) : null,
        description: input.description ? String(input.description).trim() || null : null,
        price: input.price != null && input.price !== '' ? (input.price as number) : null,
        currency: input.currency ? String(input.currency).toUpperCase() : 'INR',
        status: ((input.status as string) ?? 'ACTIVE') as never,
        createdById: auth.userId,
      },
    });
    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'VEHICLE_CREATED',
        entityType: 'Vehicle',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import' },
      },
    });
    return created.id;
  },
  applyImage: async ({ images, recordId, auth, context }: ImportApplyImageArgs) => {
    if (images.length === 0) return;
    const stored = [];
    for (const image of images) {
      const mimeType = image.mimeType ?? sniffImageMimeType(image.buffer);
      const allowedTypes = VEHICLE_IMAGE_MIME_TYPES as readonly string[];
      if (!mimeType || !allowedTypes.includes(mimeType)) {
        throw new ValidationError('The row image is not a valid vehicle image (JPEG, PNG, WebP or GIF).');
      }
      if (image.size > maxImageBytes()) {
        throw new ValidationError(`Vehicle images must be ${env.VEHICLE_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`);
      }
      const key = vehicleImageObjectKey({
        companyId: auth.companyId,
        vehicleId: recordId,
        imageId: crypto.randomUUID(),
        fileName: image.fileName,
      });
      await storageService.putObject({ key, body: image.buffer, contentType: mimeType });
      stored.push({
        id: crypto.randomUUID(),
        objectKey: key,
        fileName: image.fileName,
        mimeType,
        fileSize: image.size,
        confirmedAt: new Date().toISOString(),
      });
    }
    await prisma.vehicle.update({
      where: { id: recordId },
      data: {
        imageStorageProvider: storageService.provider,
        imageBucket: storageService.bucket,
        ...masterImageWriteData(stored),
        pendingImageObjectKey: null,
        pendingImageFileName: null,
        pendingImageMimeType: null,
        pendingImageFileSize: null,
      },
    });
    await prisma.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'VEHICLE_IMAGE_UPLOADED',
        entityType: 'Vehicle',
        entityId: recordId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', imageCount: stored.length, firstImageId: stored[0]!.id },
      },
    });
  },
};