import { z } from 'zod';
import { countryCodeForName, countryNameForCode } from '@interscale/shared';
import { PERMISSIONS } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import type { ImportColumnDefinition, ResolveRowResult, UniquenessCheck } from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

/**
 * City Master Excel import.
 *
 * The user-facing column is a human-readable Country NAME ("India"), never a
 * country code. `resolveRow` resolves the name to the same ISO alpha-2 code the
 * manual City create flow stores. `cityInputSchema` is kept as the source of
 * truth for field-level validation; the import schema mirrors it but replaces
 * `countryCode` with `country`.
 */
export const cityColumns: ImportColumnDefinition[] = [
  {
    field: 'country',
    header: 'Country',
    aliases: ['country', 'country name', 'country code'],
    required: true,
    example: 'India',
    description: 'Required. Country name (e.g., India, United States, United Arab Emirates).',
  },
  {
    field: 'name',
    header: 'City Name',
    aliases: ['city name', 'city', 'name'],
    required: true,
    example: 'Mumbai',
    description: 'Required. 2–160 characters.',
  },
  {
    field: 'airportCode',
    header: 'Airport Code',
    aliases: ['airport code', 'airport', 'iata', 'airportcode'],
    required: false,
    example: 'BOM',
    description: 'Optional. Three-letter airport code.',
  },
];

const cityImportSchema = z.object({
  country: z.string().trim().min(1, 'Country is required.'),
  name: z.string().trim().min(2, 'City name is required.').max(160),
  airportCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === '' || /^[A-Z]{3}$/.test(value), 'Use a three-letter airport code.')
    .nullable()
    .optional(),
});

export const cityAdapter = {
  masterType: 'CITY' as const,
  permission: PERMISSIONS.MASTER_CITIES_CREATE,
  columns: cityColumns,
  zodSchema: cityImportSchema,
  duplicateKeys: (input: Record<string, unknown>): UniquenessCheck[] => {
    const normalized = normalizeCustomerName(String(input.name ?? ''));
    const cc = countryCodeForName(String(input.country ?? '')) ?? '';
    return [{ key: `${cc}:${normalized}`, field: 'name', header: 'City Name' }];
  },
  existingKeys: async (companyId: string) => {
    const rows = await prisma.city.findMany({
      where: { companyId, deletedAt: null },
      select: { countryCode: true, normalizedName: true },
    });
    return new Set(rows.map((r) => `${r.countryCode}:${r.normalizedName}`));
  },
  resolveRow: async (input: Record<string, unknown>): Promise<ResolveRowResult> => {
    const country = String(input.country ?? '').trim();
    const countryCode = countryCodeForName(country);
    if (!countryCode) {
      return {
        resolved: input,
        problems: [
          {
            field: 'country',
            header: 'Country',
            value: country || null,
            message: `Unknown country "${country}".`,
          },
        ],
      };
    }
    return { resolved: { ...input, countryCode }, problems: [] };
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const normalizedName = normalizeCustomerName(String(input.name));
    const cc = String(input.countryCode ?? '').toUpperCase();
    const airport = input.airportCode ? String(input.airportCode).toUpperCase().trim() || null : null;
    const created = await tx.city.create({
      data: {
        companyId: auth.companyId,
        countryCode: cc,
        countryName: countryNameForCode(cc) ?? cc,
        name: String(input.name).trim(),
        normalizedName,
        airportCode: airport,
        status: 'ACTIVE',
        createdById: auth.userId,
      },
    });
    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'CITY_CREATED',
        entityType: 'City',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import' },
      },
    });
    return created.id;
  },
};