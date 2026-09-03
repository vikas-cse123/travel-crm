import crypto from 'node:crypto';
import { z } from 'zod';
import { SIGHTSEEING_IMAGE_MIME_TYPES, MASTER_TYPE, PERMISSIONS } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import { Prisma } from '@prisma/client';
import { env } from '../../../../config/env.js';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { ValidationError } from '../../../../utils/errors.js';
import { sightseeingImageObjectKey, storageService } from '../../../../services/storage/storage.service.js';
import { sniffImageMimeType } from '../../master-media.js';
import { masterImageWriteData } from '../../master-images.js';
import { sanitizeRichText } from '../../masters.service.js';
import { buildVisibleWhere, resolveMasterScope } from '../../master-visibility.js';
import type {
  ImportColumnDefinition,
  ImportApplyImageArgs,
  ResolveRowResult,
  UniquenessCheck,
} from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

/**
 * Sightseeing Master Excel import.
 *
 * ONE sheet, ONE sightseeing = ONE row. The first eight columns are the base
 * fields (Destination, City, Title, Sequence, Estimated Hours, Suggested Start
 * Time, Description, Remarks). Pricing categories follow as repeated 3-column
 * groups — `Category N`, `Price N`, `Currency N` — dynamically recognised in
 * any number (template ships with 3; users add more). There is no Status or
 * image column; Sightseeing images are embedded XLSX images anchored to the row
 * and stored through the normal gallery. Destination/City are entered by name
 * and resolved to existing records (the City must belong to the Destination).
 */
const BASE_SIGHTSEEING_COLUMNS: ImportColumnDefinition[] = [
  {
    field: 'destination',
    header: 'Destination',
    aliases: ['destination', 'destination name'],
    required: true,
    example: 'Singapore',
    description: 'Required. An existing Destination name.',
  },
  {
    field: 'city',
    header: 'City',
    aliases: ['city', 'city name'],
    required: true,
    example: 'Singapore',
    description: 'Required. An existing City that belongs to the Destination.',
  },
  {
    field: 'title',
    header: 'Title',
    aliases: ['title', 'sightseeing title', 'name'],
    required: true,
    example: 'Marina Bay Tour',
    description: 'Required. 2–250 characters.',
  },
  {
    field: 'sequence',
    header: 'Sequence',
    aliases: ['sequence', 'seq', 'order'],
    required: true,
    example: '1',
    description: 'Required. Positive whole number. Preserved as entered.',
  },
  {
    field: 'estimatedHours',
    header: 'Estimated Hours',
    aliases: ['estimated hours', 'estimated hours (decimal)', 'hours'],
    required: false,
    example: '3',
    description: 'Optional. Number of hours (e.g. 2, 2.5, 3).',
  },
  {
    field: 'suggestedStartTime',
    header: 'Suggested Start Time',
    aliases: ['suggested start time', 'start time', 'suggested start'],
    required: false,
    example: '10:00',
    description: 'Optional. HH:MM 24-hour time (e.g. 10:00, 18:30).',
  },
  {
    field: 'description',
    header: 'Description',
    aliases: ['description', 'desc', 'details'],
    required: false,
    example: 'City highlights',
    description: 'Optional. Free text.',
  },
  {
    field: 'remarks',
    header: 'Remarks',
    aliases: ['remarks', 'notes', 'remark'],
    required: false,
    example: 'Bring ID',
    description: 'Optional. Free text.',
  },
];

const PRICING_EXAMPLES: Record<number, { category: string; price: string }> = {
  1: { category: 'Adult', price: '5000' },
  2: { category: 'Child', price: '3000' },
  3: { category: 'Senior', price: '4000' },
};

function pricingColumns(n: number): ImportColumnDefinition[] {
  const example = PRICING_EXAMPLES[n];
  return [
    {
      field: `category${n}`,
      header: `Category ${n}`,
      aliases: [`category ${n}`, `category${n}`, `price category ${n}`],
      required: false,
      example: example?.category ?? '',
      description: 'Optional. Pricing category label.',
    },
    {
      field: `price${n}`,
      header: `Price ${n}`,
      aliases: [`price ${n}`, `price${n}`],
      required: false,
      example: example?.price ?? '',
      description: 'Optional. Non-negative number.',
    },
    {
      field: `currency${n}`,
      header: `Currency ${n}`,
      aliases: [`currency ${n}`, `currency${n}`],
      required: false,
      example: 'INR',
      description: 'Optional. Three-letter code (default INR).',
    },
  ];
}

export const sightseeingColumns: ImportColumnDefinition[] = [
  ...BASE_SIGHTSEEING_COLUMNS,
  ...pricingColumns(1),
  ...pricingColumns(2),
  ...pricingColumns(3),
];

const sightseeingImportSchema = z.object({
  destination: z.string().trim().min(1, 'Destination is required.'),
  city: z.string().trim().min(1, 'City is required.'),
  title: z.string().trim().min(2, 'Title is required.').max(250),
  sequence: z.coerce
    .number()
    .int('Sequence must be a whole number.')
    .min(1, 'Sequence must be at least 1.')
    .max(100_000, 'Sequence looks too large.'),
  estimatedHours: z.coerce
    .number()
    .min(0, 'Estimated hours cannot be negative.')
    .max(999.99, 'Estimated hours looks too large.')
    .nullable()
    .optional(),
  suggestedStartTime: z
    .string()
    .trim()
    .refine((value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a HH:MM time.')
    .nullable()
    .optional(),
  description: z.string().trim().max(50_000).nullable().optional(),
  remarks: z.string().trim().max(50_000).nullable().optional(),
});

const maxImageBytes = () => env.SIGHTSEEING_IMAGE_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const MAX_PRICING_GROUPS = 20; // matches the shared sightseeingInputSchema pricing limit

/** Detect the highest pricing group index present in the file headers. */
function maxPricingGroup(headers: string[]): number {
  let max = 0;
  for (const header of headers) {
    const norm = header.trim().toLowerCase().replace(/\s+/g, ' ');
    const match =
      /^category (\d+)$/.exec(norm) ||
      /^price (\d+)$/.exec(norm) ||
      /^currency (\d+)$/.exec(norm);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** Resolve a Destination by name, scoped to what the company can see. */
async function resolveDestination(auth: AuthContext, name: string) {
  if (!name) return null;
  const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
  return prisma.destination.findFirst({
    where: {
      ...buildVisibleWhere(scope),
      normalizedName: normalizeCustomerName(name),
      status: 'ACTIVE',
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
}

/** Resolve a City by name that is linked to the given destination. */
async function resolveCityInDestination(
  auth: AuthContext,
  destinationId: string,
  name: string,
) {
  if (!destinationId || !name) return null;
  const scope = await resolveMasterScope(auth, MASTER_TYPE.SIGHTSEEING);
  return prisma.city.findFirst({
    where: {
      ...buildVisibleWhere(scope),
      normalizedName: normalizeCustomerName(name),
      status: 'ACTIVE',
      deletedAt: null,
      destinationLinks: { some: { destinationId } },
    },
    select: { id: true, name: true },
  });
}

const blankToNull = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s || null;
};

export const sightseeingAdapter = {
  masterType: 'SIGHTSEEING' as const,
  permission: PERMISSIONS.MASTER_SIGHTSEEING_CREATE,
  columns: sightseeingColumns,
  zodSchema: sightseeingImportSchema,
  resolveColumns: (headers: string[]): ImportColumnDefinition[] => {
    const maxN = Math.min(maxPricingGroup(headers), MAX_PRICING_GROUPS);
    const columns = [...BASE_SIGHTSEEING_COLUMNS];
    for (let n = 1; n <= maxN; n++) columns.push(...pricingColumns(n));
    return columns;
  },
  image: {
    mimeTypes: SIGHTSEEING_IMAGE_MIME_TYPES,
    maxBytes: maxImageBytes(),
  },
  duplicateKeys: async (input: Record<string, unknown>, auth: AuthContext): Promise<UniquenessCheck[]> => {
    const destination = await resolveDestination(auth, String(input.destination ?? '').trim());
    const city = destination
      ? await resolveCityInDestination(auth, destination.id, String(input.city ?? '').trim())
      : null;
    const key = `${city?.id ?? ''}:${normalizeCustomerName(String(input.title ?? ''))}`;
    return [{ key, field: 'title', header: 'Title' }];
  },
  existingKeys: async (companyId: string) => {
    // Sightseeings are uniquely constrained per company + city + title across
    // soft-deleted rows, so archived titles still block imports.
    const rows = await prisma.sightseeing.findMany({
      where: { companyId },
      select: { cityId: true, normalizedTitle: true },
    });
    return new Set(rows.map((r) => `${r.cityId}:${r.normalizedTitle}`));
  },
  resolveRow: async (input: Record<string, unknown>, auth: AuthContext): Promise<ResolveRowResult> => {
    const problems: ResolveRowResult['problems'] = [];
    const destinationName = String(input.destination ?? '').trim();
    const cityName = String(input.city ?? '').trim();

    const destination = await resolveDestination(auth, destinationName);
    if (!destination) {
      problems.push({
        field: 'destination',
        header: 'Destination',
        value: destinationName || null,
        message: `Destination "${destinationName}" could not be found.`,
      });
    }
    const city = destination
      ? await resolveCityInDestination(auth, destination.id, cityName)
      : null;
    if (destination && !city) {
      problems.push({
        field: 'city',
        header: 'City',
        value: cityName || null,
        message: `City "${cityName}" could not be found in destination "${destination.name}".`,
      });
    }

    // Pricing categories.
    const pricing: Array<{ label: string; price: number | null; currency: string }> = [];
    const maxN = Math.min(
      Math.max(
        0,
        ...Object.keys(input).map((key) => {
          const match = /^(category|price|currency)(\d+)$/.exec(key);
          return match ? Number(match[2]) : 0;
        }),
      ),
      MAX_PRICING_GROUPS,
    );
    for (let n = 1; n <= maxN; n++) {
      const label = String(input[`category${n}`] ?? '').trim();
      const priceStr = input[`price${n}`] != null ? String(input[`price${n}`]).trim() : '';
      const currencyStr = input[`currency${n}`] != null ? String(input[`currency${n}`]).trim() : '';
      if (label === '' && priceStr === '' && currencyStr === '') continue; // blank group

      if (label === '') {
        problems.push({
          field: `category${n}`,
          header: `Category ${n}`,
          value: null,
          message: `Category ${n} requires a label when the group is used.`,
        });
      } else if (label.length > 60) {
        problems.push({
          field: `category${n}`,
          header: `Category ${n}`,
          value: label,
          message: `Category ${n} label must be 60 characters or fewer.`,
        });
      }

      let price: number | null = null;
      if (priceStr !== '') {
        const parsed = Number(priceStr);
        if (!Number.isFinite(parsed) || parsed < 0) {
          problems.push({
            field: `price${n}`,
            header: `Price ${n}`,
            value: priceStr,
            message: `Price ${n} must be a non-negative number.`,
          });
        } else {
          price = parsed;
        }
      }

      let currency = 'INR';
      if (currencyStr !== '') {
        if (!/^[A-Za-z]{3}$/.test(currencyStr)) {
          problems.push({
            field: `currency${n}`,
            header: `Currency ${n}`,
            value: currencyStr,
            message: `Currency ${n} must be a three-letter code.`,
          });
        } else {
          currency = currencyStr.toUpperCase();
        }
      }

      if (label !== '' && label.length <= 60) {
        pricing.push({ label, price, currency });
      }
    }

    return {
      resolved: {
        ...input,
        destinationId: destination?.id,
        cityId: city?.id,
        pricing,
      },
      problems,
    };
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const destinationId = String(input.destinationId ?? '');
    const cityId = String(input.cityId ?? '');
    if (!destinationId || !cityId) throw new ValidationError('Destination and City must resolve to existing records.');
    const link = await tx.destinationCity.findFirst({ where: { destinationId, cityId } });
    if (!link) throw new ValidationError('The selected city must be linked to the selected destination.');
    const pricing = (input.pricing as Array<{ label: string; price: number | null; currency: string }>) ?? [];
    const title = String(input.title).trim();
    const created = await tx.sightseeing.create({
      data: {
        companyId: auth.companyId,
        destinationId,
        cityId,
        title,
        normalizedTitle: normalizeCustomerName(title),
        sequence: Number(input.sequence),
        status: 'ACTIVE',
        createdById: auth.userId,
        estimatedHours:
          input.estimatedHours != null && input.estimatedHours !== '' ? Number(input.estimatedHours) : null,
        suggestedStartTime: blankToNull(input.suggestedStartTime),
        description: sanitizeRichText(input.description as string | null | undefined),
        remarks: sanitizeRichText(input.remarks as string | null | undefined),
        pricing: pricing.length ? (pricing as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'SIGHTSEEING_CREATED',
        entityType: 'Sightseeing',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', destinationId, cityId, sequence: created.sequence, pricingCount: pricing.length },
      },
    });
    return created.id;
  },
  applyImage: async ({ images, recordId, auth, context }: ImportApplyImageArgs) => {
    if (images.length === 0) return;
    const stored = [];
    for (const image of images) {
      const mimeType = image.mimeType ?? sniffImageMimeType(image.buffer);
      const allowedTypes = SIGHTSEEING_IMAGE_MIME_TYPES as readonly string[];
      if (!mimeType || !allowedTypes.includes(mimeType)) {
        throw new ValidationError('The row image is not a valid sightseeing image (JPEG, PNG, WebP or GIF).');
      }
      if (image.size > maxImageBytes()) {
        throw new ValidationError(`Sightseeing images must be ${env.SIGHTSEEING_IMAGE_MAX_UPLOAD_SIZE_MB} MB or smaller.`);
      }
      const key = sightseeingImageObjectKey({
        companyId: auth.companyId,
        sightseeingId: recordId,
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
    await prisma.sightseeing.update({
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
        action: 'SIGHTSEEING_IMAGE_UPLOADED',
        entityType: 'Sightseeing',
        entityId: recordId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', imageCount: stored.length, firstImageId: stored[0]!.id },
      },
    });
  },
};