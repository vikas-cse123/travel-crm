import { addOnServiceInputSchema } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { PERMISSIONS } from '@interscale/shared';
import type { ImportColumnDefinition, UniquenessCheck } from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

export const addOnServiceColumns: ImportColumnDefinition[] = [
  {
    field: 'name',
    header: 'Service Name',
    aliases: ['service name', 'service', 'name', 'add-on service'],
    required: true,
    example: 'Travel Insurance',
    description: 'Required. 2–200 characters.',
  },
  {
    field: 'description',
    header: 'Description',
    aliases: ['description', 'desc', 'details'],
    required: false,
    example: 'Comprehensive travel insurance',
    description: 'Optional. Rich text (max 50k).',
  },
  {
    field: 'price',
    header: 'Price',
    aliases: ['price', 'cost', 'amount'],
    required: false,
    example: '1500',
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

export const addOnServiceAdapter = {
  masterType: 'ADD_ON_SERVICE' as const,
  permission: PERMISSIONS.MASTER_ADD_ON_SERVICES_CREATE,
  columns: addOnServiceColumns,
  zodSchema: addOnServiceInputSchema,
  duplicateKeys: (input: Record<string, unknown>): UniquenessCheck[] => [
    { key: normalizeCustomerName(String(input.name ?? '')), field: 'name', header: 'Service Name' },
  ],
  existingKeys: async (companyId: string) => {
    // Service names are uniquely constrained per company across soft-deleted
    // records (archiving keeps the row), so archived names still block imports.
    const rows = await prisma.addOnService.findMany({
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
    const created = await tx.addOnService.create({
      data: {
        companyId: auth.companyId,
        name: String(input.name).trim(),
        normalizedName,
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
        action: 'ADD_ON_SERVICE_CREATED',
        entityType: 'AddOnService',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { via: 'excel_import' },
      },
    });
    return created.id;
  },
};
