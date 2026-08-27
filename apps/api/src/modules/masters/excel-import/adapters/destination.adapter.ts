import { z } from 'zod';
import {
  DESTINATION_TYPES,
  MASTER_TYPE,
  PERMISSIONS,
  countryCodeForName,
  countryNameForCode,
} from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { ValidationError } from '../../../../utils/errors.js';
import { buildVisibleWhere, resolveMasterScope } from '../../master-visibility.js';
import { sanitizeRichText } from '../../masters.service.js';
import type { ImportColumnDefinition, ResolveRowResult, UniquenessCheck } from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

/**
 * Destination Master Excel import.
 *
 * The user-facing template has exactly nine columns — Country (a human-readable
 * country name), Destination Name, Destination Type, Cities, Inclusions,
 * Exclusions, Payment Policies, Cancellation Policies and Booking Terms &
 * Conditions. Destination images are OUT OF SCOPE for Excel import; the manual
 * Destination image flow is untouched.
 *
 * Destination Type is optional and defaults to DOMESTIC. Cities are entered as
 * comma-separated names and resolved to existing, active, same-country City
 * master records — the same rules the manual Destination create flow enforces.
 */
export const destinationColumns: ImportColumnDefinition[] = [
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
    header: 'Destination Name',
    aliases: ['destination name', 'destination', 'name'],
    required: true,
    example: 'Rajasthan Highlights',
    description: 'Required. 2–200 characters.',
  },
  {
    field: 'destinationType',
    header: 'Destination Type',
    aliases: ['destination type', 'type', 'destinationtype'],
    required: false,
    example: 'DOMESTIC',
    description: 'Optional. Blank defaults to DOMESTIC. DOMESTIC or INTERNATIONAL.',
  },
  {
    field: 'cities',
    header: 'Cities',
    aliases: ['cities', 'city', 'city names'],
    required: true,
    example: 'Jaipur, Udaipur',
    description: 'Required. Comma-separated city names that already exist in your Cities master and belong to the chosen country.',
  },
  {
    field: 'inclusions',
    header: 'Inclusions',
    aliases: ['inclusions', 'includes', 'included'],
    required: false,
    example: 'Hotels and sightseeing',
    description: 'Optional. Free text.',
  },
  {
    field: 'exclusions',
    header: 'Exclusions',
    aliases: ['exclusions', 'excludes', 'excluded'],
    required: false,
    example: 'Flights',
    description: 'Optional. Free text.',
  },
  {
    field: 'paymentPolicies',
    header: 'Payment Policies',
    aliases: ['payment policies', 'payment policy', 'payment'],
    required: false,
    example: '50% advance',
    description: 'Optional. Free text.',
  },
  {
    field: 'cancellationPolicies',
    header: 'Cancellation Policies',
    aliases: ['cancellation policies', 'cancellation policy', 'cancellation'],
    required: false,
    example: 'Non-refundable within 7 days',
    description: 'Optional. Free text.',
  },
  {
    field: 'bookingTerms',
    header: 'Booking Terms & Conditions',
    aliases: ['booking terms & conditions', 'booking terms', 'booking term', 'terms'],
    required: false,
    example: 'Standard booking terms',
    description: 'Optional. Free text.',
  },
];

const destinationImportSchema = z.object({
  country: z.string().trim().min(1, 'Country is required.'),
  name: z.string().trim().min(2, 'Destination name is required.').max(200),
  // Optional — blank defaults to DOMESTIC.
  destinationType: z.enum(DESTINATION_TYPES, { invalid_type_error: 'Select a destination type.' }).default('DOMESTIC'),
  // City names are resolved to tenant city ids in resolveRow().
  cities: z.string().trim().optional().default(''),
  inclusions: z.string().trim().max(50_000).nullable().optional(),
  exclusions: z.string().trim().max(50_000).nullable().optional(),
  paymentPolicies: z.string().trim().max(50_000).nullable().optional(),
  cancellationPolicies: z.string().trim().max(50_000).nullable().optional(),
  bookingTerms: z.string().trim().max(50_000).nullable().optional(),
});

const blankToNull = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s || null;
};

async function resolveCityIds(
  input: Record<string, unknown>,
  auth: AuthContext,
): Promise<{ cityIds: string[]; problems: ResolveRowResult['problems'] }> {
  const raw = String(input.cities ?? '');
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const problems: ResolveRowResult['problems'] = [];
  if (names.length === 0) {
    problems.push({
      field: 'cities',
      header: 'Cities',
      value: raw || null,
      message: 'At least one city is required.',
    });
    return { cityIds: [], problems };
  }

  const countryCode = String(input.countryCode ?? '').toUpperCase();
  const normalized = [...new Set(names.map(normalizeCustomerName))];
  const scope = await resolveMasterScope(auth, MASTER_TYPE.DESTINATION);
  const cities = await prisma.city.findMany({
    where: {
      countryCode,
      status: 'ACTIVE',
      deletedAt: null,
      AND: [buildVisibleWhere(scope), { OR: normalized.map((name) => ({ normalizedName: name })) }],
    },
    select: { id: true, normalizedName: true },
  });
  const byName = new Map(cities.map((city) => [city.normalizedName, city.id]));
  const cityIds: string[] = [];
  for (const name of normalized) {
    const id = byName.get(name);
    if (id) {
      cityIds.push(id);
    } else {
      problems.push({
        field: 'cities',
        header: 'Cities',
        value: name,
        message: `City "${name}" could not be found in ${String(input.country ?? '') || countryCode}.`,
      });
    }
  }
  return { cityIds, problems };
}

export const destinationAdapter = {
  masterType: 'DESTINATION' as const,
  permission: PERMISSIONS.MASTER_DESTINATIONS_CREATE,
  columns: destinationColumns,
  zodSchema: destinationImportSchema,
  duplicateKeys: (input: Record<string, unknown>): UniquenessCheck[] => [
    {
      key: `${countryCodeForName(String(input.country ?? '')) ?? ''}:${normalizeCustomerName(String(input.name ?? ''))}`,
      field: 'name',
      header: 'Destination Name',
    },
  ],
  existingKeys: async (companyId: string) => {
    // Destinations are uniquely constrained per company + country + name across
    // soft-deleted rows, so archived names still block imports.
    const rows = await prisma.destination.findMany({
      where: { companyId },
      select: { countryCode: true, normalizedName: true },
    });
    return new Set(rows.map((r) => `${r.countryCode}:${r.normalizedName}`));
  },
  resolveRow: async (input: Record<string, unknown>, auth: AuthContext): Promise<ResolveRowResult> => {
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
            message: `Country "${country}" could not be found.`,
          },
        ],
      };
    }
    const { cityIds, problems } = await resolveCityIds({ ...input, countryCode }, auth);
    if (problems.length) return { resolved: input, problems };
    return {
      resolved: {
        ...input,
        countryCode,
        cityIds,
        destinationType: (input.destinationType as string) ?? 'DOMESTIC',
      },
      problems: [],
    };
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const countryCode = String(input.countryCode).toUpperCase();
    const countryName = countryNameForCode(countryCode);
    if (!countryName) throw new ValidationError('Select a valid country.');
    const cityIds = (input.cityIds as string[]) ?? [];
    // Re-validate that every resolved city is still usable (mirrors the manual
    // create flow's validateCities).
    if (new Set(cityIds).size !== cityIds.length) {
      throw new ValidationError('A city can only be selected once.');
    }
    const usable = await tx.city.count({
      where: { id: { in: cityIds }, countryCode, status: 'ACTIVE', deletedAt: null },
    });
    if (usable !== cityIds.length) {
      throw new ValidationError('Every selected city must be active, visible and belong to the chosen country.');
    }
    const created = await tx.destination.create({
      data: {
        companyId: auth.companyId,
        countryCode,
        countryName,
        name: String(input.name).trim(),
        normalizedName: normalizeCustomerName(String(input.name)),
        destinationType: ((input.destinationType as string) ?? 'DOMESTIC') as never,
        status: 'ACTIVE',
        createdById: auth.userId,
        inclusions: sanitizeRichText(blankToNull(input.inclusions)),
        exclusions: sanitizeRichText(blankToNull(input.exclusions)),
        paymentPolicies: sanitizeRichText(blankToNull(input.paymentPolicies)),
        cancellationPolicies: sanitizeRichText(blankToNull(input.cancellationPolicies)),
        bookingTerms: sanitizeRichText(blankToNull(input.bookingTerms)),
        cities: {
          create: cityIds.map((cityId, sequence) => ({ companyId: auth.companyId, cityId, sequence })),
        },
      },
    });
    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'DESTINATION_CREATED',
        entityType: 'Destination',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import', countryCode, destinationType: String(input.destinationType ?? 'DOMESTIC'), cityCount: cityIds.length },
      },
    });
    return created.id;
  },
};