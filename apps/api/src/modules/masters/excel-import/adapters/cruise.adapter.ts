import crypto from 'node:crypto';
import { cruiseInputSchema, CRUISE_IMAGE_MIME_TYPES } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { env } from '../../../../config/env.js';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { ValidationError } from '../../../../utils/errors.js';
import { cruiseImageObjectKey, storageService } from '../../../../services/storage/storage.service.js';
import { sniffImageMimeType } from '../../master-media.js';
import { masterImageWriteData } from '../../master-images.js';
import { PERMISSIONS } from '@interscale/shared';
import type {
  ImportColumnDefinition,
  ImportApplyImageArgs,
  ResolveRowResult,
  UniquenessCheck,
} from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

/**
 * Cruise Master Excel import.
 *
 * ONE sheet, ONE cruise = ONE row. The first four columns are the base Cruise
 * fields (Cruise Name, Description, Price, Currency). Room Types follow as
 * repeated 4-column groups — `Room Type N`, `Room N Description`, `Room N Price`,
 * `Room N Currency` — and the importer dynamically recognises ANY number of
 * groups (the template ships with 3, users can add more). Blank groups are
 * ignored. There is no Status or image column; Cruise images are embedded
 * XLSX images anchored to the row and stored through the normal gallery.
 */
const BASE_CRUISE_COLUMNS: ImportColumnDefinition[] = [
  {
    field: 'name',
    header: 'Cruise Name',
    aliases: ['cruise name', 'cruise', 'name'],
    required: true,
    example: 'Mediterranean Explorer',
    description: 'Required. 2–200 characters.',
  },
  {
    field: 'description',
    header: 'Description',
    aliases: ['description', 'desc', 'details'],
    required: false,
    example: 'Luxury cruise through Mediterranean',
    description: 'Optional. Rich text (max 50k).',
  },
  {
    field: 'price',
    header: 'Price',
    aliases: ['price', 'cost', 'amount'],
    required: false,
    example: '50000',
    description: 'Optional. Non-negative number (max 99,999,999.99).',
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

const ROOM_EXAMPLES: Record<number, { type: string; description: string; price: string }> = {
  1: { type: 'Inside Stateroom', description: 'Comfortable interior room', price: '50000' },
  2: { type: 'Oceanview Stateroom', description: 'Ocean view room', price: '65000' },
  3: { type: 'Verandah Stateroom', description: 'Private balcony', price: '80000' },
};

function roomTypeColumns(n: number): ImportColumnDefinition[] {
  const example = ROOM_EXAMPLES[n];
  return [
    {
      field: `roomType${n}`,
      header: `Room Type ${n}`,
      aliases: [`room type ${n}`, `roomtype ${n}`, `room type ${n} name`],
      required: false,
      example: example?.type ?? '',
      description: 'Optional. Room type name.',
    },
    {
      field: `room${n}Description`,
      header: `Room ${n} Description`,
      aliases: [`room ${n} description`, `room${n} description`, `room type ${n} description`],
      required: false,
      example: example?.description ?? '',
      description: 'Optional. Room type description.',
    },
    {
      field: `room${n}Price`,
      header: `Room ${n} Price`,
      aliases: [`room ${n} price`, `room${n} price`, `room type ${n} price`],
      required: false,
      example: example?.price ?? '',
      description: 'Optional. Non-negative number.',
    },
    {
      field: `room${n}Currency`,
      header: `Room ${n} Currency`,
      aliases: [`room ${n} currency`, `room${n} currency`, `room type ${n} currency`],
      required: false,
      example: 'INR',
      description: 'Optional. Three-letter code (default INR).',
    },
  ];
}

export const cruiseColumns: ImportColumnDefinition[] = [
  ...BASE_CRUISE_COLUMNS,
  ...roomTypeColumns(1),
  ...roomTypeColumns(2),
  ...roomTypeColumns(3),
];

const maxImageBytes = () => env.CRUISE_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/** Detect the highest Room Type group index present in the file headers. */
function maxRoomTypeGroup(headers: string[]): number {
  let max = 0;
  for (const header of headers) {
    const norm = header.trim().toLowerCase().replace(/\s+/g, ' ');
    const typeMatch = /^room type (\d+)$/.exec(norm);
    const partMatch = /^room (\d+) (description|price|currency)$/.exec(norm);
    const match = typeMatch ?? partMatch;
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

const MAX_ROOM_TYPES = 50; // matches the shared cruiseInputSchema limit

export const cruiseAdapter = {
  masterType: 'CRUISE' as const,
  permission: PERMISSIONS.MASTER_CRUISES_CREATE,
  columns: cruiseColumns,
  zodSchema: cruiseInputSchema,
  resolveColumns: (headers: string[]): ImportColumnDefinition[] => {
    const maxN = Math.min(maxRoomTypeGroup(headers), MAX_ROOM_TYPES);
    const columns = [...BASE_CRUISE_COLUMNS];
    for (let n = 1; n <= maxN; n++) columns.push(...roomTypeColumns(n));
    return columns;
  },
  image: {
    mimeTypes: CRUISE_IMAGE_MIME_TYPES,
    maxBytes: maxImageBytes(),
  },
  duplicateKeys: (input: Record<string, unknown>): UniquenessCheck[] => [
    { key: normalizeCustomerName(String(input.name ?? '')), field: 'name', header: 'Cruise Name' },
  ],
  existingKeys: async (companyId: string) => {
    // Cruise names are uniquely constrained per company across soft-deleted
    // records (archiving keeps the row), so archived names still block imports.
    const rows = await prisma.cruise.findMany({
      where: { companyId },
      select: { normalizedName: true },
    });
    return new Set(rows.map((r) => r.normalizedName));
  },
  resolveRow: async (input: Record<string, unknown>): Promise<ResolveRowResult> => {
    const problems: ResolveRowResult['problems'] = [];
    const roomTypes: Array<{
      name: string;
      description: string | null;
      price: number | null;
      currency: string;
      status: string;
      sortOrder: number;
    }> = [];

    const maxN = Math.min(
      Math.max(
        0,
        ...Object.keys(input).map((key) => {
          const typeMatch = /^roomType(\d+)$/.exec(key);
          const partMatch = /^room(\d+)(Description|Price|Currency)$/.exec(key);
          const match = typeMatch ?? partMatch;
          return match ? Number(match[1]) : 0;
        }),
      ),
      MAX_ROOM_TYPES,
    );

    for (let n = 1; n <= maxN; n++) {
      const name = String(input[`roomType${n}`] ?? '').trim();
      const descriptionRaw = input[`room${n}Description`];
      const priceRaw = input[`room${n}Price`];
      const currencyRaw = input[`room${n}Currency`];
      const description = descriptionRaw != null && String(descriptionRaw).trim() !== '' ? String(descriptionRaw).trim() : null;
      const priceStr = priceRaw != null ? String(priceRaw).trim() : '';
      const currencyStr = currencyRaw != null ? String(currencyRaw).trim().toUpperCase() : '';
      const groupHasContent = name !== '' || description !== null || priceStr !== '' || currencyStr !== '';

      if (!groupHasContent) continue; // blank unused group → ignore

      if (name === '') {
        problems.push({
          field: `roomType${n}`,
          header: `Room Type ${n}`,
          value: null,
          message: `Room Type ${n} requires a name when the group is used.`,
        });
      } else if (name.length > 160) {
        problems.push({
          field: `roomType${n}`,
          header: `Room Type ${n}`,
          value: name,
          message: `Room Type ${n} name must be 160 characters or fewer.`,
        });
      }

      let price: number | null = null;
      if (priceStr !== '') {
        const parsed = Number(priceStr);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99_999_999.99) {
          problems.push({
            field: `room${n}Price`,
            header: `Room ${n} Price`,
            value: priceStr,
            message: `Room ${n} Price must be a non-negative number.`,
          });
        } else {
          price = parsed;
        }
      }

      let currency = 'INR';
      if (currencyStr !== '' && !/^[A-Z]{3}$/.test(currencyStr)) {
        problems.push({
          field: `room${n}Currency`,
          header: `Room ${n} Currency`,
          value: currencyStr,
          message: `Room ${n} Currency must be a three-letter code.`,
        });
      } else if (currencyStr !== '') {
        currency = currencyStr;
      }

      if (name !== '' && name.length <= 160) {
        roomTypes.push({ name, description, price, currency, status: 'ACTIVE', sortOrder: n - 1 });
      }
    }

    return { resolved: { ...input, roomTypes }, problems };
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const normalizedName = normalizeCustomerName(String(input.name));
    const roomTypes = (input.roomTypes as Array<{
      name: string;
      description: string | null;
      price: number | null;
      currency: string;
      status: string;
      sortOrder: number;
    }>) ?? [];
    const created = await tx.cruise.create({
      data: {
        companyId: auth.companyId,
        name: String(input.name).trim(),
        normalizedName,
        description: input.description ? String(input.description).trim() || null : null,
        price: input.price != null && input.price !== '' ? (input.price as number) : null,
        currency: input.currency ? String(input.currency).toUpperCase() : 'INR',
        status: 'ACTIVE',
        createdById: auth.userId,
        ...(roomTypes.length
          ? {
              roomTypes: {
                create: roomTypes.map((room) => ({
                  companyId: auth.companyId,
                  name: room.name,
                  description: room.description,
                  price: room.price,
                  currency: room.currency,
                  status: room.status as never,
                  sortOrder: room.sortOrder,
                })),
              },
            }
          : {}),
      },
    });
    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'CRUISE_CREATED',
        entityType: 'Cruise',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', roomTypeCount: roomTypes.length },
      },
    });
    return created.id;
  },
  applyImage: async ({ images, recordId, auth, context }: ImportApplyImageArgs) => {
    if (images.length === 0) return;
    const stored = [];
    for (const image of images) {
      const mimeType = image.mimeType ?? sniffImageMimeType(image.buffer);
      const allowedTypes = CRUISE_IMAGE_MIME_TYPES as readonly string[];
      if (!mimeType || !allowedTypes.includes(mimeType)) {
        throw new ValidationError('The row image is not a valid cruise image (JPEG, PNG, WebP or GIF).');
      }
      if (image.size > maxImageBytes()) {
        throw new ValidationError(`Cruise images must be ${env.CRUISE_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`);
      }
      const key = cruiseImageObjectKey({
        companyId: auth.companyId,
        cruiseId: recordId,
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
    await prisma.cruise.update({
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
        action: 'CRUISE_IMAGE_UPLOADED',
        entityType: 'Cruise',
        entityId: recordId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', imageCount: stored.length, firstImageId: stored[0]!.id },
      },
    });
  },
};